/**
 * Local web UI server for `maci ui`.
 *
 * Zero runtime dependencies beyond what the CLI already ships:
 * built on Node's http module, serves the static frontend from dist/web/
 * and exposes a small JSON/SSE API that re-uses core/pipeline.ts.
 *
 * Security model: binds to 127.0.0.1 only; the server performs read-only
 * chain/indexer queries and local proof verification — no keys, no signing.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMACI_CIRCUITS } from '../core/circuits.js';
import {
  NETWORK_DEFAULTS,
  NETWORK_CHOICES,
  type NetworkName,
} from '../core/network.js';
import {
  runRoundVerification,
  runRegistryCheck,
  type PipelineEvent,
} from '../core/pipeline.js';

// dist layout: dist/maci.js + dist/web/*  (tsup copies src/web → dist/web)
const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseNetwork(value: string | null): NetworkName | null {
  if (value === null) return 'mainnet';
  return (NETWORK_CHOICES as readonly string[]).includes(value)
    ? (value as NetworkName)
    : null;
}

// ─── Static files ────────────────────────────────────────────────────────────

async function serveStatic(url: URL, res: http.ServerResponse) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Resolve and confine to WEB_ROOT (no path traversal)
  const filePath = path.normalize(path.join(WEB_ROOT, pathname));
  if (!filePath.startsWith(WEB_ROOT + path.sep) && filePath !== WEB_ROOT) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

// ─── API handlers ────────────────────────────────────────────────────────────

function handleRegistryList(res: http.ServerResponse) {
  const circuits = Object.values(AMACI_CIRCUITS).map((entry) => ({
    label: entry.label,
    production: entry.production,
    source: entry.source,
    params: entry.params,
  }));
  sendJson(res, 200, { circuits, networks: NETWORK_DEFAULTS });
}

function handleRegistryShow(power: string, res: http.ServerResponse) {
  const entry = AMACI_CIRCUITS[power];
  if (!entry) {
    sendJson(res, 404, { error: `Circuit power "${power}" not found in aMACI registry.` });
    return;
  }
  sendJson(res, 200, entry);
}

async function handleRegistryCheck(url: URL, res: http.ServerResponse) {
  const contract = url.searchParams.get('contract');
  const network = parseNetwork(url.searchParams.get('network'));
  const rpc = url.searchParams.get('rpc') ?? undefined;

  if (!contract) {
    sendJson(res, 400, { error: 'Missing required query param: contract' });
    return;
  }
  if (!network) {
    sendJson(res, 400, { error: 'Invalid network. Use "mainnet" or "testnet".' });
    return;
  }

  try {
    const result = await runRegistryCheck(contract, network, rpc);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleVerify(
  url: URL,
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const contract = url.searchParams.get('contract');
  const network = parseNetwork(url.searchParams.get('network'));
  const recheck = url.searchParams.get('recheck') === 'true';
  const rpc = url.searchParams.get('rpc') ?? undefined;
  const indexer = url.searchParams.get('indexer') ?? undefined;

  if (!contract) {
    sendJson(res, 400, { error: 'Missing required query param: contract' });
    return;
  }
  if (!network) {
    sendJson(res, 400, { error: 'Invalid network. Use "mainnet" or "testnet".' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
  });

  const send = (event: string, data: unknown) => {
    if (clientGone) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onEvent = (event: PipelineEvent) => send(event.type, event);

  // The pipeline keeps running even if the client disconnects mid-way;
  // events are simply dropped. This keeps the implementation simple and
  // matches the read-only nature of the work.
  const result = await runRoundVerification(
    { contract, network, rpc, indexer, recheck },
    onEvent
  );

  send('result', result);
  if (!clientGone) res.end();
}

// ─── Server ──────────────────────────────────────────────────────────────────

export type UiServer = {
  server: http.Server;
  port: number;
  url: string;
};

/**
 * Start the local UI server. If the preferred port is taken, retries on
 * incrementally higher ports (up to 20 attempts).
 */
export function startUiServer(preferredPort: number): Promise<UiServer> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed');
        return;
      }

      if (url.pathname === '/api/registry') {
        handleRegistryList(res);
      } else if (url.pathname.startsWith('/api/registry/check')) {
        await handleRegistryCheck(url, res);
      } else if (url.pathname.startsWith('/api/registry/')) {
        const power = decodeURIComponent(url.pathname.slice('/api/registry/'.length));
        handleRegistryShow(power, res);
      } else if (url.pathname === '/api/verify') {
        await handleVerify(url, req, res);
      } else if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Unknown API endpoint' });
      } else {
        await serveStatic(url, res);
      }
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      } else {
        res.end();
      }
    }
  });

  const MAX_ATTEMPTS = 20;

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryListen = (port: number) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_ATTEMPTS) {
          attempt += 1;
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolve({ server, port, url: `http://127.0.0.1:${port}` });
      });
    };

    tryListen(preferredPort);
  });
}
