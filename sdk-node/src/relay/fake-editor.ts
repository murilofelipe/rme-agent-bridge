/**
 * Editor falso: o loop que o `rme_agent.lua` roda, em TypeScript, para testar o
 * relay ponta a ponta sem editor de verdade. Faz long-poll, despacha o comando
 * pra um handler, e devolve o resultado.
 */

import type { Command, CommandOp } from './session';

export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;
export type FakeEditorHandlers = Partial<Record<Exclude<CommandOp, 'endSession'>, CommandHandler>>;

export interface FakeEditor {
  stop: () => Promise<void>;
  /** Resolve quando o loop termina (endSession, stop, ou erro). */
  done: Promise<void>;
}

export function startFakeEditor(
  baseUrl: string,
  sessionId: string,
  handlers: FakeEditorHandlers,
): FakeEditor {
  let running = true;

  const loop = async (): Promise<void> => {
    while (running) {
      const res = await fetch(`${baseUrl}/poll?session=${sessionId}&wait=1000`);
      if (res.status === 404) return; // sessão sumiu
      if (res.status === 204) continue;
      const { command } = (await res.json()) as { command: Command };

      if (command.op === 'endSession') {
        await submit(command.id, true, { ended: true });
        return;
      }

      const handler = handlers[command.op];
      try {
        const data = handler ? await handler(command.args) : null;
        await submit(command.id, true, data);
      } catch (e) {
        await submit(command.id, false, undefined, e instanceof Error ? e.message : String(e));
      }
    }
  };

  const submit = (commandId: string, ok: boolean, data?: unknown, error?: string) =>
    fetch(`${baseUrl}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, commandId, ok, data, error }),
    });

  const done = loop().catch(() => {});

  return {
    done,
    stop: async () => {
      running = false;
      await done;
    },
  };
}
