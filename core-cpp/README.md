# core-cpp

Core do RME modificado com a API HTTP injetada (Fase 1 de
[`../docs/planejamento/arquitetura.md`](../docs/planejamento/arquitetura.md)).

## Estrutura

- `src/api_server.{hpp,cpp}` — andaime da lib `rme_agent_api`. Compila isolada,
  sem depender do build completo do RME.
- `CMakeLists.txt` — puxa `cpp-httplib` via `FetchContent` e define a static
  lib `rme_agent_api`.
- `rme/` — **submódulo pendente**. Fork do Remere's Map Editor.

## Submódulo do fork do RME

O fork ainda não foi criado. Quando existir:

```bash
git submodule add <url-do-fork> core-cpp/rme
git commit -m "chore(core-cpp): adiciona submódulo do fork do RME"
```

Estratégia: os patches da API (o que hoje é `src/api_server.*`) passam a viver
dentro do fork; este repositório apenas fixa um commit do submódulo. A lib
`rme_agent_api` é então linkada no build do RME.

## Build isolado

```bash
cmake -S . -B build
cmake --build build
```
