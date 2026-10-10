// Sistema de esteiras: transporte lógico de itens em tiles.
// Cada esteira guarda até N itens com progresso p ∈ [0,1] (0 = início, 1 = fim).
// Itens nunca são criados nem destruídos aqui: apenas mudam de dono via sim.pushTo().
import { SIM, BUILDINGS } from '../../data/config.js';
import { DX, DZ } from '../util.js';

const MAX_ITEMS = Math.round(1 / SIM.beltSpacing);

export function beltSpeed(sim, b) {
  return BUILDINGS[b.type].speed * (1 + sim.progression.effect('belt'));
}

export function beltAccepts(sim, b) {
  if (b.items.length >= MAX_ITEMS) return false;
  if (b.items.length === 0) return true;
  return b.items[b.items.length - 1].p >= SIM.beltSpacing; // espaço no início
}

export function beltInsert(sim, b, res) {
  b.items.push({ r: res, p: 0, pp: 0 });
}

export function updateBelts(sim, dt) {
  const spacing = SIM.beltSpacing;
  for (const b of sim.buildings.values()) {
    if (BUILDINGS[b.type].kind !== 'belt') continue;
    const items = b.items;
    if (items.length === 0) { b.state = 'idle'; continue; }
    const step = beltSpeed(sim, b) * dt;
    // avança do item da frente para o de trás, respeitando o espaçamento
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.pp = it.p;
      const limit = i === 0 ? 1 : items[i - 1].p - spacing;
      it.p = Math.max(it.p, Math.min(it.p + step, limit));
    }
    // item da frente chegou ao fim: tenta transferir ao vizinho
    const front = items[0];
    if (front.p >= 1) {
      const nx = b.x + DX[b.rot], nz = b.z + DZ[b.rot];
      if (sim.pushTo(nx, nz, b.rot, front.r, b.id)) {
        items.shift();
        // o novo dono posiciona o item em p=0; para animação suave guardamos o excesso
        const t = sim.at(nx, nz);
        if (t && BUILDINGS[t.type].kind === 'belt') {
          const last = t.items[t.items.length - 1];
          last.pp = -0.0001; // marca de entrada (renderização interpola a partir da borda)
        }
        b.state = 'working';
      } else {
        front.p = 1;
        b.state = 'blocked';
      }
    } else b.state = 'working';
  }
}
