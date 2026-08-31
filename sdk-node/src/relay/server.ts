/**
 * Relay (ADR 0002): fila de comandos entre o `rme-mcp` e o `rme_agent.lua`.
 *
 * Fala o transporte do ADR 0001 (HTTP num host que não seja `localhost`).
 * Endpoints:
 *   POST /session         { ttlMs? }                      -> 201 { sessionId, deadline } | 409
 *   POST /session/end     { sessionId }                    -> 200 | 404
 *   POST /stream          { session }                      -> 200 ndjson: um `<command>\n` por comando, `:keepalive\n` no idle
 *   GET|POST /poll   (?session&wait | { session, wait })   -> 200 { command } | 204 | 404   (curl/debug; o editor usa /stream)
 *   POST /result          { sessionId, commandId, ok, ... } -> 200 | 404
 *   POST /commands        { op, args }                     -> 200 { ok, data } | 502 { ok:false, error } | 409
 *   POST /bridge          BridgeRequest                    -> 200 BridgeResponse   (modo "uma instrução", ADR 0001)
 *   GET  /status                                           -> 200 { session | null }
 *
 * O editor v4.0 aborta (`std::system_error`) se abrir/fechar um stream por poll,
 * então o `rme_agent.lua` mantém UMA conexão `/stream` aberta pela sessão toda
 * (como o `claude_agent.lua` nativo faz com a API da Anthropic).
 */

import { once } from 'node:events';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

import { SUPPORTED_VERSION, validateResponse } from '../contract';
import type { Selection } from '../contract';
import { claudeBrain, handleRequest, type Brain } from '../bridge';
import {
  SessionConflict,
  SessionManager,
  type CommandOp,
  DEFAULT_COMMAND_TIMEOUT_MS,
} from './session';

const COMMAND_OPS: ReadonlySet<string> = new Set<CommandOp>([
  'getSelection',
  'getMapContext',
  'getTile',
  'apply',
  'endSession',
]);

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_POLL_WAIT_MS = 25_000;

export interface RelayOptions {
  host?: string; // padrão 0.0.0.0 — nunca 127.0.0.1 (o editor bloqueia)
  port?: number; // padrão 8777; 0 = efêmera
  commandTimeoutMs?: number;
  /** Cérebro do modo "uma instrução" (`POST /bridge`). Padrão: `claudeBrain()`. */
  brain?: Brain;
}

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
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('corpo precisa ser um objeto JSON');
  }
  return parsed as Record<string, unknown>;
}

/** Valida os args de `apply` reaproveitando a validação do contrato (#9). */
function validateApplyArgs(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) return 'apply.args: precisa ser um objeto';
  const a = args as Record<string, unknown>;
  if (!Array.isArray(a.operations)) return 'apply.args.operations: precisa ser um array';
  if (a.bounds === undefined) return 'apply.args.bounds: obrigatório ({ min, max }) para validar os limites';
  const r = validateResponse(
    { version: SUPPORTED_VERSION, operations: a.operations, autoBorder: a.autoBorder },
    a.bounds as Selection,
  );
  return r.ok ? null : r.error;
}

export function createRelayServer(options: RelayOptions = {}): Server {
  const sessions = new SessionManager();
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const brain: Brain = options.brain ?? claudeBrain();
  const sweep = setInterval(() => sessions.sweep(), 5_000);
  if (typeof sweep.unref === 'function') sweep.unref();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    const route = `${req.method} ${url.pathname}`;

    const handle = async (): Promise<void> => {
      switch (route) {
        case 'POST /session': {
          const body = await parseBody(req);
          try {
            const s = sessions.open(typeof body.ttlMs === 'number' ? body.ttlMs : undefined);
            sendJson(res, 201, { sessionId: s.id, deadline: s.deadline });
          } catch (e) {
            if (e instanceof SessionConflict) sendJson(res, 409, { error: e.message });
            else throw e;
          }
          return;
        }

        case 'POST /session/end': {
          const body = await parseBody(req);
          const ok = sessions.close(typeof body.sessionId === 'string' ? body.sessionId : undefined);
          sendJson(res, ok ? 200 : 404, { ok });
          return;
        }

        case 'GET /poll':
        case 'POST /poll': {
          // o editor v4.0 só faz streaming via POST (http.get síncrono estoura
          // o timeout de 10s); a query string continua pra curl/testes.
          const body = req.method === 'POST' ? await parseBody(req) : {};
          const sessionId =
            (typeof body.session === 'string' ? body.session : undefined) ??
            url.searchParams.get('session') ??
            undefined;
          const s = sessions.active(sessionId);
          if (!s) {
            sendJson(res, 404, { error: 'nenhuma sessão ativa com esse id' });
            return;
          }
          s.renew();
          const wait =
            (typeof body.wait === 'number' ? body.wait : Number(url.searchParams.get('wait'))) ||
            DEFAULT_POLL_WAIT_MS;
          const cmd = await s.poll(Math.min(wait, 55_000));
          if (cmd) {
            sendJson(res, 200, { command: cmd });
          } else {
            res.writeHead(204);
            res.end();
          }
          return;
        }

        case 'POST /stream': {
          const body = await parseBody(req);
          const sessionId =
            (typeof body.session === 'string' ? body.session : undefined) ??
            url.searchParams.get('session') ??
            undefined;
          const s = sessions.active(sessionId);
          if (!s) {
            sendJson(res, 404, { error: 'nenhuma sessão ativa com esse id' });
            return;
          }
          res.writeHead(200, {
            'content-type': 'application/x-ndjson',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          let open = true;
          req.on('close', () => {
            open = false;
          });
          while (open && !s.isClosed) {
            s.renew();
            const cmd = await s.poll(5_000);
            if (!open || s.isClosed) break;
            const line = cmd ? JSON.stringify(cmd) : ':keepalive';
            if (!res.write(line + '\n')) {
              // editor não está lendo — espera o dreno, com teto
              let timer: NodeJS.Timeout | undefined;
              const drained = await Promise.race([
                once(res, 'drain').then(() => true),
                new Promise<boolean>((r) => {
                  timer = setTimeout(() => r(false), 30_000);
                }),
              ]);
              clearTimeout(timer);
              if (!drained) {
                res.destroy();
                break;
              }
            }
          }
          res.end();
          return;
        }

        case 'POST /result': {
          const body = await parseBody(req);
          const s = sessions.active(typeof body.sessionId === 'string' ? body.sessionId : undefined);
          if (!s) {
            sendJson(res, 404, { error: 'nenhuma sessão ativa com esse id' });
            return;
          }
          const applied = s.submitResult(String(body.commandId), {
            ok: body.ok === true,
            data: body.data,
            error: typeof body.error === 'string' ? body.error : undefined,
          });
          sendJson(res, applied ? 200 : 404, { ok: applied });
          return;
        }

        case 'POST /commands': {
          const body = await parseBody(req);
          const op = String(body.op);
          if (!COMMAND_OPS.has(op)) {
            sendJson(res, 400, { ok: false, error: `op desconhecida: ${JSON.stringify(body.op)}` });
            return;
          }
          if (op === 'apply') {
            const err = validateApplyArgs(body.args);
            if (err) {
              sendJson(res, 422, { ok: false, error: err });
              return;
            }
          }
          const s = sessions.active();
          if (!s) {
            sendJson(res, 409, {
              ok: false,
              error: 'nenhuma sessão ativa — abra pelo menu Scripts do editor (RME Agent → Iniciar sessão)',
            });
            return;
          }
          try {
            const result = await s.enqueue(op as CommandOp, body.args, commandTimeoutMs);
            sendJson(res, result.ok ? 200 : 502, result);
          } catch (e) {
            sendJson(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
          return;
        }

        case 'POST /bridge': {
          // modo "uma instrução" (ADR 0001): sem fila, sem sessão — o cérebro
          // resolve o request inteiro e devolve as operações validadas.
          const body = await parseBody(req);
          const result = await handleRequest(body, brain);
          if (result.ok) sendJson(res, 200, result.response);
          else sendJson(res, result.status, { error: result.error });
          return;
        }

        case 'GET /status': {
          sendJson(res, 200, { session: sessions.status() });
          return;
        }

        default:
          sendJson(res, 404, { error: `rota não encontrada: ${route}` });
      }
    };

    handle().catch((e: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 400, { error: e instanceof Error ? e.message : 'erro ao processar' });
      }
    });
  });

  server.on('close', () => clearInterval(sweep));
  return server;
}

export interface RunningRelay {
  server: Server;
  host: string;
  port: number;
  close: () => Promise<void>;
}

export function startRelayServer(options: RelayOptions = {}): Promise<RunningRelay> {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8777;
  const server = createRelayServer(options);
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
          new Promise<void>((r, j) => {
            server.closeAllConnections?.(); // derruba streams `/stream` abertos
            server.close((e) => (e ? j(e) : r()));
          }),
      });
    });
  });
}
