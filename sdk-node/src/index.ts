/**
 * `@rme-agent-bridge/sdk` — o lado-terminal da ponte.
 *
 * Por enquanto expõe só o **contrato de mensagens** (ticket #9): tipos + a
 * validação usada pelos dois lados. O handler que fala com a sessão do agente
 * e o adaptador de transporte (ADR 0001) entram nos tickets seguintes.
 */

export * from './contract';
