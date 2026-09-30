import { validateRequest, answerRequest } from './protocol.js';
import { examples } from './examples.js';
import { validateJevResponse } from './public/compare.js';


export function createRoom({ timeoutMs = 30_000 } = {}) {
  const pending = new Map();
  const clients = new Set();
  const results = [];
  const comparisons = new Map();
  let auto = false;
  let autoTimer;
  let exampleIndex = Math.floor(Math.random() * examples.length);
  const json = (body, status = 200) => Response.json(body, { status });
  const error = (message, status) => json({ error: { message } }, status);
  const snapshot = () => JSON.stringify({ type: 'queue', serverTime: Date.now(), auto, results, requests: [...pending.values()].map(({ id, request, createdAt, deadline, source, title, timedOut }) => ({ id, request, createdAt, deadline, source, title, timedOut })) });
  const broadcast = () => { const message = snapshot(); for (const ws of clients) ws.send(message); };
  function scheduleExample() {
    clearTimeout(autoTimer);
    if (auto && clients.size && !pending.size && !comparisons.size) autoTimer = setTimeout(() => {
      if (!auto || !clients.size || pending.size || comparisons.size) return;
      const example = examples[exampleIndex++ % examples.length];
      enqueue(example.request, () => {}, undefined, example);
    }, 4000);
  }
  function enqueue(request, resolve, signal, example) {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const finish = (response, outcome) => {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      signal?.removeEventListener('abort', abort);
      pending.delete(id);
      if (outcome) {
        results.unshift({ id, request, title: entry.title, source: entry.source, status: outcome });
        results.splice(20);
      }
      resolve(response);
      broadcast();
      scheduleExample();
    };
    const abort = () => finish(error('Caller disconnected', 499), 'Caller disconnected');
    const expire = () => {
      const entry = pending.get(id);
      if (!entry || entry.timedOut) return;
      entry.timedOut = true;
      clearTimeout(entry.timer);
      // Resolving the HTTP call must not discard the human's unfinished work.
      signal?.removeEventListener('abort', abort);
      resolve(error('Timed out waiting for a human answer', 504));
      broadcast();
    };
    const timer = setTimeout(expire, timeoutMs);
    pending.set(id, { id, request, createdAt, deadline: createdAt + timeoutMs, title: example?.title || 'API request', source: example?.source, timedOut: false, timer, finish, expire });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else broadcast();
  }
  function compare(entry, human, ws, enabled) {
    const result = { id: entry.id, request: entry.request, title: entry.title, source: entry.source, human, late: entry.timedOut, status: enabled ? 'Asking JEV via OpenRouter…' : 'Answered · comparison off' };
    results.unshift(result);
    results.splice(20);
    broadcast();
    if (!enabled) { scheduleExample(); return; }
    const finish = (status, jev) => {
      clearTimeout(timer);
      comparisons.delete(entry.id);
      result.status = status;
      if (jev) result.jev = jev;
      broadcast();
      scheduleExample();
    };
    const timer = setTimeout(() => finish('Comparison failed: JEV timed out'), 30_000);
    comparisons.set(entry.id, { ws, finish, request: entry.request });
    ws.send(JSON.stringify({ type: 'compare', id: entry.id, request: entry.request }));
  }
  return {
    async request(req) {
      const url = new URL(req.url);
      if (req.method !== 'POST' || !['/api/v1/systemone', '/v1/systemone'].includes(url.pathname)) return error('Not found', 404);
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return error('Origin not allowed', 403);
      let request;
      try {
        const reader = req.body?.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        let body = '';
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024 * 1024) { await reader.cancel(); return error('Request body exceeds 1 MiB', 413); }
          body += decoder.decode(value, { stream: true });
        }
        request = validateRequest(JSON.parse(body + decoder.decode()));
      }
      catch (e) { return error(e.message, 400); }
      if (pending.size >= 100) return error('Queue is full', 503);
      return new Promise(resolve => enqueue(request, resolve, req.signal));
    },
      open(ws) { clients.add(ws); ws.send(snapshot()); scheduleExample(); },
      close(ws) {
        clients.delete(ws);
        for (const comparison of comparisons.values()) if (comparison.ws === ws) comparison.finish('Comparison interrupted · browser disconnected');
        scheduleExample();
      },
      message(ws, raw) {
        try {
          const message = JSON.parse(String(raw));
          if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
          if (message.type === 'comparison') {
            const comparison = comparisons.get(message.id);
            if (!comparison || comparison.ws !== ws) throw new Error('This comparison is no longer waiting');
            if (message.jev) {
              try { comparison.finish('Compared', validateJevResponse(comparison.request, message.jev)); }
              catch { comparison.finish('Comparison failed: invalid JEV response'); }
            }
            else comparison.finish(typeof message.error === 'string' ? message.error.slice(0, 200) : 'Comparison failed');
            return;
          }
          if (message.type === 'auto') {
            if (typeof message.enabled !== 'boolean') throw new Error('Invalid auto setting');
            auto = message.enabled;
            broadcast();
            if (auto && !pending.size && !comparisons.size) {
              const example = examples[exampleIndex++ % examples.length];
              enqueue(example.request, () => {}, undefined, example);
            } else scheduleExample();
            return;
          }
          if (message.type !== 'submit') throw new Error('Unknown message type');
          const entry = pending.get(message.id);
          if (!entry) throw new Error('This request is no longer waiting');
          if (Date.now() >= entry.deadline) entry.expire();
          if (message.compare !== undefined && typeof message.compare !== 'boolean') throw new Error('Invalid comparison setting');
          const response = answerRequest(entry.request, message.values);
          ws.send(JSON.stringify({ type: 'submitted', id: message.id }));
          entry.finish(json(response));
          compare(entry, response, ws, message.compare === true);
        } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); }
      },
    stop() { auto = false; clearTimeout(autoTimer); for (const comparison of comparisons.values()) comparison.finish("Server stopped"); for (const entry of [...pending.values()]) entry.finish(error("Server stopped", 503)); },
  };
}
