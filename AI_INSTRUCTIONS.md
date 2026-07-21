# 🧠 Instruções para Agentes de IA — Sistema de Expedição

Este documento serve como **manual de referência primário** para qualquer agente de inteligência artificial que precise analisar, modificar ou dar manutenção neste projeto. Leia-o **antes** de qualquer alteração no código.

---

## 📋 Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura Técnica](#2-arquitetura-técnica)
3. [Funcionalidades Implementadas](#3-funcionalidades-implementadas)
4. [Falhas de Segurança Conhecidas](#4-falhas-de-segurança-conhecidas)
5. [Melhorias Recomendadas](#5-melhorias-recomendadas)
6. [Regras de Desenvolvimento](#6-regras-de-desenvolvimento)
7. [Deploy e Manutenção](#7-deploy-e-manutação)
8. [Próximos Passos Prioritários](#8-próximos-passos-prioritários)

---

## 1. Visão Geral do Sistema

**Nome:** Expedição Inteligente de Vendas  
**Propósito:** Sistema de expedição e conferência de vendas para pequenos e-commerces  
**Público-alvo:** Operadores de galpão/logística que conferem produtos antes do envio  

### Fluxo Principal do Usuário

1. **Administrador** importa um PDF de vendas (via upload ou arquivo de teste)
2. **Operador** seleciona a lista de um despachante
3. **Operador** bipa o código de barras (EAN) de cada produto usando:
   - Leitor físico (input de teclado)
   - Câmera do celular (biblioteca `html5-qrcode`)
4. **Sistema** confere se o EAN pertence à lista, decrementa a quantidade e registra no log
5. Ao finalizar todos os itens, o sistema marca a lista como concluída
6. **Gestor** pode exportar logs de auditoria em CSV

### Stack Tecnológica

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| HTML5 | - | Estrutura da SPA |
| CSS3 | - | Glassmorphism, tema escuro, responsivo |
| JavaScript (Vanilla) | ES2020+ | Toda a lógica do frontend |
| PDF.js (Mozilla) | 3.11.174 | Parsing de PDF no navegador |
| html5-qrcode | - | Leitura de código de barras pela câmera |
| IndexedDB | - | Banco local no navegador (modo offline) |
| PHP 8+ | - | API backend (api.php) |
| SQLite | - | Banco remoto na HostGator |
| Node.js | 18+ | Servidor de desenvolvimento + deploy automático |

---

## 2. Arquitetura Técnica

### Estrutura de Arquivos

```
/
├── index.html          # SPA — interface principal
├── index.css           # Estilos globais (glassmorphism, temas)
├── app.js              # Lógica principal (~3000 linhas)
├── pdf-parser.js       # Classe de extração de dados do PDF
├── api.php             # API REST em PHP (SQLite remoto)
├── server.js           # Servidor dev + watch + deploy FTP automático
├── deploy.js           # Script de deploy FTP manual
├── .htaccess           # Proteção do banco SQLite (Apache)
├── credencial.txt      # (IGNORADO) Credenciais FTP da HostGator
├── .gitignore          # Node, credencial, .env, Backup
├── favicon.svg         # Ícone do sistema
├── teste.pdf           # PDF de exemplo para testes
├── package.json        # Dependências Node (express, basic-ftp)
├── README.md           # Documentação básica
└── AI_INSTRUCTIONS.md  # ← VOCÊ ESTÁ AQUI
```

### Fluxo de Dados

```
[PDF] → pdf-parser.js → [Itens extraídos] → IndexedDB (local) ou api.php (remoto)
                    ↓
        [Operador bipa EAN] → app.js → processBarcodeRead()
                    ↓
            [Match item] → updateItem() (IndexedDB/api.php)
                    ↓
            [Log registrado] → addLog()
                    ↓
            [UI atualizada] → renderTable() + updateProgress()
```

### Estados da Aplicação

O sistema pode operar em **3 modos**:

1. **Local (IndexedDB):** Quando acessado via `file://` ou `localhost:8080` — usa banco no navegador
2. **Remoto (api.php):** Quando publicado na HostGator — usa SQLite via PHP
3. **Offline (Fila):** Quando o servidor remoto fica indisponível — operações são enfileiradas no `localStorage` e sincronizadas automaticamente ao voltar

---

## 3. Funcionalidades Implementadas

### Core (Funcionalidades Originais)

| Funcionalidade | Arquivo | Descrição |
|----------------|---------|-----------|
| Importação de PDF | `pdf-parser.js` | Extrai itens com SKU, EAN, quantidade, nota fiscal, canal de venda |
| Leitura de código de barras | `app.js:990` | Input manual ou câmera, suporta lote (`5*789...`) |
| Modo guiado | `app.js:1562` | Clique em um item para focar e bipar exatamente ele |
| Filtros (Todos/Pendentes/Expedidos) | `app.js:1380` | Botões de filtro rápido |
| Ordenação | `app.js:1399` | Por status, nota, descrição, SKU, quantidade |
| Busca textual | `app.js:1386` | Por SKU, EAN, descrição, cliente, nota |
| Múltiplos despachantes | `app.js:2153` | Cada lista vinculada a um despachante com prazo limite |
| Timer regressivo | `app.js:2455` | Contagem regressiva do prazo limite com alerta visual |
| Log de auditoria | `app.js:1970` | Histórico completo de todas as operações |
| Exportação CSV | `app.js:2058` | Logs em CSV com BOM para Excel |
| Som de feedback | `app.js:1224` | 4 perfis sonoros via Web Audio API |
| Modo escuro | `index.css:48` | Glassmorphism com gradientes |
| Responsivo mobile | `index.css:1400` | Layout adaptável para celular |
| Sincronização background | `app.js:2505` | Atualiza a cada 2s entre abas |

### Novas Funcionalidades (Implementadas em 17/07/2026)

| # | Funcionalidade | Arquivo | Atalho/Como usar |
|---|----------------|---------|------------------|
| 1 | **Paleta de Comandos** 🎮 | `app.js:9.1` | `Ctrl+K` ou botão ⌘ no header |
| 4 | **Desfazer (Undo)** ↩️ | `app.js:9.4` | `Ctrl+Z` ou botão ↩️ no progresso |
| 10 | **Tela Cheia** ⛶ | `app.js:9.3` | `F11` ou botão ⛶ no header |
| 15 | **Notificação Push** 🔔 | `app.js:9.6` | Dispara ao finalizar lista ou prazo < 5min |
| 17 | **Modo Offline** 📡 | `app.js:9.7` | Fila automática + badge amarelo + sincronização |
| 19 | **Lanterna** 🔦 | `app.js:9.5` | Botão 🔦 na tela da câmera (torch API) |
| 21 | **Mãos-Livres** ✋ | `app.js:9.8` | Botão ✋ no painel de leitura — câmera contínua |
| 22 | **Confirmação por Voz** 🔊 | `app.js:9.9` | TTS toggle no header (🔊/🔇) |
| 28 | **Modo Turbo** ⚡ | `app.js:9.10` | Botão ⚡ no header — desativa animações |
| 29 | **Romaneio** 🖨️ | `app.js:9.11` | Botão 🖨️ no progresso — impressão térmica 80mm |
| 30 | **Backup Automático** 💾 | `app.js:9.12` | Snapshots a cada 5min + botão restaurar na admin |
| 31 | **Menu Popup de Configurações** ⚙️ | `app.js:9.19` | Botão ⚙️ no header — popup com toggles |
| 32 | **Visualizar PDF Original** 📄 | `app.js:9.20` | Botão 📄 no progresso — modal com iframe do PDF |

---

## 4. ⚠️ Falhas de Segurança Conhecidas

### 🔴 Críticas (Corrigir URGENTEMENTE)

#### 4.1 SQL Injection na api.php
**Arquivo:** `api.php` — linhas 171-186 (`save_itens`), 210-216 (`update_item`), 235-245 (`add_log`)
**Problema:** Campos como `$item['nota']`, `$item['descricao']`, `$log['ean']` são inseridos diretamente no SQL sem sanitização.
**Correção necessária:**
- Usar `htmlspecialchars(strip_tags($valor))` em todos os campos de texto antes do bind
- Validar que strings não contenham caracteres de escape SQL

#### 4.2 Banco SQLite Exposto
**Arquivo:** `.htaccess` + `api.php:12`
**Problema:** O banco `expedicao.db` fica na pasta pública. A proteção via `.htaccess` só funciona no Apache. Em Nginx, o arquivo é baixável.
**Correção necessária:**
- Mover o banco para `../expedicao.db` (fora da pasta pública)
- Atualizar `api.php` linha 12 para `$db_file = __DIR__ . '/../expedicao.db';`

#### 4.3 CORS Totalmente Aberto
**Arquivo:** `api.php:2`
**Problema:** `Access-Control-Allow-Origin: *` permite qualquer site consumir a API
**Correção necessária:**
- Restringir para o domínio real:
```php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://projetormagcubic.online', 'http://localhost:8080'];
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
}
```

### 🟡 Médias

#### 4.4 Sem Autenticação na API
**Problema:** Qualquer pessoa que descobrir a URL da `api.php` pode deletar listas, alterar itens, etc.
**Correção necessária:**
- Adicionar verificação de token via header `Authorization: Bearer <token>`
- Token armazenado em variável de ambiente ou config.php fora da pasta pública

#### 4.5 Senha em Texto Puro
**Arquivo:** `credencial.txt`
**Problema:** Senha FTP da HostGator armazenada sem criptografia
**Correção necessária:**
- Usar variáveis de ambiente (`.env`) com biblioteca `dotenv`
- Ou criptografar com uma chave mestra

---

## 5. Melhorias Recomendadas

### Performance ⚡

| Prioridade | Melhoria | Arquivo | Esforço |
|:----------:|----------|---------|:-------:|
| Alta | Debounce na busca (200ms) | `app.js:1386` | 🟢 Fácil |
| Alta | Virtual scrolling p/ 500+ itens | `app.js:1373` | 🔴 Difícil |
| Média | Cache de vozes TTS | `app.js:9.9` | 🟢 Fácil |
| Média | Minificar CSS/JS no build | `deploy.js` | 🟡 Médio |

### Visual/UX 🎨

| Prioridade | Melhoria | Esforço |
|:----------:|----------|:-------:|
| Média | Flash verde na tela ao ler código | 🟢 Fácil |
| Média | Modo compacto para tablets | 🟡 Médio |
| Baixa | Tema claro/escuro automático (`prefers-color-scheme`) | 🟢 Fácil |

### Funcionalidades Novas 🆕

| Prioridade | Funcionalidade | Descrição | Esforço |
|:----------:|---------------|-----------|:-------:|
| Alta | **PWA (Service Worker)** | Instalável como app no celular, offline total | 🟡 Médio |
| Alta | **Relatório de Produtividade** | Itens/hora por operador, meta vs realizado | 🔴 Difícil |
| Média | **Roteirização** | Manifesto de transporte agrupado por CEP | 🔴 Difícil |
| Média | **WhatsApp Notification** | Aviso via link `wa.me` ao finalizar lista | 🟡 Médio |
| Média | **Checklist com Foto** | Foto do produto expedido vinculada ao log | 🟡 Médio |
| Média | **Modal de Visualização de PDF** | Visualizar PDF original em popup/modal | 🟢 Fácil |
| Baixa | **Integração Marketplaces** | API Shopee/ML/Amazon para importar pedidos | 🔴 Difícil |
| Baixa | **Controle de Lotes/Validade** | Alertas de vencimento na expedição | 🟡 Médio |
| Baixa | **Multi-empresa (SaaS)** | Tenant isolation com `empresa_id` | 🔴 Difícil |

---

## 6. Regras de Desenvolvimento

### Ao modificar este código, SIGA estas regras:

1. **NUNCA** commit arquivos de credencial ou `.env`
2. **SEMPRE** sanitize inputs antes de enviar ao banco (SQL Injection)
3. **NUNCA** remova funcionalidades existentes sem documentar
4. **SEMPRE** teste em `localhost:8080` antes do deploy
5. **NUNCA** quebre a compatibilidade com IndexedDB (modo local)
6. **SEMPRE** adicione logs de auditoria para novas operações
7. **PREFIRA** funções puras em vez de manipular diretamente o state global
8. **USE** `const`/`let` — nunca `var` (o sistema usa ES2020+)
9. **MANTENHA** a estrutura de seções numeradas no `app.js` (9.1, 9.2, etc.)
10. **DOCUMENTE** novas funcionalidades neste arquivo (`AI_INSTRUCTIONS.md`)

### Convenções de Código

- **Idioma:** Português-BR (código, comentários e UI)
- **Estilo:** Sempre que adicionar uma nova funcionalidade ao `app.js`, crie uma nova seção `// 9.X. NOME DA FUNCIONALIDADE`
- **Componentes:** Funções, não classes (exceto `ExpedicaoDB` e `OfflineQueue`)
- **Estado:** Mutação direta do objeto `state` — cuidado com efeitos colaterais
- **Áudio:** Sempre usar `playSoundEffect()`, nunca `playBeep()` diretamente
- **Notificações:** Sempre usar `showToast()` para feedback visual

---

## 7. Deploy e Manutenção

### Servidor Local (Desenvolvimento)
```bash
node server.js
# Acessar: http://localhost:8080/
```

O `server.js` faz **watch de alterações** e executa deploy FTP automático via `deploy.js`.

### Deploy Manual (HostGator)
```bash
node deploy.js
```

### Deploy Automático
O `server.js` já observa alterações nos arquivos e faz deploy FTP automaticamente:
```
🔔 Alteração detectada no arquivo: app.js
🔄 Iniciando deploy via FTP...
📤 Enviando app.js...
🎉 Deploy concluído com sucesso!
```

### Credenciais
Arquivo `credencial.txt` na raiz (ignorado pelo `.gitignore`):
```
Servidor FTP: ftp.projetormagcubic.com.br
Porta: 21
Usuário: tibjunior@...
Senha: (protegida)
```

### GitHub
```bash
git add -A
git commit -m "tipo: descrição"
git push origin main
```

**Repositório:** https://github.com/tibjunior/expedicao

---

## 8. Próximos Passos Prioritários

### 🔴 Urgente (Segurança)
1. Corrigir SQL Injection na `api.php`
2. Mover banco SQLite para fora da pasta pública (`../`)
3. Restringir CORS para domínios específicos
4. Adicionar autenticação por token na API

### 🟡 Performance
5. ~~Adicionar debounce na busca (200ms)~~ ✅ **Concluído**
6. Implementar paginação na tabela (50 itens por página)

### 🟢 Novas Funcionalidades
7. ~~Service Worker para PWA~~ ✅ **Concluído**
8. ~~Relatório de produtividade~~ ✅ **Concluído**
9. ~~Flash verde na leitura~~ ✅ **Concluído**
10. ~~Notificação por WhatsApp~~ ✅ **Concluído**
11. ~~Checklist com Foto~~ ✅ **Concluído**
12. ~~Menu Popup de Configurações~~ ✅ **Concluído**
13. ~~Visualizar PDF Original em Modal~~ ✅ **Concluído**

---

## 📌 Nota Final para o Agente de IA

> **Este sistema foi construído por um desenvolvedor solo para uma pequena empresa.**  
> O código é funcional mas **não segue padrões enterprise**.  
> **Sua missão** ao editar este código é:
> 1. Preservar a simplicidade e usabilidade
> 2. Não quebrar a compatibilidade com o modo local (IndexedDB)
> 3. Priorizar segurança acima de novas funcionalidades
> 4. Manter a experiência "abriu o navegador e já funciona" sem dependências complexas
>
> **Quando em dúvida, pergunte-se:** "O operador no galpão vai entender isso?"

---

## 9. Roadmap por Fases (Ordem de Prioridade)

### 🔴 FASE 1 — SEGURANÇA (Urgente — fazer antes de qualquer outra coisa)
| # | Tarefa | Arquivo | Esforço | Status |
|:-:|--------|---------|:-------:|:------:|
| 1.1 | Sanitizar todos os inputs na api.php (anti SQL Injection) | `api.php` | 🟢 Fácil | ✅ |
| 1.2 | Mover banco SQLite para fora da pasta pública (`../`) | `api.php:12` + `.htaccess` | 🟢 Fácil | ✅ |
| 1.3 | Restringir CORS para domínios específicos | `api.php:2` | 🟢 Fácil | ✅ |
| 1.4 | Adicionar autenticação por token na API | `api.php` + `app.js` | 🟡 Médio | ✅ |
| 1.5 | Mover credenciais FTP para variável de ambiente | `deploy.js` + `.env` | 🟢 Fácil | ⬜ |

### 🟡 FASE 2 — PERFORMANCE (Melhorar fluidez do sistema)
| # | Tarefa | Arquivo | Esforço | Status |
|:-:|--------|---------|:-------:|:------:|
| 2.1 | Adicionar debounce de 200ms na busca | `app.js:1386` | 🟢 Fácil | ✅ |
| 2.2 | Paginar a tabela (50 itens por página com "Carregar mais") | `app.js:1373` | 🟡 Médio | ⬜ |
| 2.3 | Cachear vozes TTS na inicialização | `app.js:9.9` | 🟢 Fácil | ⬜ |
| 2.4 | Minificar CSS/JS no build automático | `deploy.js` | 🟡 Médio | ⬜ |

### 🟢 FASE 3 — NOVAS FUNCIONALIDADES (Entregas de valor) ✅ **CONCLUÍDA**
| # | Tarefa | Esforço | Status |
|:-:|--------|:-------:|:------:|
| 3.1 | **PWA — Service Worker + manifest.json** (instalável como app) | 🟡 Médio | ✅ |
| 3.2 | **Relatório de Produtividade** (itens/hora por operador, meta vs realizado) | 🔴 Difícil | ✅ |
| 3.3 | **Flash verde na tela ao ler código** (feedback visual) | 🟢 Fácil | ✅ |
| 3.4 | **Notificação por WhatsApp** (link `wa.me` ao finalizar lista) | 🟡 Médio | ✅ |
| 3.5 | **Checklist com Foto** (foto do produto vinculada ao log) | 🟡 Médio | ✅ |
| 3.6 | **Menu Popup de Configurações** ⚙️ (botão no header com toggles) | 🟡 Médio | ✅ |
| 3.7 | **Visualizar PDF Original em Modal** 📄 (popup com iframe) | 🟢 Fácil | ✅ |

### 🔵 FASE 4 — AUTOMAÇÃO E INTEGRAÇÕES (Escalabilidade)
| # | Tarefa | Esforço | Status |
|:-:|--------|:-------:|:------:|
| 4.1 | **Roteirização de Entregas** (manifesto por CEP/rota) | 🔴 Difícil | ⬜ |
| 4.2 | **Integração com Marketplaces** (API Shopee, ML, Amazon) | 🔴 Difícil | ⬜ |
| 4.3 | **Controle de Lotes e Validade** (alertas de vencimento) | 🟡 Médio | ⬜ |
| 4.4 | **Impressão de Etiquetas** (código de barras para itens sem EAN) | 🟡 Médio | ⬜ |

### 🟣 FASE 5 — NEGÓCIO (Expansão do produto)
| # | Tarefa | Esforço | Status |
|:-:|--------|:-------:|:------:|
| 5.1 | **Multi-empresa (SaaS)** — tenant isolation com `empresa_id` | 🔴 Difícil | ⬜ |
| 5.2 | **Módulo de Estoque** — controle de saída com alerta de saldo baixo | 🔴 Difícil | ⬜ |
| 5.3 | **Dashboard Gerencial** — gráficos de desempenho em tempo real | 🔴 Difícil | ⬜ |

---

### 📊 Resumo do Roadmap

| Fase | Foco | Itens | Esforço Total | Prioridade | Status |
|:----:|------|:----:|:-------------:|:----------:|:------:|
| 🔴 1 | Segurança | 5 | 🟢 Fácil | **MÁXIMA** | 🟡 4/5 |
| 🟡 2 | Performance | 4 | 🟡 Médio | Alta | 🟡 1/4 |
| 🟢 3 | Novas Features | 7 | 🟡🔴 Misto | Média | ✅ 7/7 |
| 🔵 4 | Automação | 4 | 🔴 Difícil | Baixa | ⬜ 0/4 |
| 🟣 5 | Negócio | 3 | 🔴 Difícil | Futuro | ⬜ 0/3 |

> **Nota:** As fases são **cumulativas** — não pule para a Fase 3 sem antes concluir a Fase 1. Segurança primeiro, sempre.

---

*Documento gerado em 20/07/2026 · Última atualização: 21/07/2026 12:05 · Mantenha atualizado com cada nova funcionalidade*