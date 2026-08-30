import { fillSelection, startStubServer, type RunningStubServer } from './stub-server';
import type { BridgeResponse, Selection } from '../contract';

import requestValid from '../contract/fixtures/request.valid.json';
import responseValid from '../contract/fixtures/response.valid.json';
import responseOutOfBounds from '../contract/fixtures/response.invalid-out-of-bounds.json';

const canned = responseValid as BridgeResponse;

async function post(port: number, body: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}/bridge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('stub-server', () => {
  let running: RunningStubServer;

  afterEach(async () => {
    await running?.close();
  });

  it('devolve a canned response para um request válido e preserva a ordem', async () => {
    running = await startStubServer({ host: '127.0.0.1', port: 0, cannedResponse: canned });
    const { status, json } = await post(running.port, requestValid);
    expect(status).toBe(200);
    expect((json.operations as { type: string }[]).map((o) => o.type)).toEqual(
      canned.operations.map((o) => o.type),
    );
  });

  it('entrega o request parseado ao onRequest', async () => {
    const seen: string[] = [];
    running = await startStubServer({
      host: '127.0.0.1',
      port: 0,
      cannedResponse: canned,
      onRequest: (r) => seen.push(r.instruction),
    });
    await post(running.port, requestValid);
    expect(seen).toEqual([requestValid.instruction]);
  });

  it('422 com o erro de validação para um request inválido', async () => {
    running = await startStubServer({ host: '127.0.0.1', port: 0, cannedResponse: canned });
    const { status, json } = await post(running.port, { version: 99, instruction: 'x' });
    expect(status).toBe(422);
    expect(String(json.error)).toMatch(/versão não suportada/);
  });

  it('400 para JSON inválido', async () => {
    running = await startStubServer({ host: '127.0.0.1', port: 0, cannedResponse: canned });
    const res = await fetch(`http://127.0.0.1:${running.port}/bridge`, {
      method: 'POST',
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('405 para não-POST', async () => {
    running = await startStubServer({ host: '127.0.0.1', port: 0, cannedResponse: canned });
    const res = await fetch(`http://127.0.0.1:${running.port}/bridge`);
    expect(res.status).toBe(405);
  });

  it('respond=fillSelection cobre a seleção do request com setGround', async () => {
    running = await startStubServer({
      host: '127.0.0.1',
      port: 0,
      respond: fillSelection(4526),
    });
    const { status, json } = await post(running.port, requestValid);
    expect(status).toBe(200);
    const ops = json.operations as { type: string; x: number; y: number; id: number }[];
    // seleção 1000..1003 em x e y (fixture) = 16 tiles
    expect(ops).toHaveLength(16);
    expect(ops.every((o) => o.type === 'setGround' && o.id === 4526)).toBe(true);
  });

  it('500 se a canned response não couber na seleção do request', async () => {
    running = await startStubServer({
      host: '127.0.0.1',
      port: 0,
      cannedResponse: responseOutOfBounds as unknown as BridgeResponse,
    });
    const { status, json } = await post(running.port, requestValid);
    expect(status).toBe(500);
    expect(String(json.error)).toMatch(/response inválida/);
  });
});

// guarda: a seleção da fixture de request cobre as operações da fixture de response
it('fixtures coerentes: response.valid cabe em request.valid.selection', () => {
  const sel = requestValid.selection as Selection;
  for (const op of (responseValid as BridgeResponse).operations) {
    expect(op.x).toBeGreaterThanOrEqual(sel.min.x);
    expect(op.x).toBeLessThanOrEqual(sel.max.x);
    expect(op.y).toBeGreaterThanOrEqual(sel.min.y);
    expect(op.y).toBeLessThanOrEqual(sel.max.y);
  }
});
