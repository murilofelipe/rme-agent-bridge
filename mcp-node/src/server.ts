import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { HttpRelayClient, type RelayClient } from './relay-client.js';
import { buildTools } from './tools.js';

export const RELAY_URL = process.env.RME_RELAY_URL ?? 'http://127.0.0.1:8777';

export function createMcpServer(relay: RelayClient = new HttpRelayClient(RELAY_URL)): McpServer {
  const server = new McpServer(
    { name: 'rme-agent-bridge', version: '0.0.0' },
    {
      instructions:
        'Ferramentas do Remere\'s Map Editor (mapas OpenTibia). Requer uma sessão aberta no editor ' +
        '(menu Scripts → RME Agent → Iniciar sessão). Comece por rme_session_status / rme_get_selection.',
    },
  );

  for (const tool of buildTools(relay)) {
    server.tool(tool.name, tool.description, tool.schema, async (args: Record<string, unknown>) => tool.handler(args));
  }

  return server;
}
