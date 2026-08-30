/**
 * Cliente HTTP do relay (ADR 0002). O MCP server NÃO é o editor, então falar
 * com o relay em `127.0.0.1` é ok — só o editor precisa evitar loopback.
 */

export interface CommandOutcome {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface RelayClient {
  command(op: string, args?: unknown): Promise<CommandOutcome>;
  status(): Promise<{ session: unknown }>;
}

export class HttpRelayClient implements RelayClient {
  constructor(private readonly baseUrl: string) {}

  async command(op: string, args?: unknown): Promise<CommandOutcome> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, args }),
      });
    } catch (e) {
      return { ok: false, error: `relay inacessível em ${this.baseUrl}: ${e instanceof Error ? e.message : e}` };
    }
    const body = (await res.json().catch(() => ({}))) as CommandOutcome;
    if (res.ok) return { ok: true, data: body.data };
    return { ok: false, error: body.error ?? `relay respondeu ${res.status}` };
  }

  async status(): Promise<{ session: unknown }> {
    try {
      const res = await fetch(`${this.baseUrl}/status`);
      return (await res.json()) as { session: unknown };
    } catch {
      return { session: null };
    }
  }
}
