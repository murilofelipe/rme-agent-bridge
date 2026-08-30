import { Session, SessionManager, SessionConflict } from './session';

describe('Session', () => {
  it('entrega comandos na ordem em que foram enfileirados', async () => {
    const s = new Session();
    const p1 = s.enqueue('getSelection', null);
    const p2 = s.enqueue('getTile', { x: 1, y: 2, z: 7 });

    const c1 = await s.poll(100);
    const c2 = await s.poll(100);
    expect(c1?.op).toBe('getSelection');
    expect(c2?.op).toBe('getTile');

    s.submitResult(c1!.id, { ok: true, data: 'a' });
    s.submitResult(c2!.id, { ok: true, data: 'b' });
    expect(await p1).toEqual({ ok: true, data: 'a' });
    expect(await p2).toEqual({ ok: true, data: 'b' });
  });

  it('poll devolve null depois do wait quando a fila está vazia', async () => {
    const s = new Session();
    const t0 = Date.now();
    expect(await s.poll(60)).toBeNull();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });

  it('comando expira se o editor não responde', async () => {
    const s = new Session();
    await expect(s.enqueue('apply', {}, 40)).rejects.toThrow(/expirou/);
  });

  it('close rejeita o que está na fila e em voo', async () => {
    const s = new Session();
    const queued = s.enqueue('getSelection', null);
    const delivered = s.enqueue('getTile', null);
    const c = await s.poll(50); // getSelection sai da fila, vai pra "em voo"
    expect(c?.op).toBe('getSelection');
    s.close('editor fechou');
    await expect(queued).rejects.toThrow(/editor fechou/);
    await expect(delivered).rejects.toThrow(/editor fechou/);
  });

  it('sessão vencida recusa enqueue', async () => {
    const s = new Session(-1); // já nasceu vencida
    expect(s.isClosed).toBe(true);
    await expect(s.enqueue('getSelection', null)).rejects.toThrow(/encerrada/);
  });

  it('renew empurra o deadline', () => {
    const s = new Session(30);
    const before = s.deadline;
    s.renew(10_000);
    expect(s.deadline).toBeGreaterThan(before);
  });
});

describe('SessionManager', () => {
  it('recusa uma segunda sessão enquanto a primeira está viva', () => {
    const m = new SessionManager();
    m.open();
    expect(() => m.open()).toThrow(SessionConflict);
  });

  it('active(id) só devolve a sessão se o id bate', () => {
    const m = new SessionManager();
    const s = m.open();
    expect(m.active(s.id)).toBe(s);
    expect(m.active('outro')).toBeNull();
  });

  it('depois de fechar, dá pra abrir de novo', () => {
    const m = new SessionManager();
    const first = m.open();
    m.close(first.id);
    expect(() => m.open()).not.toThrow();
  });
});
