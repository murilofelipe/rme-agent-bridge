/**
 * SDK middleware do RME Agent Bridge.
 *
 * Andaime: apenas as assinaturas públicas descritas na Fase 2 de
 * `docs/planejamento/arquitetura.md`. A implementação (HTTP/WebSocket contra a
 * API em C++) entra em fases futuras.
 */

const NOT_IMPLEMENTED = 'not implemented: andaime da SDK, ver docs/planejamento/arquitetura.md';

export interface RMESessionOptions {
  /** URL base da API embutida no RME, ex.: http://127.0.0.1:8080 */
  baseUrl: string;
}

/** Gerencia a conexão com a API local do RME. */
export class RMESession {
  constructor(private readonly options: RMESessionOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  async connect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async close(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

/** Métodos lógicos de construção de mapa sobre uma `RMESession`. */
export class MapBuilder {
  constructor(private readonly session: RMESession) {}

  async setTile(_x: number, _y: number, _z: number, _itemId: number): Promise<void> {
    void this.session;
    throw new Error(NOT_IMPLEMENTED);
  }

  async drawLake(_centerX: number, _centerY: number, _radius: number, _z: number): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async applyAutoBorder(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
