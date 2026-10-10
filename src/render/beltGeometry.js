// Geometria das esteiras (retas e curvas) e caminho dos itens sobre elas.
// Espaço local do tile: centro na origem, fluxo de saída para +x.
// Curvas: 'L' = item entra pela esquerda local (-z); 'R' = entra pela direita (+z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BELT_Y = 0.2;

// posição local (x,z) e tangente para progresso t ∈ [0,1]
export function beltPath(shape, t, out) {
  if (shape === 'S') { out.x = t - 0.5; out.z = 0; out.tx = 1; out.tz = 0; return out; }
  const left = shape === 'L';
  const cz = left ? -0.5 : 0.5;
  const a0 = Math.PI, a1 = left ? Math.PI / 2 : (3 * Math.PI) / 2;
  const a = a0 + (a1 - a0) * t;
  out.x = 0.5 + 0.5 * Math.cos(a);
  out.z = cz + 0.5 * Math.sin(a);
  const da = a1 - a0;
  out.tx = -Math.sin(a) * da; out.tz = Math.cos(a) * da;
  const l = Math.hypot(out.tx, out.tz); out.tx /= l; out.tz /= l;
  return out;
}

// fita (ribbon) ao longo do caminho, com UV v percorrendo o comprimento
function ribbon(shape, halfW, y, segs, vScale) {
  const pos = [], uv = [], idx = [];
  const p = {};
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    beltPath(shape, t, p);
    const nx = -p.tz, nz = p.tx; // normal à direita do fluxo
    pos.push(p.x - nx * halfW, y, p.z - nz * halfW, p.x + nx * halfW, y, p.z + nz * halfW);
    uv.push(0, t * vScale, 1, t * vScale);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // garante normais para cima
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) { n.setXYZ(i, 0, 1, 0); }
  // inverte a ordem dos índices se necessário para a face superior ficar visível
  return g;
}

// parede vertical ao longo do caminho, deslocada lateralmente
function wall(shape, offset, y0, y1, thick, segs) {
  const parts = [];
  const p = {}, q = {};
  for (let i = 0; i < segs; i++) {
    beltPath(shape, i / segs, p); beltPath(shape, (i + 1) / segs, q);
    const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
    const tx = q.x - p.x, tz = q.z - p.z;
    const len = Math.hypot(tx, tz);
    const nx = -tz / len, nz = tx / len;
    const b = new THREE.BoxGeometry(len + 0.01, y1 - y0, thick);
    b.rotateY(-Math.atan2(tz, tx));
    b.translate(mx + nx * offset, (y0 + y1) / 2, mz + nz * offset);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

const cache = {};
export function beltGeometries(shape) {
  if (cache[shape]) return cache[shape];
  const segs = shape === 'S' ? 1 : 8;
  const surface = ribbon(shape, 0.33, BELT_Y, segs, shape === 'S' ? 1 : 0.8);
  // ribbon criado com normal para baixo? força orientação correta
  fixWinding(surface);
  const frameParts = [
    wall(shape, 0.38, 0.06, BELT_Y + 0.06, 0.07, segs),
    wall(shape, -0.38, 0.06, BELT_Y + 0.06, 0.07, segs),
  ];
  // leito sob a lona
  const bed = ribbon(shape, 0.36, BELT_Y - 0.03, segs, 1); fixWinding(bed);
  frameParts.push(bed);
  // pés
  for (const t of shape === 'S' ? [0.5] : [0.5]) {
    const p = beltPath(shape, t, {});
    for (const s of [-0.3, 0.3]) {
      const leg = new THREE.BoxGeometry(0.07, 0.14, 0.07);
      leg.translate(p.x + -p.tz * s, 0.07, p.z + p.tx * s);
      frameParts.push(leg);
    }
  }
  const frame = mergeGeometries(frameParts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));
  frame.computeVertexNormals();
  // setas de direção (decalque leve)
  const arrow = new THREE.BufferGeometry();
  const p = beltPath(shape, 0.55, {});
  const nx = -p.tz, nz = p.tx;
  const tip = [p.x + p.tx * 0.14, BELT_Y + 0.005, p.z + p.tz * 0.14];
  const l = [p.x - p.tx * 0.08 - nx * 0.12, BELT_Y + 0.005, p.z - p.tz * 0.08 - nz * 0.12];
  const r = [p.x - p.tx * 0.08 + nx * 0.12, BELT_Y + 0.005, p.z - p.tz * 0.08 + nz * 0.12];
  arrow.setAttribute('position', new THREE.Float32BufferAttribute([...tip, ...l, ...r, ...tip, ...r, ...l], 3));
  arrow.computeVertexNormals();
  cache[shape] = { surface, frame, arrow };
  return cache[shape];
}

function fixWinding(g) {
  // verifica a primeira face; se a normal geométrica apontar para baixo, inverte índices
  const pos = g.attributes.position, idx = g.index.array;
  const a = new THREE.Vector3().fromBufferAttribute(pos, idx[0]);
  const b = new THREE.Vector3().fromBufferAttribute(pos, idx[1]);
  const c = new THREE.Vector3().fromBufferAttribute(pos, idx[2]);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.y < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  g.computeVertexNormals();
}

// textura da lona (listras que se movem)
export function beltTexture(base = '#3a3f47', stripe = '#565d68') {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 32, 64);
  x.fillStyle = stripe;
  for (let i = 0; i < 4; i++) x.fillRect(0, i * 16, 32, 5);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 3, 64); x.fillRect(29, 0, 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
