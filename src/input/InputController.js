// Entrada do jogador (mouse e teclado) e modos: seleção, construção, mover e demolição.
import * as THREE from 'three';
import { BUILDINGS, CATEGORIES } from '../data/config.js';
import { formatMoney } from '../sim/util.js';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class InputController {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.mode = 'select';
    this.buildType = null;
    this.rot = 0;
    this.moveId = 0;
    this.hover = null;   // {x,z}
    this.drag = null;    // arraste de esteira / demolição
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.bind();
  }
  get sim() { return this.game.sim; }
  get ui() { return this.game.ui; }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousemove', (e) => this.onMove(e));
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => { e.preventDefault(); if (this.game.active) this.game.cam.zoom(e.deltaY); }, { passive: false });
    c.addEventListener('mouseleave', () => { this.game.cam.mouse.inside = false; this.game.setHoverTip(null); });
    c.addEventListener('mouseenter', () => { this.game.cam.mouse.inside = true; });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.game.cam.keys.clear());
  }

  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.game.renderer.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(ground, p)) return null;
    return { fx: p.x, fz: p.z, x: Math.floor(p.x), z: Math.floor(p.z) };
  }

  anchor(type, fx, fz, rot) {
    // posiciona a estrutura centralizada no cursor
    const [w, d] = this.sim.footprint(type, rot);
    return { x: Math.floor(fx - w / 2 + 0.5), z: Math.floor(fz - d / 2 + 0.5) };
  }

  // ------------------------------------------------------------ modos
  startBuild(type) {
    if (!this.sim.isUnlocked(type)) { this.ui.toast('Pesquise esta estrutura na Oficina (T)', 'err'); this.game.audio.play('error'); return; }
    if (this.mode === 'build' && this.buildType === type) { this.cancel(); return; }
    this.mode = 'build'; this.buildType = type; this.moveId = 0;
    this.game.setHoverTip(null);
    this.game.audio.play('click');
    this.game.renderer.clearGhost();
    this.enterOverlay();
    this.updateHint();
    this.ui.refreshItems();
    if (this.lastPick) this.updateGhost(this.lastPick);
  }
  startMove(id) {
    const b = this.sim.buildings.get(id);
    if (!b) return;
    this.mode = 'move'; this.moveId = id; this.buildType = b.type; this.rot = b.rot;
    this.game.renderer.clearGhost();
    this.enterOverlay();
    this.updateHint();
  }
  startDemolish() {
    this.mode = this.mode === 'demolish' ? 'select' : 'demolish';
    this.game.setCursorTip('');
    this.buildType = null;
    this.game.renderer.clearGhost();
    this.game.renderer.terrain.grid.visible = false;
    this.updateHint();
  }
  enterOverlay() {
    this.game.renderer.terrain.grid.visible = this.game.settings.showGrid;
    const def = BUILDINGS[this.buildType];
    this.game.renderer.showPowerCoverage(!!(def.power || def.kind === 'pole' || def.kind === 'generator'));
  }
  cancel() {
    this.mode = 'select'; this.buildType = null; this.moveId = 0; this.drag = null;
    this.game.setCursorTip('');
    this.game.renderer.clearGhost();
    this.game.renderer.terrain.grid.visible = false;
    this.game.renderer.showPowerCoverage(false);
    this.updateHint();
    this.ui.refreshItems();
  }

  updateHint() {
    let h;
    if (this.mode === 'build') {
      const d = BUILDINGS[this.buildType];
      h = `<b>${d.name}</b> · ${formatMoney(d.cost)}<br>` + (d.kind === 'belt'
        ? '<kbd>Clique</kbd>/<kbd>arraste</kbd> para traçar · <kbd>R</kbd> girar · <kbd>Botão direito</kbd> cancelar'
        : '<kbd>Clique</kbd> construir · <kbd>R</kbd> girar · <kbd>Botão direito</kbd> cancelar');
    } else if (this.mode === 'move') h = '<b>Movendo estrutura</b><br><kbd>Clique</kbd> confirmar · <kbd>R</kbd> girar · <kbd>Botão direito</kbd> cancelar';
    else if (this.mode === 'demolish') h = '<b style="color:#ff8a80">Modo demolição</b><br><kbd>Clique</kbd>/<kbd>arraste</kbd> para remover · <kbd>X</kbd> ou <kbd>Botão direito</kbd> sair';
    else h = '<kbd>WASD</kbd> mover · <kbd>Roda</kbd> zoom · <kbd>Q</kbd>/<kbd>E</kbd> girar · <kbd>Clique</kbd> selecionar · <kbd>H</kbd> ajuda';
    this.ui.setHint(h);
  }

  // ------------------------------------------------------------ mouse
  onMove(e) {
    const cam = this.game.cam;
    cam.mouse.x = e.clientX; cam.mouse.y = e.clientY; cam.mouse.inside = true;
    if (cam.dragging) { cam.dragMove(e.clientX, e.clientY); return; }
    if (!this.game.active) return;
    const p = this.pick(e);
    this.lastPick = p;
    if (!p) return;
    this.hover = p;
    if (this.mode === 'build' || this.mode === 'move') this.updateGhost(p);
    else {
      this.game.renderer.setHover(p.x, p.z, true);
      if (this.mode === 'select') {
        const hb = this.sim.at(p.x, p.z);
        this.hoverBuilding = hb || null;
        this.game.setHoverTip(hb, p);
      }
    }
    if (this.mode === 'demolish' && this.drag) this.demolishAt(p.x, p.z, true);
  }

  updateGhost(p) {
    const type = this.buildType;
    if (!type || !BUILDINGS[type]) return;
    const def = BUILDINGS[type];
    if (def.kind === 'belt' && this.drag) {
      this.game.renderer.showBeltPath(this.beltPathTiles(this.drag, p));
      return;
    }
    if (def.kind === 'belt') {
      const ok = this.beltTileOk(p.x, p.z, this.rot, 0);
      this.game.renderer.showBeltPath([{ x: p.x, z: p.z, rot: this.rot, ok }]);
      return;
    }
    const a = this.anchor(type, p.fx, p.fz, this.rot);
    const chk = this.mode === 'move' ? this.sim.canPlace(type, a.x, a.z, this.rot, { ignoreId: this.moveId, free: true }) : this.sim.canPlace(type, a.x, a.z, this.rot);
    this.game.renderer.showGhost(type, a.x, a.z, this.rot, chk.ok);
    this.ghostReason = chk.ok ? '' : chk.reason;
    this.game.setCursorTip(chk.ok ? '' : chk.reason, p);
    this.game.renderer.setHover(0, 0, false);
  }

  onDown(e) {
    this.game.audio.resume();
    if (!this.game.active) return;
    if (e.button === 1) { e.preventDefault(); this.game.cam.dragStart(e.clientX, e.clientY); return; }
    if (e.button === 2) {
      if (this.mode !== 'select') this.cancel(); else this.ui.clearSelection();
      return;
    }
    if (e.button !== 0) return;
    const p = this.pick(e);
    if (!p) return;
    if (this.mode === 'build') {
      const def = BUILDINGS[this.buildType];
      if (def.kind === 'belt') { this.drag = { x: p.x, z: p.z }; this.updateGhost(p); return; }
      const a = this.anchor(this.buildType, p.fx, p.fz, this.rot);
      const b = this.sim.placeBuilding(this.buildType, a.x, a.z, this.rot);
      if (b) {
        if (b.id) this.game.pushUndo([b.id]);
        this.game.audio.play('place');
        if (!e.shiftKey && def.kind !== 'platform') { this.cancel(); if (b.id) this.ui.select(b); }
        else this.updateGhost(p);
      } else this.game.audio.play('error');
      return;
    }
    if (this.mode === 'move') {
      const a = this.anchor(this.buildType, p.fx, p.fz, this.rot);
      if (this.sim.moveBuilding(this.moveId, a.x, a.z, this.rot)) {
        this.game.audio.play('place');
        const b = this.sim.buildings.get(this.moveId);
        this.cancel(); this.ui.select(b);
      } else this.game.audio.play('error');
      return;
    }
    if (this.mode === 'demolish') { this.drag = { x: p.x, z: p.z }; this.demolishAt(p.x, p.z, false); return; }
    // seleção
    const b = this.sim.at(p.x, p.z);
    if (b) { this.ui.select(b); this.game.audio.play('click'); }
    else this.ui.inspectTile(p.x, p.z);
  }

  onUp(e) {
    if (e.button === 1) { this.game.cam.dragEnd(); return; }
    if (e.button !== 0 || !this.drag) return;
    if (this.mode === 'build' && BUILDINGS[this.buildType]?.kind === 'belt') {
      const p = this.lastPick || this.drag;
      this.placeBeltPath(this.beltPathTiles(this.drag, p));
    }
    this.drag = null;
    if (this.lastPick && this.mode === 'build') this.updateGhost(this.lastPick);
  }

  // ------------------------------------------------------------ esteiras
  beltPathTiles(s, p) {
    const dx = p.x - s.x, dz = p.z - s.z;
    if (dx === 0 && dz === 0) return [{ x: s.x, z: s.z, rot: this.rot, ok: this.beltTileOk(s.x, s.z, this.rot, 0) }];
    const tiles = [];
    const hFirst = Math.abs(dx) >= Math.abs(dz);
    const hd = dx > 0 ? 0 : 2, vd = dz > 0 ? 1 : 3;
    if (hFirst) {
      for (let i = 0; i !== dx; i += Math.sign(dx)) tiles.push({ x: s.x + i, z: s.z, rot: hd });
      if (dz === 0) tiles.push({ x: p.x, z: s.z, rot: hd });
      for (let i = 0; i !== dz + Math.sign(dz) && dz !== 0; i += Math.sign(dz)) tiles.push({ x: p.x, z: s.z + i, rot: vd });
    } else {
      for (let i = 0; i !== dz; i += Math.sign(dz)) tiles.push({ x: s.x, z: s.z + i, rot: vd });
      if (dx === 0) tiles.push({ x: s.x, z: p.z, rot: vd });
      for (let i = 0; i !== dx + Math.sign(dx) && dx !== 0; i += Math.sign(dx)) tiles.push({ x: s.x + i, z: p.z, rot: hd });
    }
    let spend = 0;
    for (const t of tiles) {
      t.ok = this.beltTileOk(t.x, t.z, t.rot, spend);
      const ex = this.sim.at(t.x, t.z);
      if (t.ok && !ex) spend += BUILDINGS[this.buildType].cost;
    }
    return tiles;
  }

  beltTileOk(x, z, rot, alreadySpent) {
    const ex = this.sim.at(x, z);
    if (ex) return BUILDINGS[ex.type].kind === 'belt'; // re-direcionar ou trocar tipo
    const chk = this.sim.canPlace(this.buildType, x, z, rot, { free: true });
    return chk.ok && this.sim.economy.money - alreadySpent >= BUILDINGS[this.buildType].cost;
  }

  placeBeltPath(tiles) {
    let placed = 0, changed = 0, failed = 0;
    const ids = [];
    for (const t of tiles) {
      const ex = this.sim.at(t.x, t.z);
      if (ex && BUILDINGS[ex.type].kind === 'belt') {
        if (ex.type !== this.buildType) {
          // troca de tipo (ex.: esteira comum -> rápida): demole e reconstrói, mantendo os itens
          const items = ex.items.slice();
          const cost = BUILDINGS[this.buildType].cost;
          if (this.sim.economy.money + Math.floor(ex.invested * 0.5) < cost) { failed++; continue; }
          ex.items = []; // itens migram para a nova esteira
          this.sim.demolish(ex.id);
          const nb = this.sim.placeBuilding(this.buildType, t.x, t.z, t.rot, { silent: true });
          if (nb) { nb.items = items; placed++; ids.push(nb.id); } else failed++;
        } else if (this.sim.setBeltDir(ex.id, t.rot)) changed++;
        continue;
      }
      const b = this.sim.placeBuilding(this.buildType, t.x, t.z, t.rot, { silent: true });
      if (b) { placed++; ids.push(b.id); } else failed++;
    }
    if (placed || changed) this.game.audio.play(placed ? 'place' : 'rotate');
    if (failed) {
      this.game.audio.play('error');
      const why = this.sim.economy.money < BUILDINGS[this.buildType].cost ? 'moedas insuficientes' : 'local bloqueado';
      this.ui.toast(`${failed} segmento(s) não construído(s): ${why}`, 'err');
    }
    if (placed) { this.sim.events.emit('built', { type: this.buildType, count: placed }); this.game.pushUndo(ids); }
  }

  demolishAt(x, z, beltsOnly) {
    const b = this.sim.at(x, z);
    if (!b) return;
    if (beltsOnly && BUILDINGS[b.type].kind !== 'belt') return;
    if (this.sim.demolish(b.id)) this.game.audio.play('demolish');
    if (this.ui.selected?.id === b.id) this.ui.clearSelection();
  }

  // ------------------------------------------------------------ teclado
  onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const cam = this.game.cam;
    const code = e.code;
    const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (moveKeys.includes(code)) { if (down && this.game.active && !this.ui.hasModal()) cam.keys.add(code); else cam.keys.delete(code); e.preventDefault(); return; }
    if (!down) return;
    if (code === 'F5') { e.preventDefault(); if (this.game.active) this.game.save('slot1'); return; }
    if (code === 'F9') { e.preventDefault(); if (this.game.active) this.game.load('slot1'); return; }
    if (code === 'Escape') {
      e.preventDefault();
      if (!this.game.active) return;
      if (this.ui.closeTopModal()) return;
      if (!document.querySelector('#alerts-pop').classList.contains('hidden')) { document.querySelector('#alerts-pop').classList.add('hidden'); return; }
      if (this.mode !== 'select') { this.cancel(); return; }
      if (this.ui.selected) { this.ui.clearSelection(); return; }
      this.ui.openPause();
      return;
    }
    if (!this.game.active || this.ui.hasModal()) return;
    if (/^F[1-6]$/.test(code)) { e.preventDefault(); this.ui.setCat(CATEGORIES[+code.slice(1) - 1].id); return; }
    if (/^Digit[1-9]$/.test(code)) {
      const t = this.ui.itemTypes()[+code.slice(5) - 1];
      if (t) this.startBuild(t);
      return;
    }
    const sel = this.ui.selected?.kind === 'building' ? this.sim.buildings.get(this.ui.selected.id) : null;
    if (code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.game.undo(); return; }
    if (code === 'KeyC' && !e.ctrlKey) {
      // conta-gotas: copia tipo e rotação da estrutura sob o mouse (ou da selecionada)
      const src = (this.hover && this.sim.at(this.hover.x, this.hover.z)) || sel;
      if (src) {
        this.rot = src.rot;
        if (this.mode === 'build' && this.buildType === src.type) this.cancel();
        this.startBuild(src.type);
      }
      return;
    }
    switch (code) {
      case 'KeyR':
        this.rot = (this.rot + (e.shiftKey ? 3 : 1)) & 3;
        this.game.audio.play('rotate');
        if (this.lastPick && (this.mode === 'build' || this.mode === 'move')) this.updateGhost(this.lastPick);
        break;
      case 'KeyQ': cam.rotate(-1); break;
      case 'KeyE': cam.rotate(1); break;
      case 'Space': e.preventDefault(); this.game.togglePause(); break;
      case 'KeyT': this.ui.openTech(); break;
      case 'KeyG': this.ui.openFinance(); break;
      case 'KeyM': this.ui.openMap(); break;
      case 'KeyH': this.ui.openHelp(); break;
      case 'KeyX': this.startDemolish(); break;
      case 'KeyU': if (sel) this.game.upgradeSelected(); break;
      case 'KeyV': if (sel) this.startMove(sel.id); break;
      case 'Delete': case 'Backspace': if (sel) this.game.demolishSelected(); break;
      case 'KeyF':
        if (sel) { const [cx, cz] = this.sim.center(sel); if (Math.hypot(cam.goal.x - cx, cam.goal.z - cz) < 0.5 && cam.goalDistance < 15) cam.focus(cx, cz, 26); else cam.focus(cx, cz, 13); }
        else cam.focus(cam.goal.x, cam.goal.z, 26);
        break;
    }
  }
}
