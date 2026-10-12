// =====================================================================
// Mina Engrenada - dados de configuração centralizados
// Todos os números de balanceamento ficam aqui (nada espalhado no código).
// =====================================================================

export const SAVE_VERSION = 1;

export const SIM = {
  tickRate: 20,               // ticks de simulação por segundo
  beltSpacing: 0.25,          // distância mínima entre itens (fração de tile) => 4 itens por tile
  startMoney: 600,
  demolishRefund: 0.5,        // reembolso parcial ao demolir
  depositRegenPerSec: 0.0,    // regeneração global (por tile), sobrescrita por recurso
  offlineMaxSeconds: 300,     // produção máxima simulada enquanto o jogo esteve fechado
  autosaveSeconds: 90,
  upgradeMaxLevel: 5,
  upgradeCostFactor: 1.8,     // custo da melhoria = custo base * fator^(nível-1) * 0.6
  upgradeSpeedBonus: 0.25,    // +25% velocidade por nível de estrutura
  upgradeCapBonus: 0.5,       // +50% capacidade por nível de estrutura
  machineBufferCap: 10,       // capacidade base de cada buffer de entrada/saída
  upkeepInterval: 1,          // segundos entre cobranças de custo operacional
};

export const MAP = { width: 96, height: 72, tile: 1, seed: 1337 };

// ---------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------
// category: raw | processed | product ; rarity: 1..5
export const RESOURCES = {
  stone:        { name: 'Pedra',              color: 0x9aa0a6, value: 1,   category: 'raw',       rarity: 1, shape: 'rock',   uses: 'Triturador → Cascalho' },
  coal:         { name: 'Carvão',             color: 0x2b2b30, value: 3,   category: 'raw',       rarity: 1, shape: 'rock',   uses: 'Combustível do Gerador; Refinaria (Aço)' },
  iron_ore:     { name: 'Minério de Ferro',   color: 0xb5643c, value: 4,   category: 'raw',       rarity: 2, shape: 'rock',   uses: 'Triturador → Pó de Ferro' },
  copper_ore:   { name: 'Minério de Cobre',   color: 0x2fa58a, value: 5,   category: 'raw',       rarity: 2, shape: 'rock',   uses: 'Triturador → Pó de Cobre' },
  gold_ore:     { name: 'Minério de Ouro',    color: 0xe7b532, value: 18,  category: 'raw',       rarity: 4, shape: 'rock',   uses: 'Triturador → Pó de Ouro' },
  crystal:      { name: 'Cristal Bruto',      color: 0xb36cf5, value: 40,  category: 'raw',       rarity: 5, shape: 'crystal',uses: 'Triturador → Fragmentos' },
  wood:         { name: 'Madeira',            color: 0x8a5a2b, value: 2,   category: 'raw',       rarity: 1, shape: 'log',    uses: 'Serraria → Tábuas; combustível' },
  gravel:       { name: 'Cascalho',           color: 0xc8c2b4, value: 3,   category: 'processed', rarity: 1, shape: 'dust',   uses: 'Refinaria (Prisma)' },
  iron_dust:    { name: 'Pó de Ferro',        color: 0x8e4a2e, value: 7,   category: 'processed', rarity: 2, shape: 'dust',   uses: 'Fundição → Lingote de Ferro' },
  copper_dust:  { name: 'Pó de Cobre',        color: 0x3fc7a4, value: 8,   category: 'processed', rarity: 2, shape: 'dust',   uses: 'Fundição → Lingote de Cobre' },
  gold_dust:    { name: 'Pó de Ouro',         color: 0xf5cf55, value: 30,  category: 'processed', rarity: 4, shape: 'dust',   uses: 'Fundição → Lingote de Ouro' },
  crystal_shard:{ name: 'Fragmento de Cristal',color:0xd5a6ff, value: 24,  category: 'processed', rarity: 5, shape: 'crystal',uses: 'Refinaria (Prisma)' },
  planks:       { name: 'Tábuas',             color: 0xd9a566, value: 6,   category: 'processed', rarity: 1, shape: 'plank',  uses: 'Venda' },
  iron_ingot:   { name: 'Lingote de Ferro',   color: 0xbfc4cc, value: 16,  category: 'product',   rarity: 2, shape: 'ingot',  uses: 'Refinaria (Aço)' },
  copper_ingot: { name: 'Lingote de Cobre',   color: 0xe0844a, value: 19,  category: 'product',   rarity: 2, shape: 'ingot',  uses: 'Refinaria (Circuito)' },
  gold_ingot:   { name: 'Lingote de Ouro',    color: 0xffd34d, value: 62,  category: 'product',   rarity: 4, shape: 'ingot',  uses: 'Refinaria (Circuito)' },
  steel:        { name: 'Viga de Aço',        color: 0x6f8396, value: 55,  category: 'product',   rarity: 3, shape: 'ingot',  uses: 'Venda' },
  circuit:      { name: 'Circuito',           color: 0x3dd16b, value: 135, category: 'product',   rarity: 4, shape: 'chip',   uses: 'Venda' },
  prism:        { name: 'Prisma',             color: 0x9fe8ff, value: 95,  category: 'product',   rarity: 5, shape: 'crystal',uses: 'Venda' },
};

// Regeneração e quantidade dos depósitos por tipo
export const DEPOSITS = {
  stone:      { min: 260, max: 520, regen: 0.02,  hardness: 1 },
  coal:       { min: 220, max: 460, regen: 0.01,  hardness: 1 },
  iron_ore:   { min: 300, max: 600, regen: 0.01,  hardness: 1 },
  copper_ore: { min: 300, max: 600, regen: 0.01,  hardness: 1 },
  gold_ore:   { min: 200, max: 420, regen: 0.004, hardness: 2 },
  crystal:    { min: 120, max: 260, regen: 0.002, hardness: 2 },
  wood:       { min: 40,  max: 80,  regen: 0.05,  hardness: 1 },
};

// ---------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------
export const RECIPES = {
  crush_stone:   { name: 'Cascalho',            machine: 'crusher',  in: { stone: 1 },        out: { gravel: 1 },        time: 1.2 },
  crush_iron:    { name: 'Pó de Ferro',         machine: 'crusher',  in: { iron_ore: 1 },     out: { iron_dust: 1 },     time: 1.6 },
  crush_copper:  { name: 'Pó de Cobre',         machine: 'crusher',  in: { copper_ore: 1 },   out: { copper_dust: 1 },   time: 1.6 },
  crush_gold:    { name: 'Pó de Ouro',          machine: 'crusher',  in: { gold_ore: 1 },     out: { gold_dust: 1 },     time: 2.2 },
  crush_crystal: { name: 'Fragmentos de Cristal',machine:'crusher',  in: { crystal: 1 },      out: { crystal_shard: 2 }, time: 3.0 },
  saw_planks:    { name: 'Tábuas',              machine: 'sawmill',  in: { wood: 1 },         out: { planks: 1 },        time: 1.5 },
  smelt_iron:    { name: 'Lingote de Ferro',    machine: 'smelter',  in: { iron_dust: 1 },    out: { iron_ingot: 1 },    time: 2.0 },
  smelt_copper:  { name: 'Lingote de Cobre',    machine: 'smelter',  in: { copper_dust: 1 },  out: { copper_ingot: 1 },  time: 2.0 },
  smelt_gold:    { name: 'Lingote de Ouro',     machine: 'smelter',  in: { gold_dust: 1 },    out: { gold_ingot: 1 },    time: 3.0 },
  refine_steel:  { name: 'Viga de Aço',         machine: 'refinery', in: { iron_ingot: 2, coal: 1 },       out: { steel: 1 },   time: 4.0 },
  refine_circuit:{ name: 'Circuito',            machine: 'refinery', in: { copper_ingot: 1, gold_ingot: 1 },out: { circuit: 1 }, time: 5.0 },
  refine_prism:  { name: 'Prisma',              machine: 'refinery', in: { crystal_shard: 2, gravel: 1 },  out: { prism: 1 },   time: 4.0 },
};

export const FUELS = {
  coal: { burnTime: 10 },   // segundos de geração por unidade
  wood: { burnTime: 4 },
};

// ---------------------------------------------------------------------
// Estruturas
// ---------------------------------------------------------------------
// kind: belt | crossing | sorter | miner | processor | seller | storage | generator | pole | splitter | workshop | barn | platform | lumber
// inputs: lados locais que aceitam itens: 0=frente 1=direita 2=trás 3=esquerda ; outputs: lados que emitem
export const BUILDINGS = {
  conveyor:     { name: 'Esteira',             cat: 'transport',  kind: 'belt',      size: [1, 1], cost: 5,    speed: 1.0, desc: 'Transporta itens. Arraste para construir em linha.' },
  fast_conveyor:{ name: 'Esteira Rápida',      cat: 'transport',  kind: 'belt',      size: [1, 1], cost: 15,   speed: 2.2, tech: 'u_fast_belt', desc: 'Mais que o dobro da velocidade.' },
  splitter:     { name: 'Divisor',             cat: 'transport',  kind: 'splitter',  size: [1, 1], cost: 40,   tech: 'u_splitter', inputs: [2], outputs: [0, 1, 3], desc: 'Distribui itens alternadamente para frente, esquerda e direita.' },
  crossing:     { name: 'Cruzamento',          cat: 'transport',  kind: 'crossing',  size: [1, 1], cost: 25,   speed: 1.2, desc: 'Permite que duas linhas de esteira se cruzem: cada item segue reto na direção em que entrou.' },
  sorter:       { name: 'Seletor',             cat: 'transport',  kind: 'sorter',    size: [1, 1], cost: 80,   tech: 'u_sorter', inputs: [2], outputs: [0, 3], desc: 'Envia o recurso escolhido para a esquerda; o restante segue em frente.' },
  miner:        { name: 'Mineradora',          cat: 'mining',     kind: 'miner',     size: [2, 2], cost: 100,  rate: 0.5, hardness: 1, outputs: [0], power: 0, desc: 'Extrai minério dos depósitos sob ela (2×2).' },
  adv_drill:    { name: 'Perfuratriz Avançada',cat: 'mining',     kind: 'miner',     size: [2, 2], cost: 1200, rate: 1.2, hardness: 2, outputs: [0], power: 12, upkeep: 8, tech: 'u_adv_drill', desc: 'Rápida, extrai ouro e cristais. Requer energia.' },
  lumber:       { name: 'Acampamento Madeireiro',cat:'mining',    kind: 'lumber',    size: [2, 2], cost: 250,  rate: 0.4, radius: 3, outputs: [0], tech: 'u_lumber', desc: 'Corta árvores num raio de 3 tiles.' },
  crusher:      { name: 'Triturador',          cat: 'processing', kind: 'processor', size: [2, 2], cost: 200,  inputs: [1, 2, 3], outputs: [0], power: 0, recipes: ['crush_stone','crush_iron','crush_copper','crush_gold','crush_crystal'], desc: 'Tritura minério bruto.' },
  sawmill:      { name: 'Serraria',            cat: 'processing', kind: 'processor', size: [2, 2], cost: 400,  inputs: [1, 2, 3], outputs: [0], power: 0, recipes: ['saw_planks'], tech: 'u_sawmill', desc: 'Madeira → Tábuas.' },
  smelter:      { name: 'Fundição',            cat: 'processing', kind: 'processor', size: [2, 2], cost: 600,  inputs: [1, 2, 3], outputs: [0], power: 10, upkeep: 6, recipes: ['smelt_iron','smelt_copper','smelt_gold'], tech: 'u_smelter', desc: 'Funde pó metálico em lingotes. Requer energia.' },
  refinery:     { name: 'Refinaria',           cat: 'processing', kind: 'processor', size: [3, 3], cost: 1800, inputs: [1, 2, 3], outputs: [0], power: 25, upkeep: 15, recipes: ['refine_steel','refine_circuit','refine_prism'], tech: 'u_refinery', desc: 'Combina materiais em produtos de alto valor.' },
  generator:    { name: 'Gerador',             cat: 'power',      kind: 'generator', size: [2, 2], cost: 500,  inputs: [0, 1, 2, 3], output: 40, radius: 7, upkeep: 4, tech: 'u_generator', desc: 'Queima carvão ou madeira e gera 40 kW num raio de 7.' },
  pole:         { name: 'Torre de Energia',    cat: 'power',      kind: 'pole',      size: [1, 1], cost: 60,   radius: 6, link: 12, tech: 'u_pole', desc: 'Estende a rede elétrica (raio 6, liga torres a até 12).' },
  warehouse:    { name: 'Armazém',             cat: 'storage',    kind: 'storage',   size: [2, 2], cost: 300,  capacity: 200, inputs: [1, 2, 3], outputs: [0], tech: 'u_warehouse', desc: 'Armazena até 200 itens e libera pela frente (pode pausar a saída).' },
  seller:       { name: 'Centro de Vendas',    cat: 'storage',    kind: 'seller',    size: [3, 3], cost: 400,  inputs: [0, 1, 2, 3], desc: 'Recebe produtos e converte em moedas.' },
  workshop:     { name: 'Oficina de Melhorias',cat: 'infra',      kind: 'workshop',  size: [2, 2], cost: 350,  desc: 'Libera a árvore de tecnologias.' },
  barn:         { name: 'Chiqueiro dos Carregadores', cat: 'infra', kind: 'barn',    size: [2, 2], cost: 700,  pigs: 3, radius: 9, carry: 5, pigSpeed: 2.2, outputs: [0], tech: 'u_barn', desc: '3 porquinhos buscam itens de mineradoras e armazéns próximos (raio 9) e trazem para cá.' },
  platform:     { name: 'Plataforma Industrial',cat: 'infra',     kind: 'platform',  size: [3, 3], cost: 150,  tech: 'u_platform', desc: 'Nivela terreno com entulho (3×3), tornando-o construível.' },
};

export const CATEGORIES = [
  { id: 'mining',     name: 'Mineração' },
  { id: 'transport',  name: 'Transporte' },
  { id: 'processing', name: 'Processamento' },
  { id: 'power',      name: 'Energia' },
  { id: 'storage',    name: 'Armazenagem' },
  { id: 'infra',      name: 'Infraestrutura' },
];

// ---------------------------------------------------------------------
// Tecnologias (Oficina)
// ---------------------------------------------------------------------
// type: unlock (libera estrutura) | level (melhoria em níveis) ; effect aplicado em Simulation.mod()
export const TECHS = {
  u_warehouse:  { name: 'Armazém',               type: 'unlock', cost: [250],  req: [],               desc: 'Libera o Armazém.' },
  u_smelter:    { name: 'Fundição',              type: 'unlock', cost: [500],  req: [],               desc: 'Libera a Fundição (exige energia).' },
  u_generator:  { name: 'Geração de Energia',    type: 'unlock', cost: [400],  req: [],               desc: 'Libera o Gerador.' },
  u_splitter:   { name: 'Divisores',             type: 'unlock', cost: [300],  req: [],               desc: 'Libera o Divisor de esteira.' },
  u_sorter:     { name: 'Seletores',             type: 'unlock', cost: [600],  req: ['u_splitter'], desc: 'Libera o Seletor, que separa um recurso específico da linha.' },
  u_lumber:     { name: 'Silvicultura',          type: 'unlock', cost: [300],  req: [],               desc: 'Libera o Acampamento Madeireiro.' },
  u_sawmill:    { name: 'Serraria',              type: 'unlock', cost: [450],  req: ['u_lumber'],     desc: 'Libera a Serraria.' },
  u_pole:       { name: 'Rede Elétrica',         type: 'unlock', cost: [350],  req: ['u_generator'],  desc: 'Libera Torres de Energia.' },
  u_fast_belt:  { name: 'Esteira Rápida',        type: 'unlock', cost: [1500], req: ['t_belt'],       desc: 'Libera a Esteira Rápida.' },
  u_barn:       { name: 'Porquinhos Carregadores',type:'unlock', cost: [1200], req: ['u_warehouse'],  desc: 'Libera o Chiqueiro: unidades que transportam itens.' },
  u_adv_drill:  { name: 'Perfuração Avançada',   type: 'unlock', cost: [3000], req: ['u_generator','t_mining'], desc: 'Libera a Perfuratriz Avançada (ouro e cristais).' },
  u_refinery:   { name: 'Refino',                type: 'unlock', cost: [4000], req: ['u_smelter','u_generator'], desc: 'Libera a Refinaria.' },
  u_platform:   { name: 'Terraplenagem',         type: 'unlock', cost: [2500], req: ['u_refinery'],   desc: 'Libera a Plataforma Industrial.' },
  t_mining:     { name: 'Brocas Afiadas',        type: 'level',  cost: [400, 1500, 5000],  req: [],   effect: { mining: 0.25 },  desc: '+25% velocidade de mineração por nível.' },
  t_belt:       { name: 'Rolamentos Lubrificados',type:'level',  cost: [350, 1200, 4000],  req: [],   effect: { belt: 0.2 },     desc: '+20% velocidade das esteiras por nível.' },
  t_process:    { name: 'Engrenagens de Precisão',type:'level',  cost: [600, 2200, 7000],  req: ['u_smelter'], effect: { process: 0.2 }, desc: '+20% velocidade de processamento por nível.' },
  t_sell:       { name: 'Contratos de Exportação',type:'level',  cost: [800, 3000, 9000],  req: [],   effect: { sell: 0.1 },     desc: '+10% valor de venda por nível.' },
  t_storage:    { name: 'Silos Ampliados',       type: 'level',  cost: [500, 2500],        req: ['u_warehouse'], effect: { storage: 0.5 }, desc: '+50% capacidade de armazenamento por nível.' },
  t_power:      { name: 'Combustão Eficiente',   type: 'level',  cost: [700, 3000],        req: ['u_generator'], effect: { power: 0.25 },  desc: '+25% duração do combustível por nível.' },
};

// ---------------------------------------------------------------------
// Regiões (retângulos em coordenadas de tile)
// ---------------------------------------------------------------------
export const REGIONS = [
  { id: 'valley',     name: 'Vale Inicial',          rect: [30, 22, 26, 26], cost: 0,     req: null,          ground: 0x7cc35a, desc: 'Recursos básicos e construções simples.' },
  { id: 'mountain',   name: 'Serra de Ferro',        rect: [24, 2, 40, 20],  cost: 1500,  req: null,          ground: 0x9a8f7a, desc: 'Depósitos grandes de ferro, carvão e cobre.' },
  { id: 'forest',     name: 'Bosque Verde',          rect: [4, 22, 26, 26],  cost: 900,   req: null,          ground: 0x4f9a45, desc: 'Madeira em abundância.' },
  { id: 'advanced',   name: 'Planalto Cristalino',   rect: [56, 22, 20, 30], cost: 12000, req: 'u_adv_drill', ground: 0x8f7fb8, desc: 'Cobre, ouro e cristais raros.' },
  { id: 'industrial', name: 'Distrito Industrial',   rect: [24, 48, 52, 22], cost: 30000, req: 'u_refinery',  ground: 0x8d9196, desc: 'Grande área plana para cadeias avançadas (terreno exige Plataformas).' },
];

// ---------------------------------------------------------------------
// Objetivos progressivos
// ---------------------------------------------------------------------
// type: build(type,n) | extract(res,n) | delivered(machine,n) | sold(cat,n) | revenue(n) | tech(id) | region(n) | produced(res,n) | powered(n)
export const OBJECTIVES = [
  { id: 'o1',  text: 'Construa sua primeira Mineradora sobre um depósito de pedra', type: 'build', key: 'miner', n: 1, reward: 60 },
  { id: 'o2',  text: 'Extraia 40 unidades de pedra',                  type: 'extract',  key: 'stone', n: 40, reward: 60 },
  { id: 'o3',  text: 'Construa 6 segmentos de esteira',               type: 'build',    key: 'conveyor', n: 6, reward: 40 },
  { id: 'o4',  text: 'Entregue 20 minérios a um Triturador',          type: 'delivered',key: 'crusher', n: 20, reward: 120 },
  { id: 'o5',  text: 'Venda 10 produtos processados',                  type: 'sold',     key: 'processed', n: 10, reward: 80 },
  { id: 'o6',  text: 'Alcance R$ 1.000 em receita acumulada',          type: 'revenue',  n: 1000, reward: 150 },
  { id: 'o7',  text: 'Construa a Oficina de Melhorias',                type: 'build',    key: 'workshop', n: 1, reward: 120 },
  { id: 'o8',  text: 'Pesquise a Geração de Energia',                  type: 'tech',     key: 'u_generator', reward: 150 },
  { id: 'o9',  text: 'Desbloqueie uma nova região',                    type: 'region',   n: 2, reward: 300 },
  { id: 'o10', text: 'Pesquise a Fundição e produza 25 Lingotes de Ferro', type: 'produced', key: 'iron_ingot', n: 25, reward: 400 },
  { id: 'o11', text: 'Alcance R$ 10.000 em receita acumulada',         type: 'revenue',  n: 10000, reward: 600 },
  { id: 'o12', text: 'Cadeia completa: produza 10 Vigas de Aço',       type: 'produced', key: 'steel', n: 10, reward: 1500 },
  { id: 'o13', text: 'Desbloqueie o Planalto Cristalino',              type: 'regionId', key: 'advanced', reward: 2000 },
  { id: 'o14', text: 'Produza 10 Circuitos',                           type: 'produced', key: 'circuit', n: 10, reward: 4000 },
  { id: 'o15', text: 'Desbloqueie o Distrito Industrial',              type: 'regionId', key: 'industrial', reward: 6000 },
  { id: 'o16', text: 'Magnata: R$ 500.000 em receita acumulada',       type: 'revenue',  n: 500000, reward: 25000 },
];

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8, musicVolume: 0.4, sfxVolume: 0.8,
  cameraSpeed: 1.0, zoomSpeed: 1.0, dragSensitivity: 1.0,
  edgeScroll: false, invertZoom: false, showGrid: true,
  shadows: 'high', autosave: true, fullscreen: true,
};
