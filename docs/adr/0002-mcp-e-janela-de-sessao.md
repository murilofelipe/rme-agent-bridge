# ADR 0002 — MCP server + janela de sessão para o agente

**Status:** aceito
**Data:** 2026-08-30
**Contexto:** pedido do dono — `docker-compose` + "MCP nativo pra qualquer
agente conversar livremente com o editor" + plugin de instalação. Depende da
ADR 0001 (transporte HTTP) e do MVP #8–#13.

## Contexto

O MVP entrega um fluxo de **um tiro**: o script Lua, acionado pelo menu
Scripts, monta um request da seleção, faz um round-trip HTTP e aplica a
resposta. Não é uma sessão de agente conversando com o editor.

Um MCP server inverte o iniciador: o **agente** chama ferramentas
(`rme_apply_operations`, `rme_get_selection`, …) quando quer. Mas o editor
v4.0 **não tem servidor de entrada**:

- `app.events` é código morto (zero call sites de `emit` — verificado).
- `app.sleep` congela a thread da GUI; nada de loop de polling residente.
- `http` do editor é só saída.

Ou seja: sem fork em C++, o agente não consegue "alcançar" o editor a
qualquer momento.

## Decisão

**Janela de sessão com long-poll, sem fork.**

```
Claude Code ⇄(stdio/HTTP)⇄ rme-mcp ⇄(HTTP, fila)⇄ relay ⇄(long-poll)⇄ rme_agent.lua (loop)
```

1. O humano abre uma sessão no editor: **Scripts → RME Agent → "Iniciar
   sessão"**. O script entra num loop com deadline (~10 min, renovável)
   fazendo long-poll no `relay`, despachando comandos e devolvendo
   resultados. `app.sleep(300)/app.yield()` entre polls.
2. O `rme-mcp` expõe as ferramentas ao cliente MCP. Cada chamada vira um
   comando na fila do `relay`; o `relay` segura a promise até o resultado do
   editor chegar.
3. Fora de uma sessão ativa, as ferramentas devolvem erro legível
   ("nenhuma sessão ativa — abra pelo menu Scripts do editor").
4. A sessão fecha no deadline, por `rme_end_session`, ou quando o loop morre.

### Validação

`handleRequest` (contrato #9: schema + limites da seleção) roda em **todo**
comando `apply` no `relay`, antes de enfileirar. O caminho MCP não pula
validação. O `precheck` do Lua roda por comando, antes da transação (a v4.0
não faz rollback — ver ADR 0001 / `rme-scripts/README.md`).

### `claudeBrain` (`--brain claude`)

No caminho MCP **não há cérebro no loop** — o próprio agente raciocina e
chama as ferramentas. `claude -p` fica só para o caminho standalone "uma
instrução, um tiro" sem MCP.

### Hosts

O `relay` roda como serviço no compose com alias de rede `rme-bridge.local`.
`http://rme-bridge.local:8777` passa no `isUrlSafe` do editor (verificado no
spike da ADR 0001). **Zero edição de `/etc/hosts` no host.**

## Alternativas descartadas

- **Troca por arquivo (`app.storage`)** — mesma limitação de polling, mais
  frágil (sem lock, request/response separados). É o plano B da ADR 0001;
  continua fora.
- **Fork em C++ agora** — servidor HTTP/WS de entrada + `emit` nos caminhos
  de edição dá "conversa livre" de verdade (sem janela, UI normal, editor
  empurra o que o humano faz). Fica como **epic** no roadmap; custo de
  C++/wxWidgets + manutenção do rebase com o upstream não cabe neste ciclo.

## Consequências

- **Custo assumido:** durante a sessão a UI do editor fica lenta (pisca a
  cada poll) e a co-edição do humano fica degradada — é o teto da v4.0.
- O `stub-server` evolui para um `relay` com fila e estado de sessão.
- Novo pacote `mcp-node` (`@rme-agent-bridge/mcp`).
- `rme_agent.lua` reescrito de "um tiro" para loop de sessão (o item de menu
  de uma instrução continua).
- Novo job de CI `mcp-node`.
- Assets do Tibia continuam montados do disco do dono (Cipsoft, não
  redistribuível) — ADR 0001, achado operacional.
