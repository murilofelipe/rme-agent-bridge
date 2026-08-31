/**
 * Editor falso: o loop que o `rme_agent.lua` roda, em TypeScript, para testar o
 * relay ponta a ponta sem editor de verdade. Mantém UMA conexão `/stream`
 * aberta (como o script Lua faz), lê comandos linha a linha, e devolve o
 * resultado por `POST /result`.
 */

import type { Command, CommandOp } from './session';

export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;
export type FakeEditorHandlers = Partial<Record<Exclude<CommandOp, 'endSession'>, CommandHandler>>;

export interface FakeEditor {
  stop: () => Promise<void>;
  /** Resolve quando o loop termina (endSession, stop, ou stream fechado). */
  done: Promise<void>;
}

export function startFakeEditor(
  baseUrl: string,
  sessionId: string,
  handlers: FakeEditorHandlers,
): FakeEditor {
  const ac = new AbortController();

  const submit = (commandId: string, ok: boolean, data?: unknown, error?: string) =>
    fetch(`${baseUrl}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, commandId, ok, data, error }),
    });

  const handle = async (command: Command): Promise<boolean> => {
    if (command.op === 'endSession') {
      await submit(command.id, true, { ended: true });
      return true;
    }
    const handler = handlers[command.op];
    try {
      const data = handler ? await handler(command.args) : null;
      await submit(command.id, true, data);
    } catch (e) {
      await submit(command.id, false, undefined, e instanceof Error ? e.message : String(e));
    }
    return false;
  };

  const loop = async (): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: sessionId }),
        signal: ac.signal,
      });
    } catch {
      return;
    }
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      let chunk: { done: boolean; value?: Uint8Array };
      try {
        chunk = await reader.read();
      } catch {
        return; // abortado
      }
      if (chunk.done || !chunk.value) return;
      buf += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line || line.startsWith(':')) continue; // keepalive
        const stop = await handle(JSON.parse(line) as Command);
        if (stop) {
          ac.abort();
          return;
        }
      }
    }
  };

  const done = loop().catch(() => {});

  return {
    done,
    stop: async () => {
      ac.abort();
      await done;
    },
  };
}
