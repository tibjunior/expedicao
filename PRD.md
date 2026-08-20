# PRD — Sistema de Expedição de Vendas (expedicao)

> Documento de referência do produto. Reflete o estado **mergeado na
> `main`**. Trabalho em branches de feature não atualiza este arquivo — só
> merges/commits diretos na `main` disparam atualização.

**Última atualização:** 2026-08-18

---

## 1. O que o produto faz e para quem

SPA (Single Page Application) para expedição e conferência de vendas em
pequenos e-commerces. Fluxo:

1. Administrador importa um PDF de lista de separação (upload ou arquivo de
   teste).
2. Operador de galpão seleciona a lista (despachante) ativa.
3. Operador confere fisicamente cada item bipando o EAN — leitor de código
   de barras USB físico ou câmera do celular/computador.
4. O sistema valida se o EAN pertence à lista, decrementa a quantidade,
   registra em log de auditoria e dá feedback sonoro/visual imediato
   (sucesso ou erro).
5. Ao concluir todos os itens, a lista é marcada como finalizada; logs podem
   ser exportados em CSV.

Opcionalmente, ao expedir um item o sistema pode disparar automaticamente a
expedição do pedido e a emissão de etiqueta de envio via integração com a
API de bipagem do projeto **SellInfoTurbo** (que por sua vez fala com o Tiny
ERP).

Público-alvo: operadores de galpão/logística de pequenos e-commerces.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, Vanilla CSS (glassmorphism, tema escuro, responsivo), JavaScript ES2020+ — sem framework/bundler |
| Parsing de PDF | Mozilla PDF.js (client-side, sem backend) |
| Leitura de código de barras | Input físico USB + câmera via `html5-qrcode` |
| Áudio | Web Audio API (beeps sintetizados) |
| Persistência local | IndexedDB (`ExpedicaoDB`) |
| Backend remoto | PHP 8+ (`api.php`), SQLite (fora da pasta pública) |
| Dev/deploy | Node.js 18+ — `server.js` (servidor local + watcher) e `deploy.js` (`basic-ftp`) |
| Hospedagem produção | HostGator (FTP) |

Sem build step: os arquivos (`index.html`, `index.css`, `app.js`,
`pdf-parser.js`) são servidos diretamente, tanto local quanto em produção.

---

## 3. Arquitetura

### 3.1 Estrutura de arquivos

```
expedicao/
├── index.html          # SPA — interface principal
├── index.css           # Estilos globais
├── app.js              # Lógica principal do frontend
├── pdf-parser.js       # Extrator de dados do PDF (client-side)
├── api.php             # API REST em PHP (SQLite remoto, proxy Tiny/SellInfoTurbo)
├── server.js           # Servidor dev + watcher de auto-deploy FTP
├── deploy.js           # Script de deploy FTP (whitelist de arquivos)
├── .htaccess           # Proteção adicional do banco (Apache)
├── favicon.svg / logo.png
├── package.json
├── README.md
└── AI_INSTRUCTIONS.md  # Manual de referência detalhado para agentes de IA
```

### 3.2 Modos de operação

O sistema opera em 3 modos, decididos em runtime pelo hostname:

1. **Local (IndexedDB):** `localhost`/`127.0.0.1`/`file://` — banco no
   navegador, sem depender de rede.
2. **Remoto (`api.php` + SQLite):** produção — fonte de verdade fica no
   servidor PHP.
3. **Offline (fila):** quando o remoto fica indisponível, operações são
   enfileiradas em `localStorage` e sincronizadas automaticamente ao
   reconectar.

### 3.3 Fluxo de dados

```
[PDF] → pdf-parser.js → itens extraídos → IndexedDB (local) ou api.php (remoto)
                    ↓
   [Operador bipa EAN] → app.js:processBarcodeRead()
                    ↓
        [Match do item] → update no IndexedDB/api.php
                    ↓
        [Log de auditoria] → addLog()
                    ↓
   [Item expedido] → tinyEnviarEtiqueta() → api.php?action=bipagem_expedicao
                    ↓ (proxy server-side, evita CORS)
        API de bipagem do SellInfoTurbo (https://dashvturbo.kn8x.com.br)
                    ↓
        Tiny ERP expede o pedido e retorna etiqueta(s)
```

### 3.4 Integração externa — bipagem SellInfoTurbo

- `api.php?action=bipagem_expedicao` (POST, público para o frontend) recebe
  `{ pedidos: number[], cnpj?: string, token?: string }`, valida (máx. 50
  pedidos por chamada) e repassa via cURL server-side para
  `POST https://dashvturbo.kn8x.com.br/api/bipagem/expedicao` com header
  `Authorization: Bearer <token>`.
- Token vem do `localStorage` do operador (`expedicao_tiny_token`), enviado
  no body da chamada ao proxy; se ausente, o proxy usa o fallback
  `BIPAGEM_API_KEY` do servidor.
- No lado SellInfoTurbo, o endpoint valida a API key (comparação em tempo
  constante), valida o body com Zod (`pedidos: number[] 1..50`, `cnpj` de 14
  dígitos opcional) e delega para `expedirPedidosBipados` (módulo
  `tiny-expedicao`), retornando por pedido o status (`expedido` /
  `ja_expedido` / `expedido_sem_etiqueta` / erro) e as URLs de etiqueta.
- Frontend (`app.js`) dispara essa chamada em todos os caminhos que marcam
  um item como expedido (leitura por código de barras, conferência manual,
  conferência sem EAN), com deduplicação por número de pedido
  (`tinyPrintedOrders`) e um modo simulação/mock
  (`expedicao_bipagem_mock` no `localStorage`) que não bate na API real.
- Estado desta integração (revisão de segurança/config em andamento):
  ver `GRAFO.md`, nó `bipagem-tiny-sellinfo`.

---

## 4. Segurança — estado conhecido

Correções "Fase 1" já aplicadas em `api.php`: sanitização de inputs
(`strip_tags` + `htmlspecialchars`), banco SQLite fora da pasta pública,
CORS restrito a origens específicas, autenticação por token Bearer nas
rotas de escrita (GET de leitura fica aberto).

Pendências conhecidas (ver `AI_INSTRUCTIONS.md` §4-5 e nó
`bipagem-tiny-sellinfo` no `GRAFO.md` para o item específico da integração
Tiny/SellInfoTurbo):

- Credenciais/tokens com fallback hardcoded no código-fonte em vez de
  vir exclusivamente de variável de ambiente.
- Sem `.env`/`.env.example` documentando as envs do projeto (`API_TOKEN`,
  `BIPAGEM_API_KEY`, credenciais FTP).
- Senha FTP em `credencial.txt` em texto puro (fora do Git, mas sem
  criptografia).

---

## 5. Metas futuras

- Concluir auditoria de segurança da integração de bipagem com o
  SellInfoTurbo (chave hardcoded, `.env`, documentação) — em andamento, nó
  `bipagem-tiny-sellinfo` no `GRAFO.md`.
- PWA (Service Worker) para instalação e uso 100% offline.
- Relatório de produtividade por operador (itens/hora, meta vs. realizado).
- Roteirização/manifesto de transporte agrupado por CEP.
- Multi-empresa (tenant isolation por `empresa_id`) caso o sistema passe a
  atender mais de um cliente.

Roadmap detalhado e priorizado: ver `AI_INSTRUCTIONS.md` §8-9.
