# Plano — bipagem-danfe-nota-fiscal: gerar DANFE junto com a etiqueta

> Plano é descartável após a validação (vai para docs/audora/planos/arquivo/),
> mas obrigatório enquanto a demanda vive. Reler no início de CADA sessão de
> execução e após qualquer compactação de contexto.

**Objetivo:** ao expedir/bipar um pedido, buscar e devolver também o link de
impressão da DANFE, bloqueando a expedição quando não há nota fiscal válida.

**Nó do GRAFO:** `bipagem-danfe-nota-fiscal` (GRAFO.md, projeto expedicao)

**Arquitetura da mudança:** SellInfoTurbo ganha uma etapa nova em
`expedirPedidosBipados`, entre a idempotência (parte 2) e a criação de
agrupamento (parte 3): verifica se cada pedido tem nota fiscal válida —
primeiro pelo banco local (`Pedido.notaFiscalId` + `NotaFiscalResumo.situacao`,
ambos já sincronizados), confirmando ao vivo no Tiny (`getPedidoDetail` +
`getNotaFiscal`) quando o local não é suficiente/confiável. Pedidos NOVOS
(sem agrupamento existente) sem nota válida são bloqueados antes de chegar
no Tiny — três status novos (`sem_nota_fiscal`, `nota_fiscal_cancelada`,
`erro_verificacao_nota_fiscal`). Pedidos já expedidos antes (idempotência)
não são bloqueados retroativamente. Para todo pedido com nota válida, busca
o link (`GET /notas/{id}/link`, não-bloqueante — falha vira aviso, não
bloqueio). expedicao passa a abrir a segunda aba e tratar os novos status
com mensagem específica por cenário (decisão do escopo: nunca mensagem
genérica única).

**Arquivos lidos antes de planejar:**
- `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.ts` (completo, 516 linhas, estado pós-demanda anterior).
- `SellInfoTurbo/src/modules/tiny/services/tiny-client.ts` (`getPedidoDetail`, `getNotaFiscal`, `getEtiquetasAgrupamento`, `getEstoque` como modelo de função simples).
- `SellInfoTurbo/src/modules/tiny/schemas/tiny-api.ts` (`tinyNotaFiscalSchema`, `tinyEtiquetasSchema`, `tinyPedidoDetailSchema` — campo `idNotaFiscal`).
- `SellInfoTurbo/src/modules/tiny/utils/situacao.ts` (`NOTA_SITUACOES_FATURADAS`, `situacaoLabel`, `SITUACAO_LABELS`).
- `SellInfoTurbo/prisma/schema.prisma` (model `Pedido.notaFiscalId`, model `NotaFiscalResumo` — campos `tinyNotaId`, `connectionId`, `situacao`).
- `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.test.ts` (padrão de mocks existente — `mockPedidoFindMany`, `mockConnections`, etc.).
- `SellInfoTurbo/src/app/api/bipagem/expedicao/route.ts` e `route.test.ts` (não deveriam precisar mudar — só repassam o resultado do service).
- `SellInfoTurbo/src/app/api/bipagem/openapi/route.ts` (schema `PedidoResultado`, `ExpedicaoResultado`).
- Endpoint real da API Tiny v3 confirmado via swagger oficial
  (`erp.tiny.com.br/public-api/v3/swagger/swagger.json`): `GET
  /notas/{idNota}/link` → `{ link: string }`; `GET /notas/{idNota}` já
  tinha campo `situacao` (enum 1-10, oficial) não capturado no schema atual.
- `expedicao/app.js` (`solicitarEtiquetaTiny`, linhas 4679-4764, estado pós-demanda anterior).
- `expedicao/AI_INSTRUCTIONS.md` (seção 10, estado pós-demanda anterior).

**Conflitos GRAFO vs código encontrados:** nenhum.

## Notas de sessão

- Decisão de arquitetura: verificação de nota fiscal roda para TODOS os
  pedidos resolvidos (não só os novos), logo após a resolução — mas o
  BLOQUEIO só é aplicado aos que ainda não têm agrupamento existente
  (idempotência). Pedidos já expedidos antes tentam mostrar o link da nota
  se disponível, mas nunca são bloqueados retroativamente por ela.
- `getNotaFiscal` já existe no client mas seu schema (`tinyNotaFiscalSchema`)
  não captura `situacao` — precisa expandir o schema, não criar função nova.
- PHP/expedicao: mudança é só de leitura/exibição da resposta já existente,
  sem novo teste automatizado possível além do já coberto por
  `bipagem-utils.test.js` (não muda essa função).

---

## Tarefa 1 (SellInfoTurbo): schema + client — situação da nota e link de impressão

- **depende-de**: []
- **requisito**: pré-requisito técnico dos critérios 1-7 (verificação de
  situação da nota e obtenção do link).
- **decisões relevantes**: reaproveita `NOTA_SITUACOES_FATURADAS` (já
  existe, `situacao.ts`) como fonte única de verdade do que é "nota válida"
  — não inventar constante nova (fora-de-escopo do nó: "não inventar
  critério próprio de validade fiscal").
- **interfaces**:
  - produz: `tinyNotaFiscalSchema` com campo `situacao: number` (antes só
    tinha `id`/`itens`); `getLinkNotaFiscal(connectionId, notaId,
    sleep?): Promise<string>` — usados pela Tarefa 2.
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/modules/tiny/schemas/tiny-api.ts`
  - Modificar: `SellInfoTurbo/src/modules/tiny/services/tiny-client.ts`
  - Criar: `SellInfoTurbo/src/modules/tiny/services/tiny-client.test.ts` (se não cobrir isso ainda — ver passo 1) ou adicionar caso ao arquivo existente
- **done quando**: `npx vitest run src/modules/tiny/services/tiny-client.test.ts` verde com os casos novos.

Passos:

- [ ] **1. Ler `tiny-client.test.ts` para confirmar o padrão de teste usado
  para funções simples** (ex.: `getEstoque` ou `getNotaFiscal`) —
  `grep -n "getNotaFiscal\|getEstoque" src/modules/tiny/services/tiny-client.test.ts`.
  Replicar exatamente esse padrão de mock de `tinyGet` na Tarefa 1.

- [ ] **2. Escrever o teste que falha** — adicionar a
  `tiny-client.test.ts` (mesmo describe/bloco dos outros testes de GET
  simples, seguindo o padrão encontrado no passo 1):
  ```ts
  describe("getLinkNotaFiscal", () => {
    it("retorna o link da nota fiscal", async () => {
      mockTinyGet.mockResolvedValue({ link: "https://erp.tiny.com.br/nf/123.pdf" });

      const link = await getLinkNotaFiscal("c1", 123);

      expect(link).toBe("https://erp.tiny.com.br/nf/123.pdf");
      expect(mockTinyGet).toHaveBeenCalledWith("c1", "/notas/123/link", {}, undefined);
    });
  });

  describe("getNotaFiscal", () => {
    it("inclui a situacao no retorno", async () => {
      mockTinyGet.mockResolvedValue({ id: 123, situacao: 6, itens: [] });

      const nota = await getNotaFiscal("c1", 123);

      expect(nota.situacao).toBe(6);
    });
  });
  ```
  (ajustar nome do mock de `tinyGet` para o que o passo 1 encontrar — no
  arquivo pode já existir como `mockTinyGet` ou equivalente; usar o mesmo).

- [ ] **2b. Rodar e ver falhar** —
  `npx vitest run src/modules/tiny/services/tiny-client.test.ts`. Esperado:
  `getLinkNotaFiscal` não existe (erro de import) e/ou `nota.situacao` é
  `undefined` (schema não captura o campo).

- [ ] **3. Implementar o mínimo para passar**:

  3a. Em `src/modules/tiny/schemas/tiny-api.ts`, localizar:
  ```ts
  export const tinyNotaFiscalSchema = z.looseObject({
    id: z.number(),
    itens: z
      .array(
        z.looseObject({
          codigo: z.string().nullish(),
          cfop: z.string().nullish(),
        }),
      )
      .default([]),
  });
  ```
  substituir por:
  ```ts
  export const tinyNotaFiscalSchema = z.looseObject({
    id: z.number(),
    /** 1 Pendente, 2 Emitida, 3 Cancelada, 4 Enviada Aguardando Recibo,
     * 5 Rejeitada, 6 Autorizada, 7 Emitida DANFE, 8 Registrada,
     * 9 Enviada Aguardando Protocolo, 10 Denegada. Ver NOTA_SITUACOES_FATURADAS. */
    situacao: z.number(),
    itens: z
      .array(
        z.looseObject({
          codigo: z.string().nullish(),
          cfop: z.string().nullish(),
        }),
      )
      .default([]),
  });
  ```
  Também adicionar, logo abaixo de `tinyEtiquetasSchema` (mesmo arquivo):
  ```ts
  /** GET /notas/{id}/link — url para impressão da DANFE. */
  export const tinyLinkNotaFiscalSchema = z.looseObject({
    link: z.string(),
  });

  export type TinyLinkNotaFiscal = z.infer<typeof tinyLinkNotaFiscalSchema>;
  ```

  3b. Em `src/modules/tiny/services/tiny-client.ts`, adicionar
  `tinyLinkNotaFiscalSchema` ao bloco de imports de
  `@/modules/tiny/schemas/tiny-api` (junto aos outros), e adicionar a
  função logo abaixo de `getNotaFiscal`:
  ```ts
  /** URL de impressão da DANFE de uma nota fiscal já emitida. */
  export async function getLinkNotaFiscal(
    connectionId: string,
    notaId: number,
    sleep?: SleepFn,
  ): Promise<string> {
    const response = await tinyGet(connectionId, `/notas/${notaId}/link`, {}, sleep);
    return tinyLinkNotaFiscalSchema.parse(response).link;
  }
  ```

- [ ] **4. Rodar e ver passar** —
  `npx vitest run src/modules/tiny/services/tiny-client.test.ts` — suíte
  completa do arquivo verde.

- [ ] **5. Commit**:
  ```
  git add src/modules/tiny/schemas/tiny-api.ts src/modules/tiny/services/tiny-client.ts src/modules/tiny/services/tiny-client.test.ts
  git commit -m "feat(tiny): expoe situacao da nota fiscal e link de impressao da danfe"
  ```

---

## Tarefa 2 (SellInfoTurbo): bloquear expedição sem nota fiscal válida, anexar link quando disponível

- **depende-de**: [Tarefa 1]
- **requisito**: critérios 1 a 7 da spec de escopo (verificação local +
  confirmação ao vivo, bloqueio para pedidos novos sem nota válida, não
  bloqueio retroativo, busca de link não-bloqueante, status/detalhe
  específico por cenário).
- **decisões relevantes**: verificação roda para todos os `resolvidos`,
  bloqueio só se aplica a quem não está em `agrupamentoExistente`.
- **interfaces**:
  - consome: `getLinkNotaFiscal`, `tinyNotaFiscalSchema.situacao` (Tarefa 1); `NOTA_SITUACOES_FATURADAS`, `situacaoLabel` (`situacao.ts`, já existentes); `getPedidoDetail`, `getNotaFiscal` (já existentes em `tiny-client.ts`).
  - produz: `PedidoBipadoStatus` com 3 valores novos; `PedidoBipadoResultado` com campos `notaFiscalLink?: string` e `notaFiscalIndisponivel?: string` — usados pela Tarefa 3 (doc) e pela Tarefa 4 (`app.js`).
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.ts`
  - Modificar: `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.test.ts`
- **done quando**: `npx vitest run src/modules/tiny/services/tiny-expedicao.test.ts` verde (suíte completa, 29 testes existentes + novos).

Passos:

- [ ] **1. Escrever os testes que falham** — adicionar aos mocks do topo
  do arquivo (`tiny-expedicao.test.ts`) as novas funções mockadas:
  ```ts
  vi.mock("@/modules/tiny/services/tiny-client", () => ({
    criarAgrupamentoExpedicao: vi.fn(),
    getEtiquetasAgrupamento: vi.fn(),
    findPedidoByNumero: vi.fn(),
    getPedidoDetail: vi.fn(),
    getNotaFiscal: vi.fn(),
    getLinkNotaFiscal: vi.fn(),
  }));
  ```
  (substituir o bloco `vi.mock("@/modules/tiny/services/tiny-client", ...)`
  existente por este, adicionando as 3 funções novas).

  Adicionar os imports e consts de mock correspondentes junto aos
  existentes (`mockFindByNumero` etc.):
  ```ts
  import {
    criarAgrupamentoExpedicao,
    findPedidoByNumero,
    getEtiquetasAgrupamento,
    getLinkNotaFiscal,
    getNotaFiscal,
    getPedidoDetail,
  } from "@/modules/tiny/services/tiny-client";
  // ...
  const mockGetPedidoDetail = vi.mocked(getPedidoDetail);
  const mockGetNotaFiscal = vi.mocked(getNotaFiscal);
  const mockGetLinkNotaFiscal = vi.mocked(getLinkNotaFiscal);
  ```

  Adicionar `mockPedidoFindMany.mockResolvedValue([])` já é o `beforeEach`
  padrão de cada teste — cada teste novo abaixo define seu próprio mock.
  Adicionar os testes novos ao final de `describe("expedirPedidosBipados", ...)`:
  ```ts
  it("expede e anexa o link da nota fiscal quando o pedido ja tem nota valida localmente", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: 900 } as any,
    ]);
    mockNotaFiscalResumoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { tinyNotaId: 900, connectionId: "c1", situacao: 6 } as any,
    ]);
    mockCriar.mockResolvedValue(987);
    mockEtiquetas.mockResolvedValue(["https://e/1.pdf"]);
    mockGetLinkNotaFiscal.mockResolvedValue("https://nf/900.pdf");

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "expedido", notaFiscalLink: "https://nf/900.pdf" });
    expect(mockGetPedidoDetail).not.toHaveBeenCalled();
    expect(mockGetNotaFiscal).not.toHaveBeenCalled();
  });

  it("bloqueia (nao cria agrupamento) quando o pedido nao tem nota fiscal nem local nem ao vivo", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: null } as any,
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
    mockGetPedidoDetail.mockResolvedValue({ idNotaFiscal: null } as any);

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "sem_nota_fiscal" });
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("bloqueia quando a nota local esta cancelada e a confirmacao ao vivo confirma cancelada", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: 900 } as any,
    ]);
    mockNotaFiscalResumoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { tinyNotaId: 900, connectionId: "c1", situacao: 3 } as any,
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
    mockGetPedidoDetail.mockResolvedValue({ idNotaFiscal: 900 } as any);
    // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
    mockGetNotaFiscal.mockResolvedValue({ id: 900, situacao: 3, itens: [] } as any);

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "nota_fiscal_cancelada" });
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("bloqueia com status proprio quando a verificacao ao vivo falha tecnicamente", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: null } as any,
    ]);
    mockGetPedidoDetail.mockRejectedValue(new Error("timeout"));

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "erro_verificacao_nota_fiscal" });
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("nao bloqueia quando a nota e valida mas a busca do link falha — expede com aviso", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: 900 } as any,
    ]);
    mockNotaFiscalResumoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { tinyNotaId: 900, connectionId: "c1", situacao: 7 } as any,
    ]);
    mockCriar.mockResolvedValue(987);
    mockEtiquetas.mockResolvedValue(["https://e/1.pdf"]);
    mockGetLinkNotaFiscal.mockRejectedValue(new Error("tiny fora do ar"));

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "expedido" });
    expect(r.pedidos[0].notaFiscalIndisponivel).toContain("tiny fora do ar");
    expect(mockCriar).toHaveBeenCalled();
  });

  it("pedido ja expedido antes (idempotencia) nao e bloqueado por nota fiscal, mas tenta anexar o link", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 555, notaFiscalId: 900 } as any,
    ]);
    mockExpFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo
      { connectionId: "c1", tinyPedidoId: 555, agrupamentoTinyId: 700 } as any,
    ]);
    mockNotaFiscalResumoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { tinyNotaId: 900, connectionId: "c1", situacao: 6 } as any,
    ]);
    mockEtiquetas.mockResolvedValue(["https://e/antiga.pdf"]);
    mockGetLinkNotaFiscal.mockResolvedValue("https://nf/900.pdf");

    const r = await expedirPedidosBipados({ pedidos: [10] });

    expect(r.pedidos[0]).toMatchObject({ numero: 10, status: "ja_expedido", notaFiscalLink: "https://nf/900.pdf" });
    expect(mockCriar).not.toHaveBeenCalled();
  });
  ```

  Também adicionar o mock de `prisma.notaFiscalResumo.findMany` ao topo
  do arquivo, junto ao mock de `prisma` existente:
  ```ts
  vi.mock("@/lib/prisma", () => ({
    prisma: {
      pedido: { findMany: vi.fn() },
      pedidoExpedicao: { findMany: vi.fn(), createMany: vi.fn() },
      notaFiscalResumo: { findMany: vi.fn() },
    },
  }));
  ```
  e o const correspondente:
  ```ts
  const mockNotaFiscalResumoFindMany = vi.mocked(prisma.notaFiscalResumo.findMany);
  ```
  e no `beforeEach`, adicionar `mockNotaFiscalResumoFindMany.mockResolvedValue([]);`
  junto aos outros defaults.

- [ ] **1b. Rodar e ver falhar pelo motivo certo** —
  `npx vitest run src/modules/tiny/services/tiny-expedicao.test.ts`.
  Esperado: os 6 testes novos falham (comportamento não implementado); os
  29 testes antigos continuam passando (lógica ainda não tocada).

- [ ] **2. Implementar**:

  2a. Imports no topo do arquivo — adicionar:
  ```ts
  import {
    criarAgrupamentoExpedicao,
    findPedidoByNumero,
    getEtiquetasAgrupamento,
    getLinkNotaFiscal,
    getNotaFiscal,
    getPedidoDetail,
  } from "@/modules/tiny/services/tiny-client";
  import { NOTA_SITUACOES_FATURADAS, situacaoLabel } from "@/modules/tiny/utils/situacao";
  ```
  (substituindo o bloco de import de `tiny-client` existente, que hoje só
  traz `criarAgrupamentoExpedicao, findPedidoByNumero, getEtiquetasAgrupamento`).

  2b. Tipos — substituir:
  ```ts
  export type PedidoBipadoStatus =
    | "expedido"
    | "expedido_sem_etiqueta"
    | "ja_expedido"
    | "nao_encontrado"
    | "erro_busca"
    | "ambiguo"
    | "erro_tiny"
    | "empresa_desconectada";

  export type PedidoBipadoResultado = {
    numero: PedidoIdentificador;
    status: PedidoBipadoStatus;
    detalhe?: string;
  };
  ```
  por:
  ```ts
  export type PedidoBipadoStatus =
    | "expedido"
    | "expedido_sem_etiqueta"
    | "ja_expedido"
    | "nao_encontrado"
    | "erro_busca"
    | "ambiguo"
    | "erro_tiny"
    | "empresa_desconectada"
    | "sem_nota_fiscal"
    | "nota_fiscal_cancelada"
    | "erro_verificacao_nota_fiscal";

  export type PedidoBipadoResultado = {
    numero: PedidoIdentificador;
    status: PedidoBipadoStatus;
    detalhe?: string;
    /** Presente quando a nota fiscal é válida e o link foi obtido com sucesso. */
    notaFiscalLink?: string;
    /** Presente quando a nota fiscal é válida mas o link não pôde ser buscado
     * (erro técnico) — pedido continua expedido normalmente. */
    notaFiscalIndisponivel?: string;
  };
  ```

  2c. `PedidoResolvido` ganha o dado local de nota fiscal — substituir:
  ```ts
  type PedidoResolvido = { numero: PedidoIdentificador; connectionId: string; tinyPedidoId: number };
  ```
  por:
  ```ts
  type PedidoResolvido = {
    numero: PedidoIdentificador;
    connectionId: string;
    tinyPedidoId: number;
    /** notaFiscalId do banco local — undefined quando resolvido só ao vivo
     * (nunca consultou o banco), null quando o banco local não tem nota
     * vinculada para esse pedido. */
    notaFiscalIdLocal?: number | null;
  };
  ```

  2d. Na parte 1 (resolução local), incluir `notaFiscalId` no `select` e
  propagar. Localizar:
  ```ts
  const locais =
    condicoesLocais.length > 0
      ? await prisma.pedido.findMany({
          where: {
            OR: condicoesLocais,
            connectionId: { in: candidatas.map((c) => c.id) },
          },
          select: {
            numeroPedido: true,
            numeroPedidoEcommerce: true,
            tinyId: true,
            connectionId: true,
          },
        })
      : [];
  ```
  substituir por:
  ```ts
  const locais =
    condicoesLocais.length > 0
      ? await prisma.pedido.findMany({
          where: {
            OR: condicoesLocais,
            connectionId: { in: candidatas.map((c) => c.id) },
          },
          select: {
            numeroPedido: true,
            numeroPedidoEcommerce: true,
            tinyId: true,
            connectionId: true,
            notaFiscalId: true,
          },
        })
      : [];
  ```
  E dentro do `indexarLocal(...)`, nos dois pontos onde `PedidoResolvido` é
  criado (bloco `if (numerosInt.includes(...))` e bloco
  `if (pedido.numeroPedidoEcommerce && ...)`), adicionar
  `notaFiscalIdLocal: pedido.notaFiscalId` ao objeto literal em cada um dos
  dois (mesmo padrão dos outros campos: `numero`, `connectionId`,
  `tinyPedidoId`).

  2e. Nova função helper, logo abaixo de `resolverAoVivo` (antes de
  `isConexaoIndisponivel`):
  ```ts
  type VerificacaoNotaFiscal =
    | { ok: true; notaId: number }
    | {
        ok: false;
        status: "sem_nota_fiscal" | "nota_fiscal_cancelada" | "erro_verificacao_nota_fiscal";
        detalhe: string;
      };

  /**
   * Confirma se o pedido tem nota fiscal válida (Autorizada/Emitida DANFE).
   * Usa o dado local só quando já sincronizado E com situação conhecida —
   * caso contrário confirma ao vivo no Tiny antes de decidir (nunca bloqueia
   * só por atraso de sincronização).
   */
  async function verificarNotaFiscal(
    pedido: PedidoResolvido,
    notasLocaisPorChave: Map<string, number>,
    correlationId: string,
  ): Promise<VerificacaoNotaFiscal> {
    if (pedido.notaFiscalIdLocal) {
      const situacaoLocal = notasLocaisPorChave.get(`${pedido.connectionId}:${pedido.notaFiscalIdLocal}`);
      if (situacaoLocal !== undefined && NOTA_SITUACOES_FATURADAS.includes(situacaoLocal)) {
        return { ok: true, notaId: pedido.notaFiscalIdLocal };
      }
    }

    let idNotaFiscalAoVivo: number | null | undefined;
    try {
      const detalhe = await getPedidoDetail(pedido.connectionId, pedido.tinyPedidoId);
      idNotaFiscalAoVivo = detalhe.idNotaFiscal;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { err: error, correlationId, numero: pedido.numero, connectionId: pedido.connectionId },
        "Falha ao verificar nota fiscal ao vivo (detalhe do pedido)",
      );
      return { ok: false, status: "erro_verificacao_nota_fiscal", detalhe: `falha ao verificar nota fiscal: ${msg}` };
    }

    if (!idNotaFiscalAoVivo) {
      return { ok: false, status: "sem_nota_fiscal", detalhe: "pedido sem nota fiscal emitida/vinculada" };
    }

    try {
      const nota = await getNotaFiscal(pedido.connectionId, idNotaFiscalAoVivo);
      if (!NOTA_SITUACOES_FATURADAS.includes(nota.situacao)) {
        return {
          ok: false,
          status: "nota_fiscal_cancelada",
          detalhe: `nota fiscal ${idNotaFiscalAoVivo} não está autorizada/emitida (situação: ${situacaoLabel(nota.situacao)})`,
        };
      }
      return { ok: true, notaId: idNotaFiscalAoVivo };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { err: error, correlationId, numero: pedido.numero, connectionId: pedido.connectionId },
        "Falha ao verificar nota fiscal ao vivo (detalhe da nota)",
      );
      return { ok: false, status: "erro_verificacao_nota_fiscal", detalhe: `falha ao verificar nota fiscal: ${msg}` };
    }
  }
  ```

  2f. Integração no fluxo principal. Localizar o trecho que vai do fim da
  parte 1 (fechamento do loop `for (const numero of numeros) { ... }`,
  linha ~230) até o início do bloco `const agrupamentos: AgrupamentoResultado[] = [];`
  (linha ~248) — ou seja, a parte 2 (idempotência) inteira — e, logo APÓS
  o fechamento de `agrupamentoExistente` (após a linha
  `const agrupamentoExistente = new Map(...)`), inserir a nova etapa:
  ```ts
  // 2.5. verificação de nota fiscal — roda para todos os resolvidos, mas
  // o bloqueio só vale para quem ainda não tem agrupamento existente
  // (idempotência): pedido já expedido antes nunca é bloqueado
  // retroativamente, só tenta anexar o link da nota se disponível.
  const notaFiscalIdsLocais = [
    ...new Set(
      resolvidos
        .map((p) => p.notaFiscalIdLocal)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const notasLocais =
    notaFiscalIdsLocais.length > 0
      ? await prisma.notaFiscalResumo.findMany({
          where: {
            tinyNotaId: { in: notaFiscalIdsLocais },
            connectionId: { in: candidatas.map((c) => c.id) },
          },
          select: { tinyNotaId: true, connectionId: true, situacao: true },
        })
      : [];
  const notasLocaisPorChave = new Map(
    notasLocais.map((n) => [`${n.connectionId}:${n.tinyNotaId}`, n.situacao]),
  );

  const verificacoesNota = new Map<string, VerificacaoNotaFiscal>();
  await Promise.all(
    resolvidos.map(async (pedido) => {
      const chave = `${pedido.connectionId}:${pedido.tinyPedidoId}`;
      const verificacao = await verificarNotaFiscal(pedido, notasLocaisPorChave, correlationId);
      verificacoesNota.set(chave, verificacao);
      if (
        !verificacao.ok &&
        !agrupamentoExistente.has(chave)
      ) {
        resultados.set(pedido.numero, { numero: pedido.numero, status: verificacao.status, detalhe: verificacao.detalhe });
      }
    }),
  );
  const bloqueadosPorNota = new Set(
    [...verificacoesNota.entries()]
      .filter(([chave, v]) => !v.ok && !agrupamentoExistente.has(chave))
      .map(([chave]) => chave),
  );
  const resolvidosLiberados = resolvidos.filter(
    (p) => !bloqueadosPorNota.has(`${p.connectionId}:${p.tinyPedidoId}`),
  );
  ```

  2g. Trocar `resolvidos` por `resolvidosLiberados` SÓ no loop que monta
  `novosPorConexao` (parte 3). Localizar:
  ```ts
  const novosPorConexao = new Map<string, PedidoResolvido[]>();
  for (const pedido of resolvidos) {
    if (agrupamentoExistente.has(`${pedido.connectionId}:${pedido.tinyPedidoId}`)) {
      continue;
    }
  ```
  trocar `for (const pedido of resolvidos)` por
  `for (const pedido of resolvidosLiberados)` (resto do bloco idêntico —
  o `if (agrupamentoExistente.has(...))` continua ali, agora redundante
  para os bloqueados mas inofensivo, e ainda necessário para pular quem já
  tem agrupamento).

  A parte 4 (`for (const pedido of resolvidos) { ... registrarJaExpedido ... }`)
  **não muda** — continua usando `resolvidos` original, porque idempotência
  não é afetada pelo bloqueio de nota fiscal.

  2h. Anexar `notaFiscalLink`/`notaFiscalIndisponivel` nos resultados de
  sucesso. Logo ANTES do `return` final da função (antes de
  `return { agrupamentos, etiquetas: ..., pedidos: ... }`), inserir:
  ```ts
  // anexa o link da nota fiscal para todo pedido com resultado de sucesso
  // e nota válida confirmada — busca não-bloqueante: falha vira aviso, o
  // status de expedição já decidido antes não muda.
  await Promise.all(
    resolvidos.map(async (pedido) => {
      const chave = `${pedido.connectionId}:${pedido.tinyPedidoId}`;
      const verificacao = verificacoesNota.get(chave);
      if (!verificacao || !verificacao.ok) {
        return;
      }
      const resultadoAtual = resultados.get(pedido.numero);
      if (
        !resultadoAtual ||
        !["expedido", "ja_expedido", "expedido_sem_etiqueta"].includes(resultadoAtual.status)
      ) {
        return;
      }
      try {
        const link = await getLinkNotaFiscal(pedido.connectionId, verificacao.notaId);
        resultados.set(pedido.numero, { ...resultadoAtual, notaFiscalLink: link });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(
          { err: error, correlationId, numero: pedido.numero, connectionId: pedido.connectionId, notaId: verificacao.notaId },
          "Falha ao buscar link de impressão da nota fiscal",
        );
        resultados.set(pedido.numero, { ...resultadoAtual, notaFiscalIndisponivel: msg });
      }
    }),
  );
  ```

- [ ] **3. Rodar e ver passar** —
  `npx vitest run src/modules/tiny/services/tiny-expedicao.test.ts` —
  todos os testes verdes (29 antigos + 6 novos = 35). Se algum teste antigo
  quebrar, comparar com o comportamento original antes de seguir — a
  intenção é que pedidos sem `notaFiscalId` mockado em teste antigo
  (a maioria) caiam no caminho "ao vivo" via `getPedidoDetail`, que não
  está mockado com retorno específico nesses testes antigos — **atenção**:
  isso pode quebrar os testes antigos que não mockam `getPedidoDetail`,
  porque o mock padrão do `vi.fn()` sem `.mockResolvedValue` retorna
  `undefined`, e `undefined.idNotaFiscal` lança `TypeError`. Se isso
  acontecer, adicionar ao `beforeEach` do arquivo (junto aos outros
  defaults):
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: retorno mínimo do mock
  mockGetPedidoDetail.mockResolvedValue({ idNotaFiscal: 1 } as any);
  // biome-ignore lint/suspicious/noExplicitAny: retorno mínimo do mock
  mockGetNotaFiscal.mockResolvedValue({ id: 1, situacao: 6, itens: [] } as any);
  mockGetLinkNotaFiscal.mockResolvedValue("https://nf/default.pdf");
  ```
  para que os testes antigos (que não testam nota fiscal) tenham nota
  válida por padrão e continuem exercitando só o que testavam antes. Os 6
  testes novos desta tarefa sobrescrevem esses mocks explicitamente onde
  precisam de outro comportamento.

- [ ] **4. Commit**:
  ```
  git add src/modules/tiny/services/tiny-expedicao.ts src/modules/tiny/services/tiny-expedicao.test.ts
  git commit -m "feat(bipagem): bloqueia expedicao sem nota fiscal valida, anexa link da danfe quando disponivel"
  ```

---

## Tarefa 3 (SellInfoTurbo): atualizar documentação OpenAPI

- **depende-de**: [Tarefa 2]
- **requisito**: entregável de documentação — refletir os 3 status novos e
  os 2 campos novos na resposta.
- **decisões relevantes**: nenhuma nova.
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/app/api/bipagem/openapi/route.ts`
  - Modificar: `SellInfoTurbo/src/app/api/bipagem/openapi/route.test.ts`
- **done quando**: `npx vitest run src/app/api/bipagem/openapi/route.test.ts` verde.

Passos:

- [ ] **1. Escrever o teste que falha** — adicionar a `route.test.ts`:
  ```ts
  it("documenta os status e campos novos de nota fiscal", async () => {
    const res = await GET();
    const body = await res.json();

    const statusEnum = body.components.schemas.PedidoResultado.properties.status.enum;
    expect(statusEnum).toEqual(
      expect.arrayContaining(["sem_nota_fiscal", "nota_fiscal_cancelada", "erro_verificacao_nota_fiscal"]),
    );
    expect(body.components.schemas.PedidoResultado.properties.notaFiscalLink).toBeDefined();
    expect(body.components.schemas.PedidoResultado.properties.notaFiscalIndisponivel).toBeDefined();
  });
  ```

- [ ] **1b. Rodar e ver falhar** —
  `npx vitest run src/app/api/bipagem/openapi/route.test.ts`.

- [ ] **2. Implementar** — em `openapi/route.ts`, dentro de
  `components.schemas.PedidoResultado.properties.status.enum`, adicionar
  os 3 valores novos ao array existente (mantendo os 8 atuais):
  ```ts
            enum: [
              "expedido",
              "expedido_sem_etiqueta",
              "ja_expedido",
              "nao_encontrado",
              "erro_busca",
              "ambiguo",
              "erro_tiny",
              "empresa_desconectada",
              "sem_nota_fiscal",
              "nota_fiscal_cancelada",
              "erro_verificacao_nota_fiscal",
            ],
  ```
  E logo abaixo de `detalhe` no mesmo `properties` de `PedidoResultado`,
  adicionar:
  ```ts
          notaFiscalLink: {
            type: "string",
            description: "URL de impressão da DANFE — presente quando a nota fiscal é válida e o link foi obtido.",
          },
          notaFiscalIndisponivel: {
            type: "string",
            description: "Presente quando a nota fiscal é válida mas o link não pôde ser buscado (erro técnico); o pedido continua expedido normalmente.",
          },
  ```

- [ ] **3. Rodar e ver passar** —
  `npx vitest run src/app/api/bipagem/openapi/route.test.ts` — suíte
  completa verde.

- [ ] **4. Commit**:
  ```
  git add src/app/api/bipagem/openapi/route.ts src/app/api/bipagem/openapi/route.test.ts
  git commit -m "docs(bipagem): documenta status e campos novos de nota fiscal na doc openapi"
  ```

---

## Tarefa 4 (expedicao): app.js abre a DANFE junto com a etiqueta, trata os novos status

- **depende-de**: [Tarefa 2] (via contrato da API — precisa dos campos/status novos existirem do lado SellInfoTurbo)
- **requisito**: critérios 5, 6, 8 da spec (abrir 2 abas, sucesso parcial
  com aviso, mensagem específica por motivo de bloqueio).
- **decisões relevantes**: reaproveita o padrão já existente de
  `p.status`/`p.detalhe` no tratamento de erro HTTP (422) que já existe em
  `solicitarEtiquetaTiny` — os 3 status de bloqueio caem nesse caminho sem
  mudança estrutural, só precisam de mensagem amigável por status.
- **arquivos**:
  - Modificar: `expedicao/app.js`
- **done quando**: leitura manual confirma que a função abre 2 abas quando
  ambos os links vêm na resposta, mostra aviso quando só a nota está
  indisponível, e mostra mensagem específica (não genérica) para os 3
  status de bloqueio. (Sem teste automatizado possível — mesma limitação
  já registrada na Tarefa 5 do plano anterior: depende de `fetch`/DOM.)

Passos:

- [ ] **1. Localizar o trecho exato em `app.js`** (dentro de
  `async function solicitarEtiquetaTiny(numeroPedido, cnpj) { ... }`),
  substituir o bloco de tratamento de erro HTTP:
  ```js
          if (!response.ok) {
              // 422/400 podem trazer o detalhe por pedido no corpo
              if (data && Array.isArray(data.pedidos) && data.pedidos.length) {
                  const p = data.pedidos[0];
                  throw new Error(`${p.status}${p.detalhe ? ' — ' + p.detalhe : ''}`);
              }
              // data.issues típico de validação de body (400)
              if (data && Array.isArray(data.issues) && data.issues.length) {
                  throw new Error(`Body inválido: ${data.issues.join('; ')}`);
              }
              throw new Error((data && data.message) ? data.message : `Erro HTTP: ${response.status}`);
          }
  ```
  por:
  ```js
          if (!response.ok) {
              // 422/400 podem trazer o detalhe por pedido no corpo
              if (data && Array.isArray(data.pedidos) && data.pedidos.length) {
                  const p = data.pedidos[0];
                  throw new Error(mensagemDoStatusBipagem(p.status, p.detalhe));
              }
              // data.issues típico de validação de body (400)
              if (data && Array.isArray(data.issues) && data.issues.length) {
                  throw new Error(`Body inválido: ${data.issues.join('; ')}`);
              }
              throw new Error((data && data.message) ? data.message : `Erro HTTP: ${response.status}`);
          }
  ```

- [ ] **2. Adicionar a função `mensagemDoStatusBipagem`** logo ACIMA de
  `async function solicitarEtiquetaTiny(numeroPedido, cnpj) {` (mesma
  seção `9.20.2`):
  ```js
  // Mensagem específica por status de bloqueio — nunca uma genérica única
  // (decisão do escopo da demanda bipagem-danfe-nota-fiscal).
  function mensagemDoStatusBipagem(status, detalhe) {
      const sufixo = detalhe ? ` (${detalhe})` : '';
      switch (status) {
          case 'sem_nota_fiscal':
              return `Pedido sem nota fiscal emitida no Tiny — expedição bloqueada até a nota ser gerada${sufixo}.`;
          case 'nota_fiscal_cancelada':
              return `Nota fiscal do pedido está cancelada — expedição bloqueada${sufixo}.`;
          case 'erro_verificacao_nota_fiscal':
              return `Não foi possível verificar a nota fiscal do pedido — tente novamente${sufixo}.`;
          default:
              return `${status}${sufixo ? ' — ' + detalhe : ''}`;
      }
  }
  ```

- [ ] **3. Abrir a segunda aba (DANFE) e tratar sucesso parcial** —
  substituir:
  ```js
          const etiquetas = (data && Array.isArray(data.etiquetas)) ? data.etiquetas : [];
          
          if (etiquetas.length > 0) {
              console.log('🐞 [Tiny] ✅ ETIQUETA RECEBIDA:', etiquetas.length, '→', etiquetas);
              etiquetas.forEach(url => {
                  if (url) window.open(url, '_blank');
              });
              tinyPrintedOrders.add(pedidoId);
              showToast('Etiqueta Gerada', `Etiqueta do pedido ${pedidoId} aberta para impressão!`, 'success');
          } else if (data && Array.isArray(data.pedidos) && data.pedidos.length) {
              const p = data.pedidos[0];
              // Pedido expedido, mas a etiqueta não pôde ser retornada
              tinyPrintedOrders.add(pedidoId);
              const motivo = p && p.detalhe ? `: ${p.detalhe}` : '';
              showToast('Pedido Expedido', `Pedido ${pedidoId} expedido${motivo}.`, p && p.status === 'expedido' ? 'success' : 'error');
              console.warn('🐞 [Tiny] ⚠️ Pedido expedido SEM etiqueta. status:', p && p.status, '| detalhe:', p && p.detalhe);
          } else {
              throw new Error('Nenhuma etiqueta retornada pela API');
          }
  ```
  por:
  ```js
          const etiquetas = (data && Array.isArray(data.etiquetas)) ? data.etiquetas : [];
          const pedidoResultado = (data && Array.isArray(data.pedidos) && data.pedidos.length) ? data.pedidos[0] : null;
          const notaFiscalLink = pedidoResultado && pedidoResultado.notaFiscalLink;
          const notaFiscalIndisponivel = pedidoResultado && pedidoResultado.notaFiscalIndisponivel;

          if (etiquetas.length > 0 || notaFiscalLink) {
              console.log('🐞 [Tiny] ✅ ETIQUETA/NOTA RECEBIDA:', etiquetas.length, 'etiqueta(s),', notaFiscalLink ? '1 nota' : '0 nota');
              etiquetas.forEach(url => {
                  if (url) window.open(url, '_blank');
              });
              if (notaFiscalLink) {
                  window.open(notaFiscalLink, '_blank');
              }
              tinyPrintedOrders.add(pedidoId);
              const avisoNota = notaFiscalIndisponivel ? ` Nota fiscal indisponível: ${notaFiscalIndisponivel}.` : '';
              showToast('Etiqueta Gerada', `Etiqueta do pedido ${pedidoId} aberta para impressão!${avisoNota}`, notaFiscalIndisponivel ? 'warning' : 'success');
          } else if (pedidoResultado) {
              // Pedido expedido, mas a etiqueta não pôde ser retornada
              tinyPrintedOrders.add(pedidoId);
              const motivo = pedidoResultado.detalhe ? `: ${pedidoResultado.detalhe}` : '';
              const avisoNota = notaFiscalIndisponivel ? ` Nota fiscal indisponível: ${notaFiscalIndisponivel}.` : '';
              showToast('Pedido Expedido', `Pedido ${pedidoId} expedido${motivo}.${avisoNota}`, pedidoResultado.status === 'expedido' ? 'success' : 'error');
              console.warn('🐞 [Tiny] ⚠️ Pedido expedido SEM etiqueta/nota. status:', pedidoResultado.status, '| detalhe:', pedidoResultado.detalhe);
          } else {
              throw new Error('Nenhuma etiqueta retornada pela API');
          }
  ```

- [ ] **4. Verificação manual** — abrir `app.js` e conferir:
  - `mensagemDoStatusBipagem` cobre os 3 status novos com mensagem própria.
  - Bloco de sucesso abre `notaFiscalLink` em nova aba quando presente,
    além das etiquetas.
  - Nenhuma referência antiga a `data.pedidos[0]` sobrou fora de
    `pedidoResultado` na função (evita ler `data.pedidos[0]` duas vezes de
    formas diferentes).

- [ ] **5. Commit**:
  ```
  git add app.js
  git commit -m "feat(bipagem): abre a danfe junto com a etiqueta, mostra mensagem especifica por motivo de bloqueio"
  ```

---

## Tarefa 5 (expedicao): atualizar AI_INSTRUCTIONS.md

- **depende-de**: [Tarefa 2, Tarefa 4]
- **requisito**: entregável de documentação — a doc precisa refletir o
  fluxo real após esta demanda (ela já documenta o fluxo de bipagem da
  demanda anterior, seção 10).
- **arquivos**:
  - Modificar: `expedicao/AI_INSTRUCTIONS.md` (seção 10)
- **done quando**: seção 10 menciona a busca/bloqueio de nota fiscal no
  diagrama de fluxo e nos status possíveis.

Passos:

- [ ] **1. No diagrama de fluxo da seção 10** (bloco ` ``` ` que hoje
  termina em `Etiqueta(s) abrem em nova aba; toast de sucesso/erro
  conforme status`), adicionar uma linha antes do fluxo de abertura:
  ```
  SellInfoTurbo resolve o pedido por numeroPedidoEcommerce, verifica nota
  fiscal (bloqueia se ausente/cancelada — status sem_nota_fiscal /
  nota_fiscal_cancelada / erro_verificacao_nota_fiscal), expede no Tiny,
  devolve { agrupamentos, etiquetas, pedidos: [{ numero, status, detalhe,
  notaFiscalLink, notaFiscalIndisponivel }] }
      ↓
  Etiqueta e DANFE abrem cada uma em nova aba; toast de sucesso/erro/aviso
  conforme status (mensagem específica por motivo — nunca genérica)
  ```
  (substituindo as duas linhas equivalentes hoje existentes).

- [ ] **2. Adicionar um novo parágrafo** logo após a seção "Identificador
  do pedido — ponto crítico" (antes de "Autenticação do proxy"):
  ```markdown
  ### Nota fiscal obrigatória para expedir

  Desde 2026-08-20, o sistema bloqueia a expedição de um pedido sem nota
  fiscal válida (Autorizada ou Emitida DANFE) no Tiny — não expede só com
  a etiqueta. A verificação usa primeiro o banco local do SellInfoTurbo,
  confirmando ao vivo no Tiny quando necessário (nunca bloqueia só por
  atraso de sincronização). Três status possíveis de bloqueio, cada um com
  mensagem própria no toast: `sem_nota_fiscal`, `nota_fiscal_cancelada`,
  `erro_verificacao_nota_fiscal`.
  ```

- [ ] **3. Commit**:
  ```
  git add AI_INSTRUCTIONS.md
  git commit -m "docs: atualiza fluxo de bipagem com verificacao de nota fiscal"
  ```

<!-- Proibições (falhas de plano): TBD; TODO; "tratar erros adequadamente";
"similar à tarefa N" (repita o código); passo que descreve sem mostrar como;
referência a função/tipo não definido em nenhuma tarefa. -->
