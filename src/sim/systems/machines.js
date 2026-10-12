// Sistema de máquinas: mineração, processamento por receitas, armazenagem, venda e divisores.
import { SIM, BUILDINGS, RECIPES, RESOURCES, FUELS, DEPOSITS } from '../../data/config.js';
import { DEPOSIT_TYPES } from '../WorldMap.js';
import { addInv, takeInv, invTotal, DX, DZ } from '../util.js';

const levelSpeed = (b) => 1 + SIM.upgradeSpeedBonus * (b.level - 1);
const levelCap = (b) => 1 + SIM.upgradeCapBonus * (b.level - 1);

export function machineCapacity(sim, b) {
  const def = BUILDINGS[b.type];
  switch (def.kind) {
    case 'storage': return Math.round(def.capacity * levelCap(b) * (1 + sim.progression.effect('storage')));
    case 'barn': return 30;
    case 'splitter': return 2;
    case 'generator': return 10;
    default: return Math.round(SIM.machineBufferCap * levelCap(b));
  }
}

function recipesFor(b) {
  const def = BUILDINGS[b.type];
  if (b.recipe) return [b.recipe];
  return def.recipes || [];
}

export function machineAccepts(sim, b, res) {
  const def = BUILDINGS[b.type];
  if (!RESOURCES[res]) return false;
  switch (def.kind) {
    case 'seller': return true;
    case 'storage': return invTotal(b.inv) < machineCapacity(sim, b);
    case 'splitter': return invTotal(b.inv) < 2;
    case 'sorter': return invTotal(b.inv) < 2;
    case 'generator': return !!FUELS[res] && (b.inv[res] || 0) < machineCapacity(sim, b);
    case 'processor': {
      const cap = machineCapacity(sim, b);
      for (const id of recipesFor(b)) {
        const need = RECIPES[id].in[res];
        if (need && (b.inv[res] || 0) < Math.max(cap, need * 2)) return true;
      }
      return false;
    }
    default: return false;
  }
}

export function machineInsert(sim, b, res) {
  const def = BUILDINGS[b.type];
  if (def.kind === 'seller') {
    sim.countDestroyed(res, 1);
    const v = sim.economy.sellValue(res);
    sim.economy.earn(v, 'vendas');
    sim.stats.sold[res] = (sim.stats.sold[res] || 0) + 1;
    const cat = RESOURCES[res].category;
    sim.stats.soldCat[cat] = (sim.stats.soldCat[cat] || 0) + 1;
    if (cat !== 'raw') sim.stats.soldCat.processed_any = (sim.stats.soldCat.processed_any || 0) + 1;
    sim.stats.revenue += v;
    b.secCount++;
    b.lastSale = sim.time;
    sim.events.emit('sold', { b, res, value: v });
    return;
  }
  addInv(b.inv, res, 1);
  if (def.kind === 'processor') sim.stats.delivered[b.type] = (sim.stats.delivered[b.type] || 0) + 1;
}

// tenta empurrar 1 unidade de algum recurso do inventário `src` pelas saídas, em rodízio
function emit(sim, b, src) {
  const targets = sim.outputTargets(b);
  if (!targets.length) return false;
  const keys = Object.keys(src);
  if (!keys.length) return false;
  for (let k = 0; k < keys.length; k++) {
    const res = keys[(b.outRR + k) % keys.length];
    for (let t = 0; t < targets.length; t++) {
      const tg = targets[(b.outRR + t) % targets.length];
      if (sim.pushTo(tg.x, tg.z, tg.dir, res, b.id)) {
        takeInv(src, res, 1);
        b.outRR = (b.outRR + 1) % 1024;
        return true;
      }
    }
  }
  return false;
}

function setState(b, state, reason = '') { b.state = state; b.reason = reason; }

export function updateMachines(sim, dt) {
  for (const b of sim.buildings.values()) {
    const def = BUILDINGS[b.type];
    switch (def.kind) {
      case 'miner': updateMiner(sim, b, def, dt); break;
      case 'lumber': updateLumber(sim, b, def, dt); break;
      case 'processor': updateProcessor(sim, b, def, dt); break;
      case 'storage':
        if (b.outputEnabled) emit(sim, b, b.inv);
        setState(b, invTotal(b.inv) >= machineCapacity(sim, b) ? 'output_full' : (invTotal(b.inv) ? 'working' : 'idle'),
          invTotal(b.inv) >= machineCapacity(sim, b) ? 'Armazém cheio' : '');
        break;
      case 'splitter': updateSplitter(sim, b, dt); break;
      case 'sorter': updateSorter(sim, b); break;
      case 'crossing': updateCrossing(sim, b, dt); break;
      case 'barn': if (b.outputEnabled !== false) emit(sim, b, b.inv); break;
      case 'seller': setState(b, sim.time - (b.lastSale ?? -99) < 3 ? 'working' : 'idle'); break;
      case 'workshop': setState(b, 'working'); break;
      default: break;
    }
  }
}

function updateMiner(sim, b, def, dt) {
  // escoa a produção pendente primeiro (uma unidade por tick)
  emit(sim, b, b.out);
  b.wantsPower = false;
  if (!b.enabled) return setState(b, 'off', 'Desligada');
  const cap = machineCapacity(sim, b);
  if (invTotal(b.out) >= cap) return setState(b, 'output_full', 'Saída bloqueada: conecte uma esteira na frente');
  const tiles = minerTiles(sim, b, def);
  if (!tiles.length) return setState(b, 'no_deposit', 'Depósito esgotado ou inexistente');
  if (def.power) {
    b.wantsPower = true;
    if (b.sat <= 0) return setState(b, 'no_power', 'Sem energia: fora do alcance de geradores ou gerador sem combustível');
  }
  const sat = def.power ? b.sat : 1;
  const rate = def.rate * levelSpeed(b) * (1 + sim.progression.effect('mining')) * sat;
  b.progress += rate * dt;
  setState(b, 'working', sat < 1 ? 'Energia insuficiente: velocidade reduzida' : '');
  while (b.progress >= 1) {
    b.progress -= 1;
    const i = tiles[b.depRR % tiles.length];
    b.depRR++;
    const res = DEPOSIT_TYPES[sim.map.depType[i]];
    sim.map.depAmount[i] -= 1;
    addInv(b.out, res, 1);
    sim.countCreated(res, 1);
    sim.stats.extracted[res] = (sim.stats.extracted[res] || 0) + 1;
    sim.noteProduced(b, res, 1);
    if (invTotal(b.out) >= cap) { b.progress = 0; break; }
  }
}

export function minerTiles(sim, b, def) {
  const out = [];
  for (const [cx, cz] of sim.cells(b)) {
    const i = sim.map.idx(cx, cz);
    const t = sim.map.depType[i];
    if (t < 0) continue;
    const res = DEPOSIT_TYPES[t];
    if (res === 'wood') continue;
    if (DEPOSITS[res].hardness > (def.hardness || 1)) continue;
    if (sim.map.depAmount[i] >= 1) out.push(i);
  }
  return out;
}

function updateLumber(sim, b, def, dt) {
  emit(sim, b, b.out);
  if (!b.enabled) return setState(b, 'off', 'Desligado');
  const cap = machineCapacity(sim, b);
  if (invTotal(b.out) >= cap) return setState(b, 'output_full', 'Saída bloqueada');
  if (!b._trees || sim.structVersion !== b._treesV || (sim.time - (b._treesT || 0)) > 5) {
    b._trees = sim.treesNear(b); b._treesV = sim.structVersion; b._treesT = sim.time;
  }
  const trees = b._trees.filter((i) => sim.map.depAmount[i] >= 1);
  if (!trees.length) return setState(b, 'no_deposit', 'Sem árvores disponíveis (aguarde regenerar)');
  b.progress += def.rate * levelSpeed(b) * (1 + sim.progression.effect('mining')) * dt;
  setState(b, 'working');
  if (b.progress >= 1) {
    b.progress -= 1;
    const i = trees[b.depRR++ % trees.length];
    sim.map.depAmount[i] -= 1;
    addInv(b.out, 'wood', 1);
    sim.countCreated('wood', 1);
    sim.stats.extracted.wood = (sim.stats.extracted.wood || 0) + 1;
    sim.noteProduced(b, 'wood', 1);
  }
}

function hasInputs(b, recipe) {
  for (const r in recipe.in) if ((b.inv[r] || 0) < recipe.in[r]) return false;
  return true;
}

function updateProcessor(sim, b, def, dt) {
  emit(sim, b, b.out);
  b.wantsPower = false;
  if (!b.enabled) return setState(b, 'off', 'Desligada');
  const cap = machineCapacity(sim, b);
  // escolhe receita
  if (!b.crafting) {
    const options = recipesFor(b);
    let chosen = null;
    for (const id of options) if (hasInputs(b, RECIPES[id])) { chosen = id; break; }
    if (!chosen) {
      const want = options.map((id) => Object.keys(RECIPES[id].in).map((r) => RESOURCES[r].name).join(' + ')).join(' | ');
      return setState(b, 'no_input', 'Aguardando insumos: ' + want);
    }
    // espaço na saída?
    const rec = RECIPES[chosen];
    for (const r in rec.out) if ((b.out[r] || 0) + rec.out[r] > cap) return setState(b, 'output_full', 'Saída cheia: conecte uma esteira na frente');
    // consome insumos no início do ciclo (contabilizado como destruído)
    for (const r in rec.in) { takeInv(b.inv, r, rec.in[r]); sim.countDestroyed(r, rec.in[r]); }
    b.crafting = chosen;
    b.progress = 0;
  }
  const rec = RECIPES[b.crafting];
  if (def.power) {
    b.wantsPower = true;
    if (b.sat <= 0) return setState(b, 'no_power', 'Sem energia: conecte a um Gerador (ou Torre) com combustível');
  }
  const sat = def.power ? b.sat : 1;
  const speed = levelSpeed(b) * (1 + sim.progression.effect('process')) * sat;
  b.progress += (dt * speed) / rec.time;
  setState(b, 'working', sat < 1 ? 'Energia insuficiente: velocidade reduzida' : '');
  if (b.progress >= 1) {
    for (const r in rec.out) {
      addInv(b.out, r, rec.out[r]);
      sim.countCreated(r, rec.out[r]);
      sim.noteProduced(b, r, rec.out[r]);
    }
    b.crafting = null;
    b.progress = 0;
  }
}

function updateSplitter(sim, b) {
  const res = Object.keys(b.inv)[0];
  if (!res) { b.state = 'idle'; return; }
  const targets = sim.outputTargets(b);
  for (let t = 0; t < targets.length; t++) {
    const tg = targets[(b.splitRR + t) % targets.length];
    if (sim.pushTo(tg.x, tg.z, tg.dir, res, b.id)) {
      takeInv(b.inv, res, 1);
      b.splitRR = (b.splitRR + t + 1) % targets.length;
      b.state = 'working';
      return;
    }
  }
  b.state = 'output_full';
}

// Seletor: o recurso escolhido sai pela esquerda; os demais seguem em frente.
function updateSorter(sim, b) {
  const res = Object.keys(b.inv)[0];
  if (!res) { b.state = 'idle'; b.reason = b.filter ? '' : 'Escolha o recurso a separar'; return; }
  const side = b.filter && res === b.filter ? 3 : 0;
  const dir = (b.rot + side) & 3;
  if (sim.pushTo(b.x + DX[dir], b.z + DZ[dir], dir, res, b.id)) { takeInv(b.inv, res, 1); b.state = 'working'; b.reason = ''; }
  else { b.state = 'output_full'; b.reason = side === 3 ? 'Saída lateral (esquerda) bloqueada' : 'Saída frontal bloqueada'; }
}

// Cruzamento: cada item atravessa o tile em linha reta, na direção em que entrou.
function updateCrossing(sim, b, dt) {
  const step = BUILDINGS[b.type].speed * (1 + sim.progression.effect('belt')) * dt;
  let blocked = false;
  for (let i = b.items.length - 1; i >= 0; i--) {
    const it = b.items[i];
    it.pp = it.p;
    it.p = Math.min(1, it.p + step);
    if (it.p >= 1) {
      if (sim.pushTo(b.x + DX[it.d], b.z + DZ[it.d], it.d, it.r, b.id)) b.items.splice(i, 1);
      else blocked = true;
    }
  }
  b.state = blocked ? 'blocked' : b.items.length ? 'working' : 'idle';
}
