// =====================================================================
// Simulation: estado autoritativo do jogo. Não conhece Three.js nem DOM.
// A renderização apenas LÊ este estado; a interface chama os métodos públicos.
// =====================================================================
import { SIM, BUILDINGS, RESOURCES, RECIPES, TECHS, REGIONS, SAVE_VERSION } from '../data/config.js';
import { WorldMap, TERRAIN, DEPOSIT_TYPES } from './WorldMap.js';
import { DX, DZ, opposite, Emitter, addInv, invTotal } from './util.js';
import { updateBelts, beltAccepts, beltInsert } from './systems/belts.js';
import { updateMachines, machineAccepts, machineInsert, machineCapacity } from './systems/machines.js';
import { rebuildPower, updatePower } from './systems/power.js';
import { updatePigs, spawnPigsForBarn } from './systems/pigs.js';
import { Economy } from './systems/economy.js';
import { Progression } from './systems/progression.js';

export class Simulation {
  constructor({ seed, empty = false } = {}) {
    this.events = new Emitter();
    this.map = new WorldMap(seed);
    this.buildings = new Map();       // id -> building
    this.occ = new Int32Array(this.map.w * this.map.h); // id ocupante (0 = livre)
    this.pigs = [];
    this.nextId = 1;
    this.time = 0;
    this.paused = false;
    this.gameId = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    this.createdAt = new Date().toISOString();
    this.economy = new Economy(this);
    this.progression = new Progression(this);
    this.stats = { built: {}, extracted: {}, produced: {}, sold: {}, soldCat: {}, delivered: {}, revenue: 0 };
    // contabilidade de unidades (detecção de duplicação/perda): criadas e destruídas por recurso
    this.units = { created: {}, destroyed: {} };
    this.power = { networks: [], dirty: true, supply: 0, demand: 0 };
    this.secAcc = 0;
    this.prodWindow = new Array(60).fill(0);  // itens produzidos por segundo (janela de 60s)
    this.profitWindow = new Array(60).fill(0);
    this.curSec = { prod: 0, profit: 0 };
    this.alerts = [];
    if (!empty) this.setupNewGame();
  }

  // -------------------------------------------------- inicialização
  setupNewGame() {
    this.economy.money = SIM.startMoney;
    this.progression.unlockRegion('valley', true);
    this.placeBuilding('seller', 40, 33, 2, { free: true, silent: true });
  }

  def(type) { return BUILDINGS[type]; }

  // -------------------------------------------------- geometria
  footprint(type, rot) {
    const [w, d] = BUILDINGS[type].size;
    return rot & 1 ? [d, w] : [w, d];
  }
  cells(b) {
    const [w, d] = this.footprint(b.type, b.rot);
    const out = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) out.push([b.x + x, b.z + z]);
    return out;
  }
  center(b) {
    const [w, d] = this.footprint(b.type, b.rot);
    return [b.x + w / 2, b.z + d / 2];
  }
  // células da borda num lado local (0 frente,1 direita,2 trás,3 esquerda) e direção do mundo
  edge(b, localSide) {
    const dir = (b.rot + localSide) & 3;
    const [w, d] = this.footprint(b.type, b.rot);
    const cells = [];
    if (dir === 0) for (let z = 0; z < d; z++) cells.push([b.x + w - 1, b.z + z]);
    if (dir === 2) for (let z = 0; z < d; z++) cells.push([b.x, b.z + z]);
    if (dir === 1) for (let x = 0; x < w; x++) cells.push([b.x + x, b.z + d - 1]);
    if (dir === 3) for (let x = 0; x < w; x++) cells.push([b.x + x, b.z]);
    return { dir, cells };
  }
  // alvos de saída (células vizinhas) de uma estrutura
  outputTargets(b) {
    const def = BUILDINGS[b.type];
    if (!def.outputs) return [];
    if (!b._targets) {
      const t = [];
      for (const s of def.outputs) {
        const { dir, cells } = this.edge(b, s);
        // saída centralizada: em máquinas 3x3 só a célula do meio; em 2x2 as duas
        const use = cells.length === 3 ? [cells[1]] : cells;
        for (const [cx, cz] of use) t.push({ x: cx + DX[dir], z: cz + DZ[dir], dir });
      }
      b._targets = t;
    }
    return b._targets;
  }
  at(x, z) {
    if (!this.map.inBounds(x, z)) return null;
    const id = this.occ[this.map.idx(x, z)];
    return id ? this.buildings.get(id) : null;
  }

  // -------------------------------------------------- transferência de itens (única porta de entrada)
  // Tenta entregar 1 unidade de `res` na célula (x,z), vinda na direção `dir` (sentido do movimento).
  // Retorna true se a unidade foi aceita (e passa a pertencer ao destino).
  pushTo(x, z, dir, res, sourceId) {
    const t = this.at(x, z);
    if (!t || t.id === sourceId) return false;
    const def = BUILDINGS[t.type];
    if (def.kind === 'belt') {
      if (t.rot === opposite(dir)) return false; // esteira apontando de volta
      if (!beltAccepts(this, t)) return false;
      beltInsert(this, t, res);
      return true;
    }
    // lado local por onde o item entra no destino
    const fromDir = opposite(dir);
    const side = (fromDir - t.rot + 4) & 3;
    if (!def.inputs || !def.inputs.includes(side)) return false;
    if (!machineAccepts(this, t, res)) return false;
    machineInsert(this, t, res);
    return true;
  }

  // -------------------------------------------------- construção
  isUnlocked(type) {
    const def = BUILDINGS[type];
    return !def.tech || this.progression.hasTech(def.tech);
  }

  canPlace(type, x, z, rot, { ignoreId = 0, free = false } = {}) {
    const def = BUILDINGS[type];
    if (!def) return { ok: false, reason: 'Estrutura desconhecida' };
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Pesquise na Oficina: ' + TECHS[def.tech].name };
    const [w, d] = this.footprint(type, rot);
    let rubble = 0, deposit = 0, hardOnly = 0;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      const cx = x + dx, cz = z + dz;
      if (!this.map.inBounds(cx, cz)) return { ok: false, reason: 'Fora dos limites do mapa' };
      const i = this.map.idx(cx, cz);
      const r = this.map.region[i];
      if (r < 0) return { ok: false, reason: 'Terreno não construível' };
      if (!this.progression.regionUnlocked(REGIONS[r].id)) return { ok: false, reason: 'Região bloqueada: ' + REGIONS[r].name };
      const occ = this.occ[i];
      if (occ && occ !== ignoreId) return { ok: false, reason: 'Espaço ocupado' };
      const terr = this.map.terrain[i];
      if (def.kind === 'platform') {
        if (terr === TERRAIN.RUBBLE) rubble++;
        else if (terr !== TERRAIN.GROUND) return { ok: false, reason: 'Rocha no caminho' };
        continue;
      }
      if (terr === TERRAIN.ROCK) return { ok: false, reason: 'Há rochas no local' };
      if (terr === TERRAIN.RUBBLE) return { ok: false, reason: 'Entulho: nivele com uma Plataforma Industrial' };
      if (this.map.depType[i] >= 0 && this.map.depAmount[i] >= 1) {
        const res = DEPOSIT_TYPES[this.map.depType[i]];
        if (res !== 'wood') {
          if ((def.hardness || 0) >= (DEPOSITS_HARD[res] || 1)) deposit++; else hardOnly++;
        }
      }
    }
    if (def.kind === 'platform' && rubble === 0) return { ok: false, reason: 'Não há entulho para nivelar aqui' };
    if (def.kind === 'miner' && deposit === 0) {
      return { ok: false, reason: hardOnly ? 'Minério muito duro: use a Perfuratriz Avançada' : 'Posicione sobre um depósito mineral' };
    }
    if (def.kind === 'lumber') {
      const tmp = { type, x, z, rot };
      if (this.treesNear(tmp).length === 0) return { ok: false, reason: 'Nenhuma árvore no raio de alcance' };
    }
    if (!free && this.economy.money < def.cost) return { ok: false, reason: 'Moedas insuficientes', money: true };
    return { ok: true };
  }

  placeBuilding(type, x, z, rot, { free = false, silent = false } = {}) {
    const chk = this.canPlace(type, x, z, rot, { free });
    if (!chk.ok) { if (!silent) this.events.emit('error', chk.reason); return null; }
    const def = BUILDINGS[type];
    if (!free) this.economy.spend(def.cost, 'construcao');
    if (def.kind === 'platform') {
      const [w, d] = this.footprint(type, rot);
      for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) this.map.levelTile(this.map.idx(x + dx, z + dz));
      this.stats.built[type] = (this.stats.built[type] || 0) + 1;
      this.events.emit('terrain', {});
      if (!silent) this.events.emit('built', { type, x, z });
      return { platform: true };
    }
    const b = this.makeBuilding(type, x, z, rot);
    b.invested = free ? 0 : def.cost;
    this.attach(b);
    this.stats.built[type] = (this.stats.built[type] || 0) + 1;
    if (def.kind === 'barn') spawnPigsForBarn(this, b);
    if (!silent) this.events.emit('built', { type, b });
    return b;
  }

  makeBuilding(type, x, z, rot, id = 0) {
    return {
      id: id || this.nextId++, type, x, z, rot: rot & 3, level: 1, enabled: true, invested: 0,
      inv: {}, out: {}, items: [], progress: 0, crafting: null, recipe: null,
      state: 'idle', reason: '', sat: 1, wantsPower: false, fuel: 0, outRR: 0, depRR: 0,
      rate: 0, secCount: 0, outputEnabled: true, splitRR: 0,
    };
  }

  attach(b) {
    this.buildings.set(b.id, b);
    for (const [cx, cz] of this.cells(b)) this.occ[this.map.idx(cx, cz)] = b.id;
    this.invalidateNeighborhood(b);
    if (BUILDINGS[b.type].power || BUILDINGS[b.type].kind === 'generator' || BUILDINGS[b.type].kind === 'pole') this.power.dirty = true;
  }

  detach(b) {
    for (const [cx, cz] of this.cells(b)) {
      const i = this.map.idx(cx, cz);
      if (this.occ[i] === b.id) this.occ[i] = 0;
    }
    this.buildings.delete(b.id);
    this.invalidateNeighborhood(b);
    this.power.dirty = true;
  }

  invalidateNeighborhood(b) {
    // limpa caches de alvos de saída das estruturas próximas e sinaliza a renderização
    delete b._targets;
    const [w, d] = this.footprint(b.type, b.rot);
    for (let z = b.z - 1; z <= b.z + d; z++) for (let x = b.x - 1; x <= b.x + w; x++) {
      const n = this.at(x, z); if (n) delete n._targets;
    }
    this.structVersion = (this.structVersion || 0) + 1;
  }

  // valor de liquidação do conteúdo de uma estrutura (ao demolir não há perda: os itens são vendidos)
  contentsOf(b) {
    const list = [];
    for (const k in b.inv) list.push([k, b.inv[k]]);
    for (const k in b.out) list.push([k, b.out[k]]);
    for (const it of b.items) list.push([it.r, 1]);
    if (b.crafting) { /* insumos já consumidos no início do ciclo */ }
    return list;
  }

  demolish(id) {
    const b = this.buildings.get(id);
    if (!b) return false;
    if (b.type === 'seller' && [...this.buildings.values()].filter((q) => q.type === 'seller').length <= 1) {
      this.events.emit('error', 'Você precisa de pelo menos um Centro de Vendas');
      return false;
    }
    let liquid = 0;
    for (const [r, n] of this.contentsOf(b)) {
      liquid += this.economy.sellValue(r) * n;
      this.countDestroyed(r, n);
    }
    // porquinhos do chiqueiro também liquidam a carga
    if (BUILDINGS[b.type].kind === 'barn') {
      for (const p of this.pigs.filter((p) => p.barn === b.id)) {
        if (p.carry) { liquid += this.economy.sellValue(p.carry.r) * p.carry.n; this.countDestroyed(p.carry.r, p.carry.n); }
      }
      this.pigs = this.pigs.filter((p) => p.barn !== b.id);
    }
    const refund = Math.floor(b.invested * SIM.demolishRefund);
    this.detach(b);
    if (refund > 0) this.economy.earn(refund, 'reembolso');
    if (liquid > 0) this.economy.earn(liquid, 'liquidacao');
    this.events.emit('removed', { b, refund: refund + liquid });
    return true;
  }

  // mover estrutura sem custo, preservando conteúdo e nível
  moveBuilding(id, x, z, rot) {
    const b = this.buildings.get(id);
    if (!b) return false;
    const chk = this.canPlace(b.type, x, z, rot, { ignoreId: id, free: true });
    if (!chk.ok) { this.events.emit('error', chk.reason); return false; }
    this.detach(b);
    b.x = x; b.z = z; b.rot = rot & 3;
    this.attach(b);
    if (BUILDINGS[b.type].kind === 'belt') for (const it of b.items) it.pp = it.p;
    this.events.emit('moved', { b });
    return true;
  }

  // gira uma esteira existente (sem custo) — usado ao redesenhar rotas
  setBeltDir(id, rot) {
    const b = this.buildings.get(id);
    if (!b || BUILDINGS[b.type].kind !== 'belt' || b.rot === (rot & 3)) return false;
    this.detach(b); b.rot = rot & 3; this.attach(b);
    this.events.emit('moved', { b });
    return true;
  }

  upgradeCost(b) {
    const def = BUILDINGS[b.type];
    if (!['miner', 'processor', 'storage', 'generator', 'lumber', 'barn'].includes(def.kind)) return null;
    if (b.level >= SIM.upgradeMaxLevel) return null;
    return Math.round(def.cost * 0.6 * Math.pow(SIM.upgradeCostFactor, b.level - 1));
  }
  upgrade(id) {
    const b = this.buildings.get(id);
    if (!b) return false;
    const cost = this.upgradeCost(b);
    if (cost == null) return false;
    if (!this.economy.spend(cost, 'melhoria')) { this.events.emit('error', 'Moedas insuficientes'); return false; }
    b.level++;
    b.invested += cost;
    if (BUILDINGS[b.type].kind === 'barn') spawnPigsForBarn(this, b);
    this.power.dirty = true;
    this.events.emit('upgraded', { b });
    return true;
  }
  setEnabled(id, on) { const b = this.buildings.get(id); if (b) { b.enabled = !!on; this.events.emit('changed', { b }); } }
  setRecipe(id, recipe) {
    const b = this.buildings.get(id);
    if (!b) return;
    const def = BUILDINGS[b.type];
    if (recipe && !(def.recipes || []).includes(recipe)) return;
    b.recipe = recipe || null;
    this.events.emit('changed', { b });
  }
  setOutputEnabled(id, on) { const b = this.buildings.get(id); if (b) b.outputEnabled = !!on; }

  treesNear(b) {
    const def = BUILDINGS[b.type];
    const [cx, cz] = this.center(b);
    const r = def.radius || 3;
    const out = [];
    const wi = DEPOSIT_TYPES.indexOf('wood');
    for (let z = Math.floor(cz - r - 1); z <= cz + r; z++) for (let x = Math.floor(cx - r - 1); x <= cx + r; x++) {
      if (!this.map.inBounds(x, z)) continue;
      const i = this.map.idx(x, z);
      if (this.map.depType[i] !== wi || this.occ[i]) continue;
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r + 0.5) out.push(i);
    }
    return out;
  }

  // -------------------------------------------------- contabilidade de unidades
  countCreated(r, n = 1) { this.units.created[r] = (this.units.created[r] || 0) + n; }
  countDestroyed(r, n = 1) { this.units.destroyed[r] = (this.units.destroyed[r] || 0) + n; }
  worldItemCount() {
    const inv = {};
    for (const b of this.buildings.values()) {
      for (const k in b.inv) addInv(inv, k, b.inv[k]);
      for (const k in b.out) addInv(inv, k, b.out[k]);
      for (const it of b.items) addInv(inv, it.r, 1);
    }
    for (const p of this.pigs) if (p.carry) addInv(inv, p.carry.r, p.carry.n);
    return inv;
  }
  // verificação de integridade: existente == criado - destruído (para todo recurso)
  checkIntegrity() {
    const have = this.worldItemCount();
    const problems = [];
    for (const r of Object.keys(RESOURCES)) {
      const expected = (this.units.created[r] || 0) - (this.units.destroyed[r] || 0);
      const h = have[r] || 0;
      if (Math.abs(expected - h) > 1e-6) problems.push({ r, expected, have: h });
    }
    return problems;
  }

  // -------------------------------------------------- laço principal
  tick(dt = 1 / SIM.tickRate) {
    if (this.power.dirty) rebuildPower(this);
    updatePower(this, dt);
    updateMachines(this, dt);
    updateBelts(this, dt);
    updatePigs(this, dt);
    this.regenDeposits(dt);
    this.time += dt;
    this.secAcc += dt;
    if (this.secAcc >= 1) {
      this.secAcc -= 1;
      this.perSecond();
    }
  }

  regenDeposits(dt) {
    // regeneração lenta e configurável (feita em lotes a cada ~1s para economizar CPU)
    this._regenAcc = (this._regenAcc || 0) + dt;
    if (this._regenAcc < 1) return;
    const step = this._regenAcc; this._regenAcc = 0;
    const m = this.map;
    for (let i = 0; i < m.depType.length; i++) {
      const t = m.depType[i];
      if (t < 0 || m.depAmount[i] >= m.depMax[i]) continue;
      const rg = DEPOSITS_REGEN[DEPOSIT_TYPES[t]] || 0;
      if (rg > 0) m.depAmount[i] = Math.min(m.depMax[i], m.depAmount[i] + m.depMax[i] * rg * step * 0.01);
    }
  }

  perSecond() {
    this.economy.chargeUpkeep(1);
    this.prodWindow.push(this.curSec.prod); this.prodWindow.shift();
    this.profitWindow.push(this.curSec.profit); this.profitWindow.shift();
    this.curSec = { prod: 0, profit: 0 };
    for (const b of this.buildings.values()) { b.rate = b.rate * 0.85 + b.secCount * 60 * 0.15; b.secCount = 0; }
    this.progression.check();
    this.economy.rollBucket();
    this.updateAlerts();
    this.events.emit('second', {});
  }

  noteProduced(b, res, n) {
    this.stats.produced[res] = (this.stats.produced[res] || 0) + n;
    this.curSec.prod += n;
    if (b) b.secCount += n;
  }

  get productionPerMin() { return this.prodWindow.reduce((a, c) => a + c, 0); }
  get profitPerMin() { return this.profitWindow.reduce((a, c) => a + c, 0); }

  updateAlerts() {
    const a = [];
    let noPower = 0, full = 0, noFuel = 0, noInput = 0;
    for (const b of this.buildings.values()) {
      if (b.state === 'no_power') noPower++;
      else if (b.state === 'output_full') full++;
      else if (b.state === 'no_fuel') noFuel++;
      else if (b.state === 'no_deposit') noInput++;
    }
    if (noPower) a.push({ level: 'bad', text: `${noPower} estrutura(s) sem energia` });
    if (noFuel) a.push({ level: 'warn', text: `${noFuel} gerador(es) sem combustível` });
    if (full) a.push({ level: 'warn', text: `${full} estrutura(s) com saída bloqueada` });
    if (noInput) a.push({ level: 'warn', text: `${noInput} mineradora(s) com depósito esgotado` });
    this.alerts = a;
  }

  // -------------------------------------------------- consultas para a interface
  describe(b) {
    const def = BUILDINGS[b.type];
    const info = { name: def.name, level: b.level, state: b.state, reason: b.reason, kind: def.kind };
    info.capacity = machineCapacity(this, b);
    info.power = def.power ? def.power : 0;
    info.rate = b.rate;
    return info;
  }

  // -------------------------------------------------- salvamento
  serialize() {
    const buildings = [];
    for (const b of this.buildings.values()) {
      buildings.push({
        id: b.id, type: b.type, x: b.x, z: b.z, rot: b.rot, level: b.level, enabled: b.enabled, invested: b.invested,
        inv: b.inv, out: b.out, items: b.items.map((i) => [i.r, Math.round(i.p * 1000) / 1000]),
        progress: b.progress, crafting: b.crafting, recipe: b.recipe, fuel: b.fuel,
        outputEnabled: b.outputEnabled, rate: Math.round(b.rate * 10) / 10,
      });
    }
    return {
      format: 'mina-engrenada-save',
      version: SAVE_VERSION,
      gameId: this.gameId,
      createdAt: this.createdAt,
      savedAt: new Date().toISOString(),
      time: this.time,
      nextId: this.nextId,
      map: this.map.serialize(),
      economy: this.economy.serialize(),
      progression: this.progression.serialize(),
      stats: this.stats,
      units: this.units,
      buildings,
      pigs: this.pigs.map((p) => ({ id: p.id, barn: p.barn, x: p.x, z: p.z, state: p.state, target: p.target, carry: p.carry })),
    };
  }

  static deserialize(data) {
    validateSave(data);
    const sim = new Simulation({ seed: data.map.seed, empty: true });
    sim.gameId = data.gameId; sim.createdAt = data.createdAt; sim.time = data.time || 0;
    sim.map.load(data.map);
    sim.economy.load(data.economy);
    sim.progression.load(data.progression);
    sim.stats = Object.assign(sim.stats, data.stats || {});
    sim.units = { created: { ...(data.units?.created || {}) }, destroyed: { ...(data.units?.destroyed || {}) } };
    let maxId = 0;
    // reconstrução ordenada: primeiro todas as estruturas, depois os porcos (que referenciam o chiqueiro)
    for (const s of data.buildings) {
      if (!BUILDINGS[s.type]) continue; // tipo removido em versão futura: ignora
      const b = sim.makeBuilding(s.type, s.x, s.z, s.rot, s.id);
      if (sim.buildings.has(b.id)) throw new Error('Identificador duplicado no salvamento: ' + b.id);
      // valida a ocupação (não sobrepor)
      for (const [cx, cz] of sim.cells(b)) {
        if (!sim.map.inBounds(cx, cz) || sim.occ[sim.map.idx(cx, cz)]) throw new Error('Estrutura sobreposta no salvamento: ' + b.id);
      }
      Object.assign(b, {
        level: clampInt(s.level, 1, SIM.upgradeMaxLevel), enabled: s.enabled !== false, invested: +s.invested || 0,
        inv: cleanInv(s.inv), out: cleanInv(s.out), progress: +s.progress || 0, crafting: RECIPES[s.crafting] ? s.crafting : null,
        recipe: RECIPES[s.recipe] ? s.recipe : null, fuel: +s.fuel || 0, outputEnabled: s.outputEnabled !== false, rate: +s.rate || 0,
        items: (s.items || []).filter((i) => RESOURCES[i[0]]).map(([r, p]) => ({ r, p: +p, pp: +p })),
      });
      b.items.sort((a, c) => c.p - a.p);
      sim.attach(b);
      maxId = Math.max(maxId, b.id);
    }
    for (const p of data.pigs || []) {
      if (!sim.buildings.has(p.barn)) continue;
      sim.pigs.push({ id: p.id, barn: p.barn, x: +p.x, z: +p.z, px: +p.x, pz: +p.z, state: p.state || 'idle', target: p.target || 0, carry: p.carry && RESOURCES[p.carry.r] ? { r: p.carry.r, n: +p.carry.n } : null, wait: 0, heading: 0 });
    }
    sim.nextId = Math.max(data.nextId || 1, maxId + 1, ...sim.pigs.map((p) => p.id + 1));
    sim.power.dirty = true;
    return sim;
  }

  // produção offline limitada (executa a simulação real, sem atalhos)
  simulateOffline(seconds) {
    const s = Math.max(0, Math.min(SIM.offlineMaxSeconds, seconds));
    const before = this.economy.money;
    const dt = 1 / 10;
    for (let t = 0; t < s; t += dt) this.tick(dt);
    return { seconds: s, earned: this.economy.money - before };
  }
}

function clampInt(v, a, b) { v = Math.round(+v || a); return Math.max(a, Math.min(b, v)); }
function cleanInv(inv) {
  const o = {};
  if (inv && typeof inv === 'object') for (const k in inv) if (RESOURCES[k] && Number.isFinite(+inv[k]) && +inv[k] > 0) o[k] = Math.floor(+inv[k]);
  return o;
}

export function validateSave(data) {
  if (!data || typeof data !== 'object') throw new Error('Arquivo de salvamento vazio ou inválido');
  if (data.format !== 'mina-engrenada-save') throw new Error('Este arquivo não é um salvamento do Mina Engrenada');
  if (typeof data.version !== 'number') throw new Error('Versão do salvamento ausente');
  if (data.version > SAVE_VERSION) throw new Error(`Salvamento de versão mais nova (${data.version}); atualize o jogo`);
  if (!Array.isArray(data.buildings) || !data.map || !data.economy || !data.progression) throw new Error('Salvamento corrompido: seções ausentes');
}

// tabelas derivadas
import { DEPOSITS } from '../data/config.js';
const DEPOSITS_HARD = Object.fromEntries(Object.entries(DEPOSITS).map(([k, v]) => [k, v.hardness]));
const DEPOSITS_REGEN = Object.fromEntries(Object.entries(DEPOSITS).map(([k, v]) => [k, v.regen]));
export { DEPOSITS_HARD };
