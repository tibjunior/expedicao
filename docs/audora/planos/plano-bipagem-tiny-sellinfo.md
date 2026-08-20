# Plano — bipagem-tiny-sellinfo: corrigir integração de bipagem com SellInfoTurbo

> Plano é descartável após a validação (vai para docs/audora/planos/arquivo/),
> mas obrigatório enquanto a demanda vive. Reler no início de CADA sessão de
> execução e após qualquer compactação de contexto.

**Objetivo:** Fazer a bipagem do expedicao expedir pedidos de verdade via API
do SellInfoTurbo (hoje nunca funciona — usa o identificador errado), e tirar
a chave de produção hardcoded do código-fonte do proxy PHP.

**Nó do GRAFO:** `bipagem-tiny-sellinfo` (GRAFO.md, projeto expedicao)

**Arquitetura da mudança:** Dois repositórios. (1) SellInfoTurbo: a rota de
bipagem passa a aceitar `pedidos` como `number | string` — `number` continua
sendo o número interno do Tiny (comportamento antigo, com busca ao vivo na
API do Tiny quando não está no banco local); `string` é o número do pedido
no e-commerce/marketplace (`numeroPedidoEcommerce`, coluna que já existe e
já é sincronizada no Prisma — só resolvido localmente, sem busca ao vivo,
porque a API do Tiny não filtra pedidos por esse campo). (2) expedicao: para
de tentar `parseInt` no `ec` extraído do PDF (que é sempre um identificador
de marketplace, nunca o número interno do Tiny) e passa a mandar esse valor
sempre como string; o proxy PHP para de forçar `intval` nos pedidos e para
de ter fallback de chave hardcoded — a validação de "sem token" que já
existe no código passa a disparar de verdade (fail-closed) quando não há
`BIPAGEM_API_KEY` configurada.

**Arquivos lidos antes de planejar:**
- `SellInfoTurbo/src/modules/tiny/schemas/bipagem-expedicao.ts` — schema Zod do body.
- `SellInfoTurbo/src/app/api/bipagem/expedicao/route.ts` — handler HTTP.
- `SellInfoTurbo/src/app/api/bipagem/expedicao/route.test.ts` — testes da rota.
- `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.ts` — lógica de resolução/expedição.
- `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.test.ts` — testes da lógica.
- `SellInfoTurbo/src/modules/tiny/services/tiny-client.ts` (trechos `listPedidos`, `findPedidoByNumero`, `ListPedidosParams`).
- `SellInfoTurbo/src/modules/tiny/schemas/tiny-api.ts` (trecho `tinyPedidoSchema`, campo `ecommerce.numeroPedidoEcommerce`).
- `SellInfoTurbo/prisma/schema.prisma` (model `Pedido`, colunas `numeroPedido`/`numeroPedidoEcommerce`).
- `SellInfoTurbo/src/app/api/bipagem/openapi/route.ts` e `route.test.ts` — doc estática, escrita à mão.
- `SellInfoTurbo/vitest.config.ts`, `SellInfoTurbo/package.json` (script `test`).
- `expedicao/app.js` (trechos `tinyEnviarEtiqueta`, `solicitarEtiquetaTiny`, `bipagerFetch`, config popup Tiny linhas ~5038-5090).
- `expedicao/pdf-parser.js` (extração de `ec` via regex `Nº\s+EC\s+(\S+)`).
- `expedicao/api.php` (completo — rotas, `BIPAGEM_API_KEY`, endpoint `bipagem_expedicao`).
- `expedicao/index.html` (trecho popup config bipagem, linhas ~100-130).
- `expedicao/package.json`, `expedicao/server.js` (confirmado: não executa PHP, só serve estático).
- `expedicao/teste.pdf` (extraído via `pdf-parse`, confirma os 5 formatos reais de `Nº EC` por canal).

**Conflitos GRAFO vs código encontrados:** nenhum.

## Notas de sessão

- 2026-08-19 (humano): aprovou o plano, mas pediu para executar **só as
  Tarefas 1-3 (SellInfoTurbo)** nesta rodada. Tarefas 4-9 (expedicao) ficam
  pendentes — não descartadas, só adiadas. Retomar a partir da Tarefa 4
  quando o humano pedir.
- 2026-08-19: Tarefas 1-3 executadas e commitadas no SellInfoTurbo, branch
  `fix/bipagem-numero-pedido-ecommerce` (a partir da main de lá), **não
  enviada ao remoto (sem push, sem PR)**:
  - `f42252d` — feat(bipagem): resolve pedido por numeroPedidoEcommerce
    quando o identificador vem como string (inclui o schema da Tarefa 1).
  - `53b3d96` — docs(bipagem): documenta pedidos aceitando numero interno
    ou identificador de e-commerce.
  - Suíte completa do SellInfoTurbo verde (955 testes, incluindo os 7
    novos desta demanda), typecheck limpo, lint limpo.
  - Havia uma demanda paralela em andamento no working tree do
    SellInfoTurbo (`logging-padrao-estruturado`, só documento, GRAFO.md
    modificado + `docs/superpowers/specs/2026-08-19-logging-padrao-design.md`
    novo) — preservada intocada, nada dela foi commitado por esta demanda.
  - Tarefas 4-9 (expedicao) continuam pendentes. Sem elas, a bipagem no
    expedicao ainda não funciona (continua mandando `parseInt` do `ec`) —
    o SellInfoTurbo já está pronto para recebê-la como string quando essas
    tarefas rodarem.
- 2026-08-19: Tarefas 4-9 executadas e commitadas no expedicao, branch
  `develop`:
  - `99125a7` — test: normalizarIdentificadorPedido + node --test (Tarefa 4).
  - `e77017c` — fix(bipagem): app.js usa o identificador normalizado (Tarefa 5).
  - `4a5cd9c` — chore: index.html carrega bipagem-utils.js (Tarefa 6).
  - `5167fb2` — fix(seguranca): api.php sem chave hardcoded, sem intval no pedido (Tarefa 7).
  - `b02b842` — docs(env): .env.example (Tarefa 8).
  - `d63dccf` — docs: AI_INSTRUCTIONS.md §10 atualizado (Tarefa 9).
  - `npm test` local: 7/7 verde. `api.php` sem teste automatizado (PHP não
    instalado nesta máquina) — verificação só por revisão de código.
  - Todas as 9 tarefas do plano concluídas nos dois repositórios. Próximo:
    fase validar (e2e, se aplicável, e portão humano final).
- PHP não está instalado localmente (`php --version` → not found). A tarefa
  do `api.php` não tem como rodar teste automatizado nem manual local nesta
  sessão — validação é só por revisão de código cuidadosa (mudança pequena
  e mecânica) + teste manual do humano em produção depois do deploy.
- Decisão de design importante: o expedicao **nunca** deve mandar o `ec`
  como inteiro, mesmo quando o valor for uma sequência puramente numérica
  (casos Mercado Livre/TikTok Shop) — porque mesmo esses "parecem" número
  mas são o número do pedido no marketplace, não o número interno do Tiny.
  Só o SellInfoTurbo aceita `number` no schema, para clientes hipotéticos
  futuros que tenham o número interno do Tiny disponível; o expedicao usa
  sempre `string`.

---

## Tarefa 1 (SellInfoTurbo): schema aceita pedido como número interno OU identificador de e-commerce ✅ CONCLUÍDA

- **depende-de**: []
- **requisito**: "0. QUANDO o operador bipa o último item de um pedido cujo
  `ec` veio do PDF (...) O SISTEMA DEVE enviar esse valor como identificador
  de e-commerce (string) ao proxy, e o proxy/API do SellInfoTurbo DEVE
  resolver o pedido correspondente no Tiny por `numeroPedidoEcommerce`."
- **decisões relevantes**: manter retrocompatibilidade com `number` (client
  atual antes desta correção já manda inteiros que às vezes coincidem com o
  número interno do Tiny por acaso — não vale a pena quebrar esse contrato).
- **interfaces**:
  - produz: `PedidoIdentificador = number | string` (exportado de
    `bipagem-expedicao.ts`), usado pela Tarefa 2.
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/modules/tiny/schemas/bipagem-expedicao.ts`
  - Criar: `SellInfoTurbo/src/modules/tiny/schemas/bipagem-expedicao.test.ts`
- **done quando**: `npx vitest run src/modules/tiny/schemas/bipagem-expedicao.test.ts` verde.

Passos:

- [x] **1. Criar branch no SellInfoTurbo.**
  ```
  cd "c:\Users\Italo Barros\workspace\VTURBO\SellInfoTurbo"
  git checkout main && git pull && git checkout -b fix/bipagem-numero-pedido-ecommerce
  ```

- [x] **2. Escrever teste que falha** — `src/modules/tiny/schemas/bipagem-expedicao.test.ts` (arquivo novo):
  ```ts
  import { describe, expect, it } from "vitest";
  import { bipagemExpedicaoRequestSchema } from "./bipagem-expedicao";

  describe("bipagemExpedicaoRequestSchema", () => {
    it("aceita pedidos numéricos (número interno do Tiny)", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({ pedidos: [12345] });
      expect(r.success).toBe(true);
    });

    it("aceita pedidos em string (número do pedido no e-commerce)", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({
        pedidos: ["LU-1550370116151430"],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.pedidos).toEqual(["LU-1550370116151430"]);
      }
    });

    it("aceita mistura de number e string no mesmo lote", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({ pedidos: [10, "26070606BSBAKE"] });
      expect(r.success).toBe(true);
    });

    it("rejeita string vazia", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({ pedidos: [""] });
      expect(r.success).toBe(false);
    });

    it("faz trim em string com espaços nas bordas", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({ pedidos: ["  LU-123  "] });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.pedidos).toEqual(["LU-123"]);
      }
    });

    it("continua rejeitando número zero ou negativo", () => {
      const r = bipagemExpedicaoRequestSchema.safeParse({ pedidos: [0] });
      expect(r.success).toBe(false);
    });
  });
  ```

- [ ] **2b. Rodar e ver falhar** —
  `npx vitest run src/modules/tiny/schemas/bipagem-expedicao.test.ts`.
  Esperado: 2 falhas (string e mistura number+string), porque o schema atual
  só aceita `z.number()`.

- [ ] **3. Implementar o mínimo para passar** — substituir o conteúdo de
  `src/modules/tiny/schemas/bipagem-expedicao.ts`:
  ```ts
  import { z } from "zod";

  /**
   * number = número interno do pedido no Tiny (numeroPedido). string =
   * número do pedido no e-commerce/marketplace (numeroPedidoEcommerce),
   * como aparece no "Nº EC" do PDF de separação — formato varia por canal
   * (Mercado Livre, Shopee, Magalu, Amazon, TikTok Shop, ...).
   */
  const pedidoIdentificadorSchema = z.union([
    z.number().int().positive("número de pedido deve ser positivo"),
    z.string().trim().min(1, "identificador de pedido do e-commerce não pode ser vazio"),
  ]);

  export type PedidoIdentificador = z.infer<typeof pedidoIdentificadorSchema>;

  /** Body do POST /api/bipagem/expedicao. cnpj sai normalizado (só dígitos). */
  export const bipagemExpedicaoRequestSchema = z.object({
    pedidos: z
      .array(pedidoIdentificadorSchema)
      .min(1, "informe ao menos um pedido")
      .max(50, "máximo de 50 pedidos por chamada"),
    cnpj: z
      .string()
      .transform((valor) => valor.replace(/\D/g, ""))
      .refine((valor) => valor.length === 14, "cnpj deve ter 14 dígitos")
      .optional(),
  });

  export type BipagemExpedicaoRequest = z.infer<typeof bipagemExpedicaoRequestSchema>;
  ```

- [ ] **4. Rodar e ver passar** —
  `npx vitest run src/modules/tiny/schemas/bipagem-expedicao.test.ts` — 6/6 verde.

- [ ] **5. Commit**:
  ```
  git add src/modules/tiny/schemas/bipagem-expedicao.ts src/modules/tiny/schemas/bipagem-expedicao.test.ts
  git commit -m "feat(bipagem): aceita identificador de pedido do e-commerce (string) alem do numero interno do tiny"
  ```

---

## Tarefa 2 (SellInfoTurbo): resolver pedido por numeroPedidoEcommerce ✅ CONCLUÍDA

- **depende-de**: [Tarefa 1]
- **requisito**:
  - "0. (...) o proxy/API do SellInfoTurbo DEVE resolver o pedido
    correspondente no Tiny por `numeroPedidoEcommerce`."
  - "0.1. QUANDO a API do SellInfoTurbo não encontra nenhum pedido com
    aquele `numeroPedidoEcommerce` O SISTEMA DEVE retornar status
    `nao_encontrado` por pedido (...) sem quebrar os demais pedidos do
    lote."
  - "0.2. QUANDO mais de um pedido no Tiny tem o mesmo
    `numeroPedidoEcommerce` (...) O SISTEMA DEVE tratar como `ambiguo`,
    igual ao caso já existente por número interno."
- **decisões relevantes**: busca ao vivo (API do Tiny) só existe para
  identificador numérico — a API do Tiny não tem filtro por
  `numeroPedidoEcommerce`, então string que não bate no banco local vai
  direto para `nao_encontrado` (limitação aceita, documentada no comentário
  do código).
- **interfaces**:
  - consome: `PedidoIdentificador` (Tarefa 1).
  - produz: `PedidoBipadoResultado.numero: PedidoIdentificador`,
    `AgrupamentoResultado.pedidos: PedidoIdentificador[]` — usados pela
    Tarefa 3 (doc) e pelo `route.ts` (não muda, já repassa o objeto
    genericamente).
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.ts`
  - Modificar: `SellInfoTurbo/src/modules/tiny/services/tiny-expedicao.test.ts`
- **done quando**: `npx vitest run src/modules/tiny/services/tiny-expedicao.test.ts` verde (suíte completa, incluindo os 23 testes já existentes).

Passos:

- [ ] **1. Escrever os testes que falham** — adicionar ao final de
  `describe("expedirPedidosBipados", ...)` em `tiny-expedicao.test.ts`
  (antes do `});` de fechamento do describe):
  ```ts
  it("expede pedido resolvido no banco local por numeroPedidoEcommerce", async () => {
    mockConnections.mockResolvedValue([conn("c1", "11222333000144")]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      {
        numeroPedido: 999,
        numeroPedidoEcommerce: "LU-1550370116151430",
        connectionId: "c1",
        tinyId: 555,
      } as any,
    ]);
    mockCriar.mockResolvedValue(987);
    mockEtiquetas.mockResolvedValue(["https://e/1.pdf"]);

    const r = await expedirPedidosBipados({ pedidos: ["LU-1550370116151430"] });

    expect(r.pedidos).toEqual([{ numero: "LU-1550370116151430", status: "expedido" }]);
    expect(mockCriar).toHaveBeenCalledWith("c1", [555]);
  });

  it("identificador de e-commerce nao encontrado localmente vira nao_encontrado sem tentar busca ao vivo", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([]);

    const r = await expedirPedidosBipados({ pedidos: ["26070606BSBAKE"] });

    expect(r.pedidos[0]).toMatchObject({ numero: "26070606BSBAKE", status: "nao_encontrado" });
    expect(mockFindByNumero).not.toHaveBeenCalled();
  });

  it("mistura number e string no mesmo lote, cada um resolvido pela sua coluna, em 1 agrupamento", async () => {
    mockConnections.mockResolvedValue([conn("c1", null)]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 10, numeroPedidoEcommerce: null, connectionId: "c1", tinyId: 111 } as any,
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 999, numeroPedidoEcommerce: "LU-abc", connectionId: "c1", tinyId: 222 } as any,
    ]);
    mockCriar.mockResolvedValue(950);
    mockEtiquetas.mockResolvedValue([]);

    const r = await expedirPedidosBipados({ pedidos: [10, "LU-abc"] });

    expect(mockCriar).toHaveBeenCalledTimes(1);
    expect(mockCriar).toHaveBeenCalledWith("c1", [111, 222]);
    expect(r.pedidos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ numero: 10, status: "expedido" }),
        expect.objectContaining({ numero: "LU-abc", status: "expedido" }),
      ]),
    );
  });

  it("dois pedidos com o mesmo numeroPedidoEcommerce em empresas diferentes viram ambiguo", async () => {
    mockConnections.mockResolvedValue([conn("c1", "1"), conn("c2", "2")]);
    mockPedidoFindMany.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 1, numeroPedidoEcommerce: "LU-dup", connectionId: "c1", tinyId: 1 } as any,
      // biome-ignore lint/suspicious/noExplicitAny: shape mínimo nos mocks
      { numeroPedido: 2, numeroPedidoEcommerce: "LU-dup", connectionId: "c2", tinyId: 2 } as any,
    ]);

    const r = await expedirPedidosBipados({ pedidos: ["LU-dup"] });

    expect(r.pedidos[0]).toMatchObject({ numero: "LU-dup", status: "ambiguo" });
    expect(mockCriar).not.toHaveBeenCalled();
  });
  ```

- [ ] **1b. Rodar e ver falhar pelo motivo certo** —
  `npx vitest run src/modules/tiny/services/tiny-expedicao.test.ts`.
  Esperado: os 4 testes novos falham (TS provavelmente nem compila ainda,
  já que `mockPedidoFindMany` retorna objetos com `numeroPedidoEcommerce`
  mas o código de produção não lê esse campo) — os 23 testes antigos
  continuam passando (não tocamos a lógica ainda).

- [ ] **2. Implementar o mínimo para passar** — em
  `src/modules/tiny/services/tiny-expedicao.ts`:

  2a. No topo, importar o tipo e trocar as definições de tipo:
  ```ts
  import type { PedidoIdentificador } from "@/modules/tiny/schemas/bipagem-expedicao";
  ```
  (adicionar ao bloco de imports existente, junto com os outros `import`).

  Substituir:
  ```ts
  export type PedidoBipadoResultado = {
    numero: number;
    status: PedidoBipadoStatus;
    detalhe?: string;
  };

  export type AgrupamentoResultado = {
    id: number;
    cnpj: string | null;
    pedidos: number[];
  };
  ```
  por:
  ```ts
  export type PedidoBipadoResultado = {
    numero: PedidoIdentificador;
    status: PedidoBipadoStatus;
    detalhe?: string;
  };

  export type AgrupamentoResultado = {
    id: number;
    cnpj: string | null;
    pedidos: PedidoIdentificador[];
  };
  ```

  Substituir:
  ```ts
  type PedidoResolvido = { numero: number; connectionId: string; tinyPedidoId: number };
  ```
  por:
  ```ts
  type PedidoResolvido = { numero: PedidoIdentificador; connectionId: string; tinyPedidoId: number };
  ```

  2b. Assinatura da função pública:
  ```ts
  export async function expedirPedidosBipados(input: {
    pedidos: PedidoIdentificador[];
    cnpj?: string;
    correlationId?: string;
  }): Promise<ExpedicaoBipagemResultado> {
  ```
  (só troca `number[]` por `PedidoIdentificador[]`, resto igual).

  2c. Substituir o bloco "1. resolve no banco local (pedidos já
  sincronizados)" inteiro, desde `const locais = await prisma.pedido...`
  até o fechamento do `for (const numero of numeros) { ... }` (linhas ~136
  a ~193 do arquivo original), por:
  ```ts
  const numeros = [...new Set(input.pedidos)];
  const conexoes = await getConnectedConnections();
  const candidatas: ConexaoCandidata[] = input.cnpj
    ? conexoes.filter((c) => (c.sellerCnpj ?? "").replace(/\D/g, "") === input.cnpj)
    : conexoes;

  if (candidatas.length === 0) {
    const detalhe = input.cnpj
      ? "nenhuma empresa conectada com esse cnpj — reconecte em configurações"
      : "nenhuma empresa conectada ao tiny — conecte em configurações";
    return {
      agrupamentos: [],
      etiquetas: [],
      pedidos: numeros.map((numero) => ({ numero, status: "empresa_desconectada", detalhe })),
    };
  }

  const cnpjPorConexao = new Map(candidatas.map((c) => [c.id, c.sellerCnpj]));
  const resultados = new Map<PedidoIdentificador, PedidoBipadoResultado>();

  // 1. resolve no banco local (pedidos já sincronizados). `number` busca
  // por numeroPedido (número interno do Tiny); `string` busca por
  // numeroPedidoEcommerce (número do pedido no marketplace, extraído do
  // "Nº EC" do PDF de separação). A API do Tiny não filtra pedidos por
  // numeroPedidoEcommerce, então busca ao vivo (abaixo) só existe para
  // number — string que não bate localmente vai direto a nao_encontrado.
  const numerosInt = numeros.filter((n): n is number => typeof n === "number");
  const numerosEc = numeros.filter((n): n is string => typeof n === "string");

  const condicoesLocais: Array<Record<string, unknown>> = [];
  if (numerosInt.length > 0) {
    condicoesLocais.push({ numeroPedido: { in: numerosInt } });
  }
  if (numerosEc.length > 0) {
    condicoesLocais.push({ numeroPedidoEcommerce: { in: numerosEc } });
  }

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

  const locaisPorNumero = new Map<PedidoIdentificador, PedidoResolvido[]>();
  function indexarLocal(chave: PedidoIdentificador, pedido: PedidoResolvido) {
    const lista = locaisPorNumero.get(chave) ?? [];
    lista.push(pedido);
    locaisPorNumero.set(chave, lista);
  }
  for (const pedido of locais) {
    if (!pedido.connectionId) {
      continue;
    }
    if (numerosInt.includes(pedido.numeroPedido)) {
      indexarLocal(pedido.numeroPedido, {
        numero: pedido.numeroPedido,
        connectionId: pedido.connectionId,
        tinyPedidoId: pedido.tinyId,
      });
    }
    if (pedido.numeroPedidoEcommerce && numerosEc.includes(pedido.numeroPedidoEcommerce)) {
      indexarLocal(pedido.numeroPedidoEcommerce, {
        numero: pedido.numeroPedidoEcommerce,
        connectionId: pedido.connectionId,
        tinyPedidoId: pedido.tinyId,
      });
    }
  }

  const resolvidos: PedidoResolvido[] = [];
  for (const numero of numeros) {
    let matches = locaisPorNumero.get(numero) ?? [];
    let todasFalharam = false;
    if (matches.length === 0 && typeof numero === "number") {
      const resolucao = await resolverAoVivo(numero, candidatas, correlationId);
      matches = resolucao.matches;
      todasFalharam = resolucao.todasFalharam;
    }
    if (matches.length === 0 && todasFalharam) {
      resultados.set(numero, {
        numero,
        status: "erro_busca",
        detalhe: "falha ao consultar o tiny (rede ou serviço indisponível) — tente novamente",
      });
      continue;
    }
    if (matches.length === 0) {
      resultados.set(numero, {
        numero,
        status: "nao_encontrado",
        detalhe: "pedido não encontrado no banco local nem no tiny",
      });
      continue;
    }
    if (matches.length > 1) {
      resultados.set(numero, {
        numero,
        status: "ambiguo",
        detalhe: "número existe em mais de uma empresa — informe o cnpj",
      });
      continue;
    }
    resolvidos.push(matches[0]);
  }
  ```
  Atenção: `const correlationId = input.correlationId ?? randomUUID();` (linha
  logo antes de `const numeros = ...` no arquivo original) **permanece
  intocada, antes** deste bloco — só o bloco a partir de `const numeros =
  [...new Set(input.pedidos)];` está sendo substituído.

  2d. Mais abaixo no mesmo arquivo, a declaração do Map `antigos` tem tipo
  `numeros: number[]` — trocar para:
  ```ts
  const antigos = new Map<
    string,
    { connectionId: string; idAgrupamento: number; numeros: PedidoIdentificador[] }
  >();
  ```
  (resto da função `registrarJaExpedido` e tudo daí pra baixo não muda —
  já opera genericamente sobre `pedido.numero`).

- [ ] **3. Rodar e ver passar** — `npx vitest run
  src/modules/tiny/services/tiny-expedicao.test.ts` — todos os 27 testes
  verdes (23 antigos + 4 novos). Se algum teste antigo quebrar, é sinal de
  que a reescrita do bloco 1 mudou comportamento para `number` — comparar
  com o bloco original linha a linha antes de seguir.

- [ ] **4. Commit**:
  ```
  git add src/modules/tiny/services/tiny-expedicao.ts src/modules/tiny/services/tiny-expedicao.test.ts
  git commit -m "feat(bipagem): resolve pedido por numeroPedidoEcommerce quando o identificador vem como string"
  ```

---

## Tarefa 3 (SellInfoTurbo): atualizar documentação OpenAPI ✅ CONCLUÍDA

- **depende-de**: [Tarefa 1]
- **requisito**: entregável de documentação — a spec pública da API
  (`/api/bipagem/openapi`, consumida pelo Swagger UI em `/api/bipagem/docs`)
  não pode continuar dizendo que `pedidos` só aceita inteiro.
- **decisões relevantes**: nenhuma nova; só reflete a Tarefa 1.
- **interfaces**: nenhuma (documentação estática).
- **arquivos**:
  - Modificar: `SellInfoTurbo/src/app/api/bipagem/openapi/route.ts`
  - Modificar: `SellInfoTurbo/src/app/api/bipagem/openapi/route.test.ts`
- **done quando**: `npx vitest run src/app/api/bipagem/openapi/route.test.ts` verde.

Passos:

- [ ] **1. Escrever o teste que falha** — adicionar a
  `route.test.ts` (dentro do `describe`):
  ```ts
  it("documenta pedidos como numero interno OU identificador de e-commerce", () => {
    return GET().then(async (res) => {
      const body = await res.json();
      const itemSchema = body.components.schemas.ExpedicaoRequest.properties.pedidos.items;
      expect(itemSchema.oneOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "integer" }),
          expect.objectContaining({ type: "string" }),
        ]),
      );
    });
  });
  ```

- [ ] **1b. Rodar e ver falhar** —
  `npx vitest run src/app/api/bipagem/openapi/route.test.ts` — falha porque
  `items` hoje é `{ type: "integer", minimum: 1 }`, sem `oneOf`.

- [ ] **2. Implementar** — em `openapi/route.ts`, dentro de
  `ExpedicaoRequest.properties.pedidos`, substituir:
  ```ts
          pedidos: {
            type: "array",
            items: { type: "integer", minimum: 1 },
            minItems: 1,
            maxItems: 50,
            description: "Números do pedido Tiny, como no PDF de separação.",
          },
  ```
  por:
  ```ts
          pedidos: {
            type: "array",
            items: {
              oneOf: [
                { type: "integer", minimum: 1, description: "Número interno do pedido no Tiny." },
                {
                  type: "string",
                  minLength: 1,
                  description:
                    "Número do pedido no e-commerce/marketplace (\"Nº EC\" do PDF de " +
                    "separação — formato varia por canal: Mercado Livre, Shopee, " +
                    "Magalu, Amazon, TikTok Shop, ...).",
                },
              ],
            },
            minItems: 1,
            maxItems: 50,
            description:
              "Números de pedido — aceita o número interno do Tiny (integer) ou o " +
              "número do pedido no e-commerce (string), como aparece no PDF de " +
              "separação.",
          },
  ```
  Também atualizar o `example` da rota POST (linha ~30) para mostrar os dois
  casos:
  ```ts
              example: { pedidos: [12345, "LU-1550370116151430"], cnpj: "11.222.333/0001-44" },
  ```
  E o `PedidoResultado.properties.numero` (que hoje é só `{ type: "integer"
  }`) para:
  ```ts
          numero: { oneOf: [{ type: "integer" }, { type: "string" }] },
  ```

- [ ] **3. Rodar e ver passar** —
  `npx vitest run src/app/api/bipagem/openapi/route.test.ts` — 3/3 verde
  (2 testes antigos + 1 novo).

- [ ] **4. Commit**:
  ```
  git add src/app/api/bipagem/openapi/route.ts src/app/api/bipagem/openapi/route.test.ts
  git commit -m "docs(bipagem): documenta pedidos aceitando numero interno ou identificador de e-commerce"
  ```

---

## Tarefa 4 (expedicao): função pura de normalização do identificador de pedido ✅ CONCLUÍDA

- **depende-de**: []
- **requisito**: "0. (...) O SISTEMA DEVE enviar esse valor como
  identificador de e-commerce (string) ao proxy (...)" — pré-requisito: ter
  uma validação/normalização testável que não seja `parseInt`.
- **decisões relevantes**: `app.js` roda no browser e carrega tudo no
  top-level (`document.addEventListener`, `new ExpedicaoDB()` no
  construtor chama `indexedDB`) — não dá pra `require('./app.js')` em Node
  sem shim de DOM/IndexedDB. Por isso a função pura vai num arquivo NOVO
  (`bipagem-utils.js`), mesmo padrão de `pdf-parser.js` (carregado via
  `<script>` separado, sem depender de DOM), o que permite testar com
  `node --test` puro, sem instalar framework nenhum. Projeto não tinha
  nenhum teste automatizado até agora (`package.json` tinha só um
  `"test"` placeholder que sempre falhava) — esta tarefa também corrige
  isso.
- **interfaces**:
  - produz: `normalizarIdentificadorPedido(valor: unknown): string | null`
    — usada pela Tarefa 5 (`app.js`).
- **arquivos**:
  - Criar: `expedicao/bipagem-utils.js`
  - Criar: `expedicao/bipagem-utils.test.js`
  - Modificar: `expedicao/package.json` (script `test`)
- **done quando**: `npm test` roda e passa 7/7.

Passos:

- [ ] **1. Escrever o teste que falha** — `expedicao/bipagem-utils.test.js`:
  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { normalizarIdentificadorPedido } = require('./bipagem-utils.js');

  test('aceita numero puro do Mercado Livre/TikTok Shop', () => {
      assert.equal(normalizarIdentificadorPedido('2000013866459793'), '2000013866459793');
  });

  test('aceita identificador alfanumerico do Shopee', () => {
      assert.equal(normalizarIdentificadorPedido('26070606BSBAKE'), '26070606BSBAKE');
  });

  test('aceita identificador com prefixo do Magalu', () => {
      assert.equal(normalizarIdentificadorPedido('LU-1550370116151430'), 'LU-1550370116151430');
  });

  test('aceita identificador com hifens da Amazon', () => {
      assert.equal(normalizarIdentificadorPedido('702-9802415-7265855'), '702-9802415-7265855');
  });

  test('rejeita vazio, null e undefined', () => {
      assert.equal(normalizarIdentificadorPedido(''), null);
      assert.equal(normalizarIdentificadorPedido(null), null);
      assert.equal(normalizarIdentificadorPedido(undefined), null);
  });

  test('rejeita o placeholder "Sem Pedido" usado pelo pdf-parser quando falta Nº EC', () => {
      assert.equal(normalizarIdentificadorPedido('Sem Pedido'), null);
  });

  test('remove espaco nas bordas', () => {
      assert.equal(normalizarIdentificadorPedido('  LU-123  '), 'LU-123');
  });
  ```

- [ ] **1b. Rodar e ver falhar** — `node --test bipagem-utils.test.js`
  (executado de dentro de `c:\Users\Italo Barros\workspace\VTURBO\expedicao`).
  Esperado: erro de módulo não encontrado (`bipagem-utils.js` ainda não existe).

- [ ] **2. Implementar o mínimo para passar** — `expedicao/bipagem-utils.js`:
  ```js
  // Funções puras compartilhadas pela integração de bipagem (Tiny/SellInfoTurbo).
  // Carregado via <script> no index.html, antes de app.js — sem dependência de
  // DOM, testável isoladamente com `node --test`.

  function normalizarIdentificadorPedido(valor) {
      const texto = String(valor ?? '').trim();
      if (!texto || texto === 'Sem Pedido') {
          return null;
      }
      return texto;
  }

  if (typeof module !== 'undefined' && module.exports) {
      module.exports = { normalizarIdentificadorPedido };
  }
  ```

- [ ] **3. Rodar e ver passar** — `node --test bipagem-utils.test.js` — 7/7 verde.

- [ ] **4. Atualizar `package.json`** — trocar:
  ```json
      "test": "echo \"Error: no test specified\" && exit 1",
  ```
  por:
  ```json
      "test": "node --test *.test.js",
  ```
  Rodar `npm test` a partir da raiz do projeto e confirmar 7/7 verde
  também por esse caminho.

- [ ] **5. Commit**:
  ```
  git add bipagem-utils.js bipagem-utils.test.js package.json
  git commit -m "test: adiciona normalizarIdentificadorPedido com testes node --test, primeira suite automatizada do projeto"
  ```

---

## Tarefa 5 (expedicao): app.js usa o identificador normalizado, para de tentar parseInt ✅ CONCLUÍDA

- **depende-de**: [Tarefa 4]
- **requisito**: "0. QUANDO o operador bipa o último item de um pedido cujo
  `ec` veio do PDF (...) O SISTEMA DEVE enviar esse valor como identificador
  de e-commerce (string) ao proxy (...)"
- **decisões relevantes**: nunca converter pra int, mesmo quando o valor é
  puramente numérico (ver Notas de sessão).
- **interfaces**:
  - consome: `normalizarIdentificadorPedido` (Tarefa 4, global via script
    tag — Tarefa 6 adiciona o `<script>`).
- **arquivos**:
  - Modificar: `expedicao/app.js`
- **done quando**: leitura manual confirma que `solicitarEtiquetaTiny` não
  chama mais `parseInt`/`isNaN` no identificador, e o payload manda o valor
  normalizado como string. (Sem teste automatizado possível aqui — função
  depende de `fetch`/`localStorage`/DOM; cobertura fica na Tarefa 4, que
  isola a única lógica pura desta mudança, e em teste manual na fase e2e.)

Passos:

- [ ] **1. Localizar o trecho exato em `app.js`** (dentro de
  `async function solicitarEtiquetaTiny(numeroPedido, cnpj) { ... }`),
  substituir:
  ```js
      // Verifica se já foi impressa (deduplicação)
      if (tinyPrintedOrders.has(numeroPedido)) {
          console.log(`Tiny: etiqueta já solicitada para ${numeroPedido}`);
          return;
      }
      
      // Valida que o número do pedido é um inteiro válido
      const pedidoNum = parseInt(numeroPedido, 10);
      if (isNaN(pedidoNum) || pedidoNum < 1) {
          console.warn('Tiny: número de pedido inválido:', numeroPedido);
          showToast('Erro na Etiqueta', `Número de pedido inválido: ${numeroPedido}. Verifique a leitura do PDF.`, 'warning');
          return;
      }
      
      try {
          showToast('Imprimindo Etiqueta', `Solicitando etiqueta para pedido ${numeroPedido}...`, 'success');
          
          const payload = { 
              pedidos: [pedidoNum], 
              cnpj: cnpj || '',
              token: token  // Enviado via body para o proxy server-side
          };
  ```
  por:
  ```js
      // Normaliza o identificador do pedido no e-commerce (Nº EC do PDF —
      // Mercado Livre, Shopee, Magalu, Amazon, TikTok Shop... nunca o número
      // interno do Tiny, que o expedicao não tem como conhecer).
      const pedidoId = normalizarIdentificadorPedido(numeroPedido);
      if (!pedidoId) {
          console.warn('Tiny: pedido sem identificador de e-commerce (Nº EC ausente no PDF):', numeroPedido);
          showToast('Erro na Etiqueta', `Pedido sem número de e-commerce identificável. Verifique a leitura do PDF.`, 'warning');
          return;
      }

      // Verifica se já foi impressa (deduplicação)
      if (tinyPrintedOrders.has(pedidoId)) {
          console.log(`Tiny: etiqueta já solicitada para ${pedidoId}`);
          return;
      }

      try {
          showToast('Imprimindo Etiqueta', `Solicitando etiqueta para pedido ${pedidoId}...`, 'success');
          
          const payload = { 
              pedidos: [pedidoId], 
              cnpj: cnpj || '',
              token: token  // Enviado via body para o proxy server-side
          };
  ```
  (repare que a ordem mudou: a validação do identificador agora vem ANTES
  da checagem de deduplicação, porque `tinyPrintedOrders` precisa da chave
  já normalizada — senão `"123"` bipado duas vezes com espaços diferentes
  driblaria a dedup).

- [ ] **2. Atualizar as demais referências a `numeroPedido`/`pedidoNum`
  dentro da mesma função** — no restante de `solicitarEtiquetaTiny`
  (blocos de log e tratamento de resposta), trocar toda ocorrência de
  `numeroPedido` usada como chave/valor de negócio por `pedidoId` (as
  mensagens de toast/console que só exibem o valor continuam usando
  `numeroPedido` normalmente, já que é o mesmo texto — só o `tinyPrintedOrders.add(numeroPedido)` 
  no bloco de sucesso e o `tinyPrintedOrders.add(numeroPedido)` no bloco
  "expedido sem etiqueta" precisam virar `tinyPrintedOrders.add(pedidoId)`).

- [ ] **3. Verificação manual (sem framework automatizado aqui)** — abrir
  `expedicao/app.js` e conferir com os olhos que:
  - Não sobrou nenhum `parseInt(numeroPedido` nem `isNaN(pedidoNum)` na
    função.
  - `payload.pedidos` é `[pedidoId]` (string), nunca `[pedidoNum]` (era int).
  - `tinyPrintedOrders.has`/`.add` usam `pedidoId` consistentemente.

- [ ] **4. Commit**:
  ```
  git add app.js
  git commit -m "fix(bipagem): para de tentar parseInt no numero do pedido, manda sempre o identificador de e-commerce como string"
  ```

---

## Tarefa 6 (expedicao): carregar bipagem-utils.js no index.html ✅ CONCLUÍDA

- **depende-de**: [Tarefa 4]
- **requisito**: pré-requisito técnico da Tarefa 5 — `normalizarIdentificadorPedido`
  precisa existir como global no browser antes de `app.js` rodar.
- **decisões relevantes**: mesmo padrão de carregamento de `pdf-parser.js`
  (script tag simples, sem bundler).
- **interfaces**: nenhuma nova.
- **arquivos**:
  - Modificar: `expedicao/index.html`
- **done quando**: `<script src="bipagem-utils.js"></script>` aparece antes
  de `<script src="app.js"></script>` no HTML.

Passos:

- [ ] **1. Localizar a tag de `pdf-parser.js`/`app.js`** no final do
  `index.html` (grep `<script src="pdf-parser.js"` e `<script src="app.js"`
  para achar a posição exata) e adicionar a nova tag logo antes de `app.js`:
  ```html
      <script src="pdf-parser.js"></script>
      <script src="bipagem-utils.js"></script>
      <script src="app.js"></script>
  ```
  (ajustar para a ordem real encontrada no arquivo — `bipagem-utils.js`
  deve vir depois de `pdf-parser.js` e antes de `app.js`, nessa posição
  exata ou equivalente, desde que sempre antes de `app.js`).

- [ ] **2. Verificação manual** — abrir `expedicao/index.html` e conferir
  visualmente que a tag nova está presente e antes de `app.js`.

- [ ] **3. Commit**:
  ```
  git add index.html
  git commit -m "chore: carrega bipagem-utils.js antes de app.js"
  ```

---

## Tarefa 7 (expedicao): api.php — para de forçar intval e tira a chave hardcoded ✅ CONCLUÍDA

- **depende-de**: [Tarefa 5] (mesma forma de payload — `pedidos` como string)
- **requisito**:
  - "0. (...) enviar esse valor como identificador de e-commerce (string)
    ao proxy (...)" — o proxy PHP não pode forçar `intval` nisso.
  - "1. QUANDO o código-fonte de `api.php` é lido O SISTEMA NÃO DEVE conter
    nenhum valor de `BIPAGEM_API_KEY` real (hardcoded ou como fallback) —
    só leitura de variável de ambiente / arquivo de config fora da pasta
    pública e fora do Git."
  - "3. QUANDO o operador não tem token salvo E o servidor tem
    `BIPAGEM_API_KEY` configurada (...) O SISTEMA DEVE usar essa chave como
    fallback, exatamente como hoje."
  - "4. QUANDO o operador não tem token salvo E o servidor NÃO tem
    `BIPAGEM_API_KEY` configurada O SISTEMA DEVE recusar a chamada com HTTP
    401 e mensagem clara (...), em vez de usar um segredo escondido no
    código."
- **decisões relevantes**: a validação `if (!$bearerToken) { http_response_code(401); ...}`
  **já existe** no código atual — ela nunca dispara hoje só porque
  `BIPAGEM_API_KEY` sempre tem o valor hardcoded como fallback. Basta trocar
  a definição da constante para não ter mais hardcode; o fail-closed já
  funciona sem tocar mais nada.
- **interfaces**: nenhuma nova (é um script PHP standalone, sem módulos).
- **arquivos**:
  - Modificar: `expedicao/api.php`
- **done quando**: leitura manual confirma zero string de chave real no
  arquivo, e o fluxo de fallback/fail-closed descrito nos critérios acima.
  (Sem teste automatizado possível — PHP não está instalado nesta máquina;
  registrar isso como limitação conhecida na fase de validação, com pedido
  de teste manual do humano em produção.)

Passos:

- [ ] **1. Trocar a definição da constante** — em `api.php`, linha ~45,
  substituir:
  ```php
  define('BIPAGEM_API_KEY', getenv('BIPAGEM_API_KEY') ?: '[CHAVE-DE-PRODUCAO-REAL-REDACTED]');
  ```
  por:
  ```php
  // BIPAGEM_API_KEY nunca fica hardcoded aqui — só env real (getenv) ou um
  // arquivo de config FORA da pasta pública e fora do Git (mesmo padrão do
  // banco SQLite em '../expedicao.db'). Sem nenhum dos dois, a constante
  // fica vazia e o endpoint bipagem_expedicao recusa com 401 (ver validação
  // "if (!$bearerToken)" mais abaixo) em vez de usar um segredo escondido.
  function carregarBipagemApiKeyDeArquivoConfig() {
      $configFile = __DIR__ . '/../bipagem-config.php';
      if (!file_exists($configFile)) {
          return '';
      }
      $config = require $configFile;
      return is_array($config) && isset($config['BIPAGEM_API_KEY']) ? $config['BIPAGEM_API_KEY'] : '';
  }
  define('BIPAGEM_API_KEY', getenv('BIPAGEM_API_KEY') ?: carregarBipagemApiKeyDeArquivoConfig());
  ```

- [ ] **2. Trocar o `array_map('intval', ...)` no endpoint `bipagem_expedicao`**
  — substituir:
  ```php
              $pedidos = isset($input['pedidos']) ? array_map('intval', $input['pedidos']) : [];
  ```
  por:
  ```php
              $pedidos = isset($input['pedidos'])
                  ? array_map(function ($p) { return sanitize(trim(strval($p))); }, $input['pedidos'])
                  : [];
  ```

- [ ] **3. Verificação manual** — abrir `api.php` e conferir:
  - `grep -n "bipagem_key_producao"` não retorna nada (`grep -n "bipagem_key_producao" api.php`).
  - `grep -n "intval" api.php` não aparece mais dentro do case `bipagem_expedicao`
    (outras rotas que já usavam `intval` para IDs numéricos internos — como
    `$id = intval($input['id'])` em `delete_loja`/`marcar_despachante_concluido`
    — continuam intactas; são identificadores internos do próprio banco
    expedicao, não do pedido bipado).
  - O bloco `if (!$bearerToken) { http_response_code(401); ... }` continua
    exatamente como estava (não precisa mudar — já é o fail-closed certo).

- [ ] **4. Documentar o passo manual pendente** — adicionar comentário logo
  acima da função `carregarBipagemApiKeyDeArquivoConfig`:
  ```php
  // AÇÃO MANUAL NECESSÁRIA NO SERVIDOR DE PRODUÇÃO (HostGator) para não
  // quebrar a expedição de etiqueta: crie o arquivo
  // <pasta-pai-da-pasta-publica>/bipagem-config.php (fora do Git, fora da
  // pasta pública) com:
  //   <?php return ['BIPAGEM_API_KEY' => 'SUA_CHAVE_AQUI'];
  // Ou, se o hosting suportar variável de ambiente (SetEnv no .htaccess,
  // ou painel do HostGator), defina BIPAGEM_API_KEY lá em vez do arquivo.
  // Sem um dos dois, a bipagem passa a responder 401 até isso ser feito.
  ```

- [ ] **5. Commit**:
  ```
  git add api.php
  git commit -m "fix(seguranca): remove chave BIPAGEM_API_KEY hardcoded do api.php, usa env ou config fora do git; para de forcar intval no pedido bipado"
  ```

---

## Tarefa 8 (expedicao): .env e .env.example ✅ CONCLUÍDA

- **depende-de**: []
- **requisito**: "6. QUANDO um desenvolvedor abre o projeto pela primeira
  vez O SISTEMA DEVE ter `.env.example` documentando `BIPAGEM_API_KEY`
  (placeholder) e o projeto deve ter um `.env` local com placeholder —
  nunca com a chave real."
- **decisões relevantes**: instrução global do usuário — env nova de
  feature ganha entrada em `.env` (placeholder, por ser segredo) e
  `.env.example`.
- **interfaces**: nenhuma.
- **arquivos**:
  - Criar: `expedicao/.env`
  - Criar: `expedicao/.env.example`
  - Verificar: `expedicao/.gitignore` (já ignora `.env`, confirmar).
- **done quando**: os dois arquivos existem, `.env` tem só placeholder, e
  `git check-ignore .env` confirma que `.env` não vai ser commitado.

Passos:

- [ ] **1. Conferir `.gitignore`** — `grep -n "\.env" .gitignore`. Se `.env`
  não estiver listado, adicionar a linha `.env` (o README já cita `.env`
  como ignorado — confirmar que bate com o arquivo real).

- [ ] **2. Criar `expedicao/.env.example`**:
  ```
  # Chave usada pelo api.php para autenticar no proxy de bipagem quando o
  # operador não tem token salvo no localStorage do navegador (ver popup ⚙️
  # de configurações). Também pode ser lida de ../bipagem-config.php fora
  # da pasta pública — ver comentário em api.php.
  BIPAGEM_API_KEY=__coloque_a_chave_aqui__
  ```

- [ ] **3. Criar `expedicao/.env` (local, com placeholder — nunca a chave
  real)**:
  ```
  BIPAGEM_API_KEY=__coloque_a_chave_aqui__
  ```

- [ ] **4. Verificar que não vai vazar** — `git check-ignore -v .env`
  (esperado: retorna a regra do `.gitignore` que casa com `.env`; se não
  retornar nada, `.gitignore` precisa da entrada `.env` antes de seguir).

- [ ] **5. Commit** (só o `.env.example` — `.env` fica de fora por ser
  ignorado):
  ```
  git add .env.example
  git commit -m "docs(env): documenta BIPAGEM_API_KEY em .env.example"
  ```

---

## Tarefa 9 (expedicao): atualizar AI_INSTRUCTIONS.md ✅ CONCLUÍDA

- **depende-de**: [Tarefa 2, Tarefa 7] (documentação deve refletir o estado
  final já corrigido dos dois lados)
- **requisito**:
  - "7. QUANDO alguém lê `AI_INSTRUCTIONS.md` §10 (...) O SISTEMA
    (documento) DEVE refletir que a integração já está implementada —
    descrever o fluxo real (...), não mais 'Planejado (aguardando
    informações do usuário)'."
  - "8. QUANDO o humano lê a documentação desta correção O SISTEMA
    (documento) DEVE listar explicitamente o passo manual que falta no
    servidor de produção (...)."
- **decisões relevantes**: nenhuma nova.
- **interfaces**: nenhuma.
- **arquivos**:
  - Modificar: `expedicao/AI_INSTRUCTIONS.md` (seção 10, linhas ~392-464)
- **done quando**: seção 10 descreve o fluxo real implementado (não mais
  "planejado"), menciona `numeroPedidoEcommerce` vs número interno do Tiny,
  e lista o passo manual do `bipagem-config.php`/env em produção.

Passos:

- [ ] **1. Substituir a seção 10 inteira** (do `## 10. Plano Futuro:
  Integração Tiny — Impressão de Etiquetas` até o final do arquivo, linha
  ~392 até ~463, antes do rodapé `*Documento gerado em...*`) por:
  ```markdown
  ## 10. Integração Bipagem — SellInfoTurbo / Tiny ERP

  **Status:** ✅ Implementado (commit `e9912a7` + correções de
  2026-08-19 — ver nó `bipagem-tiny-sellinfo` em `GRAFO.md`)

  ### Visão Geral

  Ao expedir um item (bipagem, conferência manual ou conferência sem EAN),
  o sistema dispara automaticamente a expedição do pedido e a geração de
  etiqueta via API de bipagem do projeto **SellInfoTurbo**, que por sua vez
  fala com o Tiny ERP.

  ### Fluxo real

  ```
  Item vira "expedido" (processBarcodeRead / manualAddUnit / confirmNoEanYes)
      ↓
  tinyEnviarEtiqueta(item)  — só dispara se expedicao_tiny_enabled='1' ou modo mock
      ↓
  solicitarEtiquetaTiny(item.ec, cnpjDaLoja)
      ↓ normalizarIdentificadorPedido(item.ec)  [bipagem-utils.js]
      ↓ (dedup via tinyPrintedOrders)
  bipagerFetch() → POST api.php?action=bipagem_expedicao  (proxy, evita CORS)
      ↓ (server-side, cURL)
  POST https://dashvturbo.kn8x.com.br/api/bipagem/expedicao
      Authorization: Bearer <token do localStorage ou BIPAGEM_API_KEY do servidor>
      body: { pedidos: ["<Nº EC do PDF>"], cnpj }
      ↓
  SellInfoTurbo resolve o pedido por numeroPedidoEcommerce, expede no Tiny,
  devolve { agrupamentos, etiquetas, pedidos: [{ numero, status, detalhe }] }
      ↓
  Etiqueta(s) abrem em nova aba; toast de sucesso/erro conforme status
  ```

  ### Identificador do pedido — ponto crítico

  O campo `ec` extraído do PDF (regex `Nº\s+EC\s+(\S+)` em
  `pdf-parser.js`) é o número do pedido **na plataforma de venda**, nunca o
  número interno do Tiny. Formato varia por canal (exemplos reais de
  `teste.pdf`):

  | Canal | Nº EC |
  |---|---|
  | Mercado Livre | `2000013866459793` |
  | Shopee | `26070606BSBAKE` |
  | Magalu | `LU-1550370116151430` |
  | Amazon | `702-9802415-7265855` |
  | TikTok Shop | `584878309630969099` |

  Por isso o app **nunca** converte esse valor para inteiro — sempre manda
  como string (`normalizarIdentificadorPedido`), e o SellInfoTurbo resolve
  pelo campo `numeroPedidoEcommerce` (não pelo número interno do Tiny).

  ### Configuração necessária (popup ⚙️ de configurações)

  1. **Ativar impressão automática** (`popup-config-tiny-enabled`) — sem
     isso, `tinyEnviarEtiqueta` nunca dispara chamada nenhuma (fica só um
     log `🐞` no console, sem toast de erro — pegadinha comum ao depurar).
  2. **Token** (`popup-tiny-token`) — a `BIPAGEM_API_KEY` do SellInfoTurbo.
     Opcional se o servidor tiver a env/arquivo de config (ver abaixo).
  3. **Modo simulação** (`popup-config-bipagem-mock`) — não chama a API
     real, útil para testar o fluxo sem tocar produção.

  ### Ação manual pendente em produção (HostGator)

  `api.php` não tem mais nenhuma chave hardcoded. Sem token do operador e
  sem `BIPAGEM_API_KEY` configurada no servidor, a bipagem responde 401.
  Configure UMA das duas opções no servidor de produção:

  - Variável de ambiente `BIPAGEM_API_KEY` (se o hosting suportar `SetEnv`
    no `.htaccess` ou painel), OU
  - Arquivo `bipagem-config.php` **fora da pasta pública** (irmão de
    `../expedicao.db`), com `<?php return ['BIPAGEM_API_KEY' =>
    'SUA_CHAVE'];`.

  A chave anterior (hardcoded no commit `e9912a7`, removida do código nesta
  correção) era uma chave real de produção — o humano é responsável por
  rotacioná-la no SellInfoTurbo separadamente.
  ```

- [ ] **2. Verificação manual** — conferir que o índice no topo do arquivo
  (`## 📋 Índice`, item 8 se existir referência à seção 10 antiga) não
  ficou desatualizado; ajustar o texto do link se necessário.

- [ ] **3. Commit**:
  ```
  git add AI_INSTRUCTIONS.md
  git commit -m "docs: atualiza secao 10 do AI_INSTRUCTIONS com o fluxo real da integracao bipagem e a acao manual pendente em producao"
  ```

<!-- Proibições (falhas de plano): TBD; TODO; "tratar erros adequadamente";
"similar à tarefa N" (repita o código); passo que descreve sem mostrar como;
referência a função/tipo não definido em nenhuma tarefa. -->
