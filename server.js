import { createRoom, roomLimits } from './room.js';
import { assetFiles, assetHeaders } from './http.js';
import { compareWithJev } from './public/compare.js';

export function startServer({ port = Number(process.env.PORT || 3000), hostname = '127.0.0.1', timeoutMs = 30_000, fallback } = {}) {
  const room = createRoom({ timeoutMs, fallback });
  const server = Bun.serve({
    hostname, port, idleTimeout: 0, maxRequestBodySize: roomLimits.requestBytes,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        if (req.headers.get('origin') !== url.origin) return new Response('Origin not allowed', { status: 403 });
        if (!room.canOpen()) return new Response('Connection capacity is full', { status: 503, headers: { 'Retry-After': '1' } });
        return server.upgrade(req) ? undefined : new Response('WebSocket upgrade required', { status: 400 });
      }
      const asset = assetFiles.get(url.pathname);
      if (req.method === 'GET' && asset) return new Response(Bun.file(new URL(`./public/${asset}`, import.meta.url)), { headers: assetHeaders });
      return room.request(req);
    },
    websocket: { idleTimeout: 60, maxPayloadLength: roomLimits.messageBytes, backpressureLimit: roomLimits.frameBytes, closeOnBackpressureLimit: true, open: room.open, close: room.close, message: room.message },
  });
  return { server, stats: room.stats, async stop() { room.stop(); await server.stop(true); } };
}

if (import.meta.main) {
  // Only the CLI reads the key, so tests and browser checks never call a model.
  const key = process.env.OPENROUTER_API_KEY;
  const app = startServer({ fallback: key ? (request, signal) => compareWithJev(request, key, signal) : undefined });
  if (key) console.log('OPENROUTER_API_KEY set · unanswered requests ask Jev after the deadline');
  console.log(`Reverse Horse listening at ${app.server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.stop(); process.exit(0); });
}
