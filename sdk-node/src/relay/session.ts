/**
 * Sessão do agente (ADR 0002).
 *
 * O editor não tem servidor de entrada, então o agente não "alcança" o editor:
 * o `rme_agent.lua` abre uma sessão e faz long-poll aqui. Cada ferramenta MCP
 * vira um comando na fila; a promise só resolve quando o editor devolve o
 * resultado (ou o comando expira).
 *
 * Sessão única: o editor v4.0 só roda um loop de script por vez.
 */

import { randomUUID } from 'node:crypto';

export type CommandOp = 'getSelection' | 'getMapContext' | 'getTile' | 'apply' | 'endSession';

export interface Command {
  id: string;
  op: CommandOp;
  args: unknown;
}

export interface CommandResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEFAULT_SESSION_TTL_MS = 10 * 60_000;
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

export class Session {
  readonly id = randomUUID();
  readonly startedAt = Date.now();
  deadline: number;

  private queue: { cmd: Command; d: Deferred<CommandResult> }[] = [];
  private inFlight = new Map<string, Deferred<CommandResult>>();
  private closed = false;

  constructor(ttlMs: number = DEFAULT_SESSION_TTL_MS) {
    this.deadline = Date.now() + ttlMs;
  }

  get isClosed(): boolean {
    return this.closed || Date.now() > this.deadline;
  }

  /** Renova o deadline (o Lua manda um keepalive a cada poll). */
  renew(ttlMs: number = DEFAULT_SESSION_TTL_MS): void {
    if (!this.closed) this.deadline = Date.now() + ttlMs;
  }

  /** Enfileira um comando e espera o resultado do editor. */
  enqueue(op: CommandOp, args: unknown, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS): Promise<CommandResult> {
    if (this.isClosed) return Promise.reject(new Error('sessão encerrada'));
    const cmd: Command = { id: randomUUID(), op, args };
    const d = defer<CommandResult>();
    const timer = setTimeout(() => {
      this.drop(cmd.id);
      d.reject(new Error(`comando "${op}" expirou — o editor não respondeu em ${timeoutMs}ms`));
    }, timeoutMs);
    void d.promise.catch(() => {}).finally(() => clearTimeout(timer));
    this.queue.push({ cmd, d });
    return d.promise;
  }

  /** Long-poll do editor: próximo comando, ou null depois de `waitMs`. */
  async poll(waitMs: number): Promise<Command | null> {
    const until = Date.now() + waitMs;
    while (!this.isClosed) {
      const next = this.queue.shift();
      if (next) {
        this.inFlight.set(next.cmd.id, next.d);
        return next.cmd;
      }
      if (Date.now() >= until) return null;
      await sleep(Math.min(50, until - Date.now()));
    }
    return null;
  }

  /** Resultado de um comando entregue. `false` se o id não está em voo. */
  submitResult(commandId: string, result: CommandResult): boolean {
    const d = this.inFlight.get(commandId);
    if (!d) return false;
    this.inFlight.delete(commandId);
    d.resolve(result);
    return true;
  }

  /** Encerra: rejeita tudo que está na fila e em voo. */
  close(reason = 'sessão encerrada'): void {
    if (this.closed) return;
    this.closed = true;
    for (const { d } of this.queue) d.reject(new Error(reason));
    for (const d of this.inFlight.values()) d.reject(new Error(reason));
    this.queue = [];
    this.inFlight.clear();
  }

  private drop(commandId: string): void {
    this.queue = this.queue.filter((q) => q.cmd.id !== commandId);
    this.inFlight.delete(commandId);
  }

  status() {
    return {
      id: this.id,
      startedAt: this.startedAt,
      deadline: this.deadline,
      closed: this.isClosed,
      queued: this.queue.length,
      inFlight: this.inFlight.size,
    };
  }
}

/** Guarda a sessão única e faz a varredura de deadline. */
export class SessionManager {
  private current: Session | null = null;

  open(ttlMs?: number): Session {
    if (this.current && !this.current.isClosed) {
      throw new SessionConflict();
    }
    this.current?.close('substituída por uma nova sessão');
    this.current = new Session(ttlMs);
    return this.current;
  }

  /** Sessão ativa, opcionalmente conferindo o id. `null` se não bate ou expirou. */
  active(id?: string): Session | null {
    const s = this.current;
    if (!s || s.isClosed) return null;
    if (id !== undefined && id !== s.id) return null;
    return s;
  }

  close(id?: string, reason?: string): boolean {
    const s = this.active(id);
    if (!s) return false;
    s.close(reason);
    return true;
  }

  /** Chame periodicamente (ou deixe o server agendar) pra fechar sessão vencida. */
  sweep(): void {
    if (this.current && this.current.isClosed) {
      this.current.close('deadline da sessão atingido');
      this.current = null;
    }
  }

  status() {
    return this.current && !this.current.isClosed ? this.current.status() : null;
  }
}

export class SessionConflict extends Error {
  constructor() {
    super('já existe uma sessão ativa');
    this.name = 'SessionConflict';
  }
}
