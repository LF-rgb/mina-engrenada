// Ponto de entrada: monta simulação, renderização, entrada, interface e áudio; laço principal.
import * as THREE from 'three';
import { SIM, BUILDINGS, DEFAULT_SETTINGS, REGIONS, TECHS } from './data/config.js';
import { Simulation } from './sim/Simulation.js';
import { WorldRenderer } from './render/WorldRenderer.js';
import { CameraController } from './render/CameraController.js';
import { buildModel } from './render/models.js';
import { InputController } from './input/InputController.js';
import { UI } from './ui/UI.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { formatMoney } from './sim/util.js';
import * as Storage from './core/storage.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.speed = 1;
    this.active = false;     // partida em andamento (fora do menu principal)
    this.thumbs = {};
  }

  async init() {
    this.settings = await Storage.loadSettings(DEFAULT_SETTINGS);
    this.audio = new AudioEngine(this.settings);
    this.sim = new Simulation();
    this.renderer = new WorldRenderer(this.canvas, this.sim, this.settings);
    this.cam = new CameraController(this.renderer.camera, this.sim.map, this.settings, () => this.renderer.terrain);
    this.renderThumbnails();
    this.input = new InputController(this, this.canvas);
    this.ui = new UI(this);
    this.input.updateHint();
    this.bindSimEvents();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('beforeunload', () => { if (this.active) this.save('auto', true); });
    // primeira interação libera o áudio (política do Chromium)
    const unlock = () => { this.audio.init(); this.audio.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.hoverTipEl = document.createElement('div');
    this.hoverTipEl.style.cssText = 'position:fixed;z-index:44;pointer-events:none;background:rgba(11,17,32,.92);border:1px solid rgba(255,255,255,.12);color:#eef2f7;font:13px Segoe UI,Arial;padding:5px 9px;border-radius:7px;display:none;white-space:nowrap';
    document.body.appendChild(this.hoverTipEl);
    this.cursorTip = document.createElement('div');
    this.cursorTip.style.cssText = 'position:fixed;z-index:45;pointer-events:none;background:rgba(160,30,30,.92);color:#fff;font:600 12px Segoe UI,Arial;padding:4px 8px;border-radius:6px;display:none';
    document.body.appendChild(this.cursorTip);
    Storage.setFullscreen(this.settings.fullscreen);
    document.getElementById('loading').remove();
    await this.toMainMenu();
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
    window.__game = this; // acesso para testes automatizados
  }

  renderThumbnails() {
    // ícones gerados a partir dos próprios modelos 3D (estilo consistente com o mundo)
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(128, 128); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 5, 4); scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    for (const type of Object.keys(BUILDINGS)) {
      const def = BUILDINGS[type];
      let root;
      if (def.kind === 'belt') {
        root = new THREE.Group();
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.8), new THREE.MeshStandardMaterial({ color: type === 'conveyor' ? 0xe0a83a : 0x3fa0e0 }));
        const bt = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.62), new THREE.MeshStandardMaterial({ color: type === 'conveyor' ? 0x444a54 : 0x2c4a6e }));
        bt.position.y = 0.09; fr.add(bt);
        const a = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); a.rotation.z = -Math.PI / 2; a.position.y = 0.16; fr.add(a);
        fr.position.y = 0.1; root.add(fr);
        for (const [x, c] of [[-0.4, 0x9aa0a6], [0.25, 0xb5643c]]) { const o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14), new THREE.MeshStandardMaterial({ color: c, flatShading: true })); o.position.set(x, 0.33, 0); root.add(o); }
      } else if (def.kind === 'platform') {
        root = new THREE.Group();
        for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xb9b6ae : 0xc4c1b9 })); t.position.set((i % 3) - 1, 0.06, Math.floor(i / 3) - 1); root.add(t); }
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0xf08a24 })); cone.position.set(0.8, 0.37, 0.8); root.add(cone);
      } else root = buildModel(type).root;
      scene.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()).length();
      const c = box.getCenter(new THREE.Vector3());
      cam.position.set(c.x + size * 0.95, c.y + size * 0.85, c.z + size * 1.15);
      cam.lookAt(c);
      r.render(scene, cam);
      this.thumbs[type] = r.domElement.toDataURL('image/png');
      scene.remove(root);
    }
    r.dispose();
    r.forceContextLoss?.();
  }

  bindSimEvents() {
    // reassinado a cada nova simulação
    const s = this.sim;
    s.events.on('error', (msg) => { this.ui?.toast(msg, 'err'); });
    s.events.on('objective', ({ o }) => {
      this.audio.play('objective');
      this.ui.toast(`🏆 Objetivo concluído: <b>${o.text}</b> · +${formatMoney(o.reward)}`, 'gold');
      this.ui.flashObjective();
    });
    s.events.on('tech', ({ id }) => { this.ui.toast(`🔬 Pesquisa concluída: <b>${TECHS[id].name}</b>`, 'gold'); this.ui.renderItems(); });
    s.events.on('region', () => { this.ui.refreshModals(); });
    s.events.on('sold', () => this.audio.play('coin'));
    s.events.on('removed', ({ refund }) => { if (refund > 0) this.ui.toast(`Demolido · +${formatMoney(refund)}`); });
    s.events.on('upgraded', () => this.audio.play('upgrade'));
  }

  setSim(sim) {
    this.sim = sim;
    this.undoStack = [];
    this._stoneSpot = null;
    this.renderer?.setMarker?.(null);
    this.renderer.setSim(sim);
    this.cam.map = sim.map;
    this.bindSimEvents();
    this.input.cancel();
    this.ui.clearSelection();
    this.ui.renderItems();
    this.ui._mapBase = null;
  }

  // ------------------------------------------------------------ fluxo de partidas
  async toMainMenu() {
    this.active = false;
    this.ui.showHUD(false);
    this.ui.closeAllModals();
    this.setSim(new Simulation());
    this.decorateMenuScene();
    const saves = await Storage.listSaves();
    const latest = Object.entries(saves).filter(([, v]) => v && !v.corrupt).sort((a, b) => new Date(b[1].savedAt) - new Date(a[1].savedAt))[0];
    const box = document.getElementById('mm-buttons');
    box.innerHTML = '';
    const add = (label, sub, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`; b.onclick = () => { this.audio.init(); this.audio.play('click'); fn(); }; box.appendChild(b); };
    if (latest) add('▶ Continuar', `${latest[0] === 'auto' ? 'Salvamento automático' : latest[0].replace('slot', 'Espaço ')} · ${new Date(latest[1].savedAt).toLocaleString('pt-BR')}`, 'primary', () => this.load(latest[0]));
    add('✦ Novo jogo', 'Comece com uma pequena operação no Vale Inicial', latest ? '' : 'primary', () => {
      if (saves.auto) this.ui.confirm('Iniciar um novo jogo? O salvamento automático atual será substituído na próxima gravação (seus espaços manuais continuam intactos).', () => this.newGame(), 'Novo jogo');
      else this.newGame();
    });
    add('📂 Carregar jogo', null, '', () => this.ui.openSlots('load'));
    add('⚙ Configurações', null, '', () => this.ui.openSettings());
    add('⌨ Controles', null, '', () => this.ui.openHelp());
    add('⏻ Sair', null, '', () => this.quit());
    document.getElementById('mainmenu').classList.remove('hidden');
    this.cam.focus(44, 36, 34);
    this.menuSpin = true;
  }

  decorateMenuScene() {
    // cena viva no fundo do menu: uma pequena fábrica funcionando de verdade
    const s = this.sim;
    s.economy.money = 1e6;
    const place = (t, x, z, r) => s.placeBuilding(t, x, z, r, { silent: true });
    place('miner', 35, 27, 0);
    for (let z = 27; z <= 32; z++) place('conveyor', 37, z, 1);
    place('crusher', 37, 33, 1);
    for (let z = 35; z <= 36; z++) place('conveyor', 37, z, 1);
    place('conveyor', 37, 37, 0); place('conveyor', 38, 37, 0); place('conveyor', 39, 37, 3); place('conveyor', 39, 36, 0);
    place('miner', 49, 34, 2);
    for (let x = 48; x >= 43; x--) place('conveyor', x, 34, 2);
    place('workshop', 44, 28, 1);
    s.economy.money = 0;
    for (let i = 0; i < 400; i++) s.tick(0.05);
  }

  newGame() {
    this.ui.closeAllModals();
    this.setSim(new Simulation());
    this.startPlaying();
    this.cam.focus(42, 34, 24);
    this.ui.toast('Bem-vindo ao Vale Inicial! Siga o objetivo no canto superior esquerdo.', 'gold');
  }

  startPlaying() {
    document.getElementById('mainmenu').classList.add('hidden');
    this.menuSpin = false;
    const q = Math.PI / 2; this.cam.goalYaw = Math.round((this.cam.goalYaw - Math.PI / 4) / q) * q + Math.PI / 4;
    this.active = true;
    this.ui.showHUD(true);
    this.setSpeed(1);
    this.autosaveAcc = 0;
    this.ui.update();
  }

  async save(slot, silent = false) {
    if (!this.active) return false;
    try {
      const data = this.sim.serialize();
      data.camera = { x: this.cam.goal.x, z: this.cam.goal.z, d: this.cam.goalDistance, yaw: this.cam.goalYaw };
      const r = await Storage.writeSave(slot, data);
      if (r && r.ok === false) throw new Error(r.error);
      if (!silent) { this.ui.toast(`💾 Jogo salvo (${slot === 'auto' ? 'automático' : slot.replace('slot', 'espaço ')})`); this.audio.play('save'); }
      return true;
    } catch (e) {
      this.ui.toast('Falha ao salvar: ' + e.message, 'err');
      return false;
    }
  }

  async load(slot) {
    const r = await Storage.readSave(slot);
    if (r.error) { this.ui.toast(r.error, 'err'); this.audio.play('error'); return false; }
    let sim;
    try { sim = Simulation.deserialize(r.data); }
    catch (e) { this.ui.toast('Não foi possível carregar: ' + e.message, 'err'); this.audio.play('error'); return false; }
    this.ui.closeAllModals();
    this.setSim(sim);
    this.startPlaying();
    const c = r.data.camera;
    if (c) { this.cam.focus(c.x, c.z, c.d); this.cam.goalYaw = c.yaw; }
    if (r.recovered) this.ui.toast('O arquivo principal estava corrompido; carregamos a cópia de segurança.', 'err');
    // produção limitada enquanto o jogo esteve fechado
    const away = (Date.now() - new Date(r.data.savedAt).getTime()) / 1000;
    if (away > 30) {
      const res = sim.simulateOffline(away);
      if (res.earned > 1) this.ui.toast(`Enquanto você esteve fora (${Math.round(res.seconds / 60)} min simulados, limite ${SIM.offlineMaxSeconds / 60} min): +${formatMoney(res.earned)}`, 'gold');
    }
    this.ui.toast('📂 Partida carregada');
    return true;
  }

  quit() {
    const go = () => Storage.quitApp();
    if (this.active) this.save('auto', true).then(go); else go();
  }

  // ------------------------------------------------------------ ações
  setSpeed(s, silent) {
    this.speed = s;
    this.sim.paused = s === 0;
    this.ui.setSpeedButtons(s);
    if (!silent) this.audio.play('click');
  }
  togglePause() { this.setSpeed(this.speed === 0 ? (this.prevSpeed || 1) : (this.prevSpeed = this.speed, 0)); }

  // ------------------------------------------------------------ desfazer construções (reembolso integral)
  pushUndo(ids) {
    if (!ids || !ids.length) return;
    (this.undoStack ||= []).push({ ids, t: this.sim.time });
    if (this.undoStack.length > 30) this.undoStack.shift();
  }
  undo() {
    const st = this.undoStack || [];
    while (st.length) {
      const e = st.pop();
      const alive = e.ids.filter((id) => this.sim.buildings.has(id));
      if (!alive.length) continue;
      let back = 0;
      const m0 = this.sim.economy.money;
      for (const id of alive) this.sim.demolish(id, { refundRatio: 1 });
      back = this.sim.economy.money - m0;
      if (this.ui.selected && alive.includes(this.ui.selected.id)) this.ui.clearSelection();
      this.audio.play('demolish');
      this.ui.toast(`↶ Construção desfeita · +${formatMoney(back)}`);
      return true;
    }
    this.ui.toast('Nada para desfazer', 'err');
    return false;
  }

  setHoverTip(b, p) {
    const t = this.hoverTipEl;
    if (!b || this.input.mode !== 'select' || this.ui.hasModal()) { t.style.display = 'none'; return; }
    const def = BUILDINGS[b.type];
    const label = { working: 'operando', idle: 'ocioso', no_input: 'aguardando insumos', output_full: 'saída bloqueada', blocked: 'bloqueada', no_power: 'sem energia', no_fuel: 'sem combustível', no_deposit: 'sem recursos', off: 'desligado' }[b.state] || '';
    const color = { working: '#4fd67a', no_power: '#ef5a50', no_fuel: '#ef5a50', no_deposit: '#ef5a50', output_full: '#f08a24', blocked: '#f08a24', off: '#9aa' }[b.state] || '#ffd84a';
    t.innerHTML = `<b>${def.name}</b>${b.level > 1 ? ` · nv ${b.level}` : ''}${label ? ` · <span style="color:${color}">${label}</span>` : ''}`;
    t.style.display = 'block';
    t.style.left = this.cam.mouse.x + 16 + 'px';
    t.style.top = this.cam.mouse.y + 18 + 'px';
  }

  // alvo do marcador no mundo para os primeiros objetivos (ensina onde agir)
  objectiveTarget() {
    const o = this.sim.progression.current();
    if (!o) return null;
    const s = this.sim;
    const seller = [...s.buildings.values()].find((b) => b.type === 'seller');
    const miner = [...s.buildings.values()].find((b) => b.type === 'miner');
    if (o.id === 'o1') {
      if (!this._stoneSpot) {
        const [sx, sz] = seller ? s.center(seller) : [41, 34];
        let best = null, bd = 1e9;
        for (let z = 22; z < 48; z++) for (let x = 30; x < 56; x++) {
          const d = s.map.depositInfo(x, z);
          if (!d || d.res !== 'stone') continue;
          const ok = s.canPlace('miner', x, z, 0, { free: true }).ok;
          const dist = Math.hypot(x + 1 - sx, z + 1 - sz);
          if (ok && dist < bd) { bd = dist; best = [x + 1, z + 1]; }
        }
        this._stoneSpot = best;
      }
      return this._stoneSpot;
    }
    if ((o.id === 'o2' || o.id === 'o3') && miner) { const t = s.outputTargets(miner)[0]; return t ? [t.x + 0.5, t.z + 0.5] : null; }
    if ((o.id === 'o5') && seller) return s.center(seller);
    return null;
  }

  upgradeSelected() {
    const id = this.ui.selected?.id;
    if (id && this.sim.upgrade(id)) this.ui.renderSelection(false);
    else this.audio.play('error');
  }
  demolishSelected() {
    const id = this.ui.selected?.id;
    if (!id) return;
    if (this.sim.demolish(id)) { this.audio.play('demolish'); this.ui.clearSelection(); }
    else this.audio.play('error');
  }

  applySettings() {
    this.audio.applyVolumes();
    this.renderer.applyShadowQuality();
    Storage.setFullscreen(this.settings.fullscreen);
    if (this.input.mode === 'build') this.renderer.terrain.grid.visible = this.settings.showGrid;
    clearTimeout(this._setT);
    this._setT = setTimeout(() => Storage.saveSettings(this.settings), 300);
  }

  setCursorTip(text, p) {
    const t = this.cursorTip;
    if (!text) { t.style.display = 'none'; return; }
    t.textContent = text;
    t.style.display = 'block';
    t.style.left = this.cam.mouse.x + 16 + 'px';
    t.style.top = this.cam.mouse.y + 18 + 'px';
  }

  onVisibility() {
    if (document.hidden) { this.hiddenAt = performance.now(); return; }
    // ao voltar, recupera o tempo perdido (limitado) de forma determinística
    if (this.active && this.hiddenAt && this.speed > 0) {
      const secs = (performance.now() - this.hiddenAt) / 1000;
      if (secs > 2) this.sim.simulateOffline(secs);
    }
    this.hiddenAt = 0;
    this.last = performance.now();
  }

  // usado pelos testes automatizados: converte um ponto do mundo em pixels da tela
  worldToScreen(x, z) {
    const v = new THREE.Vector3(x, 0, z).project(this.renderer.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.resize(w, h);
  }

  // ------------------------------------------------------------ laço
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const step = 1 / SIM.tickRate;
    const speed = this.active ? this.speed : 1;
    this.renderer._simSpeed = speed;
    this.acc += dt * speed;
    if (this.acc > 1.5) this.acc = 1.5;
    let ticks = 0;
    while (this.acc >= step && ticks < 120) { this.sim.tick(step); this.acc -= step; ticks++; }
    const alpha = this.acc / step;

    if (this.menuSpin) { this.cam.goalYaw += dt * 0.08; }
    this.cam.update(dt, window.innerWidth, window.innerHeight);
    this.renderer.render(dt, alpha, this.cam);

    if (this.active) {
      this.uiAcc = (this.uiAcc || 0) + dt;
      if (this.uiAcc > 0.25) {
        this.uiAcc = 0;
        this.ui.update();
        this.renderer.setMarker(this.objectiveTarget());
        this.ui.drawMap(document.getElementById('minimap'));
        for (const m of this.ui.modalStack) if (m.kind === 'fin' || m.kind === 'map') m.refresh?.();
        let mach = 0, belts = 0;
        for (const b of this.sim.buildings.values()) if (b.state === 'working') { if (BUILDINGS[b.type].kind === 'belt') belts++; else mach++; }
        this.audio.setActivity(this.sim.paused ? 0 : mach, this.sim.paused ? 0 : belts);
      }
      if (this.settings.autosave && !this.sim.paused) {
        this.autosaveAcc += dt;
        if (this.autosaveAcc > SIM.autosaveSeconds) { this.autosaveAcc = 0; this.save('auto', true).then((ok) => ok && this.ui.toast('💾 Salvamento automático')); }
      }
    }
  }
}

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0e1422;color:#fff;font:16px Segoe UI;z-index:999;padding:40px;text-align:center">Erro ao iniciar o jogo:<br><pre style="color:#f88;white-space:pre-wrap">${e.stack || e}</pre></div>`);
});
