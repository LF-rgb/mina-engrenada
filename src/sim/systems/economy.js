// Economia: saldo, receitas, despesas por categoria e histórico por minuto.
import { BUILDINGS, RESOURCES } from '../../data/config.js';

export const LEDGER_LABELS = {
  vendas: 'Vendas', reembolso: 'Reembolsos', liquidacao: 'Liquidação de estoques', recompensa: 'Recompensas',
  construcao: 'Construção', melhoria: 'Melhorias de estruturas', pesquisa: 'Pesquisa', regiao: 'Expansão territorial', operacao: 'Custo operacional',
};

export class Economy {
  constructor(sim) {
    this.sim = sim;
    this.money = 0;
    this.totals = { income: {}, expense: {} };
    this.history = [];             // [{min, income, expense}] últimos 30 minutos
    this.bucket = { income: 0, expense: 0, inc: {}, exp: {} };
    this.bucketSec = 0;
  }
  sellValue(res) { return RESOURCES[res].value * (1 + this.sim.progression.effect('sell')); }
  earn(v, cat) {
    if (!(v > 0)) return;
    this.money += v;
    this.totals.income[cat] = (this.totals.income[cat] || 0) + v;
    this.bucket.income += v; this.bucket.inc[cat] = (this.bucket.inc[cat] || 0) + v;
    this.sim.curSec.profit += v;
  }
  spend(v, cat) {
    if (!(v >= 0) || this.money + 1e-9 < v) return false;
    this.money -= v;
    this.totals.expense[cat] = (this.totals.expense[cat] || 0) + v;
    this.bucket.expense += v; this.bucket.exp[cat] = (this.bucket.exp[cat] || 0) + v;
    if (cat === 'operacao') this.sim.curSec.profit -= v;
    return true;
  }
  upkeepPerMin() {
    let s = 0;
    for (const b of this.sim.buildings.values()) { const u = BUILDINGS[b.type].upkeep; if (u && b.enabled) s += u; }
    return s;
  }
  chargeUpkeep(seconds) {
    const cost = (this.upkeepPerMin() / 60) * seconds;
    if (cost <= 0) return;
    this.spend(Math.min(cost, this.money), 'operacao');
  }
  rollBucket() {
    this.bucketSec++;
    if (this.bucketSec >= 60) {
      this.history.push({ min: Math.floor(this.sim.time / 60), ...this.bucket });
      if (this.history.length > 30) this.history.shift();
      this.bucket = { income: 0, expense: 0, inc: {}, exp: {} };
      this.bucketSec = 0;
    }
  }
  serialize() { return { money: this.money, totals: this.totals, history: this.history }; }
  load(d) {
    this.money = Number.isFinite(+d.money) ? Math.max(0, +d.money) : 0;
    this.totals = d.totals || { income: {}, expense: {} };
    this.history = Array.isArray(d.history) ? d.history.slice(-30) : [];
  }
}
