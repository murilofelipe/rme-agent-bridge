/**
 * Contrato de mensagens da ponte (ticket #9).
 *
 * Transporte-agnóstico: o mesmo payload JSON vale por HTTP (ADR 0001) ou por
 * troca de arquivo. Duas mensagens — `BridgeRequest` (script Lua → agente) e
 * `BridgeResponse` (agente → script Lua).
 *
 * A especificação em prosa, para quem implementa o lado Lua, está em
 * `./README.md`.
 */

/** Única versão de contrato suportada neste MVP. */
export const SUPPORTED_VERSION = 1;

/** Teto de tiles numa seleção. Evita payload desproporcional. */
export const MAX_SELECTION_TILES = 4096;

/** Posição absoluta no mapa. `z` é o andar. */
export interface Position {
  x: number;
  y: number;
  z: number;
}

/** Região retangular: `min` e `max` inclusivos em cada eixo. */
export interface Selection {
  min: Position;
  max: Position;
}

export const TILE_FLAG_WALL = 1;
export const TILE_FLAG_BORDER = 2;

/**
 * Contexto compacto de um tile da seleção.
 * `items` e `flags` são omitidos quando vazios / zero.
 */
export interface TileContext {
  x: number;
  y: number;
  z: number;
  /** id do ground; `0` = sem ground. */
  ground: number;
  /** ids dos itens sobre o tile. */
  items?: number[];
  /** bitfield: `TILE_FLAG_WALL | TILE_FLAG_BORDER`. */
  flags?: number;
}

export interface BridgeRequest {
  version: number;
  /** Instrução em linguagem natural digitada pelo humano. */
  instruction: string;
  selection: Selection;
  /**
   * ESPARSO: só os tiles da seleção com conteúdo. Um tile da seleção ausente
   * desta lista é vazio (sem ground, sem item). Ver `./README.md`.
   * Pode vir ausente ou como `{}` (o cliente Lua serializa lista vazia como
   * objeto); a validação normaliza ambos para `[]`.
   */
  tiles: TileContext[];
}

export const OPERATION_TYPES = [
  'setGround',
  'addItem',
  'removeItem',
  'applyBrush',
  'borderize',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export type Operation =
  | { type: 'setGround'; x: number; y: number; z: number; id: number }
  | { type: 'addItem'; x: number; y: number; z: number; id: number; count?: number }
  | { type: 'removeItem'; x: number; y: number; z: number; id: number }
  | { type: 'applyBrush'; x: number; y: number; z: number; name: string }
  | { type: 'borderize'; x: number; y: number; z: number };

export interface BridgeResponse {
  version: number;
  /** Rodar auto-contorno ao fim da transação. Ausente = `true`. */
  autoBorder?: boolean;
  /** Lista ordenada de operações. Vazia = nada a fazer. */
  operations: Operation[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
