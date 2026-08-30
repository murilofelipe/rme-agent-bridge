/**
 * As ferramentas MCP do editor RME. Cada uma vira um comando na fila do relay
 * (ADR 0002) e espera o editor responder.
 *
 * A validação de verdade (schema + limites da seleção) é do relay/contrato #9 —
 * aqui o schema zod é só pra ajudar o agente a montar a chamada.
 */

import { z } from 'zod';

import type { RelayClient } from './relay-client.js';

const position = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
});

const selection = z.object({ min: position, max: position });

const operation = z
  .object({
    type: z.enum(['setGround', 'addItem', 'removeItem', 'applyBrush', 'borderize']),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    id: z.number().int().min(1).optional(),
    count: z.number().int().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .describe('setGround/addItem/removeItem exigem id; applyBrush exige name; borderize só x,y,z');

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>;
}

function text(s: string, isError = false) {
  return { content: [{ type: 'text' as const, text: s }], isError: isError || undefined };
}

function reply(outcome: { ok: boolean; data?: unknown; error?: string }) {
  if (!outcome.ok) return text(outcome.error ?? 'erro sem detalhe', true);
  return text(JSON.stringify(outcome.data ?? null, null, 2));
}

export function buildTools(relay: RelayClient): ToolDef[] {
  return [
    {
      name: 'rme_session_status',
      description: 'Diz se há uma sessão do agente ativa no editor (aberta pelo menu Scripts → RME Agent → Iniciar sessão).',
      schema: {},
      handler: async () => text(JSON.stringify(await relay.status(), null, 2)),
    },
    {
      name: 'rme_get_selection',
      description: 'A região atualmente selecionada pelo humano no editor: { min, max } ou null se nada está selecionado.',
      schema: {},
      handler: async () => reply(await relay.command('getSelection')),
    },
    {
      name: 'rme_get_map_context',
      description:
        'Conteúdo dos tiles com algo dentro de uma região (esparso): ground id, item ids, flags. Use antes de editar pra saber o que já existe.',
      schema: { selection },
      handler: async (a) => reply(await relay.command('getMapContext', { selection: a.selection })),
    },
    {
      name: 'rme_get_tile',
      description: 'Conteúdo de um tile específico: { x, y, z } -> { ground, items, flags } ou null se vazio.',
      schema: { x: z.number().int(), y: z.number().int(), z: z.number().int() },
      handler: async (a) => reply(await relay.command('getTile', { x: a.x, y: a.y, z: a.z })),
    },
    {
      name: 'rme_apply_operations',
      description:
        'Aplica uma lista de operações no mapa como UMA transação (um Ctrl+Z desfaz). `bounds` é a região onde as operações têm que cair (o editor rejeita fora dela). `autoBorder` (padrão true) roda o auto-contorno nos tiles tocados.',
      schema: {
        operations: z.array(operation).min(1),
        bounds: selection,
        autoBorder: z.boolean().optional(),
      },
      handler: async (a) =>
        reply(
          await relay.command('apply', {
            operations: a.operations,
            bounds: a.bounds,
            autoBorder: a.autoBorder,
          }),
        ),
    },
    {
      name: 'rme_end_session',
      description: 'Encerra a sessão do agente no editor. O humano precisa reabrir pelo menu Scripts pra você voltar a agir.',
      schema: {},
      handler: async () => reply(await relay.command('endSession')),
    },
  ];
}
