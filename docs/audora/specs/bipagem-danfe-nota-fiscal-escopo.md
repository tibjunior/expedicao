# Escopo — bipagem-danfe-nota-fiscal

> Nó no GRAFO.md: `bipagem-danfe-nota-fiscal`. Categoria: ALTA. Depende de
> `bipagem-tiny-sellinfo`.

## Objetivo

Ao expedir/bipar um pedido, o sistema deve gerar automaticamente também o
link de impressão da DANFE (nota fiscal), junto com a etiqueta de envio já
existente — as duas saem juntas, na mesma ação, sem tela ou passo extra
para o operador.

## Contexto técnico confirmado (fase de escopo)

- API Tiny v3: `GET /notas/{idNota}/link` → `{ "link": "<url>" }` (mesmo
  padrão de `GET /expedicao/{id}/etiquetas` já usado hoje).
- `GET /notas/{idNota}` retorna `situacao` — enum oficial: 1 Pendente, 2
  Emitida, 3 Cancelada, 4 Enviada Aguardando Recibo, 5 Rejeitada, 6
  Autorizada, 7 Emitida DANFE, 8 Registrada, 9 Enviada Aguardando
  Protocolo, 10 Denegada. Situações "válidas" para despacho: 6 e 7 (já
  usado em `NOTA_SITUACOES_FATURADAS` no código do SellInfoTurbo).
- SellInfoTurbo já sincroniza `Pedido.notaFiscalId` (Prisma) — não precisa
  de chamada extra ao Tiny para descobrir qual nota pertence a qual
  pedido, na maioria dos casos.

## Critérios de aceite (EARS)

1. QUANDO o operador bipa o último item de um pedido O SISTEMA DEVE
   verificar se existe nota fiscal vinculada e válida (situação Autorizada
   ou Emitida DANFE) para aquele pedido, usando primeiro o banco local
   sincronizado do SellInfoTurbo.
2. QUANDO o banco local não tem nota vinculada ao pedido (ou a nota local
   está marcada como cancelada) O SISTEMA DEVE confirmar ao vivo no Tiny
   (busca em tempo real) antes de decidir bloquear — nunca bloqueia só com
   base em dado local potencialmente desatualizado.
3. QUANDO a confirmação ao vivo mostra que o pedido não tem nota fiscal
   emitida/vinculada O SISTEMA DEVE bloquear a expedição inteira daquele
   pedido — não cria o agrupamento de expedição no Tiny, não abre etiqueta
   nem nota, e retorna um status específico (ex.: `sem_nota_fiscal`) com
   detalhe explicando que falta a nota fiscal.
4. QUANDO a confirmação ao vivo mostra que a nota fiscal existe mas está
   cancelada O SISTEMA DEVE bloquear a expedição do mesmo jeito que no
   critério 3, com status/detalhe específico indicando que a nota está
   cancelada (não a mesma mensagem de "sem nota").
5. QUANDO a nota fiscal existe e está válida (Autorizada ou Emitida DANFE)
   E a etiqueta de envio também está disponível O SISTEMA DEVE expedir o
   pedido normalmente e abrir DUAS abas novas no navegador do operador: uma
   com a etiqueta de envio, outra com o link da DANFE.
6. QUANDO a nota fiscal existe e está válida MAS a busca do link da nota
   falha por erro técnico (timeout, erro HTTP do Tiny, rede) O SISTEMA
   NÃO DEVE bloquear a expedição — o pedido é expedido e a etiqueta abre
   normalmente (comportamento já existente hoje para etiqueta ausente,
   `expedido_sem_etiqueta`), com um status/detalhe próprio explicando que
   a nota fiscal existe mas não pôde ser buscada, e o motivo técnico
   específico do erro.
7. QUANDO a própria verificação ao vivo de existência/situação da nota
   falha por erro técnico (não dá nem para confirmar se a nota existe) O
   SISTEMA DEVE bloquear a expedição (mesma decisão de segurança dos
   critérios 3/4 — não expede na incerteza), com status/detalhe próprio
   diferenciando esse erro técnico de "confirmado sem nota" ou "nota
   cancelada".
8. QUANDO qualquer um dos bloqueios acima (critérios 3, 4 ou 7) acontece O
   SISTEMA (frontend) DEVE mostrar ao operador um toast de erro claro
   identificando qual dos três motivos causou o bloqueio, usando a
   mensagem/detalhe específica devolvida pela API — não uma mensagem
   genérica única.
9. QUANDO o fluxo descrito acima roda O SISTEMA DEVE valer apenas para o
   caminho de bipagem individual já em uso (`solicitarEtiquetaTiny`,
   disparado a cada item expedido) — não para `bipagerExpedicao` (função
   sem nenhum botão/tela associado hoje).

## Fora de escopo

- `bipagerExpedicao` (expedição em lote) — sem chamador hoje, fica como
  está; se ganhar uso no futuro, vira demanda própria.
- Combinar etiqueta e DANFE num único PDF — as duas abrem como documentos
  separados, cada uma em sua aba.
- Qualquer mudança na regra de negócio de quando uma nota é considerada
  "válida" além do enum oficial do Tiny (situações 6 e 7) — não inventar
  critério próprio de validade fiscal.
- Persistir localmente no expedicao (SQLite/IndexedDB) o link ou o status
  da nota fiscal — o link é só repassado na resposta da chamada, igual à
  etiqueta hoje.
- Alterar o comportamento de dedup (`tinyPrintedOrders`) — continua
  controlando reimpressão pelo mesmo identificador de pedido já usado.

## Auto-revisão

- `[PRECISA-CLARIFICAR]` aberto: nenhum.
- Critérios em EARS e testáveis: sim.
- Fora-de-escopo explícito: sim.
- Contradição com constituição/nós vizinhos: nenhuma. Consistente com
  `bipagem-tiny-sellinfo` (mesmo padrão de proxy/resolução por pedido) e
  reaproveita infraestrutura já existente no SellInfoTurbo (sync de
  `NotaFiscalResumo`, constantes de situação em `situacao.ts`).
