// Mapa em grade: regiões, terreno e depósitos minerais.
// Geração determinística a partir de uma semente: o salvamento guarda só o que muda
// (quantidades dos depósitos e tiles nivelados por plataformas).
import { MAP, REGIONS, DEPOSITS } from '../data/config.js';
import { mulberry32 } from './util.js';

export const TERRAIN = { GROUND: 0, ROCK: 1, RUBBLE: 2, WILD: 3 };
export const DEPOSIT_TYPES = Object.keys(DEPOSITS); // índice -> id do recurso

export class WorldMap {
  constructor(seed = MAP.seed) {
    this.seed = seed;
    this.w = MAP.width;
    this.h = MAP.height;
    const n = this.w * this.h;
    this.region = new Int8Array(n).fill(-1);
    this.terrain = new Uint8Array(n).fill(TERRAIN.WILD);
    this.depType = new Int8Array(n).fill(-1);
    this.depAmount = new Float32Array(n);
    this.depMax = new Float32Array(n);
    this.height = new Float32Array(n); // altura visual (decoração)
    this.version = 0; // incrementa a cada mudança visual relevante
    this.generate();
  }

  idx(x, z) { return z * this.w + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  regionAt(x, z) { return this.inBounds(x, z) ? this.region[this.idx(x, z)] : -1; }

  generate() {
    const rnd = mulberry32(this.seed);
    // regiões
    REGIONS.forEach((r, ri) => {
      const [rx, rz, rw, rh] = r.rect;
      for (let z = rz; z < rz + rh; z++) for (let x = rx; x < rx + rw; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        this.region[i] = ri;
        this.terrain[i] = TERRAIN.GROUND;
      }
    });
    // altura decorativa fora das regiões (montanhas ao redor)
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, z);
      if (this.region[i] >= 0) continue;
      let d = 99;
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
        const nx = x + dx, nz = z + dz;
        if (this.inBounds(nx, nz) && this.region[this.idx(nx, nz)] >= 0) d = Math.min(d, Math.hypot(dx, dz));
      }
      const noise = Math.sin(x * 0.35) * Math.cos(z * 0.28) * 0.8 + Math.sin((x + z) * 0.13) * 0.6;
      this.height[i] = Math.min(9, Math.max(0.4, (d - 0.5) * 1.1 + noise + rnd() * 0.5));
    }

    const blob = (regionId, res, cx, cz, r, mult = 1) => {
      const ri = REGIONS.findIndex((q) => q.id === regionId);
      const t = DEPOSIT_TYPES.indexOf(res);
      const cfg = DEPOSITS[res];
      for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        if (this.region[i] !== ri || this.terrain[i] !== TERRAIN.GROUND) continue;
        const d = Math.hypot(x - cx, z - cz);
        const edge = r * (0.9 + 0.2 * Math.sin(x * 1.7 + z * 2.3 + this.seed));
        if (d > edge) continue;
        if (this.depType[i] >= 0 && rnd() < 0.5) continue;
        this.depType[i] = t;
        const amt = Math.round((cfg.min + rnd() * (cfg.max - cfg.min)) * mult * (1.2 - 0.4 * d / Math.max(1, r)));
        this.depAmount[i] = amt;
        this.depMax[i] = amt;
      }
    };
    const scatter = (regionId, res, chance, mult = 1, avoid = null) => {
      const ri = REGIONS.findIndex((q) => q.id === regionId);
      const t = DEPOSIT_TYPES.indexOf(res);
      const cfg = DEPOSITS[res];
      for (let i = 0; i < this.region.length; i++) {
        if (this.region[i] !== ri || this.terrain[i] !== TERRAIN.GROUND || this.depType[i] >= 0) continue;
        const x = i % this.w, z = (i / this.w) | 0;
        if (avoid && avoid(x, z)) continue;
        if (rnd() < chance) {
          this.depType[i] = t;
          const amt = Math.round((cfg.min + rnd() * (cfg.max - cfg.min)) * mult);
          this.depAmount[i] = amt; this.depMax[i] = amt;
        }
      }
    };
    const rocks = (regionId, chance, kind = TERRAIN.ROCK, avoid = null) => {
      const ri = REGIONS.findIndex((q) => q.id === regionId);
      for (let i = 0; i < this.region.length; i++) {
        if (this.region[i] !== ri || this.depType[i] >= 0 || this.terrain[i] !== TERRAIN.GROUND) continue;
        const x = i % this.w, z = (i / this.w) | 0;
        if (avoid && avoid(x, z)) continue;
        if (rnd() < chance) { this.terrain[i] = kind; this.height[i] = kind === TERRAIN.ROCK ? 0.6 + rnd() * 0.8 : 0.15; }
      }
    };

    // Vale inicial (centro do vale ~ (43,35); Centro de Vendas pré-construído em (40..42, 33..35))
    const nearSeller = (x, z) => x >= 37 && x <= 46 && z >= 30 && z <= 39;
    blob('valley', 'stone', 35.5, 27.5, 2.6);
    blob('valley', 'stone', 49.5, 41.5, 2.4);
    blob('valley', 'stone', 34.5, 43.5, 2.0);
    blob('valley', 'coal', 51.5, 27, 1.8);
    blob('valley', 'iron_ore', 50.5, 34.5, 1.9);
    scatter('valley', 'wood', 0.035, 1, (x, z) => nearSeller(x, z) || (x > 33 && x < 52 && z > 25 && z < 44));
    rocks('valley', 0.012, TERRAIN.ROCK, nearSeller);

    // Serra de Ferro
    blob('mountain', 'iron_ore', 31, 8, 3.4, 1.6);
    blob('mountain', 'iron_ore', 52, 14, 3.2, 1.6);
    blob('mountain', 'coal', 42, 6, 3.0, 1.5);
    blob('mountain', 'coal', 58, 7, 2.4, 1.5);
    blob('mountain', 'copper_ore', 37, 16, 2.6, 1.4);
    blob('mountain', 'stone', 47, 17, 2.4, 1.8);
    blob('mountain', 'stone', 27, 15, 2.2, 1.8);
    rocks('mountain', 0.06);

    // Bosque Verde
    blob('forest', 'stone', 12, 40, 2.3, 1.3);
    blob('forest', 'coal', 22, 28, 1.8, 1.2);
    scatter('forest', 'wood', 0.42);
    rocks('forest', 0.015);

    // Planalto Cristalino
    blob('advanced', 'copper_ore', 61, 27, 2.8, 1.5);
    blob('advanced', 'copper_ore', 71, 45, 2.4, 1.5);
    blob('advanced', 'gold_ore', 69, 30, 2.6, 1.3);
    blob('advanced', 'gold_ore', 60, 44, 2.2, 1.3);
    blob('advanced', 'crystal', 66, 38, 2.4, 1.4);
    blob('advanced', 'crystal', 72, 24.5, 1.8, 1.4);
    rocks('advanced', 0.035);

    // Distrito Industrial: muito entulho (exige plataformas), algum ferro e carvão
    blob('industrial', 'iron_ore', 32, 62, 2.6, 2);
    blob('industrial', 'coal', 46, 65, 2.4, 2);
    blob('industrial', 'gold_ore', 68, 62, 2.2, 1.6);
    rocks('industrial', 0.72, TERRAIN.RUBBLE);
  }

  isBuildableTerrain(x, z) {
    if (!this.inBounds(x, z)) return false;
    return this.terrain[this.idx(x, z)] === TERRAIN.GROUND;
  }

  // Exporta só o que difere do mapa gerado
  serialize() {
    const deposits = [];
    for (let i = 0; i < this.depAmount.length; i++) {
      if (this.depType[i] >= 0 && Math.abs(this.depAmount[i] - this.depMax[i]) > 0.001) deposits.push([i, Math.round(this.depAmount[i] * 100) / 100]);
    }
    const leveled = [];
    for (let i = 0; i < this.terrain.length; i++) if (this.levelled && this.levelled.has(i)) leveled.push(i);
    return { seed: this.seed, deposits, leveled };
  }

  load(data) {
    for (const [i, a] of data.deposits || []) {
      if (i >= 0 && i < this.depAmount.length && this.depType[i] >= 0 && Number.isFinite(a)) this.depAmount[i] = Math.max(0, Math.min(this.depMax[i], a));
    }
    for (const i of data.leveled || []) this.levelTile(i);
    this.version++;
  }

  levelTile(i) {
    if (i < 0 || i >= this.terrain.length) return false;
    if (this.terrain[i] !== TERRAIN.RUBBLE) return false;
    this.terrain[i] = TERRAIN.GROUND;
    this.height[i] = 0;
    if (!this.levelled) this.levelled = new Set();
    this.levelled.add(i);
    this.version++;
    return true;
  }

  depositInfo(x, z) {
    if (!this.inBounds(x, z)) return null;
    const i = this.idx(x, z);
    if (this.depType[i] < 0) return null;
    return { res: DEPOSIT_TYPES[this.depType[i]], amount: this.depAmount[i], max: this.depMax[i] };
  }
}
