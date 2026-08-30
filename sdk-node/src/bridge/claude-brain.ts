/**
 * Cérebro real (#12): usa a sessão do Claude Code que o mapper já paga
 * (`claude -p`), sem API key e sem custo por token além da assinatura.
 *
 * É só um `Brain` (ver handler.ts). A validação (schema + limites) continua
 * no `handleRequest` — nada de validar de novo aqui.
 *
 * ATENÇÃO: uma query real leva ~15-60s. O lado Lua congela a GUI enquanto
 * espera (ADR 0001) — o editor fica sem responder nesse intervalo.
 */

import { execFile } from 'node:child_process';

import type { BridgeRequest, BridgeResponse } from '../contract';
import { SUPPORTED_VERSION, OPERATION_TYPES } from '../contract';
import type { Brain } from './handler';

export interface ClaudeBrainOptions {
  /** Caminho do binário. Padrão `claude`. */
  bin?: string;
  /** Timeout em ms. Padrão 120000. */
  timeoutMs?: number;
  /** Injeta o executor (teste). Recebe o prompt, devolve o stdout cru. */
  run?: (prompt: string) => Promise<string>;
}

function buildPrompt(req: BridgeRequest): string {
  const { min, max } = req.selection;
  return [
    'Você é a ponte entre um agente e o Remere\'s Map Editor (mapas Tibia).',
    'Responda APENAS com um JSON (sem cercas, sem texto em volta) no formato:',
    `{"version":${SUPPORTED_VERSION},"autoBorder":true,"operations":[...]}`,
    `operations: lista de { type, x, y, z, ... } com type em ${OPERATION_TYPES.join('|')}.`,
    'setGround/addItem/removeItem exigem "id" (inteiro); applyBrush exige "name"; borderize só x,y,z.',
    `Toda operação DEVE cair dentro da seleção: min (${min.x},${min.y},${min.z}) max (${max.x},${max.y},${max.z}).`,
    `Contexto atual dos tiles (esparso, só os com conteúdo): ${JSON.stringify(req.tiles)}`,
    `Instrução do usuário: ${JSON.stringify(req.instruction)}`,
  ].join('\n');
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`sem JSON no stdout: ${raw.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function claudeBrain(options: ClaudeBrainOptions = {}): Brain {
  const bin = options.bin ?? 'claude';
  const timeoutMs = options.timeoutMs ?? 120_000;

  const run =
    options.run ??
    ((prompt: string) =>
      new Promise<string>((resolve, reject) => {
        const child = execFile(
          bin,
          ['-p', prompt],
          { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          },
        );
        child.stdin?.end(); // senão o CLI espera ~3s por stdin antes de começar
      }));

  return async (req: BridgeRequest): Promise<BridgeResponse> => {
    if (req.instruction.trim() === '') {
      return { version: SUPPORTED_VERSION, operations: [] };
    }
    const stdout = await run(buildPrompt(req));
    return extractJson(stdout) as BridgeResponse;
  };
}
