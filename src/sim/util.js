// Utilidades compartilhadas da simulação (sem dependência de renderização)

// Direções no plano: 0=Leste(+x) 1=Sul(+z) 2=Oeste(-x) 3=Norte(-z). Crescem no sentido horário (visto de cima).
export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];
export const opposite = (d) => (d + 2) & 3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, data) {
    const set = this.handlers.get(evt);
    if (set) for (const fn of set) { try { fn(data); } catch (e) { console.error('[evento]', evt, e); } }
    const any = this.handlers.get('*');
    if (any) for (const fn of any) { try { fn(evt, data); } catch (e) { console.error(e); } }
  }
}

export function addInv(inv, res, n) { inv[res] = (inv[res] || 0) + n; }
export function takeInv(inv, res, n) {
  const have = inv[res] || 0;
  const t = Math.min(have, n);
  if (t <= 0) return 0;
  if (have - t <= 0) delete inv[res]; else inv[res] = have - t;
  return t;
}
export function invTotal(inv) { let s = 0; for (const k in inv) s += inv[k]; return s; }

export function formatMoney(v) {
  const neg = v < 0; v = Math.abs(v);
  let s;
  if (v >= 1e9) s = (v / 1e9).toFixed(2) + ' bi';
  else if (v >= 1e6) s = (v / 1e6).toFixed(2) + ' mi';
  else if (v >= 1e4) s = Math.floor(v).toLocaleString('pt-BR');
  else s = (Math.round(v * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: v < 100 ? 1 : 0 });
  return (neg ? '-' : '') + 'R$ ' + s;
}
