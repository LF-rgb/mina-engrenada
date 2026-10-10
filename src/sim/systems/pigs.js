// Porquinhos carregadores: unidades que buscam itens nas saídas de mineradoras,
// acampamentos e armazéns próximos ao chiqueiro e os trazem de volta.
// A carga do porco é contabilizada como item existente (sem perda nem duplicação).
import { BUILDINGS } from '../../data/config.js';
import { takeInv, addInv, invTotal } from '../util.js';
import { machineCapacity } from './machines.js';

export function pigCount(b) { return BUILDINGS[b.type].pigs + (b.level - 1); }

export function spawnPigsForBarn(sim, barn) {
  const have = sim.pigs.filter((p) => p.barn === barn.id).length;
  const [cx, cz] = sim.center(barn);
  for (let i = have; i < pigCount(barn); i++) {
    sim.pigs.push({ id: sim.nextId++, barn: barn.id, x: cx + (i - 1) * 0.4, z: cz + 0.8, px: cx, pz: cz, state: 'idle', target: 0, carry: null, wait: i * 0.7, heading: 0 });
  }
}

function sourceStock(b) {
  const kind = BUILDINGS[b.type].kind;
  if (kind === 'miner' || kind === 'lumber') return b.out;
  if (kind === 'storage') return b.inv;
  return null;
}

function moveToward(p, tx, tz, speed, dt) {
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  p.px = p.x; p.pz = p.z;
  if (d < 0.05) return true;
  const s = Math.min(d, speed * dt);
  p.x += (dx / d) * s; p.z += (dz / d) * s;
  p.heading = Math.atan2(dx, dz);
  return d - s < 0.4;
}

export function updatePigs(sim, dt) {
  for (const p of sim.pigs) {
    const barn = sim.buildings.get(p.barn);
    if (!barn) continue;
    const def = BUILDINGS[barn.type];
    const [bx, bz] = sim.center(barn);
    const speed = def.pigSpeed * (1 + 0.1 * (barn.level - 1));
    p.px = p.x; p.pz = p.z;
    if (!barn.enabled) { p.state = p.carry ? 'toBarn' : 'idle'; }
    if (p.state === 'idle') {
      p.wait -= dt;
      if (p.wait > 0 || !barn.enabled) continue;
      if (p.carry) { p.state = 'toBarn'; continue; }
      // escolhe a fonte com mais estoque e menos porcos indo até ela
      let best = null, bestScore = 0;
      for (const b of sim.buildings.values()) {
        const st = sourceStock(b);
        if (!st || b.id === barn.id) continue;
        const [cx, cz] = sim.center(b);
        const d = Math.hypot(cx - bx, cz - bz);
        if (d > def.radius) continue;
        const stock = invTotal(st);
        if (stock <= 0) continue;
        const claimed = sim.pigs.filter((q) => q.target === b.id && q.state === 'toSource').length;
        const score = stock / (1 + claimed * 3) - d * 0.05;
        if (score > bestScore) { best = b; bestScore = score; }
      }
      if (best) { p.state = 'toSource'; p.target = best.id; } else p.wait = 1;
    } else if (p.state === 'toSource') {
      const src = sim.buildings.get(p.target);
      if (!src) { p.state = 'idle'; p.target = 0; continue; }
      const [cx, cz] = sim.center(src);
      if (moveToward(p, cx, cz, speed, dt)) {
        const st = sourceStock(src);
        const res = st && Object.keys(st)[0];
        if (res) {
          const n = takeInv(st, res, def.carry);
          p.carry = { r: res, n };
        }
        p.state = 'toBarn';
      }
    } else if (p.state === 'toBarn') {
      if (moveToward(p, bx, bz, speed, dt)) {
        if (p.carry) {
          const space = machineCapacity(sim, barn) - invTotal(barn.inv);
          if (space <= 0) { p.wait = 0.5; continue; } // espera sem perder a carga
          const n = Math.min(space, p.carry.n);
          addInv(barn.inv, p.carry.r, n);
          p.carry.n -= n;
          if (p.carry.n <= 0) p.carry = null;
        }
        if (!p.carry) { p.state = 'idle'; p.target = 0; p.wait = 0.4; }
      }
    }
  }
  // estado do chiqueiro
  for (const b of sim.buildings.values()) {
    if (BUILDINGS[b.type].kind !== 'barn') continue;
    const busy = sim.pigs.some((p) => p.barn === b.id && p.state !== 'idle');
    b.state = !b.enabled ? 'off' : invTotal(b.inv) >= machineCapacity(sim, b) ? 'output_full' : busy ? 'working' : 'idle';
    b.reason = b.state === 'output_full' ? 'Chiqueiro cheio: conecte uma esteira na frente' : b.state === 'idle' ? 'Nenhuma fonte com estoque no raio' : '';
  }
}
