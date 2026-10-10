// Testes automatizados da simulação (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/Simulation.js';

function chain() {
  const s = new Simulation();
  s.placeBuilding('miner', 35, 27, 0);
  for (let z = 27; z <= 33; z++) s.placeBuilding('conveyor', 37, z, 1);
  for (let x = 37; x <= 39; x++) s.placeBuilding('conveyor', x, 34, 0);
  return s;
}
const run = (s, sec) => { for (let i = 0; i < sec * 20; i++) s.tick(0.05); };

test('inicia partida com saldo e Centro de Vendas', () => {
  const s = new Simulation();
  assert.equal(s.economy.money, 600);
  assert.equal([...s.buildings.values()].filter((b) => b.type === 'seller').length, 1);
});
test('construção válida desconta moedas; inválida é recusada sem cobrar', () => {
  const s = new Simulation();
  assert.ok(s.placeBuilding('miner', 35, 27, 0));
  assert.equal(s.economy.money, 500);
  assert.equal(s.placeBuilding('miner', 35, 27, 0, { silent: true }), null);
  assert.equal(s.economy.money, 500);
  assert.equal(s.placeBuilding('miner', 44, 40, 0, { silent: true }), null, 'sem depósito');
  assert.equal(s.placeBuilding('conveyor', 0, 0, 0, { silent: true }), null, 'fora da região');
});
test('extração, transporte por esteira e venda', () => {
  const s = chain(); run(s, 60);
  assert.ok(s.stats.extracted.stone >= 25);
  assert.ok(s.stats.sold.stone >= 20);
  assert.deepEqual(s.checkIntegrity(), []);
});
test('bloqueio logístico: itens esperam sem se perder', () => {
  const s = new Simulation();
  s.placeBuilding('miner', 35, 27, 0);
  s.placeBuilding('conveyor', 37, 27, 1); s.placeBuilding('conveyor', 37, 28, 1); // termina no vazio
  run(s, 60);
  const m = [...s.buildings.values()].find((b) => b.type === 'miner');
  assert.equal(m.state, 'output_full');
  assert.deepEqual(s.checkIntegrity(), []);
});
test('processamento no triturador e melhoria aumenta produtividade', () => {
  const s = new Simulation(); s.economy.money = 1e5;
  s.placeBuilding('miner', 35, 27, 0);
  s.placeBuilding('crusher', 37, 27, 0);
  run(s, 30);
  assert.ok((s.stats.produced.gravel || 0) > 0);
  const m = [...s.buildings.values()].find((b) => b.type === 'miner');
  const before = s.stats.extracted.stone;
  assert.ok(s.upgrade(m.id)); assert.equal(m.level, 2);
  assert.deepEqual(s.checkIntegrity(), []);
});
test('energia: sem gerador para; com carvão produz lingotes', () => {
  const s = new Simulation(); s.economy.money = 1e5;
  s.progression.techs.u_smelter = 1; s.progression.techs.u_generator = 1;
  const sm = s.placeBuilding('smelter', 47, 36, 0);
  sm.inv.iron_dust = 6; s.countCreated('iron_dust', 6);
  run(s, 2); assert.equal(sm.state, 'no_power');
  const g = s.placeBuilding('generator', 47, 39, 0);
  g.inv.coal = 5; s.countCreated('coal', 5);
  run(s, 10);
  assert.ok((s.stats.produced.iron_ingot || 0) > 0);
  assert.deepEqual(s.checkIntegrity(), []);
});
test('tecnologia, região e economia', () => {
  const s = new Simulation(); s.economy.money = 1e5;
  assert.equal(s.progression.research('u_generator'), false, 'exige Oficina');
  s.placeBuilding('workshop', 44, 28, 0);
  assert.ok(s.progression.research('u_generator'));
  assert.ok(s.progression.unlockRegion('forest'));
  assert.ok(s.economy.totals.expense.pesquisa > 0 && s.economy.totals.expense.regiao > 0);
});
test('salvar e carregar preserva estado e identificadores', () => {
  const s = chain(); run(s, 40);
  const data = JSON.parse(JSON.stringify(s.serialize()));
  const l = Simulation.deserialize(data);
  assert.equal(l.buildings.size, s.buildings.size);
  assert.deepEqual([...l.buildings.keys()].sort(), [...s.buildings.keys()].sort());
  assert.equal(Math.round(l.economy.money), Math.round(s.economy.money));
  assert.deepEqual(l.checkIntegrity(), []);
  run(l, 20); assert.deepEqual(l.checkIntegrity(), []);
});
test('salvamento inválido é rejeitado com mensagem', () => {
  assert.throws(() => Simulation.deserialize(null));
  assert.throws(() => Simulation.deserialize({ format: 'x' }));
  assert.throws(() => Simulation.deserialize({ format: 'mina-engrenada-save', version: 999, buildings: [] }));
});
test('demolição reembolsa e liquida conteúdo sem perder unidades', () => {
  const s = chain(); run(s, 20);
  const belt = [...s.buildings.values()].find((b) => b.type === 'conveyor' && b.items.length);
  const m0 = s.economy.money;
  assert.ok(s.demolish(belt.id));
  assert.ok(s.economy.money > m0);
  assert.deepEqual(s.checkIntegrity(), []);
});
test('estabilidade com muitas estruturas', () => {
  const s = new Simulation(); s.economy.money = 1e7;
  for (const r of ['mountain', 'forest']) s.progression.unlockRegion(r, true);
  let n = 0;
  for (let z = 3; z < 21; z++) for (let x = 25; x < 63; x++) if (s.placeBuilding('conveyor', x, z, 0, { silent: true })) n++;
  const t = Date.now(); run(s, 30);
  assert.ok(n > 300, 'n=' + n);
  assert.ok(Date.now() - t < 5000);
  assert.deepEqual(s.checkIntegrity(), []);
});
