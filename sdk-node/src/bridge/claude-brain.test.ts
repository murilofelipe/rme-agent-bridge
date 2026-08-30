import { claudeBrain } from './claude-brain';
import { handleRequest } from './handler';
import type { BridgeRequest } from '../contract';

import requestValid from '../contract/fixtures/request.valid.json';

const req = requestValid as unknown as BridgeRequest;

describe('claudeBrain', () => {
  it('instrução vazia → operations: [] sem chamar o binário', async () => {
    let called = false;
    const brain = claudeBrain({
      run: async () => {
        called = true;
        return '{}';
      },
    });
    const res = await brain({ ...req, instruction: '   ' });
    expect(res.operations).toEqual([]);
    expect(called).toBe(false);
  });

  it('parseia o JSON do stdout (mesmo com cercas/ruído em volta)', async () => {
    const brain = claudeBrain({
      run: async () =>
        '```json\n{"version":1,"operations":[{"type":"setGround","x":1000,"y":1000,"z":7,"id":4526}]}\n```\n',
    });
    const res = await brain(req);
    expect(res.operations).toHaveLength(1);
  });

  it('operações válidas passam pelo handler e mantêm a ordem', async () => {
    const brain = claudeBrain({
      run: async () =>
        JSON.stringify({
          version: 1,
          operations: [
            { type: 'setGround', x: 1000, y: 1000, z: 7, id: 4526 },
            { type: 'borderize', x: 1001, y: 1001, z: 7 },
          ],
        }),
    });
    const res = await handleRequest(req, brain);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.response.operations.map((o) => o.type)).toEqual(['setGround', 'borderize']);
  });

  it('stdout sem JSON → o handler devolve 502', async () => {
    const res = await handleRequest(req, claudeBrain({ run: async () => 'desculpe, não consegui' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(502);
  });
});
