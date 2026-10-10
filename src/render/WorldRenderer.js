// Renderização do mundo: lê o estado da simulação e o representa em Three.js.
// Nada aqui altera a simulação.
import * as THREE from 'three';
import { BUILDINGS, RESOURCES, MAP } from '../data/config.js';
import { DX, DZ } from '../sim/util.js';
import { buildModel, buildPig, itemGeometry, itemMaterial, mat } from './models.js';
import { beltGeometries, beltPath, beltTexture, BELT_Y } from './beltGeometry.js';
import { Terrain, makeLabel } from './Terrain.js';
import { machineCapacity } from '../sim/systems/machines.js';
import { beltSpeed } from '../sim/systems/belts.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
const path = {};

export class WorldRenderer {
  constructor(canvas, sim, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd0ee);
    this.scene.fog = new THREE.Fog(0x9fd0ee, 60, 140);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 400);

    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x5a6b3a, 1.15);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.applyShadowQuality();

    this.beltTex = { conveyor: beltTexture('#3a3f47', '#5a626e'), fast_conveyor: beltTexture('#2c4a6e', '#4f8fd6') };
    this.beltSurfaceMat = {
      conveyor: new THREE.MeshStandardMaterial({ map: this.beltTex.conveyor, roughness: 0.8 }),
      fast_conveyor: new THREE.MeshStandardMaterial({ map: this.beltTex.fast_conveyor, roughness: 0.6 }),
    };
    this.beltFrameMat = { conveyor: mat(0xe0a83a, { metal: 0.3 }), fast_conveyor: mat(0x3fa0e0, { metal: 0.3 }) };
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });

    this.objects = new Map();   // id -> { model, type, x, z, rot }
    this.beltMeshes = [];
    this.itemMeshes = {};
    this.pigModels = new Map();
    this.particles = [];
    this.popups = [];
    this.statusSprites = new Map();
    this.statusTex = makeStatusTextures();
    this.setSim(sim);

    // fantasmas e sobreposições
    this.ghostRoot = new THREE.Group(); this.scene.add(this.ghostRoot);
    this.selRoot = new THREE.Group(); this.scene.add(this.selRoot);
    this.coverRoot = new THREE.Group(); this.scene.add(this.coverRoot);
    this.hoverTile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    this.hoverTile.rotation.x = -Math.PI / 2; this.hoverTile.visible = false; this.scene.add(this.hoverTile);
    this.time = 0;
  }

  applyShadowQuality() {
    const q = this.settings.shadows;
    this.renderer.shadowMap.enabled = q !== 'off';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.sun.castShadow = q !== 'off';
  }

  setSim(sim) {
    // troca de partida: limpa tudo
    this.sim = sim;
    for (const o of this.objects.values()) this.scene.remove(o.model.root);
    this.objects.clear();
    for (const m of this.beltMeshes) { this.scene.remove(m); }
    this.beltMeshes = [];
    for (const k in this.itemMeshes) this.scene.remove(this.itemMeshes[k]);
    this.itemMeshes = {};
    for (const p of this.pigModels.values()) this.scene.remove(p.root);
    this.pigModels.clear();
    for (const s of this.statusSprites.values()) this.scene.remove(s);
    this.statusSprites.clear();
    if (this.terrain) this.scene.remove(this.terrain.group);
    this.terrain = new Terrain(this.scene, sim);
    this.structVersion = -1;
    this.resAcc = 99;
    sim.events.on('sold', (e) => this.onSold(e));
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ estruturas
  syncStructures() {
    const sim = this.sim;
    if (sim.structVersion === this.structVersion) return;
    this.structVersion = sim.structVersion;
    const seen = new Set();
    for (const b of sim.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (def.kind === 'belt') continue;
      seen.add(b.id);
      let o = this.objects.get(b.id);
      if (!o) {
        const model = buildModel(b.type);
        model.root.traverse((c) => { c.userData.buildingId = b.id; });
        this.scene.add(model.root);
        o = { model, type: b.type };
        this.objects.set(b.id, o);
        o.spawnT = this.time;
      }
      const [cx, cz] = sim.center(b);
      o.model.root.position.set(cx, 0, cz);
      o.model.root.rotation.y = -b.rot * Math.PI / 2;
    }
    for (const [id, o] of this.objects) if (!seen.has(id)) {
      this.scene.remove(o.model.root);
      this.objects.delete(id);
      const s = this.statusSprites.get(id); if (s) { this.scene.remove(s); this.statusSprites.delete(id); }
    }
    this.rebuildBelts();
    this.resAcc = 99;
  }

  beltShape(b) {
    const sim = this.sim;
    const r = b.rot;
    const feeds = (fromDir) => {
      // existe algo na célula vizinha (direção fromDir a partir da esteira) que empurra para dentro dela?
      const nx = b.x + DX[fromDir], nz = b.z + DZ[fromDir];
      const n = sim.at(nx, nz);
      if (!n) return false;
      const moveDir = (fromDir + 2) & 3;
      if (BUILDINGS[n.type].kind === 'belt') return n.rot === moveDir;
      return sim.outputTargets(n).some((t) => t.x === b.x && t.z === b.z && t.dir === moveDir);
    };
    if (feeds((r + 2) & 3)) return 'S';
    const left = feeds((r + 3) & 3), right = feeds((r + 1) & 3);
    if (left && !right) return 'L';
    if (right && !left) return 'R';
    return 'S';
  }

  rebuildBelts() {
    for (const m of this.beltMeshes) { this.scene.remove(m); m.dispose(); }
    this.beltMeshes = [];
    const groups = {};
    for (const b of this.sim.buildings.values()) {
      if (BUILDINGS[b.type].kind !== 'belt') continue;
      const shape = this.beltShape(b);
      b._shape = shape;
      const key = b.type + '|' + shape;
      (groups[key] ||= []).push(b);
    }
    for (const key in groups) {
      const [type, shape] = key.split('|');
      const list = groups[key];
      const g = beltGeometries(shape);
      const surf = new THREE.InstancedMesh(g.surface, this.beltSurfaceMat[type], list.length);
      const frame = new THREE.InstancedMesh(g.frame, this.beltFrameMat[type], list.length);
      const arrow = new THREE.InstancedMesh(g.arrow, this.arrowMat, list.length);
      list.forEach((b, i) => {
        tmpM.compose(tmpP.set(b.x + 0.5, 0, b.z + 0.5), tmpQ.setFromAxisAngle(UP, -b.rot * Math.PI / 2), tmpS.set(1, 1, 1));
        surf.setMatrixAt(i, tmpM); frame.setMatrixAt(i, tmpM); arrow.setMatrixAt(i, tmpM);
      });
      surf.receiveShadow = true; frame.castShadow = true; frame.receiveShadow = true;
      arrow.renderOrder = 2;
      this.scene.add(surf, frame, arrow);
      this.beltMeshes.push(surf, frame, arrow);
    }
  }

  // ------------------------------------------------------------ itens nas esteiras
  updateItems(alpha) {
    const counts = {};
    const sim = this.sim;
    for (const b of sim.buildings.values()) {
      if (BUILDINGS[b.type].kind !== 'belt' || !b.items.length) continue;
      const shape = b._shape || 'S';
      const ang = -b.rot * Math.PI / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const it of b.items) {
        let p = it.pp < 0 ? it.p : it.pp + (it.p - it.pp) * alpha;
        p = Math.max(0, Math.min(1, p));
        beltPath(shape, p, path);
        // rotação local->mundo (rotação em torno de y)
        const wx = b.x + 0.5 + path.x * ca + path.z * sa;
        const wz = b.z + 0.5 - path.x * sa + path.z * ca;
        let im = this.itemMeshes[it.r];
        const n = counts[it.r] || 0;
        if (!im || n >= im.instanceMatrix.count) im = this.growItems(it.r, n + 1);
        const yaw = Math.atan2(-(path.tz * ca - path.tx * sa), path.tx * ca + path.tz * sa);
        tmpM.compose(tmpP.set(wx, BELT_Y + 0.1, wz), tmpQ.setFromAxisAngle(UP, yaw), tmpS.set(1, 1, 1));
        im.setMatrixAt(n, tmpM);
        counts[it.r] = n + 1;
      }
    }
    for (const r in this.itemMeshes) {
      const im = this.itemMeshes[r];
      im.count = counts[r] || 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  growItems(res, need) {
    const old = this.itemMeshes[res];
    const cap = Math.max(256, Math.pow(2, Math.ceil(Math.log2(need * 1.5))));
    const im = new THREE.InstancedMesh(itemGeometry(RESOURCES[res].shape), itemMaterial(res), cap);
    im.castShadow = true;
    im.frustumCulled = false;
    if (old) {
      for (let i = 0; i < old.count; i++) { old.getMatrixAt(i, tmpM); im.setMatrixAt(i, tmpM); }
      this.scene.remove(old); old.dispose();
    }
    this.scene.add(im);
    this.itemMeshes[res] = im;
    return im;
  }

  // ------------------------------------------------------------ porcos
  updatePigs(dt, alpha) {
    const seen = new Set();
    for (const p of this.sim.pigs) {
      seen.add(p.id);
      let m = this.pigModels.get(p.id);
      if (!m) { m = buildPig(); this.scene.add(m.root); this.pigModels.set(p.id, m); }
      const x = p.px + (p.x - p.px) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      const moving = Math.hypot(p.x - p.px, p.z - p.pz) > 1e-4;
      m.root.position.set(x, 0, z);
      // suaviza a direção
      const target = p.heading || 0;
      let d = target - m.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      m.root.rotation.y += d * Math.min(1, dt * 10);
      m.update(dt, this.time, p, moving);
    }
    for (const [id, m] of this.pigModels) if (!seen.has(id)) { this.scene.remove(m.root); this.pigModels.delete(id); }
  }

  // ------------------------------------------------------------ efeitos
  onSold(e) {
    const b = e.b;
    b._popAcc = (b._popAcc || 0) + e.value;
  }

  spawnSmoke(pos, dark = false) {
    if (this.particles.length > 220) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX(), color: dark ? 0x555555 : 0xdddddd, transparent: true, opacity: 0.7, depthWrite: false }));
    s.position.copy(pos);
    s.scale.setScalar(0.35);
    this.scene.add(s);
    this.particles.push({ s, life: 0, max: 2.4, vx: (Math.random() - 0.5) * 0.2, vz: 0.15 + Math.random() * 0.1 });
  }

  spawnPopup(x, y, z, text, color = '#ffd84a') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 40px "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, 128, 32);
    g.fillStyle = color; g.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.position.set(x, y, z); s.scale.set(2, 0.5, 1); s.renderOrder = 20;
    this.scene.add(s);
    this.popups.push({ s, life: 0 });
  }

  updateEffects(dt) {
    this.smokeAcc = (this.smokeAcc || 0) + dt;
    const emit = this.smokeAcc > 0.35;
    if (emit) this.smokeAcc = 0;
    for (const [id, o] of this.objects) {
      const b = this.sim.buildings.get(id);
      if (!b) continue;
      if (emit && o.model.smokeAt && b.state === 'working') {
        const p = o.model.smokeAt.clone(); o.model.root.localToWorld(p);
        this.spawnSmoke(p, b.type === 'generator');
      }
      if (b._popAcc && (this.time - (b._popT || 0)) > 0.9) {
        const [cx, cz] = this.sim.center(b);
        this.spawnPopup(cx, 3.4, cz, '+R$ ' + (b._popAcc >= 100 ? Math.round(b._popAcc) : b._popAcc.toFixed(1)));
        b._popAcc = 0; b._popT = this.time;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.s.position.y += dt * 0.9; p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt;
      const k = p.life / p.max;
      p.s.scale.setScalar(0.35 + k * 1.1);
      p.s.material.opacity = 0.6 * (1 - k);
      if (p.life >= p.max) { this.scene.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life += dt;
      p.s.position.y += dt * 1.0;
      p.s.material.opacity = Math.min(1, 2 * (1.6 - p.life));
      if (p.life > 1.6) { this.scene.remove(p.s); p.s.material.map.dispose(); p.s.material.dispose(); this.popups.splice(i, 1); }
    }
  }

  updateStatusIcons() {
    for (const [id, o] of this.objects) {
      const b = this.sim.buildings.get(id);
      if (!b) continue;
      const tex = this.statusTex[b.state];
      let s = this.statusSprites.get(id);
      if (tex) {
        if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.set(0.8, 0.8, 1); s.renderOrder = 15; this.scene.add(s); this.statusSprites.set(id, s); }
        s.material.map = tex;
        const [cx, cz] = this.sim.center(b);
        const h = BUILDINGS[b.type].size[0] >= 3 ? 3.4 : 2.6;
        s.position.set(cx, h + Math.sin(this.time * 3 + id) * 0.1, cz);
        s.visible = true;
      } else if (s) s.visible = false;
    }
  }

  // ------------------------------------------------------------ quadro
  render(dt, alpha, camCtl) {
    this.time += dt;
    const sim = this.sim;
    this.syncStructures();
    this.terrain.refresh();
    this.resAcc += dt;
    if (this.resAcc > 1) { this.resAcc = 0; this.terrain.updateResources(); this.updateStatusIcons(); }
    // animação das lonas
    for (const t of ['conveyor', 'fast_conveyor']) {
      const speed = BUILDINGS[t].speed * (1 + sim.progression.effect('belt'));
      if (!sim.paused) this.beltTex[t].offset.y -= dt * speed * (this._simSpeed || 1);
    }
    // modelos
    for (const [id, o] of this.objects) {
      const b = sim.buildings.get(id);
      if (!b) continue;
      if (BUILDINGS[b.type].kind === 'pole') b.powered = sim.power.networks.some((n) => n.nodes.some((nd) => nd.b === b) && n.supply > 0);
      const cap = BUILDINGS[b.type].kind === 'storage' ? machineCapacity(sim, b) : 0;
      o.model.update(sim.paused ? 0 : dt * (this._simSpeed || 1), this.time, b, sim, cap);
      // animação de surgimento
      const age = this.time - (o.spawnT ?? -10);
      const s = age < 0.35 ? 0.6 + 0.4 * easeOutBack(age / 0.35) : 1;
      o.model.root.scale.setScalar(s);
    }
    this.updateItems(sim.paused ? 1 : alpha);
    this.updatePigs(sim.paused ? 0 : dt, sim.paused ? 1 : alpha);
    this.updateEffects(dt);
    // sombra acompanha a câmera
    const t = camCtl.target;
    const span = Math.max(20, camCtl.distance * 0.9);
    const sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
    this.sun.position.set(t.x - 30, 55, t.z - 18);
    this.sun.target.position.set(t.x, 0, t.z);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ fantasmas e seleção
  clearGhost() {
    for (const c of [...this.ghostRoot.children]) this.ghostRoot.remove(c);
    this.ghostKey = null;
  }

  showGhost(type, x, z, rot, ok) {
    const key = type + rot;
    if (this.ghostKey !== key) {
      this.clearGhost();
      this.ghostKey = key;
      const def = BUILDINGS[type];
      const [w, d] = rot & 1 ? [def.size[1], def.size[0]] : def.size;
      this.ghostFoot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.35, depthWrite: false }));
      this.ghostFoot.rotation.x = -Math.PI / 2;
      this.ghostRoot.add(this.ghostFoot);
      if (def.kind !== 'platform' && def.kind !== 'belt') {
        const m = buildModel(type);
        const gm = new THREE.MeshStandardMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.55, depthWrite: false });
        m.root.traverse((c) => { if (c.isMesh) { c.material = gm; c.castShadow = false; } });
        m.root.rotation.y = -rot * Math.PI / 2;
        this.ghostModel = m.root; this.ghostMat = gm;
        this.ghostRoot.add(m.root);
      } else this.ghostModel = null;
      // setas de entrada/saída
      this.ghostRoot.add(portArrows(type, rot));
      // alcance
      if (def.radius) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(def.radius - 0.08, def.radius + 0.08, 64), new THREE.MeshBasicMaterial({ color: 0x6ad7ff, transparent: true, opacity: 0.7, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.userData.center = true;
        this.ghostRoot.add(ring);
      }
    }
    const def = BUILDINGS[type];
    const [w, d] = rot & 1 ? [def.size[1], def.size[0]] : def.size;
    this.ghostRoot.position.set(x + w / 2, 0.02, z + d / 2);
    const c = ok ? 0x33ff88 : 0xff4444;
    this.ghostFoot.material.color.setHex(c);
    if (this.ghostMat) this.ghostMat.color.setHex(ok ? 0x66ffaa : 0xff6666);
    this.ghostRoot.visible = true;
  }

  showBeltPath(tiles) {
    // tiles: [{x,z,rot,ok}]
    this.clearGhost();
    this.ghostRoot.position.set(0, 0, 0);
    const okM = new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.45, depthWrite: false });
    const badM = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.45, depthWrite: false });
    const arrowG = new THREE.ConeGeometry(0.18, 0.4, 3); arrowG.rotateZ(-Math.PI / 2);
    for (const t of tiles) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), t.ok ? okM : badM);
      q.rotation.x = -Math.PI / 2; q.position.set(t.x + 0.5, 0.04, t.z + 0.5);
      const a = new THREE.Mesh(arrowG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      a.position.set(t.x + 0.5, 0.25, t.z + 0.5); a.rotation.y = -t.rot * Math.PI / 2;
      this.ghostRoot.add(q, a);
    }
    this.ghostKey = 'belt-path';
  }

  setSelection(b) {
    for (const c of [...this.selRoot.children]) this.selRoot.remove(c);
    if (!b) return;
    const def = BUILDINGS[b.type];
    const [w, d] = this.sim.footprint(b.type, b.rot);
    const [cx, cz] = this.sim.center(b);
    const h = def.kind === 'belt' ? 0.4 : 1.4;
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.1, h, d + 0.1)), new THREE.LineBasicMaterial({ color: 0x6ad7ff }));
    box.position.set(cx, h / 2, cz);
    this.selRoot.add(box);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, d + 0.2), new THREE.MeshBasicMaterial({ color: 0x6ad7ff, transparent: true, opacity: 0.18, depthWrite: false }));
    plate.rotation.x = -Math.PI / 2; plate.position.set(cx, 0.03, cz);
    this.selRoot.add(plate);
    if (def.radius) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(def.radius - 0.08, def.radius + 0.08, 64), new THREE.MeshBasicMaterial({ color: 0x6ad7ff, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.06, cz);
      this.selRoot.add(ring);
    }
    const arrows = portArrows(b.type, b.rot);
    arrows.position.set(cx, 0.02, cz);
    this.selRoot.add(arrows);
  }

  showPowerCoverage(on) {
    for (const c of [...this.coverRoot.children]) this.coverRoot.remove(c);
    if (!on) return;
    const m = new THREE.MeshBasicMaterial({ color: 0x6ad7ff, transparent: true, opacity: 0.12, depthWrite: false });
    for (const net of this.sim.power.networks) for (const n of net.nodes) {
      const disk = new THREE.Mesh(new THREE.CircleGeometry(n.radius, 48), m);
      disk.rotation.x = -Math.PI / 2; disk.position.set(n.cx, 0.05, n.cz);
      this.coverRoot.add(disk);
    }
  }

  setHover(x, z, visible) {
    this.hoverTile.visible = visible;
    this.hoverTile.position.set(x + 0.5, 0.035, z + 0.5);
  }
}

function portArrows(type, rot) {
  // setas verdes (entrada) e laranja (saída) nas bordas da estrutura
  const g = new THREE.Group();
  const def = BUILDINGS[type];
  const [w, d] = def.size;
  const outM = new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.9, depthWrite: false });
  const inM = new THREE.MeshBasicMaterial({ color: 0x45e07a, transparent: true, opacity: 0.8, depthWrite: false });
  const geo = new THREE.ConeGeometry(0.16, 0.32, 3); geo.rotateZ(-Math.PI / 2); // aponta +x
  const sides = (list, outward, m) => {
    for (const s of list || []) {
      // lado local s em coordenadas do modelo (frente=+x, direita=+z, trás=-x, esquerda=-z)
      const dir = s; const dx = [1, 0, -1, 0][dir], dz = [0, 1, 0, -1][dir];
      const along = dir % 2 === 0 ? d : w;
      const n = along === 3 && outward ? 1 : along;
      for (let k = 0; k < n; k++) {
        const off = n === 1 ? 0 : -along / 2 + 0.5 + k;
        const a = new THREE.Mesh(geo, m);
        const edge = (dir % 2 === 0 ? w : d) / 2;
        a.position.set(dx * (edge + 0.3) + (dir % 2 ? off : 0), 0.25, dz * (edge + 0.3) + (dir % 2 ? 0 : off));
        const ang = Math.atan2(-dz, dx);
        a.rotation.y = outward ? ang : ang + Math.PI;
        g.add(a);
      }
    }
  };
  if (def.kind !== 'belt') { sides(def.outputs, true, outM); sides(def.inputs, false, inM); }
  g.rotation.y = -rot * Math.PI / 2;
  return g;
}

function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

let smokeTex = null;
function SMOKE_TEX() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

function makeStatusTextures() {
  const make = (bg, glyph) => {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = 'white'; g.stroke();
    g.fillStyle = 'white'; g.font = 'bold 50px "Segoe UI Symbol", "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(glyph, 48, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return {
    no_power: make('#e0433b', '⚡'),
    no_fuel: make('#e0433b', '🔥'.length > 1 ? '!' : '!'),
    output_full: make('#f08a24', '■'),
    no_deposit: make('#e0433b', '×'),
    no_input: make('#d8a21a', '…'),
  };
}
