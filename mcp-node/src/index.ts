#!/usr/bin/env node
/**
 * rme-mcp — MCP server do RME Agent Bridge.
 *
 *   rme-mcp                 # stdio (padrão; usado pelo plugin do Claude Code)
 *   rme-mcp --http [--port 8778]   # Streamable HTTP (usado pelo docker-compose)
 *
 * Env: RME_RELAY_URL (padrão http://127.0.0.1:8777)
 */

import { createServer } from 'node:http';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMcpServer, RELAY_URL } from './server.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const server = createMcpServer();

  if (process.argv.includes('--http')) {
    const port = Number(arg('port') ?? 8778);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    createServer((req, res) => {
      transport.handleRequest(req, res).catch((e) => {
        console.error('[rme-mcp] erro na requisição:', e);
        if (!res.headersSent) res.writeHead(500).end();
      });
    }).listen(port, () => {
      console.error(`[rme-mcp] Streamable HTTP em :${port} — relay ${RELAY_URL}`);
    });
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[rme-mcp] stdio pronto — relay ${RELAY_URL}`);
}

main().catch((e) => {
  console.error('[rme-mcp] falhou:', e);
  process.exit(1);
});
