# 🗺️ RME Agent Bridge

[![C++](https://img.shields.io/badge/Core-C++-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/SDK-TypeScript-3178C6.svg)](#)
[![Node.js](https://img.shields.io/badge/Env-Node.js-339933.svg)](#)
[![Python](https://img.shields.io/badge/Agent-Python-3776AB.svg)](#)
[![Docker](https://img.shields.io/badge/Orchestration-Docker-2496ED.svg)](#)

O **RME Agent Bridge** é uma arquitetura de integração open-source desenhada para revolucionar a criação de mapas de OpenTibia. O projeto estabelece uma comunicação bidirecional em tempo real entre o **Remere's Map Editor (RME)** e agentes autônomos de Inteligência Artificial (LLMs).

Ao invés de depender de automação visual frágil (Visão Computacional e simulação de mouse GUI), este ecossistema injeta uma API nativa no core do editor, permitindo que a IA atue como uma arquiteta de software: manipulando matrizes, geometrias e estruturas de dados de forma assíncrona, orquestrada e com precisão absoluta.

---

## 🚀 Como Funciona a Arquitetura

O ecossistema é desacoplado em três serviços independentes para garantir manutenibilidade e isolamento de ambiente:

1. **Core Modificado (C++):** O motor monolítico original do RME foi expandido com um servidor HTTP/WebSocket interno. Ele expõe as funções de desenho OpenGL e o gatilho de *Auto-Border* via uma API REST de baixa latência.
2. **SDK Middleware (TypeScript / Node.js):** Uma biblioteca abstrata e fortemente tipada que traduz intenções de alto nível (matrizes, polígonos, IDs de itens) em requisições de alta performance para a API em C++.
3. **Agente Autônomo (Python + Docker):** Rodando de forma conteinerizada para isolamento total, o agente processa especificações em linguagem natural, gera a lógica procedural do terreno e orquestra a construção do mapa consumindo a SDK em Node.js.

---

## 📁 Estrutura do Monorepo

```text
rme-agent-bridge/
├── core-cpp/              # Fork do RME modificado com o servidor injetado
│   ├── src/
│   └── CMakeLists.txt
├── sdk-node/              # Middleware e abstrações
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── agent-python/          # Integração com Gemini Pro e lógica de IA
│   ├── app/
│   └── requirements.txt
├── docker/                # Orquestração de containers do ambiente do agente
│   ├── Dockerfile.agent
│   └── docker-compose.yml
└── README.md
```

---

## ✨ Principais Funcionalidades
Integração Nativa e Assíncrona: Sem delays de renderização ou dependência de resolução de tela. O código conversa diretamente com a engine do mapa.

Geração Procedural Avançada: Suporte arquitetural para criação de sistemas de cavernas orgânicas e distribuições de natureza baseadas em ruído matemático.

Gatilho de Auto-Border Remoto: Aciona as regras nativas de borda do client do Tibia diretamente via código, garantindo transições perfeitas entre água, terra e montanhas.

Pipeline Testável: A separação da SDK em Node.js permite a implementação de testes unitários rígidos (ex: via Jest) antes de aplicar os comandos no mapa binário.

## 🛠️ Próximos Passos (Roadmap Inicial)

- [ ] Setup do ambiente de compilação CMake para o Core C++.
- [ ] Injeção de dependência do servidor HTTP leve (cpp-httplib).
- [ ] Mapeamento do primeiro endpoint de inserção de Tile.
- [ ] Construção dos contêineres Docker para desenvolvimento local.

O planejamento detalhado por fase está em [`docs/planejamento/`](docs/planejamento/).

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
| `agent-python/` | `pip install -e .[dev]` | `ruff check . && pytest` |
| `core-cpp/` | — | `cmake -S core-cpp -B core-cpp/build && cmake --build core-cpp/build` |
| `docker/` | — | `docker compose -f docker/docker-compose.yml build` |

O fork do RME entra como submódulo em `core-cpp/rme` (veja `core-cpp/README.md`).
