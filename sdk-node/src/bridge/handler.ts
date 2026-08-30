/**
 * O núcleo do lado-terminal (#11): pega o request cru, valida, chama o
 * "cérebro" e valida a `response` contra o schema (#9) **e** contra os
 * limites da seleção recebida. Nada de operação sai daqui sem passar pelos
 * dois filtros.
 *
 * O `Brain` é a costura para #12 — o stub, uma sessão do Claude Code, ou
 * outro agente qualquer entram por aqui.
 */

import { validateRequest, validateResponse } from '../contract';
import type { BridgeRequest, BridgeResponse } from '../contract';

export type Brain = (req: BridgeRequest) => BridgeResponse | Promise<BridgeResponse>;

export type HandlerResult =
  | { ok: true; response: BridgeResponse }
  | { ok: false; status: number; error: string };

export async function handleRequest(raw: unknown, brain: Brain): Promise<HandlerResult> {
  const reqResult = validateRequest(raw);
  if (!reqResult.ok) return { ok: false, status: 422, error: reqResult.error };

  let draft: BridgeResponse;
  try {
    draft = await brain(reqResult.value);
  } catch (e) {
    return { ok: false, status: 502, error: `cérebro falhou: ${e instanceof Error ? e.message : String(e)}` };
  }

  const respResult = validateResponse(draft, reqResult.value.selection);
  if (!respResult.ok) {
    return { ok: false, status: 500, error: `response inválida para esta seleção: ${respResult.error}` };
  }
  return { ok: true, response: respResult.value };
}
