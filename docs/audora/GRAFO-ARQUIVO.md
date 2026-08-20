# GRAFO-ARQUIVO — Sistema de Expedição de Vendas (expedicao)

> Nós `entregue` compactados. Corpo completo aqui; 1 linha correspondente no
> índice do `GRAFO.md`. Origem `inferido` = reconstruído no bootstrap
> brownfield a partir de README.md/AI_INSTRUCTIONS.md/código; não confirmado
> linha a linha pelo humano.

### core-conferencia-expedicao

- **id**: core-conferencia-expedicao
- **estado**: entregue
- **origem**: inferido
- **depende-de**: []
- **objetivo**: Operador importa PDF de separação, confere fisicamente cada
  item bipando o código de barras (leitor USB ou câmera via html5-qrcode) e
  o sistema decrementa quantidade, valida e registra em log de auditoria.
- **criterios-aceite**:
  - QUANDO um PDF de separação é importado O SISTEMA DEVE extrair itens com
    nota fiscal, canal de venda, SKU, EAN e quantidade (`pdf-parser.js`).
  - QUANDO o operador bipa um EAN que pertence à lista O SISTEMA DEVE
    decrementar a quantidade restante e dar feedback sonoro/visual de
    sucesso.
  - QUANDO o operador bipa um EAN que não pertence à lista O SISTEMA DEVE
    recusar, tremer a tela e emitir beep grave de erro.
  - QUANDO todos os itens de um despachante são expedidos O SISTEMA DEVE
    marcá-lo como concluído.
  - Suporta filtros (todos/pendentes/concluídos), ordenação, busca textual e
    exportação de logs em CSV.
- **fora-de-escopo**: Integração com ERPs/marketplaces externos (nó
  `bipagem-tiny-sellinfo`).
- **decisoes**: —
- **atualizado-em**: 2026-08-18

### persistencia-multi-modo

- **id**: persistencia-multi-modo
- **estado**: entregue
- **origem**: inferido
- **depende-de**: []
- **objetivo**: O sistema opera em 3 modos de persistência conforme o
  ambiente: IndexedDB local (`localhost`/`file://`), `api.php` + SQLite
  remoto (produção HostGator), e fila offline em `localStorage` quando o
  remoto fica indisponível, sincronizada automaticamente ao reconectar.
- **criterios-aceite**:
  - QUANDO acessado em `localhost:8080` ou `file://` O SISTEMA DEVE usar
    IndexedDB (`ExpedicaoDB`) sem depender de rede.
  - QUANDO publicado no domínio de produção O SISTEMA DEVE usar `api.php`
    como fonte de verdade (SQLite fora da pasta pública).
  - QUANDO uma chamada remota falha O SISTEMA DEVE enfileirar a operação
    localmente e sincronizar quando a conexão voltar.
- **fora-de-escopo**: —
- **decisoes**: —
- **atualizado-em**: 2026-08-18

### admin-despachantes-lojas

- **id**: admin-despachantes-lojas
- **estado**: entregue
- **origem**: inferido
- **depende-de**: []
- **objetivo**: Área de administração permite cadastrar/listar/excluir
  despachantes (listas de expedição, com prazo limite e CNPJ da loja) e
  lojas (nome + CNPJ), usadas para vincular cada PDF importado à empresa
  correta.
- **criterios-aceite**:
  - CRUD de despachantes via `add_despachante`, `get_despachantes_ativos`,
    `get_all_despachantes`, `marcar_despachante_concluido`,
    `delete_despachante`.
  - CRUD de lojas via `add_loja`, `get_all_lojas`, `delete_loja`.
- **fora-de-escopo**: —
- **decisoes**: —
- **atualizado-em**: 2026-08-18

### seguranca-api-fase1

- **id**: seguranca-api-fase1
- **estado**: entregue
- **origem**: inferido
- **depende-de**: []
- **objetivo**: Correções de segurança "Fase 1" do `api.php`: sanitização de
  inputs (`strip_tags` + `htmlspecialchars`), banco SQLite movido para fora
  da pasta pública, CORS restrito a origens específicas, autenticação por
  token Bearer nas rotas de escrita (POST).
- **criterios-aceite**:
  - Rotas GET (leitura) não exigem token; rotas POST (escrita) exigem
    header `Authorization: Bearer <API_TOKEN>`.
  - `Access-Control-Allow-Origin` restrito à lista `$allowed_origins`.
  - Banco em `__DIR__ . '/../expedicao.db'`, com migração automática do
    local antigo se encontrado.
- **fora-de-escopo**: Credenciais/token ainda hardcoded como fallback no
  código-fonte (`api.php`) — risco levantado e tratado pelo nó
  `bipagem-tiny-sellinfo` para o caso específico de `BIPAGEM_API_KEY`.
- **decisoes**: —
- **atualizado-em**: 2026-08-18

### deploy-continuo-ftp

- **id**: deploy-continuo-ftp
- **estado**: entregue
- **origem**: inferido
- **depende-de**: []
- **objetivo**: `server.js` observa alterações nos arquivos da aplicação
  (`index.html`, `index.css`, `app.js`, `pdf-parser.js`) e dispara upload
  automático via FTP (`deploy.js`, `basic-ftp`) para o servidor de produção,
  usando uma whitelist de arquivos permitidos.
- **criterios-aceite**:
  - Arquivos sensíveis (`credencial.txt`, `server.js`, `package.json`, etc.)
    nunca são enviados via FTP.
  - Debounce de 1000ms evita disparos duplicados ao salvar.
- **fora-de-escopo**: —
- **decisoes**: —
- **atualizado-em**: 2026-08-18
