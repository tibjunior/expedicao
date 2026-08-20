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
- bipagem-danfe-nota-fiscal | em-curso | Gerar também o link de impressão da DANFE (nota fiscal) junto com a etiqueta de envio na bipagem
- bipagem-auth-fraca | planejada | API_TOKEN hardcoded e público no app.js — proteção do proxy de bipagem é decorativa, não real
- core-conferencia-expedicao | entregue | Parsing de PDF, fila de conferência por bipagem, filtros/busca/log/CSV → ver GRAFO-ARQUIVO.md
- persistencia-multi-modo | entregue | IndexedDB local / api.php+SQLite remoto / fila offline sincronizável → ver GRAFO-ARQUIVO.md
- admin-despachantes-lojas | entregue | CRUD de despachantes e lojas via api.php → ver GRAFO-ARQUIVO.md
- seguranca-api-fase1 | entregue | Sanitização de inputs, CORS restrito, auth por token, banco fora da pasta pública → ver GRAFO-ARQUIVO.md
- deploy-continuo-ftp | entregue | Auto-deploy FTP ao salvar arquivos monitorados → ver GRAFO-ARQUIVO.md

## Nós [carga: auto — carregar somente os nós tocados pela demanda]

### bipagem-danfe-nota-fiscal

- **id**: bipagem-danfe-nota-fiscal
- **estado**: em-curso
- **origem**: humano
- **depende-de**: [bipagem-tiny-sellinfo]
- **objetivo**: Ao expedir/bipar um pedido, gerar automaticamente também o
  link de impressão da DANFE (nota fiscal) — hoje só a etiqueta de envio
  sai automaticamente; o operador precisa da nota fiscal física junto com
  a mercadoria para o despacho ser válido.
- **criterios-aceite**: ver spec dedicada —
  `docs/audora/specs/bipagem-danfe-nota-fiscal-escopo.md` (categoria ALTA).
- **fora-de-escopo**: ver spec dedicada —
  `docs/audora/specs/bipagem-danfe-nota-fiscal-escopo.md`.
- **decisoes**:
  - 2026-08-20 (humano): as duas devem sair juntas no momento da
    separação/bipagem — não é uma tela separada para buscar a nota depois.
  - 2026-08-20 (humano): sem nota vinculada, ou nota cancelada → bloqueia
    a expedição inteira do pedido (não expede só com a etiqueta).
  - 2026-08-20 (humano): verificação usa banco local primeiro, mas
    confirma ao vivo no Tiny antes de bloquear (nunca bloqueia só por
    atraso de sincronização).
  - 2026-08-20 (humano): cada erro/motivo tem status e mensagem própria
    (não uma mensagem genérica única) — operador vê exatamente qual dos
    cenários aconteceu.
  - 2026-08-20 (humano): etiqueta e DANFE abrem cada uma em nova aba
    separada (não combina num PDF único).
  - 2026-08-20 (humano): só o fluxo de bipagem individual já em uso —
    `bipagerExpedicao` (código morto, sem chamador) fica fora.
  - 2026-08-20: 5 tarefas do plano concluídas. SellInfoTurbo branch
    `feat/bipagem-danfe-nota-fiscal` (commits `d509d00`, `85bf15e`,
    `8570754`; sem push/merge ainda). expedicao branch `develop`
    (commits `71d597f`, `ab21030`). 971 testes verdes no SellInfoTurbo,
    typecheck limpo; `npm test` 7/7 no expedicao. Ver plano para detalhe.
  - 2026-08-20: revisão adversarial achou 2 bugs reais (label de situação
    de nota fiscal errado; pedido idempotente com nota inválida ficava
    sem aviso) — corrigidos, commit `06d7863`. Também achou que a
    correção de auth do proxy (`bipagem-tiny-sellinfo`) era mais fraca
    do que a doc dizia — corrigido o texto, débito técnico registrado
    como nó `bipagem-auth-fraca` (planejada).
  - 2026-08-20 (humano): aprovou e pediu merge da branch
    `feat/bipagem-danfe-nota-fiscal` na main do SellInfoTurbo — feito,
    commit `b8bd249`, local apenas (sem push). Decidiu NÃO mergear a
    branch `develop` do expedicao ainda — nó continua `em-curso` até
    isso acontecer.
- **delta**:
- **e2e**: pulado-pelo-humano (2026-08-20 — sem conexão real ao Tiny nem
  PHP local disponível; humano optou pela evidência de testes
  automatizados já rodada)
- **feedback-reprovacao**:
- **atualizado-em**: 2026-08-20

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
  - ADICIONADO (2026-08-19, achado em revisão adversarial na fase
    validar): `api.php?action=bipagem_expedicao` nunca chamava
    `authenticateRequest()` — qualquer requisição anônima sem `token` no
    body disparava expedição real usando `BIPAGEM_API_KEY` do servidor
    assim que ela fosse configurada em produção. Humano decidiu corrigir
    nesta mesma demanda: endpoint agora exige `Authorization: Bearer
    <API_TOKEN>` (mesmo token dos demais endpoints de escrita).
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
