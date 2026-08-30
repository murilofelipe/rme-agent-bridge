import { startRelayServer, type RunningRelay } from './server';
import { startFakeEditor } from './fake-editor';

let relay: RunningRelay;
let base: string;

beforeEach(async () => {
  relay = await startRelayServer({ host: '127.0.0.1', port: 0, commandTimeoutMs: 2000 });
  base = `http://127.0.0.1:${relay.port}`;
});
afterEach(async () => {
  await relay.close();
});

async function openSession(): Promise<string> {
  const res = await fetch(`${base}/session`, { method: 'POST' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { sessionId: string }).sessionId;
}

function command(op: string, args?: unknown) {
  return fetch(`${base}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, args }),
  });
}

describe('relay', () => {
  it('POST /session cria uma sessão; a segunda dá 409', async () => {
    await openSession();
    const dup = await fetch(`${base}/session`, { method: 'POST' });
    expect(dup.status).toBe(409);
  });

  it('ciclo completo: comando -> editor falso aplica -> resultado volta, ordem preservada', async () => {
    const sessionId = await openSession();
    const seen: string[] = [];
    const editor = startFakeEditor(base, sessionId, {
      getSelection: () => {
        seen.push('getSelection');
        return { min: { x: 0, y: 0, z: 7 }, max: { x: 3, y: 3, z: 7 } };
      },
      apply: (args) => {
        seen.push('apply');
        return { applied: (args as { operations: unknown[] }).operations.length };
      },
    });

    const sel = await (await command('getSelection')).json();
    expect(sel).toEqual({ ok: true, data: { min: { x: 0, y: 0, z: 7 }, max: { x: 3, y: 3, z: 7 } } });

    const applyRes = await command('apply', {
      bounds: { min: { x: 0, y: 0, z: 7 }, max: { x: 3, y: 3, z: 7 } },
      operations: [
        { type: 'setGround', x: 0, y: 0, z: 7, id: 4526 },
        { type: 'setGround', x: 1, y: 1, z: 7, id: 4526 },
      ],
    });
    expect(applyRes.status).toBe(200);
    expect(await applyRes.json()).toEqual({ ok: true, data: { applied: 2 } });
    expect(seen).toEqual(['getSelection', 'apply']);

    await fetch(`${base}/session/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    await editor.stop();
  });

  it('apply com operação fora dos bounds -> 422 antes de enfileirar', async () => {
    await openSession();
    const res = await command('apply', {
      bounds: { min: { x: 0, y: 0, z: 7 }, max: { x: 1, y: 1, z: 7 } },
      operations: [{ type: 'setGround', x: 99, y: 99, z: 7, id: 4526 }],
    });
    expect(res.status).toBe(422);
    expect(String(((await res.json()) as { error: string }).error)).toMatch(/fora da seleção/);
  });

  it('apply sem bounds -> 422', async () => {
    await openSession();
    const res = await command('apply', { operations: [] });
    expect(res.status).toBe(422);
  });

  it('comando sem sessão ativa -> 409 legível', async () => {
    const res = await command('getSelection');
    expect(res.status).toBe(409);
    expect(String(((await res.json()) as { error: string }).error)).toMatch(/nenhuma sessão ativa/);
  });

  it('op desconhecida -> 400', async () => {
    await openSession();
    const res = await command('dropDatabase');
    expect(res.status).toBe(400);
  });

  it('encerrar a sessão rejeita os comandos pendentes', async () => {
    const sessionId = await openSession();
    const pending = command('getSelection'); // ninguém pra responder
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`${base}/session/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const res = await pending;
    expect(res.status).toBe(502);
    expect(String(((await res.json()) as { error: string }).error)).toMatch(/encerrada/);
  });

  it('comando expira se o editor nunca puxa', async () => {
    await openSession();
    const res = await command('getSelection');
    expect(res.status).toBe(502);
    expect(String(((await res.json()) as { error: string }).error)).toMatch(/expirou/);
  }, 5000);

  it('POST /stream: header ndjson + primeira linha (comando ou keepalive)', async () => {
    const sessionId = await openSession();
    const res = await fetch(`${base}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: sessionId }),
    });
    expect(res.headers.get('content-type')).toMatch(/ndjson/);
    const reader = res.body!.getReader();

    // enfileira um comando ANTES de ler — deve chegar como uma linha JSON
    const pending = command('getSelection');
    const dec = new TextDecoder();
    let acc = '';
    let line: string | undefined;
    while (!line) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      line = acc.split('\n').find((l) => l.startsWith('{'));
    }
    const cmd = JSON.parse(line as string) as { id: string; op: string };
    expect(cmd.op).toBe('getSelection');
    await fetch(`${base}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, commandId: cmd.id, ok: true, data: null }),
    });
    expect(await (await pending).json()).toEqual({ ok: true, data: null });
    await reader.cancel();
  }, 15000);

  it('POST /stream sem sessão -> 404', async () => {
    const res = await fetch(`${base}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: 'nao-existe' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /poll (curl/debug; o editor usa /stream)', async () => {
    const sessionId = await openSession();
    const editor = startFakeEditor(base, sessionId, { getTile: () => ({ ground: 4526 }) });
    const res = await command('getTile', { x: 1, y: 1, z: 7 });
    expect(await res.json()).toEqual({ ok: true, data: { ground: 4526 } });
    await editor.stop();
  });

  it('POST /bridge usa o cérebro injetado (modo "uma instrução")', async () => {
    await relay.close();
    relay = await startRelayServer({
      host: '127.0.0.1',
      port: 0,
      brain: () => ({ version: 1, operations: [{ type: 'borderize', x: 1000, y: 1000, z: 7 }] }),
    });
    base = `http://127.0.0.1:${relay.port}`;
    const res = await fetch(`${base}/bridge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        instruction: 'contorna',
        selection: { min: { x: 1000, y: 1000, z: 7 }, max: { x: 1003, y: 1003, z: 7 } },
        tiles: [],
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { operations: unknown[] }).operations).toHaveLength(1);
  });

  it('GET /status reflete a sessão ativa', async () => {
    expect(await (await fetch(`${base}/status`)).json()).toEqual({ session: null });
    const sessionId = await openSession();
    const { session } = (await (await fetch(`${base}/status`)).json()) as { session: { id: string } };
    expect(session.id).toBe(sessionId);
  });
});
