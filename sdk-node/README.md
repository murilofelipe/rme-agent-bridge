# @rme-agent-bridge/sdk

Lado-terminal do [RME Agent Bridge](https://github.com/murilofelipe/rme-agent-bridge):
contrato de mensagens + validação, o **relay** (fila de comandos + janela de
sessão, ADR 0002) e o cérebro `claude -p` (modo "uma instrução", ADR 0001).

## Uso

```bash
npx --package @rme-agent-bridge/sdk rme-relay      # sobe o relay em 0.0.0.0:8777
npx --package @rme-agent-bridge/sdk rme-stub --fill 4526   # stub de teste
```

Ou como lib:

```ts
import { startRelayServer, validateResponse } from "@rme-agent-bridge/sdk";
```

## O que exporta

- `contract/` — `BridgeRequest`/`BridgeResponse`, `validateRequest`,
  `validateResponse`, fixtures.
- `bridge/` — `handleRequest`, `createStubServer`, `claudeBrain`.
- `relay/` — `startRelayServer`, `Session`/`SessionManager`, `startFakeEditor`.

Ver os ADRs em
[`docs/adr/`](https://github.com/murilofelipe/rme-agent-bridge/tree/main/docs/adr).
