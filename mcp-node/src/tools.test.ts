import { createServer, type Server } from 'node:http';

import { buildTools } from './tools';
import { HttpRelayClient, type RelayClient, type CommandOutcome } from './relay-client';

function fakeRelay(over: Partial<RelayClient> = {}): RelayClient & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  return {
    calls,
    command: async (op, args) => {
      calls.push([op, args]);
      return { ok: true, data: { echo: op } } satisfies CommandOutcome;
    },
    status: async () => ({ session: null }),
    ...over,
  };
}

const tool = (relay: RelayClient, name: string) => buildTools(relay).find((t) => t.name === name)!;

describe('ferramentas MCP', () => {
  it('rme_get_selection vira o comando getSelection', async () => {
    const relay = fakeRelay();
    await tool(relay, 'rme_get_selection').handler({});
    expect(relay.calls).toEqual([['getSelection', undefined]]);
  });

  it('rme_apply_operations repassa operations/bounds/autoBorder pro comando apply', async () => {
    const relay = fakeRelay();
    const bounds = { min: { x: 0, y: 0, z: 7 }, max: { x: 3, y: 3, z: 7 } };
    const operations = [{ type: 'setGround', x: 0, y: 0, z: 7, id: 4526 }];
    await tool(relay, 'rme_apply_operations').handler({ operations, bounds, autoBorder: false });
    expect(relay.calls).toEqual([['apply', { operations, bounds, autoBorder: false }]]);
  });

  it('rme_get_tile passa x/y/z', async () => {
    const relay = fakeRelay();
    await tool(relay, 'rme_get_tile').handler({ x: 10, y: 20, z: 7 });
    expect(relay.calls).toEqual([['getTile', { x: 10, y: 20, z: 7 }]]);
  });

  it('erro do relay vira content isError', async () => {
    const relay = fakeRelay({
      command: async () => ({ ok: false, error: 'nenhuma sessão ativa' }),
    });
    const res = await tool(relay, 'rme_get_selection').handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/nenhuma sessão ativa/);
  });

  it('sucesso vira JSON no content', async () => {
    const relay = fakeRelay({ command: async () => ({ ok: true, data: { min: 1 } }) });
    const res = await tool(relay, 'rme_get_selection').handler({});
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({ min: 1 });
  });
});

describe('HttpRelayClient', () => {
  let srv: Server;
  let port: number;
  const received: { url: string; body: unknown }[] = [];

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        srv = createServer((req, res) => {
          let raw = '';
          req.on('data', (c) => (raw += c));
          req.on('end', () => {
            received.push({ url: req.url!, body: raw ? JSON.parse(raw) : null });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, data: { got: true } }));
          });
        });
        srv.listen(0, '127.0.0.1', () => {
          port = (srv.address() as { port: number }).port;
          resolve();
        });
      }),
  );
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));

  it('POST /commands com { op, args }', async () => {
    const client = new HttpRelayClient(`http://127.0.0.1:${port}`);
    const out = await client.command('getTile', { x: 1, y: 2, z: 7 });
    expect(out).toEqual({ ok: true, data: { got: true } });
    expect(received.at(-1)).toEqual({
      url: '/commands',
      body: { op: 'getTile', args: { x: 1, y: 2, z: 7 } },
    });
  });

  it('relay fora do ar -> ok:false com mensagem', async () => {
    const client = new HttpRelayClient('http://127.0.0.1:1');
    const out = await client.command('getSelection');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/inacess/);
  });
});
