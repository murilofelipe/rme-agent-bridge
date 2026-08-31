#!/usr/bin/env node
/**
 * Sobe o relay (ADR 0002).
 *
 *   npm run relay -- [--host H] [--port P]
 *
 * Padrão: 0.0.0.0:8777. No docker-compose roda como serviço `rme-bridge.local`.
 * O `POST /bridge` (modo "uma instrução") usa `claudeBrain()` — precisa do CLI
 * `claude` autenticado no ambiente.
 */

import { startRelayServer } from './server';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

startRelayServer({
  host: arg('host') ?? '0.0.0.0',
  port: Number(arg('port') ?? 8777),
})
  .then((r) => {
    console.log(`[relay] ouvindo em ${r.host}:${r.port}`);
    console.log('[relay] sessão MCP: POST /session -> menu Scripts do editor faz o long-poll');
    console.log('[relay] uma instrução: POST /bridge (claudeBrain)');
  })
  .catch((e) => {
    console.error('[relay] falhou ao iniciar:', e);
    process.exit(1);
  });
