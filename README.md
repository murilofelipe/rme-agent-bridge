# 🗺️ RME Agent Bridge

[![C++](https://img.shields.io/badge/Core-C++-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/SDK-TypeScript-3178C6.svg)](#)
[![Node.js](https://img.shields.io/badge/Env-Node.js-339933.svg)](#)

**RME Agent Bridge** é uma ponte entre agentes de IA e o **Remere's Map Editor
(RME)**, o editor de mapas de OpenTibia. Ela dá a qualquer agente uma forma de
*enxergar* e *manipular* um mapa aberto no editor — sem simular mouse, sem
screenshot.

A analogia: é para o RME o que a extensão de navegador do Claude Code é para um
site. O editor passa a expor **comandos** (`coloque grama no quadrado 100,50`,
`rode o auto-contorno nessa área`, `me diga o que tem aqui`, `selecione essa
região`) e o agente os chama direto.

> O entendimento completo do projeto está em [`CONTEXT.md`](CONTEXT.md).

---

## 🎯 O que este projeto é (e o que não é)

**A ponte é o produto.** Quem é o agente — Claude Code, um modelo local, um
script seu — é plugável e está **fora do escopo**. Existe um único contrato de
comandos por baixo; as formas de consumo (SDK, servidor MCP, plugin) são
embrulhos finos sobre ele.

A ponte **não** entende linguagem natural, **não** tem modelo de IA próprio,
**não** gera nada procedural e **não** interpreta imagens. Traduzir *"faz um
lago sombrio no canto nordeste"* em ações no mapa é trabalho do agente. A ponte
só expõe o mapa de um jeito que um LLM consiga raciocinar em cima.

## 🧩 Casos de uso alvo

1. **Co-edição ao vivo** — uma pessoa trabalha no RME normalmente; um agente
   trabalha no mesmo mapa ao lado, guiado por chat.
2. **Reproduzir uma referência** — dado um mapa de outro game ou uma imagem, o
   agente monta aquilo no editor para um servidor de jogo.

## ⚙️ Como a co-edição ao vivo funciona

| Tema | Decisão |
| --- | --- |
| Interação | Linguagem natural via chat (terminal no MVP; dentro do RME depois) |
| Operação do agente | Uma operação = uma transação atômica = **um** passo de undo |
| Concorrência | Enquanto o agente mexe numa área, o RME bloqueia o input do humano ali até terminar |
| Visual | Retângulo colorido semitransparente sobre a área + label curto |
| Comunicação | Bidirecional (WebSocket): agente manda comandos, editor manda eventos |
| Modos | (1) humano pede pelo chat · (2) humano seleciona área e aciona "revisar" / "continuar daqui" pelo menu do RME |
| Auto-contorno | Automático ao fim de cada transação (desligável); também como comando avulso |

## 🎯 Alvo técnico

- Editor: [`opentibiabr/remeres-map-editor`](https://github.com/opentibiabr/remeres-map-editor)
- Client/itens: Tibia recente (protocolo 13.x) — um alvo só
- Transporte: uma conexão WebSocket bidirecional, mensagens JSON

---

## 📁 Estrutura do Monorepo

```text
rme-agent-bridge/
├── core-cpp/     # RME modificado: servidor de comandos + overlay de bloqueio
│   ├── src/
│   └── CMakeLists.txt
├── sdk-node/     # Embrulho/SDK do contrato de comandos (TypeScript)
│   └── src/
├── docs/
│   ├── agents/       # config das engineering skills
│   └── planejamento/ # notas de planejamento
├── CONTEXT.md
└── README.md
```

> `agent-python/` e `docker/` existem como andaime do plano antigo (agente
> autônomo próprio) e devem sair — o agente é externo à ponte.

---

## 🛠️ Roadmap inicial

- [x] Scaffolding do monorepo + CI
- [ ] Definir a forma das mensagens do contrato (ADR)
- [ ] Forkar o RME e trazer como submódulo em `core-cpp/rme`
- [ ] Primeiro comando ponta a ponta: colocar um tile num RME aberto
- [ ] Servidor WebSocket no core + overlay de bloqueio
- [ ] SDK cobrindo o contrato + testes
- [ ] Primeira fatia demonstrável da co-edição ao vivo

---

## 🧑‍💻 Desenvolvimento

### Fluxo de branches (Gitflow leve)

- `main` — releases estáveis.
- `develop` — branch de integração; todo trabalho é mergeado aqui via PR.
- Features: `feat/<nome>` a partir de `develop` → PR para `develop` (CI obrigatório).

### Rodando cada serviço

| Serviço | Setup | Checks |
| --- | --- | --- |
| `sdk-node/` | `npm ci` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `core-cpp/` | — | `cmake -S core-cpp -B core-cpp/build && cmake --build core-cpp/build` |

O fork do RME entra como submódulo em `core-cpp/rme` (veja `core-cpp/README.md`).
