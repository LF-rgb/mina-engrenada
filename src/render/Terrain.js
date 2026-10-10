// Terreno, vegetação, rochas, depósitos minerais e sobreposições de regiões.
import * as THREE from 'three';
import { REGIONS, RESOURCES, BUILDINGS } from '../data/config.js';
import { TERRAIN, DEPOSIT_TYPES } from '../sim/WorldMap.js';
import { mulberry32, formatMoney } from '../sim/util.js';
import { itemMaterial } from './models.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
const C = (h) => new THREE.Color(h);

export class Terrain {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mapVersion = -1;
    this.decorVersion = -1;
    this.buildGround();
    this.buildStaticDecor();
    this.buildDynamicDecor();
    this.buildGrid();
    this.regionGroup = new THREE.Group();
    this.group.add(this.regionGroup);
    this.refresh(true);
  }

  vertexHeight(vx, vz) {
    // altura de um vértice = média das alturas dos tiles selvagens vizinhos (0 se tocar região)
    const m = this.sim.map;
    let s = 0, n = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const x = vx + dx, z = vz + dz;
      if (!m.inBounds(x, z)) { s += 3; n++; continue; }
      const i = m.idx(x, z);
      if (m.region[i] >= 0) return 0;
      s += m.height[i]; n++;
    }
    return n ? s / n : 0;
  }

  buildGround() {
    const m = this.sim.map;
    const W = m.w, H = m.h;
    // anel de montanhas fora do mapa para fechar o horizonte
    const pad = 14;
    const pos = [], col = [];
    this.heightGrid = new Float32Array((W + 1) * (H + 1));
    for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) this.heightGrid[z * (W + 1) + x] = this.vertexHeight(x, z);
    const hv = (x, z) => this.heightGrid[z * (W + 1) + x];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const a = [x, hv(x, z), z], b = [x + 1, hv(x + 1, z), z], c = [x, hv(x, z + 1), z + 1], d = [x + 1, hv(x + 1, z + 1), z + 1];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      for (let k = 0; k < 6; k++) col.push(0, 0, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.groundGeo = g;
    this.ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    // borda externa (saia de montanhas)
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + pad * 6, H + pad * 6, 40, 40), new THREE.MeshStandardMaterial({ color: 0x6f7d5a, roughness: 1, flatShading: true }));
    outer.rotation.x = -Math.PI / 2;
    const op = outer.geometry.attributes.position;
    for (let i = 0; i < op.count; i++) {
      const x = op.getX(i) + W / 2, z = -op.getY(i) + H / 2;
      const inside = x > 0 && x < W && z > 0 && z < H;
      const dist = Math.max(-x, x - W, -z, z - H, 0);
      op.setZ(i, inside ? -1 : 3 + dist * 0.35 + Math.sin(x * 0.3) * Math.cos(z * 0.25) * 2.5);
    }
    outer.geometry.computeVertexNormals();
    outer.position.set(W / 2, 0, H / 2);
    outer.receiveShadow = true;
    this.group.add(outer);
    // água / névoa abaixo
  }

  paintGround() {
    const m = this.sim.map;
    const prog = this.sim.progression;
    const col = this.groundGeo.attributes.color;
    const c = new THREE.Color(), tint = new THREE.Color();
    const gray = new THREE.Color(0x555b66);
    let k = 0;
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const i = m.idx(x, z);
      const r = m.region[i];
      if (r >= 0) {
        c.setHex(REGIONS[r].ground);
        const chk = ((x + z) & 1) ? 0.97 : 1.02;
        c.multiplyScalar(chk + (Math.sin(x * 12.9898 + z * 78.233) * 0.5 + 0.5) * 0.04);
        const t = m.terrain[i];
        if (t === TERRAIN.RUBBLE) c.setHex(0x6e6658);
        if (m.levelled && m.levelled.has(i)) c.setHex(((x + z) & 1) ? 0xb9b6ae : 0xc4c1b9);
        if (m.depType[i] >= 0) {
          const res = DEPOSIT_TYPES[m.depType[i]];
          if (res !== 'wood') { tint.setHex(RESOURCES[res].color); c.lerp(tint, 0.35 * Math.min(1, m.depAmount[i] / Math.max(1, m.depMax[i]) + 0.3)); }
          else c.multiplyScalar(0.88);
        }
        if (!prog.regionUnlocked(REGIONS[r].id)) { c.lerp(gray, 0.45); c.multiplyScalar(0.7); }
      } else {
        const h = m.height[i];
        if (h < 1.6) c.setHex(0x5f8f45); else if (h < 3.5) c.setHex(0x7c7a5a); else if (h < 6.5) c.setHex(0x8b8478); else c.setHex(0xe8edf0);
        c.multiplyScalar(0.92 + ((x * 7 + z * 13) % 5) * 0.025);
      }
      for (let v = 0; v < 6; v++) { col.setXYZ(k++, c.r, c.g, c.b); }
    }
    col.needsUpdate = true;
  }

  buildStaticDecor() {
    const m = this.sim.map;
    const rnd = mulberry32(99);
    // árvores decorativas nas encostas + pedras grandes
    const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6); trunkGeo.translate(0, 0.25, 0);
    const leafGeo = new THREE.ConeGeometry(0.42, 1.0, 7); leafGeo.translate(0, 0.95, 0);
    const leaf2 = new THREE.ConeGeometry(0.32, 0.7, 7); leaf2.translate(0, 1.35, 0);
    this.trunkGeo = trunkGeo; this.leafGeo = leafGeo; this.leaf2 = leaf2;
    const spots = [];
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const i = m.idx(x, z);
      if (m.region[i] >= 0) continue;
      const h = m.height[i];
      if (h < 4 && rnd() < 0.35) spots.push([x + 0.2 + rnd() * 0.6, z + 0.2 + rnd() * 0.6, 0.7 + rnd() * 0.7, rnd()]);
    }
    const n = spots.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4426, flatShading: true }), n);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3f7d3a, flatShading: true, roughness: 0.9 }), n);
    const leaves2 = new THREE.InstancedMesh(leaf2, new THREE.MeshStandardMaterial({ color: 0x4f9447, flatShading: true, roughness: 0.9 }), n);
    spots.forEach(([x, z, s, r], k) => {
      const y = this.heightAt(x, z);
      tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, r * 6, 0)), tmpS.set(s, s, s));
      trunks.setMatrixAt(k, tmpM); leaves.setMatrixAt(k, tmpM); leaves2.setMatrixAt(k, tmpM);
      const tint = new THREE.Color().setHSL(0.27 + r * 0.08, 0.45, 0.32 + r * 0.1);
      leaves.setColorAt(k, tint); leaves2.setColorAt(k, tint.clone().offsetHSL(0, 0, 0.06));
    });
    for (const im of [trunks, leaves, leaves2]) { im.castShadow = true; im.receiveShadow = true; this.group.add(im); }
  }

  heightAt(x, z) {
    const W = this.sim.map.w;
    const xi = Math.max(0, Math.min(W - 1, Math.floor(x))), zi = Math.max(0, Math.min(this.sim.map.h - 1, Math.floor(z)));
    const fx = x - xi, fz = z - zi;
    const h = (a, b) => this.heightGrid[b * (W + 1) + a];
    return (h(xi, zi) * (1 - fx) + h(xi + 1, zi) * fx) * (1 - fz) + (h(xi, zi + 1) * (1 - fx) + h(xi + 1, zi + 1) * fx) * fz;
  }

  buildDynamicDecor() {
    const m = this.sim.map;
    // árvores de madeira (recurso)
    this.woodTiles = [];
    for (let i = 0; i < m.depType.length; i++) if (DEPOSIT_TYPES[m.depType[i]] === 'wood') this.woodTiles.push(i);
    const nW = this.woodTiles.length;
    this.woodTrunks = new THREE.InstancedMesh(this.trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a4e2a, flatShading: true }), nW);
    this.woodLeaves = new THREE.InstancedMesh(this.leafGeo, new THREE.MeshStandardMaterial({ color: 0x3e8f3e, flatShading: true, roughness: 0.85 }), nW);
    this.woodLeaves2 = new THREE.InstancedMesh(this.leaf2, new THREE.MeshStandardMaterial({ color: 0x52a84a, flatShading: true, roughness: 0.85 }), nW);
    for (const im of [this.woodTrunks, this.woodLeaves, this.woodLeaves2]) { im.castShadow = true; im.receiveShadow = true; this.group.add(im); }

    // minérios: por recurso, 3 pedaços por tile
    this.oreTiles = {};
    for (let i = 0; i < m.depType.length; i++) {
      const t = m.depType[i];
      if (t < 0) continue;
      const res = DEPOSIT_TYPES[t];
      if (res === 'wood') continue;
      (this.oreTiles[res] ||= []).push(i);
    }
    this.oreMeshes = {};
    const rockGeo = new THREE.DodecahedronGeometry(0.22, 0);
    const crystalGeo = new THREE.OctahedronGeometry(0.2); crystalGeo.scale(0.7, 1.8, 0.7);
    for (const res in this.oreTiles) {
      const n = this.oreTiles[res].length * 3;
      const geo = res === 'crystal' ? crystalGeo : rockGeo;
      const im = new THREE.InstancedMesh(geo, itemMaterial(res), n);
      im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
      this.oreMeshes[res] = im;
    }
    // rochas e entulho (dependem do terreno)
    const rock = new THREE.DodecahedronGeometry(0.42, 0);
    this.rockMesh = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: 0x8d8a85, flatShading: true, roughness: 0.9 }), m.w * m.h);
    this.rockMesh.castShadow = true; this.rockMesh.receiveShadow = true; this.group.add(this.rockMesh);
    const rub = new THREE.BoxGeometry(0.28, 0.16, 0.22);
    this.rubbleMesh = new THREE.InstancedMesh(rub, new THREE.MeshStandardMaterial({ color: 0x8a7e6a, flatShading: true }), m.w * m.h * 2);
    this.rubbleMesh.receiveShadow = true; this.rubbleMesh.castShadow = true; this.group.add(this.rubbleMesh);
  }

  updateRocks() {
    const m = this.sim.map;
    let r = 0, u = 0;
    for (let i = 0; i < m.terrain.length; i++) {
      const x = i % m.w, z = (i / m.w) | 0;
      const h = Math.sin(i * 91.7) * 0.5 + 0.5;
      if (m.terrain[i] === TERRAIN.ROCK) {
        tmpM.compose(tmpP.set(x + 0.5, 0.25, z + 0.5), tmpQ.setFromEuler(tmpE.set(h, h * 5, 0)), tmpS.set(1 + h * 0.4, 0.7 + h * 0.6, 1 + h * 0.3));
        this.rockMesh.setMatrixAt(r++, tmpM);
      } else if (m.terrain[i] === TERRAIN.RUBBLE) {
        for (let k = 0; k < 2; k++) {
          const hh = Math.sin(i * 13.3 + k * 7.7) * 0.5 + 0.5;
          tmpM.compose(tmpP.set(x + 0.25 + hh * 0.5, 0.06, z + 0.3 + ((k + hh) % 1) * 0.4), tmpQ.setFromEuler(tmpE.set(hh, hh * 9, hh * 0.5)), tmpS.set(1, 1 + hh, 1));
          this.rubbleMesh.setMatrixAt(u++, tmpM);
        }
      }
    }
    this.rockMesh.count = r; this.rockMesh.instanceMatrix.needsUpdate = true;
    this.rubbleMesh.count = u; this.rubbleMesh.instanceMatrix.needsUpdate = true;
  }

  updateResources() {
    const m = this.sim.map, occ = this.sim.occ;
    // árvores
    this.woodTiles.forEach((i, k) => {
      const x = i % m.w, z = (i / m.w) | 0;
      const f = m.depAmount[i] / Math.max(1, m.depMax[i]);
      const hidden = occ[i] || m.depAmount[i] < 1;
      const h = Math.sin(i * 3.1) * 0.5 + 0.5;
      const s = hidden ? 0.0001 : 0.55 + f * 0.6 + h * 0.2;
      tmpM.compose(tmpP.set(x + 0.5, 0, z + 0.5), tmpQ.setFromEuler(tmpE.set(0, h * 6, 0)), tmpS.set(s, s, s));
      this.woodTrunks.setMatrixAt(k, tmpM); this.woodLeaves.setMatrixAt(k, tmpM); this.woodLeaves2.setMatrixAt(k, tmpM);
    });
    for (const im of [this.woodTrunks, this.woodLeaves, this.woodLeaves2]) im.instanceMatrix.needsUpdate = true;
    // minérios
    for (const res in this.oreTiles) {
      const im = this.oreMeshes[res];
      let k = 0;
      for (const i of this.oreTiles[res]) {
        const x = i % m.w, z = (i / m.w) | 0;
        const f = Math.min(1, m.depAmount[i] / Math.max(1, m.depMax[i]));
        const hidden = occ[i] && BUILDINGS[this.sim.buildings.get(occ[i])?.type]?.kind !== 'belt';
        for (let j = 0; j < 3; j++) {
          const h = Math.sin(i * 7.13 + j * 3.7) * 0.5 + 0.5;
          const s = hidden || m.depAmount[i] < 1 ? 0.0001 : (0.45 + f * 0.75) * (0.7 + h * 0.5);
          const ox = [0.28, 0.7, 0.5][j] + (h - 0.5) * 0.15, oz = [0.3, 0.4, 0.75][j];
          tmpM.compose(tmpP.set(x + ox, 0.06 * s, z + oz), tmpQ.setFromEuler(tmpE.set(h * 2, h * 7, res === 'crystal' ? (h - 0.5) * 0.6 : 0)), tmpS.set(s, s, s));
          im.setMatrixAt(k++, tmpM);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  buildGrid() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
    const tex = new THREE.CanvasTexture(c);
    const m = this.sim.map;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(m.w, m.h);
    tex.anisotropy = 4;
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.25, depthWrite: false }));
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.set(m.w / 2, 0.015, m.h / 2);
    this.grid.visible = false;
    this.group.add(this.grid);
  }

  buildRegionOverlays() {
    // remove anteriores
    for (const ch of [...this.regionGroup.children]) { this.regionGroup.remove(ch); ch.geometry?.dispose?.(); if (ch.material?.map) ch.material.map.dispose(); }
    const prog = this.sim.progression;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6); postGeo.translate(0, 0.35, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2b632, flatShading: true });
    REGIONS.forEach((r) => {
      if (prog.regionUnlocked(r.id)) return;
      const [rx, rz, rw, rh] = r.rect;
      const ov = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.28, depthWrite: false }));
      ov.rotation.x = -Math.PI / 2; ov.position.set(rx + rw / 2, 0.03, rz + rh / 2);
      this.regionGroup.add(ov);
      // cercas na borda
      const perim = [];
      for (let x = rx; x <= rx + rw; x += 2) { perim.push([x, rz]); perim.push([x, rz + rh]); }
      for (let z = rz; z <= rz + rh; z += 2) { perim.push([rx, z]); perim.push([rx + rw, z]); }
      const posts = new THREE.InstancedMesh(postGeo, postMat, perim.length);
      perim.forEach(([x, z], k) => { tmpM.makeTranslation(x, 0, z); posts.setMatrixAt(k, tmpM); });
      posts.castShadow = true;
      this.regionGroup.add(posts);
      // placa
      const st = prog.regionStatus(r.id);
      const label = makeLabel(`🔒 ${r.name}`, st.state === 'locked' ? st.reason : formatMoney(r.cost) + ' · tecla M');
      label.position.set(rx + rw / 2, 3.2, rz + rh / 2);
      this.regionGroup.add(label);
    });
  }

  refresh(force = false) {
    const m = this.sim.map;
    if (force || m.version !== this.mapVersion) {
      this.mapVersion = m.version;
      this.paintGround();
      this.updateRocks();
      this.buildRegionOverlays();
    }
  }
}

export function makeLabel(title, sub, scale = 1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  const r = 26;
  x.fillStyle = 'rgba(14,20,34,0.82)';
  x.beginPath(); x.roundRect(8, 8, 496, 144, r); x.fill();
  x.strokeStyle = 'rgba(242,182,50,0.9)'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 44px "Segoe UI", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(title, 256, 60, 470);
  x.fillStyle = '#f2c14e'; x.font = '600 32px "Segoe UI", Arial, sans-serif';
  x.fillText(sub || '', 256, 115, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(7 * scale, 2.2 * scale, 1);
  s.renderOrder = 10;
  return s;
}
