// Rede elétrica por proximidade: geradores e torres formam redes (união por distância);
// consumidores dentro do raio de um nó pertencem à rede desse nó.
// A cada tick: demanda = soma das máquinas que querem trabalhar; oferta = geradores com combustível.
import { BUILDINGS, FUELS, SIM } from '../../data/config.js';
import { takeInv } from '../util.js';

export function rebuildPower(sim) {
  const nodes = [];
  for (const b of sim.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (def.kind === 'generator' || def.kind === 'pole') {
      const [cx, cz] = sim.center(b);
      nodes.push({ b, cx, cz, radius: def.radius, link: def.kind === 'pole' ? def.link : def.radius + 2 });
    }
  }
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const d = Math.hypot(nodes[i].cx - nodes[j].cx, nodes[i].cz - nodes[j].cz);
    if (d <= Math.max(nodes[i].link, nodes[j].link)) parent[find(i)] = find(j);
  }
  const nets = new Map();
  nodes.forEach((n, i) => {
    const r = find(i);
    if (!nets.has(r)) nets.set(r, { id: r, nodes: [], generators: [], consumers: [], supply: 0, demand: 0, sat: 1 });
    nets.get(r).nodes.push(n);
    if (BUILDINGS[n.b.type].kind === 'generator') nets.get(r).generators.push(n.b);
  });
  const list = [...nets.values()];
  for (const b of sim.buildings.values()) {
    b.net = -1;
    const def = BUILDINGS[b.type];
    if (!def.power) continue;
    const [cx, cz] = sim.center(b);
    const half = Math.max(...sim.footprint(b.type, b.rot)) / 2;
    let best = null, bestD = 1e9;
    for (const net of list) for (const n of net.nodes) {
      const d = Math.hypot(n.cx - cx, n.cz - cz);
      if (d <= n.radius + half && d < bestD) { best = net; bestD = d; }
    }
    if (best) { best.consumers.push(b); b.net = best.id; }
  }
  sim.power.networks = list;
  sim.power.dirty = false;
  sim.events.emit('power', {});
}

export function generatorOutput(sim, b) {
  return BUILDINGS[b.type].output * (1 + SIM.upgradeSpeedBonus * (b.level - 1));
}

export function updatePower(sim, dt) {
  let totSupply = 0, totDemand = 0;
  const fuelMult = 1 + sim.progression.effect('power');
  // consumidores sem rede: sem energia
  for (const b of sim.buildings.values()) if (BUILDINGS[b.type].power && b.net === -1) b.sat = 0;
  for (const net of sim.power.networks) {
    let demand = 0;
    for (const c of net.consumers) if (c.enabled && c.wantsPower) demand += BUILDINGS[c.type].power;
    // geradores com combustível disponível
    let capacity = 0;
    const active = [];
    for (const g of net.generators) {
      if (!g.enabled) { g.state = 'off'; g.reason = 'Desligado'; continue; }
      const hasFuel = g.fuel > 0 || Object.keys(g.inv).some((r) => FUELS[r]);
      if (!hasFuel) { g.state = 'no_fuel'; g.reason = 'Sem combustível: envie Carvão ou Madeira'; continue; }
      capacity += generatorOutput(sim, g);
      active.push(g);
    }
    const load = capacity > 0 ? Math.min(1, demand / capacity) : 0;
    for (const g of active) {
      if (demand <= 0) { g.state = 'idle'; g.reason = 'Sem demanda na rede'; g.load = 0; continue; }
      g.load = load;
      g.fuel -= (dt * load) / fuelMult;
      if (g.fuel <= 0) {
        // queima nova unidade de combustível (carvão preferencialmente)
        const r = g.inv.coal ? 'coal' : (g.inv.wood ? 'wood' : null);
        if (r) { takeInv(g.inv, r, 1); sim.countDestroyed(r, 1); g.fuel += FUELS[r].burnTime; g.burning = r; }
        else g.fuel = 0;
      }
      g.state = 'working'; g.reason = '';
    }
    net.supply = capacity; net.demand = demand;
    net.sat = demand <= 0 ? 1 : Math.min(1, capacity / demand);
    for (const c of net.consumers) c.sat = net.sat;
    totSupply += capacity; totDemand += demand;
  }
  sim.power.supply = totSupply;
  sim.power.demand = totDemand;
}
