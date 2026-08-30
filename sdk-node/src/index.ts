/**
 * `@rme-agent-bridge/sdk` — o lado-terminal da ponte.
 *
 * - `contract` (#9): tipos + validação do formato de mensagem, usados pelos dois lados.
 * - `bridge` (#10): servidor stub que fala o transporte do ADR 0001 e devolve
 *   uma `BridgeResponse` fixa. O handler com cérebro real entra em #12.
 */

export * from './contract';
export * from './bridge';
export * from './relay';
