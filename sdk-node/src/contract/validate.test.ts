import { validateRequest, validateResponse } from './validate';
import { Selection } from './types';

import requestValid from './fixtures/request.valid.json';
import requestTooLarge from './fixtures/request.invalid-too-large.json';
import requestBadVersion from './fixtures/request.invalid-version.json';
import requestBadSchema from './fixtures/request.invalid-schema.json';
import responseValid from './fixtures/response.valid.json';
import responseBadSchema from './fixtures/response.invalid-schema.json';
import responseBadVersion from './fixtures/response.invalid-version.json';
import responseOutOfBounds from './fixtures/response.invalid-out-of-bounds.json';

const selectionOf = requestValid.selection as Selection;

describe('validateRequest', () => {
  it('aceita um request válido', () => {
    const r = validateRequest(requestValid);
    expect(r.ok).toBe(true);
  });

  it('rejeita seleção grande demais', () => {
    const r = validateRequest(requestTooLarge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/seleção grande demais/);
  });

  it('rejeita versão não suportada (fixture)', () => {
    const r = validateRequest(requestBadVersion);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/versão não suportada.*suportada: 1/);
  });

  it('rejeita tile fora da seleção (fixture)', () => {
    const r = validateRequest(requestBadSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fora da seleção/);
  });

  it('rejeita instruction ausente', () => {
    const { instruction: _omit, ...rest } = requestValid;
    const r = validateRequest(rest);
    expect(r.ok).toBe(false);
  });

  it('rejeita min > max na seleção', () => {
    const r = validateRequest({
      ...requestValid,
      selection: { min: { x: 5, y: 5, z: 7 }, max: { x: 1, y: 1, z: 7 } },
      tiles: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/min não pode ser maior/);
  });

  it('não é objeto', () => {
    expect(validateRequest('nope').ok).toBe(false);
    expect(validateRequest([]).ok).toBe(false);
    expect(validateRequest(null).ok).toBe(false);
  });
});

describe('validateResponse', () => {
  it('aceita uma response válida e preserva a ordem das operações', () => {
    const r = validateResponse(responseValid, selectionOf);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.operations.map((o) => o.type)).toEqual([
        'setGround',
        'setGround',
        'addItem',
        'applyBrush',
        'borderize',
      ]);
    }
  });

  it('aceita operations vazio (nada a fazer)', () => {
    const r = validateResponse({ version: 1, operations: [] }, selectionOf);
    expect(r.ok).toBe(true);
  });

  it('repassa o toggle autoBorder sem alterar', () => {
    const r = validateResponse({ ...responseValid, autoBorder: false }, selectionOf);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.autoBorder).toBe(false);
  });

  it('rejeita type de operação desconhecido', () => {
    const r = validateResponse(responseBadSchema, selectionOf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/type desconhecido.*paintRainbow/);
  });

  it('rejeita versão não suportada', () => {
    const r = validateResponse(responseBadVersion, selectionOf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/versão não suportada/);
  });

  it('rejeita operação fora dos limites da seleção', () => {
    const r = validateResponse(responseOutOfBounds, selectionOf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fora da seleção: \(2000,2000,7\)/);
  });

  it('rejeita setGround sem id válido', () => {
    const r = validateResponse(
      { version: 1, operations: [{ type: 'setGround', x: 1000, y: 1000, z: 7 }] },
      selectionOf,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/\.id: inteiro >= 1/);
  });

  it('rejeita applyBrush com name vazio', () => {
    const r = validateResponse(
      { version: 1, operations: [{ type: 'applyBrush', x: 1000, y: 1000, z: 7, name: '' }] },
      selectionOf,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name: string não vazia/);
  });

  it('rejeita addItem com count inválido', () => {
    const r = validateResponse(
      { version: 1, operations: [{ type: 'addItem', x: 1000, y: 1000, z: 7, id: 2782, count: 0 }] },
      selectionOf,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/count: inteiro >= 1/);
  });
});
