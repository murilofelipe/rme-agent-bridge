import { handleRequest, type Brain } from './handler';
import type { BridgeResponse } from '../contract';

import requestValid from '../contract/fixtures/request.valid.json';
import responseValid from '../contract/fixtures/response.valid.json';
import responseOutOfBounds from '../contract/fixtures/response.invalid-out-of-bounds.json';
import responseBadSchema from '../contract/fixtures/response.invalid-schema.json';

const brainOf = (r: BridgeResponse): Brain => () => r;

describe('handleRequest', () => {
  it('response válida passa e mantém a ordem das operações', async () => {
    const res = await handleRequest(requestValid, brainOf(responseValid as BridgeResponse));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.operations.map((o) => o.type)).toEqual(
        (responseValid as BridgeResponse).operations.map((o) => o.type),
      );
    }
  });

  it('request inválido → 422, cérebro nem é chamado', async () => {
    let called = false;
    const res = await handleRequest({ version: 99 }, () => {
      called = true;
      return responseValid as BridgeResponse;
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(422);
    expect(called).toBe(false);
  });

  it('operação fora dos limites da seleção → 500, nada repassado', async () => {
    const res = await handleRequest(requestValid, brainOf(responseOutOfBounds as unknown as BridgeResponse));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(500);
      expect(res.error).toMatch(/fora da seleção/);
    }
  });

  it('schema da response quebrado → 500', async () => {
    const res = await handleRequest(requestValid, brainOf(responseBadSchema as unknown as BridgeResponse));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });

  it('cérebro lança → 502 com erro estruturado', async () => {
    const res = await handleRequest(requestValid, () => {
      throw new Error('agente offline');
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toMatch(/agente offline/);
    }
  });
});
