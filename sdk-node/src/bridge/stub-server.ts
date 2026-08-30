/**
 * Servidor stub do lado-terminal (parte do tracer bullet #10).
 *
 * Fala o transporte do ADR 0001: HTTP, ligado num host que NÃO seja
 * `localhost`/`127.` (o `isUrlSafe` do editor bloqueia esses) — por padrão
 * `0.0.0.0`, alcançável por alias de hostname ou IP de LAN.
 *
 * Recebe um `BridgeRequest`, valida com o contrato (#9), e devolve um
 * `BridgeResponse` fixo. Sem cérebro ainda — isso entra em #12.
 */

import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

import type { BridgeRequest, BridgeResponse } from '../contract';
import { handleRequest } from './handler';
import type { Brain } from './handler';

export interface StubServerOptions {
  /** Host de bind. Padrão `0.0.0.0`. Nunca use `127.0.0.1` — o editor bloqueia. */
  host?: string;
  /** Porta. Padrão `8777`. `0` = porta efêmera (útil em teste). */
  port?: number;
  /** Response fixa devolvida a todo request válido. Ignorada se `respond`/`brain` for dado. */
  cannedResponse?: BridgeResponse;
  /** Gera a response a partir do request (regra fixa síncrona). */
  respond?: (req: BridgeRequest) => BridgeResponse;
  /** Cérebro real (#12) — ex.: `claudeBrain()`. Tem precedência sobre `respond`/`cannedResponse`. */
  brain?: Brain;
  /** Chamado a cada request recebido (log / inspeção em teste). */
  onRequest?: (req: BridgeRequest) => void;
}

/** Regra fixa: preenche o ground de cada tile da seleção com `groundId`. */
export function fillSelection(groundId: number) {
  return (req: BridgeRequest): BridgeResponse => {
    const { min, max } = req.selection;
    const operations: BridgeResponse['operations'] = [];
    for (let z = min.z; z <= max.z; z++) {
      for (let y = min.y; y <= max.y; y++) {
        for (let x = min.x; x <= max.x; x++) {
          operations.push({ type: 'setGround', x, y, z, id: groundId });
        }
      }
    }
    return { version: 1, autoBorder: true, operations };
  };
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('corpo grande demais'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Cria (sem iniciar) o servidor stub. */
export function createStubServer(options: StubServerOptions): Server {
  return createServer((req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'use POST' });
      return;
    }

    const brain: Brain = (parsedReq) => {
      options.onRequest?.(parsedReq);
      if (options.brain) return options.brain(parsedReq);
      const draft = options.respond ? options.respond(parsedReq) : options.cannedResponse;
      if (!draft) throw new Error('stub sem `brain`, `respond` nem `cannedResponse`');
      return draft;
    };

    readBody(req)
      .then(async (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: 'JSON inválido' });
          return;
        }

        const result = await handleRequest(parsed, brain);
        if (result.ok) sendJson(res, 200, result.response);
        else sendJson(res, result.status, { error: result.error });
      })
      .catch((err: unknown) => {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'erro ao ler o corpo' });
      });
  });
}

export interface RunningStubServer {
  server: Server;
  host: string;
  port: number;
  close: () => Promise<void>;
}

/** Cria e inicia o servidor stub. */
export function startStubServer(options: StubServerOptions): Promise<RunningStubServer> {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8777;
  const server = createStubServer(options);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        host,
        port: boundPort,
        close: () =>
          new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
  });
}
