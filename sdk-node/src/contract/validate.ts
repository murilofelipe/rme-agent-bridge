/**
 * Validação do contrato da ponte (ticket #9).
 *
 * Duas camadas:
 *  1. estrutura/tipos/enum/versão — `validateRequest` / `validateResponse`;
 *  2. semântica que depende do request — limites da seleção (feito em
 *     `validateResponse`, que recebe a `Selection`).
 *
 * Checagens que dependem do estado do editor (id de item existe? tile existe?)
 * NÃO são aqui — acontecem na aplicação, no script Lua, e causam rollback.
 */

import {
  BridgeRequest,
  BridgeResponse,
  MAX_SELECTION_TILES,
  Operation,
  OPERATION_TYPES,
  OperationType,
  Position,
  Selection,
  SUPPORTED_VERSION,
  ValidationResult,
} from './types';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const isPosition = (v: unknown): v is Position =>
  isObject(v) && isInt(v.x) && isInt(v.y) && isInt(v.z);

const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isInt);

const fail = (error: string): ValidationResult<never> => ({ ok: false, error });

function checkVersion(v: unknown): string | null {
  if (v !== SUPPORTED_VERSION) {
    return `versão não suportada: ${JSON.stringify(v)} (suportada: ${SUPPORTED_VERSION})`;
  }
  return null;
}

function selectionTileCount(s: Selection): number {
  return (
    (s.max.x - s.min.x + 1) * (s.max.y - s.min.y + 1) * (s.max.z - s.min.z + 1)
  );
}

function within(p: { x: number; y: number; z: number }, s: Selection): boolean {
  return (
    p.x >= s.min.x &&
    p.x <= s.max.x &&
    p.y >= s.min.y &&
    p.y <= s.max.y &&
    p.z >= s.min.z &&
    p.z <= s.max.z
  );
}

function validateSelection(v: unknown): ValidationResult<Selection> {
  if (!isObject(v) || !isPosition(v.min) || !isPosition(v.max)) {
    return fail('selection: precisa de { min: {x,y,z}, max: {x,y,z} } com inteiros');
  }
  const sel = { min: v.min, max: v.max };
  if (sel.min.x > sel.max.x || sel.min.y > sel.max.y || sel.min.z > sel.max.z) {
    return fail('selection: min não pode ser maior que max em nenhum eixo');
  }
  const n = selectionTileCount(sel);
  if (n > MAX_SELECTION_TILES) {
    return fail(`seleção grande demais: ${n} tiles (máximo ${MAX_SELECTION_TILES})`);
  }
  return { ok: true, value: sel };
}

function validateTileContext(v: unknown, i: number, sel: Selection): string | null {
  if (!isObject(v)) return `tiles[${i}]: precisa ser um objeto`;
  if (!isInt(v.x) || !isInt(v.y) || !isInt(v.z)) return `tiles[${i}]: x/y/z inteiros`;
  if (!isInt(v.ground) || v.ground < 0) return `tiles[${i}].ground: inteiro >= 0`;
  if (v.items !== undefined && !(isIntArray(v.items) && v.items.every((n) => n >= 0))) {
    return `tiles[${i}].items: array de inteiros >= 0`;
  }
  if (v.flags !== undefined && !(isInt(v.flags) && v.flags >= 0)) {
    return `tiles[${i}].flags: inteiro >= 0`;
  }
  if (!within(v as unknown as Position, sel)) {
    return `tiles[${i}] (${v.x},${v.y},${v.z}) fora da seleção`;
  }
  return null;
}

export function validateRequest(payload: unknown): ValidationResult<BridgeRequest> {
  if (!isObject(payload)) return fail('request: precisa ser um objeto JSON');

  const versionError = checkVersion(payload.version);
  if (versionError) return fail(versionError);

  if (typeof payload.instruction !== 'string') {
    return fail('request.instruction: precisa ser string');
  }

  const sel = validateSelection(payload.selection);
  if (!sel.ok) return sel;

  if (!Array.isArray(payload.tiles)) return fail('request.tiles: precisa ser um array');
  for (let i = 0; i < payload.tiles.length; i++) {
    const err = validateTileContext(payload.tiles[i], i, sel.value);
    if (err) return fail(err);
  }

  return { ok: true, value: payload as unknown as BridgeRequest };
}

const ID_TYPES: ReadonlySet<OperationType> = new Set(['setGround', 'addItem', 'removeItem']);

function validateOperation(v: unknown, i: number, sel: Selection): string | null {
  if (!isObject(v)) return `operations[${i}]: precisa ser um objeto`;
  if (typeof v.type !== 'string' || !OPERATION_TYPES.includes(v.type as OperationType)) {
    return `operations[${i}].type desconhecido: ${JSON.stringify(v.type)}`;
  }
  const type = v.type as OperationType;
  if (!isInt(v.x) || !isInt(v.y) || !isInt(v.z)) return `operations[${i}]: x/y/z inteiros`;
  if (!within(v as unknown as Position, sel)) {
    return `operations[${i}] (${type}) fora da seleção: (${v.x},${v.y},${v.z})`;
  }
  if (ID_TYPES.has(type) && !(isInt(v.id) && (v.id as number) >= 1)) {
    return `operations[${i}] (${type}).id: inteiro >= 1`;
  }
  if (type === 'addItem' && v.count !== undefined && !(isInt(v.count) && (v.count as number) >= 1)) {
    return `operations[${i}] (addItem).count: inteiro >= 1`;
  }
  if (type === 'applyBrush' && (typeof v.name !== 'string' || v.name.length === 0)) {
    return `operations[${i}] (applyBrush).name: string não vazia`;
  }
  return null;
}

export function validateResponse(
  payload: unknown,
  selection: Selection,
): ValidationResult<BridgeResponse> {
  if (!isObject(payload)) return fail('response: precisa ser um objeto JSON');

  const versionError = checkVersion(payload.version);
  if (versionError) return fail(versionError);

  if (payload.autoBorder !== undefined && typeof payload.autoBorder !== 'boolean') {
    return fail('response.autoBorder: precisa ser boolean');
  }

  if (!Array.isArray(payload.operations)) {
    return fail('response.operations: precisa ser um array');
  }
  for (let i = 0; i < payload.operations.length; i++) {
    const err = validateOperation(payload.operations[i], i, selection);
    if (err) return fail(err);
  }

  return { ok: true, value: payload as unknown as BridgeResponse };
}

export type { Operation };
