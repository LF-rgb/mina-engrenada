// Modelos 3D procedurais estilizados (originais) para todas as estruturas.
// Cada fábrica retorna { root, update(dt, t, b) } — update anima partes móveis conforme o estado.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESOURCES } from '../data/config.js';

// ---------------------------------------------------------------- materiais
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0.05, flatShading: opts.flat ?? true, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 }));
  }
  return matCache.get(key);
}
export const PAL = {
  steel: 0x8a96a3, darkSteel: 0x4a5560, yellow: 0xf2b632, orange: 0xf0803c, red: 0xd9534a, brick: 0xb5543d,
  wood: 0x9b6a3c, darkWood: 0x6b4426, roof: 0x5b6f86, teal: 0x2bb3a3, cream: 0xf3ead7, concrete: 0xb8b4ac,
  black: 0x2a2d33, green: 0x5cc46a, blue: 0x3b7dd8, pink: 0xf4a9b8, white: 0xf2f2f2, purple: 0x8e66d6,
};

// ---------------------------------------------------------------- primitivas
function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
function cyl(rt, rb, h, seg, m, x = 0, y = 0, z = 0, parent) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
function cone(r, h, seg, m, x, y, z, parent) { return cyl(0.001, r, h, seg, m, x, y, z, parent); }
function prismRoof(len, width, height, m, x, y, z, parent, alongX = true) {
  // telhado de duas águas (prisma triangular)
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, height); shape.lineTo(-width / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  const mesh = new THREE.Mesh(g, m);
  if (alongX) mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function gear(r, thick, teeth, m) {
  const shape = new THREE.Shape();
  const n = teeth * 2;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.78;
    const a2 = a + Math.PI / n;
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    shape.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.25, 0, Math.PI * 2, true); shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}
function base(w, d, parent, color = PAL.concrete) {
  return box(w - 0.08, 0.12, d - 0.08, mat(color), 0, 0, 0, parent);
}
function stripes(w, parent, x, y, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) box(w / 5, 0.06, 0.04, mat(i % 2 ? PAL.black : PAL.yellow), -w / 2 + w / 10 + (i * w) / 5, 0, 0, g);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function statusLight(parent, x, y, z) {
  const m = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x33ff66, emissiveIntensity: 1.5 });
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m);
  s.position.set(x, y, z);
  parent.add(s);
  return s;
}
const STATE_COLORS = { working: 0x3dff6e, idle: 0xffd84a, no_input: 0xffd84a, output_full: 0xff8a2a, no_power: 0xff3b3b, no_fuel: 0xff3b3b, no_deposit: 0xff3b3b, off: 0x555555, blocked: 0xff8a2a };
function setLight(light, state) {
  const c = STATE_COLORS[state] ?? 0xffd84a;
  light.material.color.setHex(c); light.material.emissive.setHex(c);
}
function chute(parent, x, y, z) {
  // bica de saída voltada para a frente (+x)
  const g = new THREE.Group();
  box(0.3, 0.06, 0.34, mat(PAL.darkSteel), 0, 0, 0, g);
  box(0.3, 0.12, 0.04, mat(PAL.darkSteel), 0, 0.04, 0.17, g);
  box(0.3, 0.12, 0.04, mat(PAL.darkSteel), 0, 0.04, -0.17, g);
  g.position.set(x, y, z);
  g.rotation.z = -0.25;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- estruturas
const FACTORIES = {
  miner(adv = false) {
    const root = new THREE.Group();
    base(2, 2, root, adv ? 0x9aa6b5 : PAL.concrete);
    const bodyC = adv ? PAL.blue : PAL.yellow;
    box(1.3, 0.5, 1.3, mat(bodyC), -0.15, 0.12, 0, root);
    stripes(1.3, root, -0.15, 0.62, 0.66);
    // torre (derrick)
    const legs = [[-0.6, -0.45], [-0.6, 0.45], [0.2, -0.45], [0.2, 0.45]];
    for (const [x, z] of legs) {
      const l = cyl(0.04, 0.05, 1.5, 6, mat(PAL.darkSteel, { metal: 0.5 }), x * 0.8 - 0.05, 0.6, z * 0.8, root);
      l.rotation.z = x < 0 ? -0.1 : 0.1; l.rotation.x = z < 0 ? 0.1 : -0.1;
    }
    box(0.55, 0.08, 0.55, mat(PAL.darkSteel), -0.2, 2.05, 0, root);
    cyl(0.12, 0.12, 0.25, 10, mat(PAL.red), -0.2, 2.13, 0, root);
    // broca giratória
    const drill = new THREE.Group();
    cyl(0.05, 0.05, 1.3, 8, mat(PAL.steel, { metal: 0.6, rough: 0.4 }), 0, 0.3, 0, drill);
    const bit = cone(0.28, 0.5, 8, mat(adv ? 0x9fe8ff : 0xc9ced6, { metal: 0.7, rough: 0.3 }), 0, -0.2, 0, drill);
    bit.rotation.x = Math.PI; bit.position.y = 0.05;
    for (let i = 0; i < 3; i++) { const f = box(0.04, 0.9, 0.18, mat(PAL.steel, { metal: 0.6 }), 0, 0.35, 0, drill); f.rotation.y = (i * Math.PI) / 1.5; f.position.x = 0.07 * Math.cos(i * 2.1); }
    drill.position.set(-0.2, 0.35, 0);
    root.add(drill);
    // cabine/motor
    box(0.5, 0.45, 0.6, mat(adv ? 0xe6edf5 : PAL.orange), 0.55, 0.12, -0.4, root);
    box(0.3, 0.2, 0.02, mat(0x9fd3ff, { emissive: 0x224466, ei: 0.4 }), 0.55, 0.35, -0.09, root);
    if (adv) { cyl(0.18, 0.18, 0.6, 10, mat(PAL.darkSteel), 0.55, 0.12, 0.45, root); }
    chute(root, 0.85, 0.3, 0.1);
    const light = statusLight(root, 0.55, 0.62, -0.4);
    const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), mat(0x999999));
    ore.position.set(0.75, 0.45, 0.1); root.add(ore);
    return {
      root,
      update(dt, t, b, sim) {
        const working = b.state === 'working';
        drill.rotation.y += dt * (working ? (adv ? 14 : 8) : 0);
        drill.position.y = 0.35 + (working ? Math.sin(t * 6) * 0.06 : 0.12);
        setLight(light, b.state);
        const k = Object.keys(b.out)[0];
        ore.visible = !!k;
        if (k) ore.material = itemMaterial(k);
      },
    };
  },
  adv_drill() { return FACTORIES.miner(true); },

  lumber() {
    const root = new THREE.Group();
    base(2, 2, root, 0x8c7b5e);
    box(1.0, 0.6, 0.9, mat(PAL.wood), -0.35, 0.12, -0.3, root);
    prismRoof(1.15, 1.05, 0.45, mat(PAL.red), -0.35, 0.72, -0.3, root);
    // pilha de toras
    for (let i = 0; i < 5; i++) {
      const lg = cyl(0.11, 0.11, 0.8, 8, mat(PAL.darkWood), 0.2 + (i % 3) * 0.22, 0.12 + (i > 2 ? 0.2 : 0) + 0.11, 0.55, root);
      lg.rotation.x = Math.PI / 2; lg.position.x += i > 2 ? 0.11 : 0;
    }
    const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16), mat(0xd0d6dc, { metal: 0.8, rough: 0.3 }));
    saw.rotation.x = Math.PI / 2; saw.position.set(0.55, 0.55, -0.35); root.add(saw);
    box(0.5, 0.35, 0.2, mat(PAL.darkSteel), 0.55, 0.12, -0.35, root);
    chute(root, 0.85, 0.3, 0.1);
    const light = statusLight(root, -0.8, 0.95, -0.3);
    return { root, update(dt, t, b) { if (b.state === 'working') saw.rotation.y += dt * 18; setLight(light, b.state); } };
  },

  crusher() {
    const root = new THREE.Group();
    base(2, 2, root);
    box(1.4, 0.6, 1.4, mat(PAL.teal), -0.05, 0.12, 0, root);
    stripes(1.4, root, -0.05, 0.12, 0.71);
    // funil
    const hopper = cyl(0.75, 0.45, 0.55, 4, mat(PAL.darkSteel, { metal: 0.4 }), -0.15, 0.72, 0, root);
    hopper.rotation.y = Math.PI / 4;
    // rolos visíveis dentro do funil
    const rollers = [];
    for (const z of [-0.17, 0.17]) {
      const r = new THREE.Group();
      const c = cyl(0.15, 0.15, 0.7, 10, mat(0x6b7480, { metal: 0.6 }), 0, -0.35, 0, r);
      for (let i = 0; i < 6; i++) { const tooth = box(0.05, 0.7, 0.05, mat(PAL.yellow), 0, -0.35, 0, r); const a = (i / 6) * Math.PI * 2; tooth.position.x = Math.cos(a) * 0.16; tooth.position.z = Math.sin(a) * 0.16; }
      r.rotation.x = Math.PI / 2; r.rotation.z = 0;
      r.position.set(-0.15, 1.12, z);
      c.position.y = 0; r.children.forEach((ch) => (ch.position.y = 0));
      root.add(r); rollers.push(r);
    }
    box(0.4, 0.3, 0.5, mat(PAL.orange), 0.6, 0.72, -0.45, root);
    chute(root, 0.85, 0.3, 0);
    const light = statusLight(root, 0.6, 1.06, -0.45);
    return {
      root,
      update(dt, t, b) {
        const w = b.state === 'working';
        rollers[0].rotation.y += dt * (w ? 6 : 0);
        rollers[1].rotation.y -= dt * (w ? 6 : 0);
        root.children[1].position.y = 0.12 + (w ? Math.sin(t * 40) * 0.008 : 0);
        setLight(light, b.state);
      },
    };
  },

  sawmill() {
    const root = new THREE.Group();
    base(2, 2, root, 0x8c7b5e);
    box(1.5, 0.7, 1.2, mat(PAL.wood), -0.1, 0.12, -0.15, root);
    prismRoof(1.6, 1.35, 0.5, mat(0x3f6e4a), -0.1, 0.82, -0.15, root);
    box(1.2, 0.3, 0.3, mat(PAL.darkWood), 0.1, 0.12, 0.6, root);
    const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18), mat(0xd0d6dc, { metal: 0.8, rough: 0.3 }));
    saw.rotation.x = Math.PI / 2; saw.position.set(0.15, 0.5, 0.6); root.add(saw);
    chute(root, 0.85, 0.3, 0.1);
    const light = statusLight(root, 0.66, 0.9, -0.3);
    return { root, update(dt, t, b) { if (b.state === 'working') saw.rotation.y += dt * 20; setLight(light, b.state); } };
  },

  smelter() {
    const root = new THREE.Group();
    base(2, 2, root, 0x9b8f84);
    box(1.4, 0.9, 1.3, mat(PAL.brick), -0.1, 0.12, 0, root);
    // faixas de tijolo
    for (let i = 0; i < 3; i++) box(1.42, 0.04, 1.32, mat(0x8a3e2c), -0.1, 0.3 + i * 0.25, 0, root);
    const chimney = cyl(0.17, 0.22, 1.3, 10, mat(0x7a3a2a), -0.45, 1.0, -0.35, root);
    cyl(0.21, 0.21, 0.1, 10, mat(PAL.black), -0.45, 2.25, -0.35, root);
    // boca do forno brilhante
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 2 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.55), glowMat);
    mouth.position.set(0.61, 0.45, 0); root.add(mouth);
    box(0.08, 0.06, 0.65, mat(PAL.black), 0.62, 0.64, 0, root);
    // cadinho
    cyl(0.25, 0.18, 0.3, 10, mat(PAL.darkSteel, { metal: 0.5 }), 0.25, 1.02, 0.35, root);
    chute(root, 0.85, 0.2, 0.55);
    const light = statusLight(root, 0.62, 0.9, -0.45);
    const pl = new THREE.PointLight(0xff7a1a, 0, 3);
    pl.position.set(0.9, 0.5, 0); root.add(pl);
    return {
      root, smokeAt: new THREE.Vector3(-0.45, 2.4, -0.35),
      update(dt, t, b) {
        const w = b.state === 'working';
        glowMat.emissiveIntensity = w ? 1.8 + Math.sin(t * 7) * 0.5 + Math.sin(t * 13) * 0.3 : 0.25;
        pl.intensity = w ? 2.2 + Math.sin(t * 9) * 0.5 : 0;
        setLight(light, b.state);
      },
    };
  },

  refinery() {
    const root = new THREE.Group();
    base(3, 3, root, 0xa7a49d);
    box(2.4, 0.4, 2.4, mat(0xcfd5db), 0, 0.12, 0, root);
    const tanks = [];
    for (const [x, z, h, c] of [[-0.7, -0.7, 1.6, 0xe9eef3], [-0.7, 0.55, 1.2, 0xf2c14e], [0.35, -0.8, 1.0, 0xe9eef3]]) {
      const tk = cyl(0.42, 0.42, h, 14, mat(c, { metal: 0.3, rough: 0.5 }), x, 0.52, z, root);
      cyl(0.44, 0.44, 0.05, 14, mat(PAL.darkSteel), x, 0.52 + h * 0.6, z, root);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, { metal: 0.3 }));
      dome.position.set(x, 0.52 + h, z); dome.castShadow = true; root.add(dome);
      tanks.push(tk);
    }
    // coluna de destilação
    cyl(0.18, 0.2, 2.2, 10, mat(PAL.steel, { metal: 0.5 }), 0.55, 0.52, 0.45, root);
    for (let i = 0; i < 5; i++) cyl(0.24, 0.24, 0.05, 10, mat(PAL.orange), 0.55, 0.8 + i * 0.4, 0.45, root);
    // tubos
    const p1 = cyl(0.06, 0.06, 1.3, 8, mat(PAL.darkSteel, { metal: 0.6 }), -0.1, 1.5, 0, root); p1.rotation.z = Math.PI / 2;
    const p2 = cyl(0.06, 0.06, 1.3, 8, mat(PAL.darkSteel, { metal: 0.6 }), -0.1, 1.2, -0.2, root); p2.rotation.x = Math.PI / 2;
    const flare = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xff7a00, emissiveIntensity: 2.5 }));
    flare.position.set(0.55, 2.9, 0.45); root.add(flare);
    // painel
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x22ff88, emissiveIntensity: 0.8 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.6), panelMat);
    panel.position.set(1.21, 0.75, -0.6); root.add(panel);
    chute(root, 1.35, 0.25, 0);
    const light = statusLight(root, 1.2, 1.05, -0.6);
    return {
      root,
      update(dt, t, b) {
        const w = b.state === 'working';
        flare.visible = w;
        flare.scale.y = 1 + Math.sin(t * 15) * 0.3;
        panelMat.emissiveIntensity = w ? 0.8 + Math.sin(t * 3) * 0.3 : 0.1;
        setLight(light, b.state);
      },
    };
  },

  generator() {
    const root = new THREE.Group();
    base(2, 2, root, 0x9fa5ab);
    box(1.5, 0.75, 1.1, mat(0x4f8f5a), -0.1, 0.12, -0.15, root);
    box(1.52, 0.08, 1.12, mat(PAL.darkSteel), -0.1, 0.87, -0.15, root);
    const stack = cyl(0.14, 0.16, 1.1, 10, mat(PAL.darkSteel, { metal: 0.5 }), -0.6, 0.9, -0.45, root);
    // ventoinha no topo
    const fan = new THREE.Group();
    for (let i = 0; i < 4; i++) { const bl = box(0.6, 0.02, 0.12, mat(0xd8dde2, { metal: 0.6 }), 0, 0, 0, fan); bl.rotation.y = (i * Math.PI) / 2; bl.position.set(Math.cos((i * Math.PI) / 2) * 0.15, 0, -Math.sin((i * Math.PI) / 2) * 0.15); }
    cyl(0.36, 0.36, 0.06, 16, mat(PAL.black), 0, -0.02, 0, fan);
    fan.position.set(0.25, 0.97, -0.15); root.add(fan);
    // símbolo de raio
    const bolt = new THREE.Shape();
    bolt.moveTo(0, 0.25); bolt.lineTo(-0.1, 0); bolt.lineTo(0.02, 0); bolt.lineTo(-0.05, -0.25); bolt.lineTo(0.12, 0.05); bolt.lineTo(0, 0.05); bolt.lineTo(0.06, 0.25);
    const boltMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.02, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffc400, emissiveIntensity: 0.8 }));
    boltMesh.position.set(-0.1, 0.5, 0.41); root.add(boltMesh);
    // bobina/pilha de carvão
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), mat(0x26262b)); c.position.set(0.35 + (i % 2) * 0.2, 0.2 + (i > 1 ? 0.15 : 0), 0.6); c.castShadow = true; root.add(c); }
    const light = statusLight(root, 0.55, 0.97, -0.6);
    return {
      root, smokeAt: new THREE.Vector3(-0.6, 2.05, -0.45),
      update(dt, t, b) {
        const w = b.state === 'working';
        fan.rotation.y += dt * (w ? 10 + (b.load || 0) * 10 : 0);
        boltMesh.material.emissiveIntensity = w ? 0.8 + Math.sin(t * 8) * 0.4 : 0.05;
        setLight(light, b.state);
      },
    };
  },

  pole() {
    const root = new THREE.Group();
    box(0.5, 0.1, 0.5, mat(PAL.concrete), 0, 0, 0, root);
    const m = mat(0x7d8790, { metal: 0.5 });
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
      const l = cyl(0.025, 0.03, 2.2, 5, m, x, 0.1, z, root);
      l.rotation.z = -x * 0.25; l.rotation.x = z * 0.25;
    }
    for (let i = 0; i < 4; i++) box(0.36 - i * 0.05, 0.03, 0.36 - i * 0.05, m, 0, 0.5 + i * 0.5, 0, root);
    box(0.9, 0.05, 0.06, m, 0, 2.2, 0, root);
    for (const x of [-0.4, 0.4]) cyl(0.04, 0.05, 0.14, 8, mat(0xcfe8ff), x, 2.25, 0, root);
    const tip = statusLight(root, 0, 2.38, 0);
    return { root, update(dt, t, b) { tip.material.emissiveIntensity = b.powered ? 1 + Math.sin(t * 4) : 0.1; tip.material.color.setHex(b.powered ? 0x6ad7ff : 0x555555); tip.material.emissive.setHex(b.powered ? 0x6ad7ff : 0x222222); } };
  },

  warehouse() {
    const root = new THREE.Group();
    base(2, 2, root);
    box(1.6, 0.9, 1.5, mat(0xd8c9a8), -0.1, 0.12, 0, root);
    prismRoof(1.7, 1.7, 0.45, mat(PAL.roof), -0.1, 1.02, 0, root, false);
    // porta de enrolar
    box(0.04, 0.6, 0.8, mat(0x8e98a3, { metal: 0.4 }), 0.71, 0.12, 0, root);
    for (let i = 0; i < 6; i++) box(0.05, 0.02, 0.8, mat(0x6c7681), 0.72, 0.18 + i * 0.1, 0, root);
    // caixotes
    box(0.3, 0.3, 0.3, mat(PAL.wood), 0.75, 0.12, -0.65, root);
    box(0.25, 0.25, 0.25, mat(PAL.wood), 0.78, 0.42, -0.62, root);
    // barra de preenchimento
    box(1.2, 0.08, 0.06, mat(PAL.black), -0.1, 0.9, 0.76, root);
    const fill = box(1.2, 0.09, 0.07, mat(0x5cd17a, { emissive: 0x2a8a40, ei: 0.6 }), -0.1, 0.9, 0.77, root);
    chute(root, 0.85, 0.12, 0.6);
    return {
      root,
      update(dt, t, b, sim, cap) {
        let tot = 0; for (const k in b.inv) tot += b.inv[k];
        const f = Math.max(0.001, Math.min(1, tot / (cap || 200)));
        // barra cresce da esquerda para a direita ao longo do eixo z local
        fill.scale.set(f, 1, 1);
        fill.position.set(-0.7 + 0.6 * f, 0.895, 0.77);
      },
    };
  },

  seller() {
    const root = new THREE.Group();
    base(3, 3, root, 0xc9b99a);
    box(2.5, 0.25, 2.5, mat(0xa47c55), 0, 0.12, 0, root);
    box(2.0, 0.9, 1.4, mat(PAL.cream), -0.1, 0.37, -0.35, root);
    // toldo listrado
    for (let i = 0; i < 8; i++) {
      const s = box(0.27, 0.05, 1.0, mat(i % 2 ? PAL.white : PAL.red), -1.03 + i * 0.27, 1.2, 0.55, root);
      s.rotation.x = 0.35;
    }
    box(2.2, 0.35, 0.3, mat(0x6b4f35), -0.1, 0.37, 0.75, root); // balcão
    // placa com moeda giratória
    cyl(0.05, 0.05, 1.8, 8, mat(PAL.darkSteel), 1.05, 0.37, -1.0, root);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xaa7700, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 }));
    coin.rotation.x = Math.PI / 2; coin.position.set(1.05, 2.5, -1.0); coin.castShadow = true; root.add(coin);
    const sym = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16), mat(0xb8860b, { metal: 0.6 }));
    sym.position.z = 0.05; coin.add(sym);
    // caixotes e sacos
    for (let i = 0; i < 3; i++) box(0.3, 0.3, 0.3, mat(PAL.wood), -0.9 + i * 0.35, 0.37, 1.05, root);
    return {
      root,
      update(dt, t, b) { coin.rotation.z += dt * (b.state === 'working' ? 5 : 1); },
    };
  },

  workshop() {
    const root = new THREE.Group();
    base(2, 2, root);
    box(1.5, 0.8, 1.3, mat(0x7fa8c9), -0.1, 0.12, -0.1, root);
    prismRoof(1.6, 1.45, 0.5, mat(0x3f4f63), -0.1, 0.92, -0.1, root);
    const g = gear(0.35, 0.1, 9, mat(PAL.yellow, { metal: 0.5 }));
    g.position.set(0.72, 0.6, -0.1); g.rotation.y = Math.PI / 2; root.add(g);
    const g2 = gear(0.2, 0.1, 7, mat(PAL.orange, { metal: 0.5 }));
    g2.position.set(0.72, 0.95, 0.3); g2.rotation.y = Math.PI / 2; root.add(g2);
    box(0.3, 0.2, 0.2, mat(PAL.black, { metal: 0.6 }), 0.5, 0.12, 0.7, root); // bigorna
    return { root, update(dt) { g.rotation.z += dt * 0.8; g2.rotation.z -= dt * 1.3; } };
  },

  barn() {
    const root = new THREE.Group();
    base(2, 2, root, 0x9a8a63);
    box(1.2, 0.7, 1.2, mat(0xc0392b), -0.25, 0.12, -0.25, root);
    prismRoof(1.3, 1.35, 0.55, mat(0x5a3324), -0.25, 0.82, -0.25, root);
    box(0.04, 0.45, 0.5, mat(PAL.white), 0.36, 0.12, -0.25, root);
    // cercado
    for (let i = 0; i < 5; i++) box(0.05, 0.3, 0.05, mat(PAL.wood), -0.85 + i * 0.4, 0.12, 0.85, root);
    box(1.7, 0.04, 0.04, mat(PAL.wood), -0.05, 0.32, 0.85, root);
    // cocho
    box(0.5, 0.15, 0.25, mat(PAL.darkWood), 0.55, 0.12, 0.45, root);
    chute(root, 0.85, 0.12, -0.6);
    return { root, update() {} };
  },

  splitter() {
    const root = new THREE.Group();
    box(0.9, 0.22, 0.9, mat(0x56606b), 0, 0, 0, root);
    const disc = new THREE.Group();
    cyl(0.3, 0.3, 0.06, 12, mat(PAL.yellow), 0, 0, 0, disc);
    for (let i = 0; i < 3; i++) { const v = box(0.5, 0.08, 0.05, mat(PAL.black), 0, 0.03, 0, disc); v.rotation.y = (i * Math.PI) / 3; }
    disc.position.y = 0.22; root.add(disc);
    // setas de saída
    const arrowM = mat(PAL.orange, { emissive: 0x803000, ei: 0.4 });
    for (const [x, z, r] of [[0.38, 0, 0], [0, 0.38, -Math.PI / 2], [0, -0.38, Math.PI / 2]]) {
      const a = cone(0.09, 0.18, 4, arrowM, 0, 0, 0, root); a.rotation.z = -Math.PI / 2; a.position.set(x, 0.25, z);
      const p = new THREE.Group(); p.add(a); root.add(p); a.position.set(0, 0, 0); p.position.set(x, 0.26, z); p.rotation.y = r;
    }
    return { root, update(dt, t, b) { disc.rotation.y += dt * (b.state === 'working' ? 6 : 0.5); } };
  },
};

export function buildModel(type) {
  const f = FACTORIES[type];
  if (!f) {
    const root = new THREE.Group();
    box(0.9, 0.5, 0.9, mat(0xff00ff), 0, 0, 0, root);
    return { root, update() {} };
  }
  return f();
}

// ---------------------------------------------------------------- itens (recursos)
const itemGeoCache = {};
export function itemGeometry(shape) {
  if (itemGeoCache[shape]) return itemGeoCache[shape];
  let g;
  switch (shape) {
    case 'rock': g = new THREE.DodecahedronGeometry(0.11); break;
    case 'dust': g = new THREE.ConeGeometry(0.13, 0.12, 7); g.translate(0, -0.03, 0); break;
    case 'ingot': { g = new THREE.CylinderGeometry(0.08, 0.11, 0.08, 4); g.rotateY(Math.PI / 4); g.scale(1.6, 1, 0.8); break; }
    case 'crystal': g = new THREE.OctahedronGeometry(0.11); g.scale(0.8, 1.4, 0.8); break;
    case 'log': g = new THREE.CylinderGeometry(0.07, 0.07, 0.28, 7); g.rotateZ(Math.PI / 2); break;
    case 'plank': g = new THREE.BoxGeometry(0.3, 0.05, 0.12); break;
    case 'chip': { const a = new THREE.BoxGeometry(0.18, 0.03, 0.18); const b2 = new THREE.BoxGeometry(0.08, 0.04, 0.08); b2.translate(0, 0.03, 0); g = mergeGeometries([a, b2]); break; }
    default: g = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  }
  itemGeoCache[shape] = g;
  return g;
}
const itemMatCache = {};
export function itemMaterial(res) {
  if (!itemMatCache[res]) {
    const r = RESOURCES[res];
    const shiny = r.category === 'product' || r.shape === 'crystal';
    itemMatCache[res] = new THREE.MeshStandardMaterial({
      color: r.color, roughness: shiny ? 0.3 : 0.85, metalness: r.shape === 'ingot' ? 0.6 : 0.05, flatShading: true,
      emissive: r.shape === 'crystal' ? r.color : 0x000000, emissiveIntensity: r.shape === 'crystal' ? 0.35 : 0,
    });
  }
  return itemMatCache[res];
}

// ---------------------------------------------------------------- porquinho
export function buildPig() {
  const root = new THREE.Group();
  const pink = mat(PAL.pink, { rough: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), pink);
  body.scale.set(1, 0.85, 1.3); body.position.y = 0.3; body.castShadow = true; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), pink);
  head.position.set(0, 0.38, 0.3); head.castShadow = true; root.add(head);
  const snout = cyl(0.07, 0.07, 0.06, 10, mat(0xe88aa0), 0, 0, 0, root);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.36, 0.45);
  for (const x of [-0.07, 0.07]) {
    const ear = cone(0.05, 0.1, 4, pink, x, 0.47, 0.27, root); ear.rotation.x = -0.4;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mat(0x111111)); eye.position.set(x * 0.9, 0.42, 0.42); root.add(eye);
  }
  const legs = [];
  for (const [x, z] of [[-0.1, -0.15], [0.1, -0.15], [-0.1, 0.15], [0.1, 0.15]]) {
    const l = cyl(0.04, 0.04, 0.16, 6, pink, 0, 0, 0, root);
    const p = new THREE.Group(); p.position.set(x, 0.18, z); l.position.set(0, -0.16, 0); p.add(l); root.add(p); legs.push(p);
  }
  // mochila com a carga
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.22), mat(PAL.wood));
  pack.position.set(0, 0.52, -0.05); root.add(pack);
  const cargo = new THREE.Mesh(itemGeometry('rock'), mat(0x999999));
  cargo.position.set(0, 0.65, -0.05); root.add(cargo);
  return {
    root,
    update(dt, t, pig, moving) {
      const sw = moving ? Math.sin(t * 14 + pig.id) * 0.5 : 0;
      legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
      body.position.y = 0.3 + (moving ? Math.abs(Math.sin(t * 14 + pig.id)) * 0.03 : 0);
      pack.visible = !!pig.carry;
      cargo.visible = !!pig.carry;
      if (pig.carry) cargo.material = itemMaterial(pig.carry.r);
    },
  };
}
