versao-schema: 1

# GRAFO — Sistema de Expedição de Vendas (expedicao)

> Memória externa do produto. Requisito não escrito aqui é requisito que não
> existe. Atualizado por delta durante a demanda; sincronizado na validação.

## Propósito [carga: sempre]

Sistema web SPA para expedição e conferência de vendas de pequenos
e-commerces. Um administrador importa a lista de separação em PDF; o operador
de galpão confere fisicamente cada item bipando o código de barras (leitor
USB ou câmera), com feedback sonoro/visual imediato. Diferencial: parsing de
PDF 100% no navegador, funciona offline (IndexedDB + fila de sincronização) e
opcionalmente integra com a API de bipagem do SellInfoTurbo para expedir
pedidos e emitir etiquetas no Tiny ERP automaticamente.

## Constituição [carga: sempre]

- **stack**: Frontend — HTML5, Vanilla CSS (glassmorphism), JavaScript
  ES2020+ (sem framework/bundler), Mozilla PDF.js, html5-qrcode, Web Audio
  API, IndexedDB. Backend remoto — PHP 8+ (`api.php`) + SQLite. Dev/deploy —
  Node.js 18+ (`server.js` com watch, `deploy.js` com `basic-ftp`).
- **restricoes**: Sem build step/bundler — arquivos servidos diretamente.
  Banco SQLite fica fora da pasta pública (`../expedicao.db`). Credenciais
  (FTP, tokens de API) nunca commitadas — devem vir de `.env`/variáveis de
  ambiente no servidor PHP.
- **padroes**: Código e UI em Português-BR. Novas funcionalidades em
  `app.js` ganham seção numerada (`// 9.X. NOME`). Preferir funções puras;
  áudio sempre via `playSoundEffect()`; feedback visual sempre via
  `showToast()`. `const`/`let`, nunca `var`.
- **como-rodar**: `npm install && npm start` — abre em
  `http://localhost:8080/` (modo local usa IndexedDB). O backend PHP
  (`api.php`) só roda no host remoto (HostGator); não há ambiente PHP local
  documentado neste projeto.

## Índice de nós [carga: sempre]

- bipagem-tiny-sellinfo | em-curso | Auditar/corrigir integração de bipagem com API do SellInfoTurbo
- core-conferencia-expedicao | entregue | Parsing de PDF, fila de conferência por bipagem, filtros/busca/log/CSV → ver GRAFO-ARQUIVO.md
- persistencia-multi-modo | entregue | IndexedDB local / api.php+SQLite remoto / fila offline sincronizável → ver GRAFO-ARQUIVO.md
- admin-despachantes-lojas | entregue | CRUD de despachantes e lojas via api.php → ver GRAFO-ARQUIVO.md
- seguranca-api-fase1 | entregue | Sanitização de inputs, CORS restrito, auth por token, banco fora da pasta pública → ver GRAFO-ARQUIVO.md
- deploy-continuo-ftp | entregue | Auto-deploy FTP ao salvar arquivos monitorados → ver GRAFO-ARQUIVO.md

## Nós [carga: auto — carregar somente os nós tocados pela demanda]

### bipagem-tiny-sellinfo

- **id**: bipagem-tiny-sellinfo
- **estado**: em-curso
- **origem**: humano
- **depende-de**: []
- **objetivo**: Garantir que a integração de bipagem do expedicao com a API
  de bipagem do SellInfoTurbo (`POST /api/bipagem/expedicao`, proxy via
  `api.php`) seja segura e esteja completa, corrigindo os problemas
  encontrados na implementação já commitada direto na main (commit
  `e9912a7`, autor Tibjunior, 2026-08-18).
- **criterios-aceite**: ver spec dedicada —
  `docs/audora/specs/bipagem-tiny-sellinfo-escopo.md` (categoria ALTA).
- **fora-de-escopo**: ver spec dedicada —
  `docs/audora/specs/bipagem-tiny-sellinfo-escopo.md`.
- **decisoes**:
  - 2026-08-18 (humano): a integração de bipagem já existe (commit
    `e9912a7`, direto na main). Optou por auditar/corrigir essa
    implementação em vez de refazer do zero.
  - 2026-08-18 (humano): trabalho desta demanda deve ocorrer em branch
    `develop` do expedicao, não direto na main.
  - 2026-08-19 (humano): confirmado via depuração que a bipagem nunca
    funcionou de ponta a ponta (causa raiz: `ec` do PDF é o número do
    pedido no marketplace, API do SellInfoTurbo só resolve por número
    interno do Tiny). Decidiu corrigir nos dois projetos (expedicao branch
    `develop` + SellInfoTurbo branch nova lá).
  - 2026-08-19 (humano): pediu para executar só as tarefas do lado
    SellInfoTurbo nesta rodada. Feito: branch
    `fix/bipagem-numero-pedido-ecommerce` no SellInfoTurbo, commits
    `f42252d`/`53b3d96` — resolve pedido por `numeroPedidoEcommerce`, doc
    atualizada, 955 testes verdes. Depois mergeado na main do
    SellInfoTurbo (`107f165`, sem push ao remoto).
  - 2026-08-19 (humano): pediu para completar as Tarefas 4-9 (expedicao).
    Feito na branch `develop`: `bipagem-utils.js` (função pura +
    primeira suíte de testes automatizados do projeto), `app.js` manda
    sempre string (nunca mais `parseInt`), `index.html` carrega o script
    novo, `api.php` sem chave hardcoded (fail-closed real) e sem
    `intval` forçado no pedido, `.env`/`.env.example`,
    `AI_INSTRUCTIONS.md` §10 atualizado. As 9 tarefas do plano estão
    concluídas nos dois repositórios.
- **delta**:
  - ADICIONADO (2026-08-19): critérios 0/0.1/0.2 — bipagem deve resolver
    pedido por `numeroPedidoEcommerce` (string), não mais tentar `parseInt`
    do `ec`. Exige mudança também no SellInfoTurbo. Ver spec.
  - REMOVIDO (2026-08-19): "qualquer mudança na lógica de negócio da
    bipagem" do fora-de-escopo — motivo: é exatamente essa lógica que
    estava com a causa raiz do defeito.
- **e2e**: pulado-pelo-humano (2026-08-19 — sem PHP/SellInfoTurbo local
  disponível para testar a chamada real ponta a ponta; humano optou por ir
  direto ao roteiro de validação com revisão de código)
- **feedback-reprovacao**:
- **atualizado-em**: 2026-08-18

<!-- Regras de manutenção (skill grafo):
0. Nó `planejada` pode viver SÓ no índice (sem corpo) até ser detalhado —
   expansão sob demanda. A partir de `em-curso`, corpo completo é obrigatório.
1. Validar schema antes de escrever — delta que quebra schema é rejeitado.
2. Nó `entregue` no sync: compactar para 1 linha e mover para
   docs/audora/GRAFO-ARQUIVO.md; promover resumo ao PRD.md.
3. GRAFO ativo acima de ~300 linhas → compactação obrigatória.
4. Em branch: editar somente nós da demanda daquela branch.
5. Máximo 3 nós em-curso simultâneos. -->
