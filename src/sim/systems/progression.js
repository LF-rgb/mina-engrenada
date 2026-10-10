// Progressão: tecnologias (Oficina), regiões e objetivos.
import { TECHS, REGIONS, OBJECTIVES } from '../../data/config.js';

export class Progression {
  constructor(sim) {
    this.sim = sim;
    this.techs = {};        // id -> nível
    this.regions = new Set();
    this.objIndex = 0;
    this.completed = [];
  }
  hasTech(id) { return (this.techs[id] || 0) > 0; }
  techLevel(id) { return this.techs[id] || 0; }
  effect(key) {
    let s = 0;
    for (const id in this.techs) { const t = TECHS[id]; if (t && t.effect && t.effect[key]) s += t.effect[key] * this.techs[id]; }
    return s;
  }
  hasWorkshop() { for (const b of this.sim.buildings.values()) if (b.type === 'workshop') return true; return false; }

  techStatus(id) {
    const t = TECHS[id];
    const lvl = this.techLevel(id);
    const max = t.cost.length;
    if (lvl >= max) return { state: 'done', lvl, max };
    const missing = t.req.filter((r) => !this.hasTech(r));
    const cost = t.cost[lvl];
    if (!this.hasWorkshop()) return { state: 'locked', lvl, max, cost, reason: 'Construa uma Oficina de Melhorias' };
    if (missing.length) return { state: 'locked', lvl, max, cost, reason: 'Requer: ' + missing.map((m) => TECHS[m].name).join(', ') };
    return { state: this.sim.economy.money >= cost ? 'available' : 'expensive', lvl, max, cost };
  }
  research(id) {
    const st = this.techStatus(id);
    if (st.state !== 'available') { this.sim.events.emit('error', st.reason || (st.state === 'done' ? 'Já pesquisado' : 'Moedas insuficientes')); return false; }
    if (!this.sim.economy.spend(st.cost, 'pesquisa')) return false;
    this.techs[id] = (this.techs[id] || 0) + 1;
    this.sim.power.dirty = true;
    this.sim.events.emit('tech', { id, level: this.techs[id] });
    return true;
  }

  regionUnlocked(id) { return this.regions.has(id); }
  regionStatus(id) {
    const r = REGIONS.find((q) => q.id === id);
    if (this.regions.has(id)) return { state: 'unlocked' };
    if (r.req && !this.hasTech(r.req)) return { state: 'locked', reason: 'Requer pesquisa: ' + TECHS[r.req].name, cost: r.cost };
    return { state: this.sim.economy.money >= r.cost ? 'available' : 'expensive', cost: r.cost };
  }
  unlockRegion(id, free = false) {
    if (this.regions.has(id)) return false;
    const r = REGIONS.find((q) => q.id === id);
    if (!r) return false;
    if (!free) {
      const st = this.regionStatus(id);
      if (st.state !== 'available') { this.sim.events.emit('error', st.reason || 'Moedas insuficientes'); return false; }
      if (!this.sim.economy.spend(r.cost, 'regiao')) return false;
    }
    this.regions.add(id);
    this.sim.map.version++;
    this.sim.events.emit('region', { id });
    return true;
  }

  current() { return OBJECTIVES[this.objIndex] || null; }
  progressOf(o) {
    const s = this.sim.stats;
    switch (o.type) {
      case 'build': return [s.built[o.key] || 0, o.n];
      case 'extract': return [s.extracted[o.key] || 0, o.n];
      case 'delivered': return [s.delivered[o.key] || 0, o.n];
      case 'sold': return [o.key === 'processed' ? (s.soldCat.processed_any || 0) : (s.soldCat[o.key] || 0), o.n];
      case 'revenue': return [Math.floor(s.revenue), o.n];
      case 'tech': return [this.hasTech(o.key) ? 1 : 0, 1];
      case 'region': return [this.regions.size, o.n];
      case 'regionId': return [this.regions.has(o.key) ? 1 : 0, 1];
      case 'produced': return [s.produced[o.key] || 0, o.n];
      default: return [0, 1];
    }
  }
  check() {
    // pode concluir vários em sequência
    for (let guard = 0; guard < 5; guard++) {
      const o = this.current();
      if (!o) return;
      const [v, n] = this.progressOf(o);
      if (v < n) return;
      this.completed.push(o.id);
      this.objIndex++;
      this.sim.economy.earn(o.reward, 'recompensa');
      this.sim.events.emit('objective', { o });
    }
  }

  serialize() { return { techs: this.techs, regions: [...this.regions], objIndex: this.objIndex, completed: this.completed }; }
  load(d) {
    this.techs = {};
    for (const k in d.techs || {}) if (TECHS[k]) this.techs[k] = Math.max(0, Math.min(TECHS[k].cost.length, d.techs[k] | 0));
    this.regions = new Set((d.regions || []).filter((r) => REGIONS.some((q) => q.id === r)));
    if (!this.regions.size) this.regions.add('valley');
    this.objIndex = Math.max(0, Math.min(OBJECTIVES.length, d.objIndex | 0));
    this.completed = d.completed || [];
  }
}
