# Mina Engrenada

Jogo 3D de mineração, automação e construção industrial para Windows (10/11, 64 bits). Funciona offline, com teclado e mouse.

## Novidades da versão 1.1

- **Cruzamento** (Transporte): duas linhas de esteira se cruzam sem misturar os itens.
- **Seletor** (Transporte, pesquisa "Seletores"): separa um recurso escolhido para a esquerda; o restante segue em frente.
- **Desfazer** com Ctrl+Z: remove a última construção com reembolso integral.
- **Conta-gotas** com C: copia a estrutura sob o mouse, com a mesma rotação.
- **Dica ao passar o mouse** sobre qualquer estrutura (nome, nível e estado).
- **Seta guia** no mapa indicando onde cumprir os primeiros objetivos.
- **Produção e vendas por recurso** na tela de Finanças (G).
- Correções: erro interno após construir uma estrutura; aviso vermelho que ficava preso na tela; caixa de atalhos sobreposta em telas menores.

## Como jogar (versão pronta)

1. Descompacte `MinaEngrenada-Windows-x64.zip` em qualquer pasta.
2. Abra `MinaEngrenada.exe`.
3. Se o Windows SmartScreen avisar "aplicativo não reconhecido", clique em **Mais informações → Executar assim mesmo** (o executável não tem assinatura digital paga).

Os salvamentos ficam em `%APPDATA%\Mina Engrenada\saves` (um arquivo JSON por espaço, com cópia `.bak` automática). As configurações ficam em `%APPDATA%\Mina Engrenada\settings.json`.

## Controles

| Tecla / mouse | Ação |
|---|---|
| W A S D ou setas | Mover a câmera |
| Roda do mouse | Zoom |
| Botão do meio + arrastar | Deslocar a câmera |
| Q / E | Girar a câmera 90° |
| Clique esquerdo | Selecionar, construir, confirmar |
| Arrastar com esteira selecionada | Traçar linha de esteiras (em L) |
| Clique direito | Cancelar construção ou fechar seleção |
| R (Shift+R) | Girar estrutura antes de posicionar |
| F1 a F6 | Categorias de construção |
| 1 a 9 | Item da categoria |
| Shift + clique | Construir várias seguidas |
| U | Melhorar estrutura selecionada |
| C | Copiar a estrutura sob o mouse |
| Ctrl + Z | Desfazer a última construção (reembolso integral) |
| V | Mover estrutura selecionada |
| Delete | Demolir selecionada |
| X | Modo demolição (arraste para remover esteiras) |
| F | Enquadrar seleção |
| Espaço | Pausar / retomar |
| T / G / M / H | Tecnologias / Finanças / Mapa / Ajuda |
| F5 / F9 | Salvamento rápido / carregamento rápido (espaço 1) |
| Esc | Fechar janelas / menu de pausa |

Movimento da câmera pelas bordas da tela, sensibilidade, velocidade e inversão do zoom podem ser ajustados em **Configurações**.

## Ciclo de jogo

Mineradora sobre depósito → esteiras → Triturador → Fundição (energia) → Refinaria (energia) → Centro de Vendas → moedas → melhorias, tecnologias e novas regiões.

Cada máquina mostra **setas verdes (entradas)** e **seta laranja (saída)** ao ser selecionada ou posicionada.

## O que foi implementado

**Mundo:** mapa 96×72 em grade com relevo, vegetação, rochas, entulho e 5 regiões: Vale Inicial, Serra de Ferro, Bosque Verde, Planalto Cristalino e Distrito Industrial (este exige Plataformas para nivelar o terreno). Regiões bloqueadas aparecem escurecidas, cercadas e com placa de preço.

**Recursos (19):** pedra, carvão, minério de ferro, cobre, ouro, cristal, madeira; cascalho, pós metálicos, fragmentos de cristal, tábuas; lingotes de ferro, cobre e ouro, vigas de aço, circuitos e prismas. Depósitos têm quantidade finita, esgotamento e regeneração lenta configurável. Ouro e cristal exigem a Perfuratriz Avançada.

**Estruturas (19), todas com modelo 3D próprio e animado:** Esteira, Esteira Rápida, Cruzamento, Divisor, Seletor, Mineradora, Perfuratriz Avançada, Acampamento Madeireiro, Triturador, Serraria, Fundição, Refinaria, Gerador, Torre de Energia, Armazém, Centro de Vendas, Oficina de Melhorias, Chiqueiro dos Carregadores e Plataforma Industrial.

**Esteiras:** transporte lógico real (até 4 itens por tile), curvas automáticas, velocidades diferentes, bloqueio quando a saída está ocupada (itens aguardam sem se perder), redesenho de direção sem custo, troca de tipo preservando itens. Itens visíveis em movimento via instanciação (sem objetos físicos pesados).

**Construção:** fantasma verde/vermelho com motivo do bloqueio junto ao cursor, grade, rotação, validação de colisão, limites, região, terreno, depósito e saldo; cobrança só após construção válida; mover estruturas; demolir com reembolso de 50% e liquidação do conteúdo.

**Energia:** geradores queimam carvão ou madeira; rede por proximidade com torres; consumo por máquina; falta de energia reduz ou para a máquina com aviso.

**Economia e progressão:** custos de construção, melhorias (nível 1 a 5 por máquina), custos operacionais, histórico financeiro de 30 minutos, 18 tecnologias com pré-requisitos, 16 objetivos com recompensas e dicas contextuais.

**Interface:** barra superior (saldo, energia, produção/min, lucro/min, alertas, velocidade 1×/2×/3×), barra de construção com ícones gerados dos próprios modelos, painel da estrutura selecionada, inspeção de depósitos, minimapa clicável, mapa geral, menu principal, pausa, salvar/carregar em 4 espaços, configurações e ajuda.

**Áudio:** efeitos, ambiente de fábrica proporcional à atividade e música generativa, tudo procedural (sem arquivos de terceiros), com volume geral, música e efeitos separados.

**Salvamento:** manual, rápido (F5/F9) e automático a cada 90 s; gravação atômica com backup; validação de versão e de estrutura; recuperação pelo `.bak` quando o arquivo principal está corrompido; produção offline limitada a 5 minutos.

## Sobre o vídeo de referência

O vídeo do anúncio **não chegou** a ser recebido (só o texto do pedido), e o link do Facebook bloqueia acesso automatizado. As mecânicas foram construídas a partir da descrição do pedido.

- **Inferido, não confirmado:** o papel das criaturas semelhantes a porcos. Implementei os "Porquinhos Carregadores": unidades que buscam minério nas saídas de mineradoras e armazéns próximos e levam ao chiqueiro. É uma solução coerente com o gênero, mas pode não corresponder ao anúncio.
- Enviando prints das principais cenas, dá para ajustar visual e mecânicas.

## Testes realmente executados

**Automatizados da simulação** (`npm test`, 14 de 14 aprovados): inicialização, construção válida e inválida, desconto de moedas, extração, transporte por esteira, venda, bloqueio logístico, processamento, melhoria, energia (parada sem gerador, produção com carvão), tecnologias, regiões, economia, salvar/carregar com identificadores preservados, rejeição de salvamento inválido, demolição com reembolso, estabilidade com mais de 300 esteiras, cruzamento, seletor e desfazer. Todos verificam integridade: unidades existentes = criadas − consumidas/vendidas (sem duplicação nem perda).

**Jogabilidade real** (Electron no Linux com mouse e teclado simulados via Playwright, `tests/e2e/play.cjs`), aprovados: iniciar partida, mover câmera com WASD, construir mineradora clicando, recusar construção sobreposta, traçar 10 esteiras por arraste, extração e venda acontecendo, integridade, melhoria com U, construir triturador, construir Oficina e pesquisar tecnologia. As etapas seguintes do roteiro (energia pela interface, mapa, F5/F9, demolição pela interface) não chegaram a ser concluídas nessa rodada, mas os mesmos sistemas passaram nos testes automatizados acima.

**Não executado:** o `.exe` não foi aberto em um Windows real (o ambiente de compilação é Linux). O pacote foi gerado com o Electron oficial para Windows x64, e o mesmo código foi executado sem erros no Electron para Linux.

## Recursos pendentes / ideias de expansão

- Priorização de rotas entre várias entradas.
- Desgaste e manutenção das máquinas.
- Ícone próprio do executável e instalador (`.msi`/NSIS).
- Mais regiões, recursos e receitas.

## Desenvolvimento

Requisitos: Node.js 20+.

```bash
npm install
npm start            # compila e abre o jogo (Electron)
npm test             # testes da simulação
npm run dist:win     # gera release/Mina Engrenada-win32-x64 (funciona no Windows, Linux ou macOS)
```

Para testar a jogabilidade automatizada (Linux): `xvfb-run node tests/e2e/play.cjs`.

### Estrutura do código

```
src/data/config.js          todos os números de balanceamento (recursos, receitas, estruturas, tecnologias, regiões, objetivos)
src/sim/                    simulação pura, sem gráficos (testável em Node)
  Simulation.js             estado, construção, demolição, salvamento
  WorldMap.js               mapa, regiões, depósitos (geração determinística por semente)
  systems/belts.js          esteiras
  systems/machines.js       mineração, receitas, armazenagem, venda, divisores
  systems/power.js          rede elétrica
  systems/pigs.js           porquinhos carregadores
  systems/economy.js        saldo e histórico financeiro
  systems/progression.js    tecnologias, regiões e objetivos
src/render/                 Three.js: modelos procedurais, terreno, esteiras instanciadas, câmera
src/input/                  mouse, teclado e modos de construção
src/ui/                     interface HTML/CSS
src/audio/                  áudio procedural (Web Audio)
src/core/storage.js         salvamento local
electron/                   janela desktop e acesso a arquivos
tests/                      testes da simulação e de jogabilidade
```

### Como adicionar conteúdo

- **Novo recurso:** entrada em `RESOURCES` (e em `DEPOSITS` se for minerável) e um `blob(...)` em `WorldMap.generate()`.
- **Nova receita:** entrada em `RECIPES` e o id na lista `recipes` da máquina.
- **Nova máquina:** entrada em `BUILDINGS` (tipo `processor` já funciona só com dados) e uma função em `FACTORIES` de `src/render/models.js` para o modelo 3D.
- **Nova tecnologia ou objetivo:** entradas em `TECHS` e `OBJECTIVES`.

### Tecnologia escolhida

O Unity não estava disponível no ambiente de desenvolvimento, então o jogo foi feito em **Three.js (WebGL) empacotado com Electron**, que gera um executável Windows nativo sem depender de navegador, internet ou editor. Todos os gráficos, sons e modelos são originais e procedurais; as bibliotecas usadas (Three.js, Electron) têm licença MIT.
