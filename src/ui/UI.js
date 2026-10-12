// Interface do jogo (HTML/CSS sobre o canvas 3D). Toda ação chama métodos públicos da simulação.
import { BUILDINGS, CATEGORIES, RESOURCES, RECIPES, TECHS, REGIONS, OBJECTIVES, FUELS, SIM } from '../data/config.js';
import { formatMoney, invTotal } from '../sim/util.js';
import { LEDGER_LABELS } from '../sim/systems/economy.js';
import { machineCapacity, minerTiles } from '../sim/systems/machines.js';
import { beltSpeed } from '../sim/systems/belts.js';
import { generatorOutput } from '../sim/systems/power.js';
import { pigCount } from '../sim/systems/pigs.js';
import { SLOTS, listSaves } from '../core/storage.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const resChip = (r, n) => `<span class="res"><i style="background:${hex(RESOURCES[r].color)}"></i>${RESOURCES[r].name}${n != null ? ` <b>${Math.floor(n)}</b>` : ''}</span>`;

const STATE_LABEL = {
  working: 'Operando', idle: 'Ocioso', no_input: 'Aguardando insumos', output_full: 'Saída bloqueada', blocked: 'Bloqueada',
  no_power: 'Sem energia', no_fuel: 'Sem combustível', no_deposit: 'Sem recursos', off: 'Desligado',
};

const OBJ_HINTS = {
  o1: 'Abra <b>Mineração</b> na barra inferior, escolha a Mineradora e clique sobre as pedras cinzentas perto do Centro de Vendas.',
  o2: 'A mineradora extrai sozinha. O minério fica na saída (seta laranja) até ser levado embora.',
  o3: 'Em <b>Transporte</b>, segure o botão esquerdo e arraste para desenhar uma linha de esteiras partindo da saída da mineradora.',
  o4: 'Construa um Triturador e leve a esteira até uma das entradas (setas verdes). Cascalho vale 3× mais que pedra.',
  o5: 'Ligue a saída do Triturador ao Centro de Vendas com esteiras.',
  o6: 'Expanda: mais mineradoras em outros depósitos, ferro e carvão também vendem.',
  o7: 'A Oficina (Infraestrutura) libera a árvore de tecnologias (tecla T).',
  o8: 'Na árvore (T), pesquise “Geração de Energia”. Geradores queimam carvão ou madeira.',
  o9: 'Abra o Mapa (M) e compre uma região. A Serra de Ferro tem depósitos enormes.',
  o10: 'Cadeia: minério de ferro → Triturador (pó) → Fundição (precisa de energia) → lingote.',
  o11: 'Use Melhorias (U) nas máquinas e as tecnologias globais para multiplicar a produção.',
  o12: 'Refinaria: 2 lingotes de ferro + 1 carvão = Viga de Aço. Use divisores e armazéns para alimentar.',
  o13: 'Pesquise a Perfuração Avançada e desbloqueie o Planalto Cristalino no mapa.',
  o14: 'Circuito: lingote de cobre + lingote de ouro na Refinaria. Ouro só sai com a Perfuratriz Avançada.',
  o15: 'O Distrito Industrial exige Plataformas para nivelar o entulho.',
  o16: 'Agora é com você: otimize, automatize e alcance meio milhão!',
};

export class UI {
  constructor(game) {
    this.game = game;
    this.cat = 'mining';
    this.selected = null;
    this.selKind = null;
    this.modalStack = [];
    this.lastAlertCount = 0;
    this.buildCats();
    this.bindTopbar();
    this.bindMinimap();
  }
  get sim() { return this.game.sim; }

  // ------------------------------------------------------------ geral
  toast(msg, kind = '') {
    const t = el('div', 'toast ' + kind, msg);
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'err' ? 2200 : 3200);
  }

  showHUD(on) { $('#hud').classList.toggle('hidden', !on); }

  bindTopbar() {
    $('#speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.game.setSpeed(+b.dataset.speed); });
    $('#btn-tech').onclick = () => this.openTech();
    $('#btn-fin').onclick = () => this.openFinance();
    $('#btn-map').onclick = () => this.openMap();
    $('#btn-menu').onclick = () => this.openPause();
    $('#btn-alerts').onclick = () => {
      const p = $('#alerts-pop');
      p.classList.toggle('hidden');
      this.renderAlerts();
    };
  }

  setSpeedButtons(speed) {
    for (const b of $('#speed').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.speed === speed);
  }

  // ------------------------------------------------------------ barra superior (atualização periódica)
  update() {
    const sim = this.sim;
    $('#st-money').textContent = formatMoney(sim.economy.money);
    const { supply, demand } = sim.power;
    $('#st-power').textContent = `${Math.round(supply)} / ${Math.round(demand)} kW`;
    const f = $('#st-powerfill');
    f.style.width = (supply > 0 ? Math.min(100, (demand / supply) * 100) : demand > 0 ? 100 : 0) + '%';
    f.style.background = demand > supply ? 'var(--red)' : demand > supply * 0.85 ? 'var(--orange)' : 'var(--green)';
    $('#st-prod').textContent = Math.round(sim.productionPerMin) + '/min';
    const pr = sim.profitPerMin;
    $('#st-profit').textContent = formatMoney(pr) + '/min';
    $('#st-profit').style.color = pr >= 0 ? 'var(--green)' : 'var(--red)';
    const ac = sim.alerts.length;
    $('#alert-count').textContent = ac;
    $('#alert-count').classList.toggle('hidden', ac === 0);
    if (ac > this.lastAlertCount) this.game.audio.play('alert');
    this.lastAlertCount = ac;
    if (!$('#alerts-pop').classList.contains('hidden')) this.renderAlerts();
    this.updateObjective();
    this.refreshItems();
    if (this.selected) this.renderSelection(false);
  }

  renderAlerts() {
    const p = $('#alerts-pop');
    const a = this.sim.alerts;
    p.innerHTML = '<div class="h3">Alertas</div>' + (a.length ? a.map((x) => `<div class="al ${x.level}">${esc(x.text)}</div>`).join('') : '<div class="al" style="border-color:var(--green)">Tudo funcionando.</div>');
  }

  updateObjective() {
    const pg = this.sim.progression;
    const o = pg.current();
    $('#obj-count').textContent = `${pg.objIndex}/${OBJECTIVES.length}`;
    if (!o) {
      $('#obj-text').textContent = 'Todos os objetivos concluídos! Continue expandindo seu império.';
      $('#obj-fill').style.width = '100%'; $('#obj-prog').textContent = ''; $('#obj-reward').textContent = ''; $('#obj-hint').innerHTML = '';
      return;
    }
    const [v, n] = pg.progressOf(o);
    $('#obj-text').textContent = o.text;
    $('#obj-fill').style.width = Math.min(100, (v / n) * 100) + '%';
    $('#obj-prog').textContent = o.type === 'revenue' ? `${formatMoney(Math.min(v, n))} / ${formatMoney(n)}` : `${Math.min(v, n)} / ${n}`;
    $('#obj-reward').textContent = 'Recompensa: ' + formatMoney(o.reward);
    if (this._hintFor !== o.id) { $('#obj-hint').innerHTML = OBJ_HINTS[o.id] || ''; this._hintFor = o.id; }
  }
  flashObjective() { const c = $('#objective'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }

  // ------------------------------------------------------------ barra de construção
  buildCats() {
    const cats = $('#cats');
    cats.innerHTML = '';
    CATEGORIES.forEach((c, i) => {
      const b = el('button', c.id === this.cat ? 'on' : '', `${c.name}<kbd>F${i + 1}</kbd>`);
      b.onclick = () => this.setCat(c.id);
      cats.appendChild(b);
    });
    const up = el('button', '', 'Melhorias<kbd>T</kbd>');
    up.onclick = () => this.openTech();
    cats.appendChild(up);
    this.renderItems();
  }
  setCat(id) {
    this.cat = id;
    [...$('#cats').children].forEach((b, i) => b.classList.toggle('on', CATEGORIES[i]?.id === id));
    this.renderItems();
  }
  renderItems() {
    const box = $('#items');
    box.innerHTML = '';
    const list = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].cat === this.cat);
    list.forEach((type, i) => {
      const d = BUILDINGS[type];
      const it = el('div', 'item', `<kbd>${i + 1}</kbd><img src="${this.game.thumbs[type] || ''}" alt=""><div class="nm">${d.name}</div><div class="cs">${formatMoney(d.cost)}</div>`);
      it.dataset.type = type;
      it.onclick = () => this.game.input.startBuild(type);
      it.onmouseenter = (e) => this.showTip(e, type);
      it.onmousemove = (e) => this.moveTip(e);
      it.onmouseleave = () => this.hideTip();
      box.appendChild(it);
    });
    this.refreshItems();
  }
  itemTypes() { return [...$('#items').children].map((c) => c.dataset.type); }
  refreshItems() {
    const sim = this.sim;
    for (const it of $('#items').children) {
      const t = it.dataset.type;
      it.classList.toggle('locked', !sim.isUnlocked(t));
      it.classList.toggle('poor', sim.economy.money < BUILDINGS[t].cost);
      it.classList.toggle('on', this.game.input.mode === 'build' && this.game.input.buildType === t);
    }
  }
  showTip(e, type) {
    const d = BUILDINGS[type];
    const sim = this.sim;
    let html = `<h4>${d.name} · ${formatMoney(d.cost)}</h4>${d.desc}`;
    const meta = [];
    if (d.size) meta.push(`Tamanho ${d.size[0]}×${d.size[1]}`);
    if (d.power) meta.push(`Energia ${d.power} kW`);
    if (d.upkeep) meta.push(`Custo ${formatMoney(d.upkeep)}/min`);
    if (d.rate) meta.push(`${(d.rate * 60).toFixed(0)} itens/min`);
    if (d.speed) meta.push(`${(d.speed / SIM.beltSpacing * 60).toFixed(0)} itens/min máx.`);
    if (d.recipes) meta.push('Receitas: ' + d.recipes.map((r) => RECIPES[r].name).join(', '));
    html += `<div class="meta">${meta.join(' · ')}</div>`;
    if (!sim.isUnlocked(type)) html += `<div class="req">Requer pesquisa: ${TECHS[d.tech].name}</div>`;
    const t = $('#tooltip'); t.innerHTML = html; t.classList.remove('hidden');
    this.moveTip(e);
  }
  moveTip(e) { const t = $('#tooltip'); const r = t.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 14) + 'px'; t.style.top = (e.clientY - r.height - 14) + 'px'; }
  hideTip() { $('#tooltip').classList.add('hidden'); }

  setHint(html) { $('#hint').innerHTML = html; }

  // ------------------------------------------------------------ painel de seleção
  select(b) {
    this.selected = b ? { kind: 'building', id: b.id } : null;
    this.renderSelection(true);
  }
  inspectTile(x, z) {
    this.selected = { kind: 'tile', x, z };
    this.renderSelection(true);
  }
  clearSelection() { this.selected = null; this.renderSelection(true); }

  renderSelection(full) {
    const p = $('#selpanel');
    const s = this.selected;
    if (!s) { p.classList.add('hidden'); this.game.renderer.setSelection(null); return; }
    if (s.kind === 'tile') {
      if (!full) return;
      const info = this.sim.map.depositInfo(s.x, s.z);
      const r = this.sim.map.regionAt(s.x, s.z);
      const reg = r >= 0 ? REGIONS[r] : null;
      let body = `<div class="kv"><span>Posição</span><span>${s.x}, ${s.z}</span></div><div class="kv"><span>Região</span><span>${reg ? reg.name : 'Encosta (não construível)'}</span></div>`;
      if (info) {
        const res = RESOURCES[info.res];
        body += `<div class="sec">Depósito</div><div class="inv">${resChip(info.res)}</div>
          <div class="kv"><span>Quantidade</span><span>≈ ${Math.floor(info.amount)} / ${Math.floor(info.max)}</span></div>
          <div class="progress"><i style="width:${(info.amount / info.max) * 100}%;background:${hex(res.color)}"></i></div>
          <div class="kv"><span>Valor bruto</span><span>${formatMoney(res.value)} / un.</span></div>
          <div class="kv"><span>Uso</span><span style="text-align:right;max-width:200px">${res.uses}</span></div>
          ${['gold_ore', 'crystal'].includes(info.res) ? '<div class="reason">Minério duro: requer a Perfuratriz Avançada.</div>' : ''}`;
      } else body += '<div class="reason">Nenhum depósito mineral neste tile.</div>';
      p.innerHTML = `<div class="sp-head"><div><h3>${info ? 'Depósito de ' + RESOURCES[info.res].name : 'Terreno'}</h3></div><button class="x">✕</button></div><div class="sp-body">${body}</div>`;
      p.querySelector('.x').onclick = () => this.clearSelection();
      p.classList.remove('hidden');
      this.game.renderer.setSelection(null);
      return;
    }
    const b = this.sim.buildings.get(s.id);
    if (!b) { this.clearSelection(); return; }
    const def = BUILDINGS[b.type];
    if (full) {
      p.innerHTML = `<div class="sp-head"><img src="${this.game.thumbs[b.type] || ''}"><div><h3>${def.name}</h3><div class="lvl" id="sp-lvl"></div></div><button class="x" title="Fechar">✕</button></div>
        <div class="sp-body"><div id="sp-dyn"></div><div id="sp-ctl"></div><div class="actions" id="sp-act"></div></div>`;
      p.querySelector('.x').onclick = () => this.clearSelection();
      this.buildControls(b);
      this.game.renderer.setSelection(b);
      p.classList.remove('hidden');
    }
    $('#sp-lvl').textContent = ['miner', 'processor', 'storage', 'generator', 'lumber', 'barn'].includes(def.kind) ? `Nível ${b.level} / ${SIM.upgradeMaxLevel}` : '';
    $('#sp-dyn').innerHTML = this.dynamicInfo(b);
    this.updateActions(b);
  }

  dynamicInfo(b) {
    const sim = this.sim;
    const def = BUILDINGS[b.type];
    let h = `<span class="chip ${b.state}">${STATE_LABEL[b.state] || b.state}</span>`;
    if (b.reason) h += `<div class="reason">${esc(b.reason)}</div>`;
    const inv = (o) => { const k = Object.keys(o); return k.length ? k.map((r) => resChip(r, o[r])).join('') : '<span class="res empty">vazio</span>'; };
    const kv = (a, v) => `<div class="kv"><span>${a}</span><span>${v}</span></div>`;
    switch (def.kind) {
      case 'miner': {
        const tiles = minerTiles(sim, b, def);
        const by = {};
        for (const i of tiles) { const r = sim.map.depositInfo(i % sim.map.w, (i / sim.map.w) | 0); by[r.res] = (by[r.res] || 0) + r.amount; }
        h += kv('Produção', `${b.rate.toFixed(1)} itens/min`);
        h += kv('Velocidade nominal', `${(def.rate * (1 + SIM.upgradeSpeedBonus * (b.level - 1)) * (1 + sim.progression.effect('mining')) * 60).toFixed(0)}/min`);
        if (def.power) h += kv('Energia', `${def.power} kW · ${Math.round(b.sat * 100)}%`);
        if (def.upkeep) h += kv('Custo operacional', formatMoney(def.upkeep) + '/min');
        h += `<div class="sec">Depósitos sob a máquina</div><div class="inv">${Object.keys(by).length ? Object.keys(by).map((r) => resChip(r, by[r])).join('') : '<span class="res empty">esgotado</span>'}</div>`;
        h += `<div class="sec">Saída (${invTotal(b.out)}/${machineCapacity(sim, b)})</div><div class="inv">${inv(b.out)}</div>`;
        break;
      }
      case 'lumber':
        h += kv('Produção', `${b.rate.toFixed(1)} itens/min`) + kv('Árvores no alcance', sim.treesNear(b).filter((i) => sim.map.depAmount[i] >= 1).length);
        h += `<div class="sec">Saída</div><div class="inv">${inv(b.out)}</div>`;
        break;
      case 'processor': {
        const rec = b.crafting ? RECIPES[b.crafting] : null;
        h += kv('Produção', `${b.rate.toFixed(1)} itens/min`);
        if (def.power) h += kv('Energia', `${def.power} kW · ${Math.round(b.sat * 100)}%`);
        if (def.upkeep) h += kv('Custo operacional', formatMoney(def.upkeep) + '/min');
        h += `<div class="sec">Processando</div>`;
        h += rec ? `<div class="kv"><span>${rec.name}</span><span>${Math.round(b.progress * 100)}%</span></div><div class="progress"><i style="width:${b.progress * 100}%"></i></div>` : '<div class="reason">—</div>';
        h += `<div class="sec">Entrada (máx ${machineCapacity(sim, b)} por tipo)</div><div class="inv">${inv(b.inv)}</div>`;
        h += `<div class="sec">Saída</div><div class="inv">${inv(b.out)}</div>`;
        break;
      }
      case 'storage':
        h += kv('Ocupação', `${invTotal(b.inv)} / ${machineCapacity(sim, b)}`);
        h += `<div class="progress"><i style="width:${(invTotal(b.inv) / machineCapacity(sim, b)) * 100}%"></i></div>`;
        h += `<div class="sec">Conteúdo</div><div class="inv">${inv(b.inv)}</div>`;
        break;
      case 'seller': {
        h += kv('Vendas', `${b.rate.toFixed(1)} itens/min`) + kv('Bônus de venda', `+${Math.round(sim.progression.effect('sell') * 100)}%`);
        const sold = Object.entries(sim.stats.sold).sort((a, c) => c[1] - a[1]).slice(0, 8);
        h += `<div class="sec">Tabela de preços</div>`;
        h += Object.keys(RESOURCES).filter((r) => sim.stats.sold[r] || RESOURCES[r].category !== 'raw' || true).slice(0, 19).map((r) => kv(`<span class="res"><i style="background:${hex(RESOURCES[r].color)}"></i>${RESOURCES[r].name}</span>`, formatMoney(sim.economy.sellValue(r)))).join('');
        if (sold.length) h += `<div class="sec">Mais vendidos</div><div class="inv">${sold.map(([r, n]) => resChip(r, n)).join('')}</div>`;
        break;
      }
      case 'generator': {
        const net = sim.power.networks.find((n) => n.generators.includes(b));
        h += kv('Geração máxima', `${generatorOutput(sim, b)} kW`) + kv('Carga', `${Math.round((b.load || 0) * 100)}%`);
        h += kv('Queimando', b.fuel > 0 ? `${RESOURCES[b.burning || 'coal'].name} (${b.fuel.toFixed(1)}s)` : '—');
        if (net) h += kv('Rede', `${Math.round(net.supply)} kW / demanda ${Math.round(net.demand)} kW · ${net.consumers.length} máquinas`);
        h += kv('Custo operacional', formatMoney(def.upkeep) + '/min');
        h += `<div class="sec">Combustível</div><div class="inv">${inv(b.inv)}</div>`;
        h += `<div class="reason">Carvão: ${FUELS.coal.burnTime}s por unidade a plena carga · Madeira: ${FUELS.wood.burnTime}s.</div>`;
        break;
      }
      case 'pole': {
        const net = sim.power.networks.find((n) => n.nodes.some((x) => x.b === b));
        h += net ? kv('Rede', `${Math.round(net.supply)} kW / ${Math.round(net.demand)} kW`) + kv('Geradores', net.generators.length) + kv('Consumidores', net.consumers.length) : '';
        h += `<div class="reason">Alcance ${def.radius} tiles. Liga-se a geradores/torres a até ${def.link} tiles.</div>`;
        break;
      }
      case 'belt':
        h += kv('Velocidade', `${(beltSpeed(sim, b)).toFixed(2)} tiles/s · até ${Math.round(beltSpeed(sim, b) / SIM.beltSpacing * 60)} itens/min`);
        h += `<div class="sec">Itens (${b.items.length}/4)</div><div class="inv">${b.items.length ? b.items.map((i) => resChip(i.r)).join('') : '<span class="res empty">vazia</span>'}</div>`;
        h += `<div class="reason">Arraste com a esteira selecionada sobre esta para mudar a direção sem custo.</div>`;
        break;
      case 'crossing':
        h += kv('Itens atravessando', b.items.length) + `<div class="reason">Cada item segue reto na direção em que entrou. Use para cruzar duas linhas de esteira.</div>`;
        break;
      case 'sorter':
        h += kv('Separando', b.filter ? resChip(b.filter) : '<span style="color:var(--orange)">nada escolhido</span>');
        h += `<div class="sec">Buffer</div><div class="inv">${inv(b.inv)}</div><div class="reason">Entrada por trás. O recurso escolhido sai pela <b>esquerda</b> (seta azul); o restante segue em frente (seta laranja).</div>`;
        break;
      case 'splitter':
        h += `<div class="sec">Buffer</div><div class="inv">${inv(b.inv)}</div><div class="reason">Entrada por trás; saídas em rodízio pela frente e laterais.</div>`;
        break;
      case 'barn': {
        const pigs = sim.pigs.filter((p) => p.barn === b.id);
        h += kv('Porquinhos', `${pigs.length} (busca até ${def.carry} itens cada)`) + kv('Alcance', def.radius + ' tiles');
        h += kv('Em ação', pigs.filter((p) => p.state !== 'idle').length);
        h += `<div class="sec">Estoque (${invTotal(b.inv)}/${machineCapacity(sim, b)})</div><div class="inv">${inv(b.inv)}</div>`;
        h += `<div class="reason">Os porquinhos coletam da saída de mineradoras, acampamentos e armazéns no alcance e entregam aqui. Ligue a frente do chiqueiro a uma esteira.</div>`;
        break;
      }
      case 'workshop':
        h += `<div class="reason">Tecnologias pesquisadas: ${Object.keys(sim.progression.techs).length} de ${Object.keys(TECHS).length}.</div>`;
        break;
    }
    return h;
  }

  buildControls(b) {
    const def = BUILDINGS[b.type];
    const c = $('#sp-ctl');
    c.innerHTML = '';
    if (def.kind === 'processor' && def.recipes.length > 1) {
      const s = el('select');
      s.innerHTML = `<option value="">Receita: automática</option>` + def.recipes.map((r) => {
        const rc = RECIPES[r];
        const ins = Object.entries(rc.in).map(([k, n]) => `${n} ${RESOURCES[k].name}`).join(' + ');
        const outs = Object.entries(rc.out).map(([k, n]) => `${n} ${RESOURCES[k].name}`).join(' + ');
        return `<option value="${r}" ${b.recipe === r ? 'selected' : ''}>${ins} → ${outs} (${rc.time}s)</option>`;
      }).join('');
      s.onchange = () => { this.sim.setRecipe(b.id, s.value || null); this.game.audio.play('click'); };
      c.appendChild(el('div', 'sec', 'Receita'));
      c.appendChild(s);
    } else if (def.kind === 'processor') {
      const rc = RECIPES[def.recipes[0]];
      c.innerHTML = `<div class="sec">Receita</div><div class="reason">${Object.entries(rc.in).map(([k, n]) => `${n} ${RESOURCES[k].name}`).join(' + ')} → ${Object.entries(rc.out).map(([k, n]) => `${n} ${RESOURCES[k].name}`).join(' + ')} (${rc.time}s)</div>`;
    }
    if (def.kind === 'sorter') {
      const s = el('select');
      s.id = 'sp-filter';
      s.innerHTML = '<option value="">— escolha o recurso —</option>' + Object.keys(RESOURCES).map((r) => `<option value="${r}" ${b.filter === r ? 'selected' : ''}>${RESOURCES[r].name}</option>`).join('');
      s.onchange = () => { this.sim.setFilter(b.id, s.value); this.game.audio.play('click'); this.renderSelection(false); };
      c.appendChild(el('div', 'sec', 'Recurso separado (sai pela esquerda)'));
      c.appendChild(s);
    }
    const a = $('#sp-act');
    a.innerHTML = '';
    const mk = (label, cls, fn, id) => { const bt = el('button', 'btn ' + cls, label); bt.onclick = fn; if (id) bt.id = id; a.appendChild(bt); return bt; };
    if (this.sim.upgradeCost(b) != null || b.level >= SIM.upgradeMaxLevel && ['miner', 'processor', 'storage', 'generator', 'lumber', 'barn'].includes(def.kind)) {
      mk('', 'primary wide', () => this.game.upgradeSelected(), 'sp-up');
    }
    if (def.kind === 'workshop') mk('Abrir tecnologias (T)', 'primary wide', () => this.openTech());
    if (!['belt', 'workshop', 'seller', 'pole', 'crossing', 'sorter', 'splitter'].includes(def.kind)) mk('', '', () => { this.sim.setEnabled(b.id, !b.enabled); this.game.audio.play('click'); this.renderSelection(false); }, 'sp-toggle');
    if (def.kind === 'storage' || def.kind === 'barn') mk('', '', () => { this.sim.setOutputEnabled(b.id, !b.outputEnabled); this.renderSelection(false); }, 'sp-out');
    mk('Mover (V)', '', () => this.game.input.startMove(b.id));
    mk('', 'danger', () => this.game.demolishSelected(), 'sp-del');
  }

  updateActions(b) {
    const up = $('#sp-up');
    if (up) {
      const cost = this.sim.upgradeCost(b);
      if (cost == null) { up.textContent = 'Nível máximo'; up.disabled = true; }
      else { up.innerHTML = `Melhorar para nível ${b.level + 1} · ${formatMoney(cost)} <small>(U)</small>`; up.disabled = this.sim.economy.money < cost; }
    }
    const t = $('#sp-toggle'); if (t) t.textContent = b.enabled ? 'Desligar' : 'Ligar';
    const o = $('#sp-out'); if (o) o.textContent = b.outputEnabled ? 'Pausar saída' : 'Liberar saída';
    const d = $('#sp-del');
    if (d) d.textContent = `Demolir (+${formatMoney(Math.floor(b.invested * SIM.demolishRefund))})`;
  }

  // ------------------------------------------------------------ modais
  modal(title, size = '') {
    const back = el('div', 'modal-back');
    const m = el('div', 'modal ' + size);
    m.innerHTML = `<header><h2>${title}</h2><button class="x" title="Fechar (Esc)">✕</button></header><div class="body"></div>`;
    back.appendChild(m);
    $('#modal-root').appendChild(back);
    const close = () => { back.remove(); this.modalStack = this.modalStack.filter((x) => x !== entry); entry.onClose?.(); };
    m.querySelector('.x').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back && entry.dismissable !== false) close(); });
    const entry = { back, body: m.querySelector('.body'), close, refresh: null, dismissable: true };
    this.modalStack.push(entry);
    return entry;
  }
  closeTopModal() { const m = this.modalStack[this.modalStack.length - 1]; if (m && m.dismissable !== false) { m.close(); return true; } return false; }
  hasModal() { return this.modalStack.length > 0; }
  closeAllModals() { while (this.modalStack.length) this.modalStack[this.modalStack.length - 1].close(); }
  refreshModals() { for (const m of this.modalStack) m.refresh?.(); }

  confirm(text, onYes, yes = 'Confirmar') {
    const m = this.modal('Confirmação', 'small');
    m.body.innerHTML = `<p style="margin-top:0;line-height:1.5">${text}</p><div class="actions"><button class="btn" id="cf-no">Cancelar</button><button class="btn primary" id="cf-yes">${yes}</button></div>`;
    m.body.querySelector('#cf-no').onclick = m.close;
    m.body.querySelector('#cf-yes').onclick = () => { m.close(); onYes(); };
  }

  openTech() {
    if (this.modalStack.some((m) => m.kind === 'tech')) return;
    const m = this.modal('Oficina de Melhorias · Tecnologias');
    m.kind = 'tech';
    const render = () => {
      const pg = this.sim.progression;
      const card = (id) => {
        const t = TECHS[id]; const st = pg.techStatus(id);
        const dots = t.type === 'level' ? `<div class="dots">${t.cost.map((_, i) => `<i class="${i < st.lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
        let btn;
        if (st.state === 'done') btn = `<button class="btn" disabled>✔ ${t.type === 'level' ? 'Nível máximo' : 'Pesquisado'}</button>`;
        else btn = `<button class="btn ${st.state === 'available' ? 'primary' : ''}" data-tech="${id}" ${st.state === 'available' ? '' : 'disabled'}>Pesquisar · ${formatMoney(st.cost)}</button>`;
        return `<div class="tech ${st.state}"><h4>${t.name}${t.type === 'level' ? ` <small style="color:var(--muted)">nível ${st.lvl}/${st.max}</small>` : ''}</h4>${dots}<p>${t.desc}</p>${st.state === 'locked' && st.reason ? `<div class="rq">${st.reason}</div>` : ''}${btn}</div>`;
      };
      const unlocks = Object.keys(TECHS).filter((k) => TECHS[k].type === 'unlock');
      const levels = Object.keys(TECHS).filter((k) => TECHS[k].type === 'level');
      m.body.innerHTML = (pg.hasWorkshop() ? '' : '<div class="banner">Construa uma <b>Oficina de Melhorias</b> (categoria Infraestrutura) para pesquisar tecnologias.</div>') +
        `<div class="h3">Novas estruturas</div><div class="tech-grid">${unlocks.map(card).join('')}</div><div class="h3">Melhorias globais</div><div class="tech-grid">${levels.map(card).join('')}</div>`;
      m.body.querySelectorAll('[data-tech]').forEach((b) => (b.onclick = () => { if (this.sim.progression.research(b.dataset.tech)) { this.game.audio.play('upgrade'); render(); this.renderItems(); } }));
    };
    m.refresh = () => { const sc = m.body.scrollTop; render(); m.body.scrollTop = sc; };
    render();
  }

  openFinance() {
    if (this.modalStack.some((m) => m.kind === 'fin')) return;
    const m = this.modal('Finanças', 'mid');
    m.kind = 'fin';
    const render = () => {
      const e = this.sim.economy;
      const inc = e.totals.income, exp = e.totals.expense;
      const sumI = Object.values(inc).reduce((a, c) => a + c, 0), sumE = Object.values(exp).reduce((a, c) => a + c, 0);
      const rows = (o, cls) => Object.entries(o).sort((a, c) => c[1] - a[1]).map(([k, v]) => `<tr><td>${LEDGER_LABELS[k] || k}</td><td class="${cls}">${formatMoney(v)}</td></tr>`).join('') || '<tr><td colspan=2 style="color:var(--muted)">—</td></tr>';
      const last = e.history[e.history.length - 1];
      m.body.innerHTML = `
        <div class="fin-cols">
          <div><div class="h3">Saldo e ritmo</div><table class="fin">
            <tr><td>Saldo</td><td>${formatMoney(e.money)}</td></tr>
            <tr><td>Lucro (últimos 60s)</td><td class="${this.sim.profitPerMin >= 0 ? 'pos' : 'neg'}">${formatMoney(this.sim.profitPerMin)}</td></tr>
            <tr><td>Custo operacional</td><td class="neg">${formatMoney(e.upkeepPerMin())}/min</td></tr>
            <tr><td>Minuto anterior</td><td>${last ? `<span class="pos">+${formatMoney(last.income)}</span> / <span class="neg">-${formatMoney(last.expense)}</span>` : '—'}</td></tr>
            <tr><td>Receita total</td><td class="pos">${formatMoney(sumI)}</td></tr>
            <tr><td>Despesa total</td><td class="neg">${formatMoney(sumE)}</td></tr>
            <tr><td><b>Lucro líquido acumulado</b></td><td class="${sumI - sumE >= 0 ? 'pos' : 'neg'}"><b>${formatMoney(sumI - sumE)}</b></td></tr>
          </table></div>
          <div><div class="h3">Últimos 30 minutos</div><canvas id="fin-chart" width="320" height="180" style="width:100%;background:rgba(255,255,255,.03);border-radius:10px"></canvas>
          <div style="font-size:12px;color:var(--muted);margin-top:4px"><span class="pos">■</span> Receitas <span class="neg">■</span> Despesas — linha: lucro líquido</div></div>
        </div>
        <div style="margin-top:16px"><div class="h3">Produção e vendas por recurso (último minuto)</div>${this.rateTable()}</div>
        <div class="fin-cols" style="margin-top:16px">
          <div><div class="h3">Receitas por origem</div><table class="fin">${rows(inc, 'pos')}</table></div>
          <div><div class="h3">Despesas por categoria</div><table class="fin">${rows(exp, 'neg')}</table></div>
        </div>`;
      const cv = m.body.querySelector('#fin-chart');
      const g = cv.getContext('2d');
      const hist = [...e.history, { income: e.bucket.income, expense: e.bucket.expense }];
      const max = Math.max(1, ...hist.map((h) => Math.max(h.income, h.expense)));
      const W = cv.width, H = cv.height, bw = W / 31;
      hist.forEach((h, i) => {
        const x = i * bw + 4;
        g.fillStyle = '#4fd67a'; g.fillRect(x, H - 14 - (h.income / max) * (H - 30), bw * 0.42, (h.income / max) * (H - 30));
        g.fillStyle = '#ef5a50'; g.fillRect(x + bw * 0.45, H - 14 - (h.expense / max) * (H - 30), bw * 0.42, (h.expense / max) * (H - 30));
      });
      g.strokeStyle = '#ffcf5c'; g.lineWidth = 2; g.beginPath();
      hist.forEach((h, i) => { const y = H - 14 - (Math.max(0, h.income - h.expense) / max) * (H - 30); const x = i * bw + 4 + bw * 0.45; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      g.fillStyle = '#9aa7b8'; g.font = '11px Segoe UI'; g.fillText(formatMoney(max), 4, 12); g.fillText('agora', W - 36, H - 2);
    };
    m.refresh = render;
    render();
  }

  rateTable() {
    const rates = this.sim.ratesPerMin();
    const keys = Object.keys(RESOURCES).filter((r) => rates[r]);
    if (!keys.length) return '<div class="reason">Nenhuma produção no último minuto.</div>';
    const rows = keys.map((r) => {
      const x = rates[r];
      const val = (x.sold || 0) * this.sim.economy.sellValue(r);
      return `<tr><td>${resChip(r)}</td><td>${(x.produced || 0).toFixed(1)}</td><td>${(x.sold || 0).toFixed(1)}</td><td class="pos">${val ? formatMoney(val) : '—'}</td></tr>`;
    }).join('');
    return `<div style="overflow-x:auto"><table class="fin"><tr><th>Recurso</th><th>Produzido/min</th><th>Vendido/min</th><th>Receita/min</th></tr>${rows}</table></div>`;
  }

  openMap() {
    if (this.modalStack.some((x) => x.kind === 'map')) return;
    const m = this.modal('Mapa e Regiões');
    m.kind = 'map';
    const render = () => {
      const pg = this.sim.progression;
      m.body.innerHTML = `<canvas id="bigmap" width="768" height="576" style="width:100%;max-width:768px;display:block;margin:0 auto;border-radius:12px;cursor:crosshair"></canvas>
        <div class="regions">${REGIONS.map((r) => {
          const st = pg.regionStatus(r.id);
          const btn = st.state === 'unlocked' ? '<button class="btn" disabled>✔ Desbloqueada</button>' : `<button class="btn ${st.state === 'available' ? 'primary' : ''}" data-region="${r.id}" ${st.state === 'available' ? '' : 'disabled'}>Desbloquear · ${formatMoney(r.cost)}</button>`;
          return `<div class="region"><h4><i style="background:${hex(r.ground)}"></i>${r.name}</h4><p>${r.desc}</p>${st.reason ? `<p style="color:#ff9d95">${st.reason}</p>` : ''}${btn}<button class="btn" data-goto="${r.id}">Ir até lá</button></div>`;
        }).join('')}</div>`;
      this.drawMap(m.body.querySelector('#bigmap'), true);
      m.body.querySelector('#bigmap').onclick = (e) => {
        const c = e.target, r = c.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * this.sim.map.w, z = ((e.clientY - r.top) / r.height) * this.sim.map.h;
        this.game.cam.focus(x, z); m.close();
      };
      m.body.querySelectorAll('[data-region]').forEach((b) => (b.onclick = () => {
        if (this.sim.progression.unlockRegion(b.dataset.region)) {
          this.game.audio.play('unlock');
          const r = REGIONS.find((q) => q.id === b.dataset.region);
          this.toast(`🗺 Região desbloqueada: <b>${r.name}</b>`, 'gold');
          m.close();
          this.game.cam.focus(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2, 40);
        }
      }));
      m.body.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { const r = REGIONS.find((q) => q.id === b.dataset.goto); m.close(); this.game.cam.focus(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2, 45); }));
    };
    m.refresh = () => { this.drawMap(m.body.querySelector('#bigmap'), true); };
    m.refreshFull = render;
    render();
  }

  // ------------------------------------------------------------ minimapa
  bindMinimap() {
    const c = $('#minimap');
    const go = (e) => {
      const r = c.getBoundingClientRect();
      this.game.cam.focus(((e.clientX - r.left) / r.width) * this.sim.map.w, ((e.clientY - r.top) / r.height) * this.sim.map.h);
    };
    let down = false;
    c.addEventListener('mousedown', (e) => { if (e.button === 0) { down = true; go(e); } });
    window.addEventListener('mousemove', (e) => { if (down) go(e); });
    window.addEventListener('mouseup', () => (down = false));
  }

  drawMap(canvas, big = false) {
    if (!canvas) return;
    const sim = this.sim, m = sim.map;
    const g = canvas.getContext('2d');
    const sx = canvas.width / m.w, sz = canvas.height / m.h;
    if (!this._mapBase || this._mapBaseV !== m.version || this._mapBase.width !== canvas.width) {
      const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
      const o = off.getContext('2d');
      for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
        const i = m.idx(x, z), r = m.region[i];
        let col;
        if (r < 0) { const h = m.height[i]; col = h < 1.6 ? '#4d7a3a' : h < 3.5 ? '#6c6a4e' : h < 6.5 ? '#7b766c' : '#d8dde2'; }
        else {
          col = hex(REGIONS[r].ground);
          if (m.terrain[i] === 1) col = '#77736d';
          else if (m.terrain[i] === 2) col = '#5f584c';
          if (m.depType[i] >= 0) { const res = ['stone', 'coal', 'iron_ore', 'copper_ore', 'gold_ore', 'crystal', 'wood'][m.depType[i]]; col = res === 'wood' ? '#2f6b2c' : hex(RESOURCES[res].color); }
          if (!sim.progression.regionUnlocked(REGIONS[r].id)) col = shade(col);
        }
        o.fillStyle = col; o.fillRect(x * sx, z * sz, Math.ceil(sx), Math.ceil(sz));
      }
      // nomes das regiões
      o.font = `bold ${big ? 14 : 9}px Segoe UI`; o.textAlign = 'center';
      for (const r of REGIONS) {
        const [rx, rz, rw, rh] = r.rect;
        const un = sim.progression.regionUnlocked(r.id);
        o.strokeStyle = un ? 'rgba(255,255,255,.5)' : 'rgba(242,182,50,.9)'; o.lineWidth = 1.5; o.setLineDash(un ? [] : [4, 3]);
        o.strokeRect(rx * sx, rz * sz, rw * sx, rh * sz);
        if (big || !un) { o.fillStyle = un ? '#fff' : '#ffcf5c'; o.fillText((un ? '' : '🔒 ') + r.name, (rx + rw / 2) * sx, (rz + rh / 2) * sz); }
      }
      this._mapBase = off; this._mapBaseV = m.version;
    }
    g.drawImage(this._mapBase, 0, 0);
    // estruturas
    const colors = { belt: '#e0a83a', miner: '#f2b632', processor: '#3cc8b4', generator: '#4fd67a', storage: '#d8c9a8', seller: '#ff6b5e', pole: '#6ad7ff', workshop: '#7fa8c9', barn: '#f4a9b8', lumber: '#9b6a3c', splitter: '#ffffff', crossing: '#e0a83a', sorter: '#3cc8b4' };
    for (const b of sim.buildings.values()) {
      const def = BUILDINGS[b.type];
      const [w, d] = sim.footprint(b.type, b.rot);
      g.fillStyle = colors[def.kind] || '#fff';
      g.fillRect(b.x * sx, b.z * sz, w * sx, d * sz);
    }
    // vista da câmera
    const t = this.game.cam.target;
    const span = this.game.cam.distance * 0.7;
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.setLineDash([]);
    g.strokeRect((t.x - span) * sx, (t.z - span * 0.6) * sz, span * 2 * sx, span * 1.2 * sz);
  }

  // ------------------------------------------------------------ menus de jogo
  openPause() {
    if (this.modalStack.some((m) => m.kind === 'pause')) return;
    const wasSpeed = this.game.speed;
    this.game.setSpeed(0, true);
    const m = this.modal('Jogo pausado', 'small');
    m.kind = 'pause';
    m.onClose = () => { if (!this.modalStack.some((x) => x.kind === 'pause')) this.game.setSpeed(wasSpeed || 1, true); };
    m.body.innerHTML = `<div class="menu-list">
      <button class="btn primary" data-a="cont">▶ Continuar</button>
      <button class="btn" data-a="save">💾 Salvar jogo</button>
      <button class="btn" data-a="load">📂 Carregar jogo</button>
      <button class="btn" data-a="set">⚙ Configurações</button>
      <button class="btn" data-a="help">⌨ Controles e ajuda</button>
      <button class="btn danger" data-a="restart">↺ Reiniciar partida</button>
      <button class="btn" data-a="menu">⌂ Menu principal</button>
      <button class="btn danger" data-a="quit">⏻ Sair para o desktop</button></div>`;
    m.body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'cont') m.close();
      if (a === 'save') this.openSlots('save');
      if (a === 'load') this.openSlots('load');
      if (a === 'set') this.openSettings();
      if (a === 'help') this.openHelp();
      if (a === 'restart') this.confirm('Reiniciar a partida? Todo o progresso não salvo será perdido.', () => { this.closeAllModals(); this.game.newGame(); }, 'Reiniciar');
      if (a === 'menu') this.confirm('Voltar ao menu principal? O jogo será salvo automaticamente antes.', async () => { await this.game.save('auto', true); this.closeAllModals(); this.game.toMainMenu(); }, 'Voltar ao menu');
      if (a === 'quit') this.confirm('Sair do jogo? A partida será salva automaticamente.', () => this.game.quit(), 'Salvar e sair');
    }));
  }

  async openSlots(mode) {
    const m = this.modal(mode === 'save' ? 'Salvar jogo' : 'Carregar jogo', 'small');
    const render = async () => {
      const info = await listSaves();
      m.body.innerHTML = `<div class="slots">${SLOTS.filter((s) => mode === 'load' || s.id !== 'auto').map((s) => {
        const i = info[s.id];
        const meta = i ? (i.corrupt ? '<small style="color:var(--red)">arquivo corrompido</small>' : `<small>${new Date(i.savedAt).toLocaleString('pt-BR')} · ${formatMoney(i.money || 0)} · ${Math.floor((i.time || 0) / 60)} min de jogo</small>`) : '<small>vazio</small>';
        const can = mode === 'save' || (i && !i.corrupt) || (i && i.corrupt);
        return `<div class="slot"><div class="meta"><b>${s.name}</b>${meta}</div><button class="btn ${mode === 'save' ? 'primary' : ''}" data-slot="${s.id}" ${can ? '' : 'disabled'}>${mode === 'save' ? 'Salvar aqui' : 'Carregar'}</button></div>`;
      }).join('')}</div>`;
      m.body.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = async () => {
        const slot = b.dataset.slot;
        if (mode === 'save') {
          const go = async () => { await this.game.save(slot); render(); };
          if (info[slot]) this.confirm('Substituir o salvamento existente?', go, 'Substituir'); else go();
        } else {
          const ok = await this.game.load(slot);
          if (ok) this.closeAllModals();
        }
      }));
    };
    render();
  }

  openSettings() {
    const m = this.modal('Configurações', 'mid');
    const s = this.game.settings;
    const range = (key, label, min, max, step, fmt = (v) => Math.round(v * 100) + '%') => `<div class="set-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-k="${key}"><span class="v" data-v="${key}">${fmt(s[key])}</span></div>`;
    const check = (key, label) => `<div class="set-row"><span>${label}</span><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}><span></span></div>`;
    m.body.innerHTML = `<div class="h3">Áudio</div>${range('masterVolume', 'Volume geral', 0, 1, 0.05)}${range('musicVolume', 'Música', 0, 1, 0.05)}${range('sfxVolume', 'Efeitos sonoros', 0, 1, 0.05)}
      <div class="h3" style="margin-top:16px">Câmera e controles</div>${range('cameraSpeed', 'Velocidade da câmera (WASD)', 0.3, 2.5, 0.1)}${range('zoomSpeed', 'Velocidade do zoom', 0.3, 2.5, 0.1)}${range('dragSensitivity', 'Sensibilidade do arraste (botão do meio)', 0.3, 2.5, 0.1)}
      ${check('edgeScroll', 'Mover a câmera com o mouse nas bordas da tela')}${check('invertZoom', 'Inverter direção do zoom')}
      <div class="h3" style="margin-top:16px">Vídeo e jogo</div>
      <div class="set-row"><span>Qualidade das sombras</span><select data-k="shadows"><option value="high">Alta</option><option value="medium">Média</option><option value="off">Desligadas</option></select><span></span></div>
      ${check('showGrid', 'Mostrar grade no modo construção')}${check('fullscreen', 'Tela cheia')}${check('autosave', 'Salvamento automático a cada 90 s')}`;
    m.body.querySelector('select[data-k=shadows]').value = s.shadows;
    m.body.querySelectorAll('[data-k]').forEach((inp) => {
      const ev = inp.type === 'range' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.k;
        s[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
        const v = m.body.querySelector(`[data-v=${k}]`); if (v) v.textContent = Math.round(s[k] * 100) + '%';
        this.game.applySettings();
      });
    });
  }

  openHelp() {
    const m = this.modal('Controles e ajuda', 'mid');
    const rows = [
      ['W A S D / Setas', 'Mover a câmera'], ['Roda do mouse', 'Zoom'], ['Botão do meio + arrastar', 'Deslocar a câmera'], ['Q / E', 'Girar a câmera 90°'],
      ['Clique esquerdo', 'Selecionar / construir / confirmar'], ['Arrastar (esteira)', 'Construir linha de esteiras (em L)'], ['Clique direito', 'Cancelar construção / fechar seleção'],
      ['R', 'Girar estrutura antes de posicionar'], ['F1 … F6', 'Categorias de construção'], ['1 … 9', 'Escolher item da categoria'],
      ['U', 'Melhorar estrutura selecionada'], ['C', 'Copiar a estrutura sob o mouse (conta-gotas)'], ['Ctrl + Z', 'Desfazer a última construção (reembolso integral)'], ['V', 'Mover estrutura selecionada'], ['Delete', 'Demolir selecionada'], ['X', 'Modo demolição (arraste para remover esteiras)'],
      ['F', 'Enquadrar a seleção / voltar ao padrão'], ['Espaço', 'Pausar / retomar'], ['T · G · M', 'Tecnologias · Finanças · Mapa'], ['F5 / F9', 'Salvamento rápido / carregar rápido'], ['Esc', 'Fechar janelas / menu de pausa'],
    ];
    m.body.innerHTML = `<div class="keys">${rows.map(([k, v]) => `<div><kbd>${k}</kbd></div><div>${v}</div>`).join('')}</div>
      <div class="h3" style="margin-top:18px">Como jogar</div>
      <p style="line-height:1.6;color:#cbd5e3;font-size:14px;margin:0">Posicione <b>Mineradoras</b> sobre depósitos. Cada máquina tem <span style="color:#45e07a">entradas (setas verdes)</span> e <span style="color:#ff9a2e">saída (seta laranja)</span>. Ligue-as com <b>esteiras</b>: a esteira leva o item na direção da seta. Itens que chegam ao <b>Centro de Vendas</b> viram moedas. Processar aumenta muito o valor: Triturador → Fundição → Refinaria. Fundição, Refinaria e Perfuratriz precisam de <b>energia</b>: alimente um Gerador com carvão e mantenha as máquinas dentro do raio dele (ou de Torres). Use a <b>Oficina</b> para pesquisar tecnologias e o <b>Mapa</b> para comprar novas regiões.</p>`;
  }
}

function shade(hexStr) {
  const n = parseInt(hexStr.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.45 + 30, g = ((n >> 8) & 255) * 0.45 + 30, b = (n & 255) * 0.45 + 40;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
