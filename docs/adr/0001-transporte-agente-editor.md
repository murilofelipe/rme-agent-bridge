# ADR 0001 — Transporte entre o agente e o script Lua do editor

**Status:** aceito
**Data:** 2026-08-29
**Contexto do ticket:** #8 (spike de transporte)

## Contexto

O MVP da co-edição ao vivo tem dois lados: um script Lua rodando dentro do
Remere's Map Editor (build `opentibiabr/remeres-map-editor`) e um lado-terminal
que o agente (Claude Code) roda. O contrato de mensagens (#9) é
transporte-agnóstico; faltava decidir o canal.

Duas hipóteses, ambas de leitura de código, nenhuma testada:

1. **HTTP** — a API `http` do editor é só de saída e `isUrlSafe()` rejeita URLs
   contendo `localhost`, `127.`, `0.0.0.0`, `[::1]`. A checagem é casamento de
   string pura, então um hostname que resolva para loopback ou um IP de LAN
   *talvez* passe.
2. **Troca por arquivo** — `app.storage(nome)` faz I/O de arquivo JSON em C++
   (`:save()` / `:load()`), sem lock, no diretório do script.

## Spike

Editor `v4.0.0` (`canary-map-editor`, release de 2026-06-12) rodando **headless**
(`xvfb` + GL por software) num container, com um servidor dummy noutro container
da mesma rede, alias `rme-bridge.local`. Um script Lua autorun (`bridge_probe.lua`)
exercitou a matriz de URLs e gravou o resultado via `app.storage`. Setup em
`~/Downloads/rme-spike/` (descartável).

Também rodado visível (X11) — a janela abre normalmente.

**Ressalva do sandbox Lua no autorun:** `app.sleep(ms)` = `sleep_for` na thread
da GUI. Um laço de polling residente no autorun impede a janela de mapear. O
script da ponte tem que registrar menu/overlay e **retornar** no boot; trabalho
por acionamento (menu de contexto).

Resultados (`probe_result.json`):

| URL | Resultado |
| --- | --- |
| `http://bridge:8777` (hostname arbitrário) | `ok=true`, HTTP 200, ~imediato |
| `http://rme-bridge.local:8777` (alias) | `ok=true`, HTTP 200, ~imediato |
| `http://127.0.0.1:8777` | **bloqueado** — `error="Security: URL blocked (Localhost access denied)"` (mesmo com servidor ativo) |
| `http://localhost:8777` | **bloqueado**, mesma mensagem |
| `http://[::1]:8777` | **bloqueado**, mesma mensagem |
| `http.postJsonStream` para `http://bridge:8777` | `ok=true`, corpo completo recebido |

Superfície da API confirmada em runtime na `v4.0.0`: `app.transaction`,
`app.addContextMenu`, `app.storage`, `app.sleep`/`yield`, `app.mapView.addOverlay`,
`http.*` (incl. streaming), `json.*`, `Brushes`. `app.map` / `app.selection`
retornam `nil` sem mapa aberto (esperado).
`app.storage` grava `./<nome>.json` relativo ao CWD do editor quando
`SCRIPT_DIR` não está setado (contexto autorun); `save`/`load` funcionam.

## Decisão

**Transporte = HTTP, com o bridge local exposto num host que NÃO seja
`localhost` / `127.` / `[::1]`.**

- O lado-terminal sobe um servidor HTTP local. O script Lua fala com ele por
  um hostname alias (ex.: entrada em `/etc/hosts` apontando `rme-bridge.local`
  para `127.0.0.1`) ou pelo IP de LAN da máquina.
- Requisições do agente: **streaming** (`http.postJsonStream` + `streamRead`
  num laço curto com `app.sleep`/`app.yield`), como o `claude_agent.lua` faz —
  o agente pode demorar dezenas de segundos e a chamada síncrona bloquearia a
  thread da GUI (e estoura o timeout de 10 s do `http.post`).
- Um round-trip por acionamento. Sem laço de polling residente.
- O payload é o do contrato #9, inalterado.

**Troca por arquivo (`app.storage`) fica como plano B** — funciona, mas exige
arquivos separados de request/response, escrita atômica no lado-terminal, e
poll com teto de tempo no Lua. Só adotar se o HTTP mostrar problema.

**WebSocket de entrada continua fora** (exigiria fork).

## Consequências

- O usuário precisa de **uma linha em `/etc/hosts`** (uma vez) ou usar o IP de
  LAN. Documentar no README/setup do lado-terminal.
- O lado-terminal (#6-equivalente, agora dentro de #10/#12) implementa um
  servidor HTTP; o script Lua (#10+) implementa o cliente streaming.
- Descoberta paralela: **o editor roda headless com autorun Lua** (`xvfb` + GL
  software). Testes de fumaça automatizados de scripts Lua são viáveis no CI
  para a parte que não depende de mapa aberto — revisar a decisão de "sem
  harness headless" da spec quando fizer sentido.
- Não testado no spike (precisa de mapa aberto): leitura de seleção,
  `app.transaction` como um passo de undo, render do overlay, disparo do menu
  de contexto. Ficam para a primeira interação real com mapa (#10).

## Achado operacional: o build v4.0 exige assets do Tibia 12

`File > New` no `canary-map-editor` v4.0 falha com
`Couldn't load catalog-content.json. Assets directory not found in path: //assets/`
e **não cria mapa**. O `data/clients.xml` do zip lista só "Client 11" (legado),
mas o editor quer o bundle de assets moderno (`assets/catalog-content.json` +
sprite sheets, ~100+ MB, do client Tibia 12+ ou do servidor Canary).

Consequência: qualquer verificação hands-on com este build (#10, #12, #13, e a
verificação manual dos itens acima) precisa antes de um bundle de assets. Não é
bloqueio para #9 (contrato, puro código). Documentar o passo de obter os assets
no setup de dev.

