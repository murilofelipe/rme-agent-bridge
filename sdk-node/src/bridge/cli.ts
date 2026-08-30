/**
 * Sobe o servidor stub para o tracer bullet #10.
 *
 *   npm run build && node dist/bridge/cli.js [--host H] [--port P] [--response arquivo.json]
 *
 * Sem `--response`, usa a fixture `response.valid.json` do contrato.
 */

import { readFileSync } from 'node:fs';

import type { BridgeResponse } from '../contract';
import defaultResponse from '../contract/fixtures/response.valid.json';
import { fillSelection, startStubServer } from './stub-server';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const host = arg('host') ?? '0.0.0.0';
const port = Number(arg('port') ?? 8777);
const responsePath = arg('response');
const fill = arg('fill');

const respond = fill ? fillSelection(Number(fill)) : undefined;
const cannedResponse = respond
  ? undefined
  : ((responsePath ? JSON.parse(readFileSync(responsePath, 'utf8')) : defaultResponse) as BridgeResponse);

startStubServer({
  host,
  port,
  respond,
  cannedResponse,
  onRequest: (req) => {
    console.log(
      `[stub] request: "${req.instruction}" | seleção ${JSON.stringify(req.selection.min)}..${JSON.stringify(
        req.selection.max,
      )} | ${req.tiles.length} tiles`,
    );
  },
})
  .then((s) => {
    const mode = respond
      ? `fill selection com ground ${fill}`
      : `fixture ${responsePath ?? 'response.valid.json'}`;
    console.log(`[stub] ouvindo em ${s.host}:${s.port} — modo: ${mode}`);
  })
  .catch((err) => {
    console.error('[stub] falhou ao iniciar:', err);
    process.exit(1);
  });
