# Escopo — bipagem-tiny-sellinfo

> Nó no GRAFO.md: `bipagem-tiny-sellinfo`. Categoria: ALTA. Branch: `develop`.

## Objetivo

Corrigir a integração de bipagem do expedicao com a API do SellInfoTurbo
(`POST /api/bipagem/expedicao`, proxy via `api.php?action=bipagem_expedicao`)
já implementada no commit `e9912a7` (direto na main, 2026-08-18): eliminar o
segredo de produção hardcoded no código-fonte, documentar as variáveis de
ambiente necessárias, e atualizar a documentação do projeto para refletir o
que já está implementado — sem quebrar a expedição em produção (HostGator)
no processo.

## Reabertura de escopo (2026-08-19)

Durante a depuração (skill `depurar`), o humano relatou que **a bipagem não
funciona hoje, mesmo com chave e domínio corretos** — nenhuma chamada chega
na API. Causa raiz demonstrada (ver `docs/audora/depuracao/` se existir
relatório, ou histórico da conversa): o campo `ec` extraído do PDF
(`Nº EC`, ex.: `LU-1550370116151430`, `702-9802415-7265855`) é o número do
pedido **na plataforma de venda/marketplace**, formato varia por canal. A
API de bipagem do SellInfoTurbo hoje só resolve pedido por `numeroPedido`
(número **interno** do Tiny, inteiro) — nunca recebe nem entende o número
do marketplace. O Prisma do SellInfoTurbo já sincroniza e guarda
`numeroPedidoEcommerce` (string) por pedido, então o dado existe; só falta
a rota de bipagem usá-lo. Isso muda o objetivo e os critérios de aceite:
a integração nunca funcionou de ponta a ponta, e corrigir isso é o cerne
desta demanda agora — não só a auditoria de segurança original.

**Decisão do humano (2026-08-19):** corrigir nos dois projetos — expedicao
(branch `develop`) e SellInfoTurbo (nova branch lá) — para a bipagem
resolver pedidos pelo número do e-commerce.

## Contexto crítico (achado na fase de escopo)

A constante `BIPAGEM_API_KEY` em `api.php` tinha fallback hardcoded (uma
string literal, já removida do código) que é uma **chave real de produção**,
confirmado pelo humano. Isso é um segredo vazado no código-fonte versionado.

- **Rotação da chave no SellInfoTurbo:** fora do escopo desta demanda — o
  humano cuida disso separadamente, no seu tempo.
- **Não quebrar produção agora:** o humano pediu para o sistema continuar
  funcionando. Fisicamente isso só é possível de duas formas: (a) manter o
  segredo em algum lugar acessível ao `api.php` em runtime, ou (b) aceitar
  uma janela de falha até o humano configurar o segredo no servidor.
  Decisão: seguir o padrão que o próprio projeto já usa para a credencial
  FTP (`credencial.txt`, fora do Git) — mover `BIPAGEM_API_KEY` para uma
  variável de ambiente real (`getenv`) ou, se o HostGator não suportar `env`
  do processo PHP, para um arquivo de config fora da pasta pública e fora do
  Git (mesmo padrão de `../expedicao.db`). **O humano precisa criar esse
  arquivo/env no servidor de produção manualmente** — isso é responsabilidade
  dele, documentada nesta demanda, e é a única forma de não deixar o segredo
  no código sem uma janela de indisponibilidade.

## Critérios de aceite (EARS)

0. QUANDO o operador bipa o último item de um pedido cujo `ec` veio do PDF
   (formato de qualquer marketplace suportado: Mercado Livre, Shopee,
   Magalu, Amazon, TikTok Shop) O SISTEMA DEVE enviar esse valor como
   identificador de e-commerce (string) ao proxy, e o proxy/API do
   SellInfoTurbo DEVE resolver o pedido correspondente no Tiny por
   `numeroPedidoEcommerce` — não mais tentar interpretar `ec` como inteiro.
0.1. QUANDO a API do SellInfoTurbo não encontra nenhum pedido com aquele
   `numeroPedidoEcommerce` O SISTEMA DEVE retornar status `nao_encontrado`
   por pedido (comportamento já existente para o caso análogo por número
   interno) — sem quebrar os demais pedidos do lote.
0.2. QUANDO mais de um pedido no Tiny tem o mesmo `numeroPedidoEcommerce`
   (raro, mas possível entre conexões/empresas diferentes) O SISTEMA DEVE
   tratar como `ambiguo`, igual ao caso já existente por número interno.
1. QUANDO o código-fonte de `api.php` é lido O SISTEMA NÃO DEVE conter
   nenhum valor de `BIPAGEM_API_KEY` real (hardcoded ou como fallback) — só
   leitura de variável de ambiente / arquivo de config fora da pasta pública
   e fora do Git.
2. QUANDO o operador envia uma bipagem com token salvo no `localStorage`
   (`expedicao_tiny_token`) O SISTEMA DEVE continuar usando esse token no
   proxy, sem alteração de comportamento.
3. QUANDO o operador não tem token salvo E o servidor tem
   `BIPAGEM_API_KEY` configurada (env ou arquivo de config) O SISTEMA DEVE
   usar essa chave como fallback, exatamente como hoje.
4. QUANDO o operador não tem token salvo E o servidor NÃO tem
   `BIPAGEM_API_KEY` configurada O SISTEMA DEVE recusar a chamada com HTTP
   401 e mensagem clara ("chave de bipagem não configurada no servidor"),
   em vez de usar um segredo escondido no código.
5. QUANDO o modo simulação está ativo (`expedicao_bipagem_mock` no
   `localStorage`) O SISTEMA DEVE continuar funcionando sem exigir token
   nem `BIPAGEM_API_KEY`, exatamente como hoje.
6. QUANDO um desenvolvedor abre o projeto pela primeira vez O SISTEMA DEVE
   ter `.env.example` documentando `BIPAGEM_API_KEY` (placeholder) e o
   projeto deve ter um `.env` local com placeholder — nunca com a chave
   real. [PRECISA-CLARIFICAR: como esse `.env`/arquivo de config é
   efetivamente lido pelo `api.php` em produção no HostGator — depende do
   suporte a `SetEnv`/`php_value` daquele hosting, que não temos como
   confirmar sem acesso ao painel. A implementação vai usar `getenv()` com
   fallback para um arquivo de config local fora da pasta pública
   (`../bipagem-config.php`, no padrão de `../expedicao.db`), e documentar
   as duas opções para o humano escolher a que funciona no HostGator dele.]
7. QUANDO alguém lê `AI_INSTRUCTIONS.md` §10 ("Plano Futuro: Integração
   Tiny") O SISTEMA (documento) DEVE refletir que a integração já está
   implementada — descrever o fluxo real (`tinyEnviarEtiqueta`, proxy
   `api.php`, API do SellInfoTurbo), não mais "Planejado (aguardando
   informações do usuário)".
8. QUANDO o humano lê a documentação desta correção O SISTEMA (documento)
   DEVE listar explicitamente o passo manual que falta no servidor de
   produção (configurar `BIPAGEM_API_KEY` fora do código) para a mudança
   não regredir a expedição de etiquetas em produção.

## Fora de escopo

- Rotacionar a `BIPAGEM_API_KEY` no lado do SellInfoTurbo — o humano cuida
  disso separadamente.
- Reescrever o histórico do Git para remover o segredo do commit `e9912a7`
  já publicado — operação destrutiva, não solicitada.
- Corrigir `API_TOKEN` (outro segredo hardcoded em `api.php`, pré-existente
  a esta demanda, não introduzido pela integração de bipagem).
- Dedup de pedidos, modo mock, fluxo de abertura de etiqueta em nova aba —
  mantidos como estão, não fazem parte da causa raiz encontrada.
- Fazer o deploy da correção para produção (HostGator e Coolify) — segue o
  fluxo de deploy já existente de cada projeto, por conta do humano.
- Suporte a marketplaces além dos 5 observados no PDF de teste (Mercado
  Livre, Shopee, Magalu, Amazon, TikTok Shop) — se um canal novo aparecer
  com formato de `Nº EC` inesperado, tratar como demanda nova.

## Auto-revisão

- `[PRECISA-CLARIFICAR]` aberto: 1 (item 6/critério de leitura de env no
  HostGator — decisão de implementação documentada com as duas opções, não
  bloqueia o fechamento do escopo pois o comportamento observável — fallback
  em camadas, fail-closed sem segredo — está definido independente de qual
  mecanismo de leitura o humano escolher em produção).
- Critérios em EARS e testáveis: sim, exceto 7-8 que são sobre
  documentação (mantidos por serem entregáveis explícitos desta demanda).
- Fora-de-escopo explícito: sim.
- Contradição com constituição/nós vizinhos: nenhuma. Consistente com
  `seguranca-api-fase1` (GRAFO-ARQUIVO.md) — mesma linha de correções de
  segurança do `api.php`.
