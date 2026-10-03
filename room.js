import { validateRequest, answerRequest, averageResponses } from './public/protocol.js';
import { validateJevResponse } from './public/compare.js';
import { apiPaths } from './http.js';

// Shared by Bun and the Durable Object. These are budgets, not tuning knobs.
export const roomLimits = Object.freeze({
  panel: 5, requests: 100, readers: 16, clients: 4096,
  requestBytes: 64 * 1024, pendingBytes: 2 * 1024 * 1024,
  messageBytes: 128 * 1024, frameBytes: 256 * 1024,
  historyBytes: 4 * 1024 * 1024, clientHistoryBytes: 128 * 1024,
  history: 100, comparisons: 16, ackMs: 10_000,
});
const encoder = new TextEncoder();
const size = text => encoder.encode(text).byteLength;
const json = (body, status = 200, headers) => Response.json(body, { status, headers });
const error = (message, status) => json({ error: { message } }, status, status === 503 ? { 'Retry-After': '1' } : undefined);

export function createRoom({ timeoutMs = 30_000 } = {}) {
  const pending = new Map(), clients = new Map(), active = new Set(), readers = new Set();
  const history = new Map(), comparisons = new Map(), dirty = new Set();
  let pendingBytes = 0, historyBytes = 0, flushTimer, stopped = false;
  const counters = { accepted: 0, rejected: 0, frames: 0, sentBytes: 0 };

  function wake() {
    if (!stopped && !flushTimer) flushTimer = setTimeout(flush, 0);
  }
  function changed(state) { if (clients.has(state.ws)) { dirty.add(state); wake(); } }
  function notify(entry) { for (const state of entry.audience) changed(state); }
  function send(state, message) {
    if (!clients.has(state.ws)) return false;
    const data = JSON.stringify(message), bytes = size(data);
    if (bytes > roomLimits.frameBytes) { drop(state, 'Outbound message too large'); return false; }
    try {
      // Bun returns 0 on a dropped send and -1 on a buffered send. Cloudflare
      // returns void. Snapshot acknowledgements bound buffering on both runtimes.
      const sent = state.ws.send(data);
      if (sent === 0) { drop(state, 'WebSocket send failed'); return false; }
      counters.frames++; counters.sentBytes += bytes;
      return true;
    } catch { drop(state, 'WebSocket send failed'); return false; }
  }
  function drop(state, reason) {
    close(state.ws);
    try { state.ws.close(1013, reason); } catch { /* Already closed. */ }
  }
  function snapshot(state) {
    const entry = state.job;
    const requests = entry ? [{ id: entry.id, request: entry.request, createdAt: entry.createdAt, deadline: entry.deadline,
      title: 'API request', timedOut: false, received: entry.answers.size, expected: entry.target,
      submitted: entry.answers.get(state)?.response }] : [];
    const message = { type: 'queue', version: ++state.version, serverTime: Date.now(), requests, results: [], retired: [...state.retired] };
    const budget = Math.min(roomLimits.clientHistoryBytes, roomLimits.frameBytes - size(JSON.stringify(message)) - 1024);
    let bytes = 0;
    const results = state.results.flatMap(id => {
      const record = history.get(id);
      if (!record || bytes + record.bytes > budget) return [];
      bytes += record.bytes;
      return [record.result];
    });
    return { ...message, results };
  }
  function flush() {
    flushTimer = undefined;
    schedule();
    for (const state of [...dirty]) {
      if (state.awaiting) continue; // Keep only the latest state, not a frame queue.
      dirty.delete(state);
      if (!clients.has(state.ws)) continue;
      const message = snapshot(state);
      state.awaiting = message.version; state.retiredSent = message.retired;
      state.ackTimer = setTimeout(() => drop(state, 'WebSocket acknowledgement timed out'), roomLimits.ackMs);
      send(state, message);
    }
  }
  function arm(entry) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => finish(entry, 'Timed out waiting for a human answer', 504), Math.max(0, entry.deadline - Date.now()));
  }
  function schedule() {
    const available = [...active].filter(state => !state.job && !state.awaiting);
    // Shuffle once per scheduling pass; filling a panel does not scan all sockets.
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    for (const entry of pending.values()) {
      if (Date.now() >= entry.deadline) { finish(entry, 'Timed out waiting for a human answer', 504); continue; }
      const deferred = [];
      while (available.length && entry.participants.size < entry.target && entry.audience.size < entry.target * 2) {
        const state = available.pop();
        if (entry.audience.has(state)) { deferred.push(state); continue; }
        state.job = entry;
        entry.participants.add(state); entry.audience.add(state);
        notify(entry);
      }
      available.push(...deferred);
    }
  }
  function release(entry, state, retire = false) {
    if (!entry.answers.has(state)) {
      entry.participants.delete(state);
      if (state.job === entry) state.job = undefined;
      // A retired card is delivered once, then the browser owns its unfinished draft.
      if (retire) state.retired.push({ id: entry.id, request: entry.request, deadline: entry.deadline, late: true });
    }
    changed(state); notify(entry); wake();
  }
  function pruneHistory() {
    while (history.size > roomLimits.history || historyBytes > roomLimits.historyBytes) {
      const [id, record] = history.entries().next().value;
      // An evicted result must not retain a comparison or its request body.
      comparisons.get(id)?.finish('Comparison stopped · result expired', undefined, false);
      history.delete(id); historyBytes -= record.bytes;
      for (const state of record.audience) { state.results = state.results.filter(value => value !== id); changed(state); }
    }
  }
  function save(result, audience) {
    const record = { result, audience: new Set([...audience].filter(state => clients.has(state.ws))), bytes: size(JSON.stringify(result)) };
    history.set(result.id, record); historyBytes += record.bytes;
    for (const state of record.audience) { state.results.unshift(result.id); state.results.splice(20); changed(state); }
    pruneHistory();
    return record;
  }
  function compare(entry, record) {
    const state = [...entry.answers].find(([state, answer]) => clients.has(state.ws) && answer.compare && !state.comparison)?.[0];
    if (!state || comparisons.size >= roomLimits.comparisons || !history.has(entry.id) || stopped) return;
    historyBytes -= record.bytes;
    record.result.status = 'Asking Jev via OpenRouter…';
    record.bytes = size(JSON.stringify(record.result)); historyBytes += record.bytes;
    const comparison = { state, request: entry.request, finish(status, jev, prune = true) {
      if (!comparisons.delete(entry.id)) return;
      clearTimeout(comparison.timer); state.comparison = undefined;
      historyBytes -= record.bytes;
      record.result.status = status;
      if (jev) record.result.jev = jev;
      record.bytes = size(JSON.stringify(record.result)); historyBytes += record.bytes;
      for (const viewer of record.audience) changed(viewer);
      send(state, { type: 'cancel-compare', id: entry.id });
      if (prune) pruneHistory();
    } };
    comparisons.set(entry.id, comparison); state.comparison = entry.id;
    comparison.timer = setTimeout(() => comparison.finish('Comparison failed: Jev timed out'), 30_000);
    pruneHistory();
    if (comparisons.has(entry.id)) send(state, { type: 'compare', id: entry.id, request: entry.request });
  }
  function finish(entry, outcome, status = 200) {
    if (!pending.delete(entry.id)) return;
    clearTimeout(entry.timer); entry.signal?.removeEventListener('abort', entry.abort);
    pendingBytes -= entry.bytes;
    const human = status !== 499 && status !== 503 && entry.answers.size ? averageResponses([...entry.answers.values()].map(answer => answer.response)) : undefined;
    // Resolve before websocket delivery: a stalled browser cannot hold HTTP open.
    entry.resolve(human ? json(human, 200, { 'X-Reverse-Horse-Answers': String(entry.answers.size), 'X-Reverse-Horse-Target': String(entry.target) }) : error(outcome, status));
    entry.resolve = entry.signal = entry.abort = undefined;
    for (const state of entry.audience) {
      if (state.job === entry) {
        state.job = undefined;
        if (status === 504 && !entry.answers.has(state)) release(entry, state, true);
      }
    }
    const record = save({ id: entry.id, request: entry.request, title: 'API request', human,
      answerCount: entry.answers.size, late: false, status: human ? [...entry.answers.values()].some(answer => answer.compare) ? 'Answered · comparison skipped (busy)' : 'Answered · comparison off' : outcome }, entry.audience);
    if (human) compare(entry, record);
    notify(entry); wake();
  }
  function close(ws) {
    const state = clients.get(ws);
    if (!state) return;
    clients.delete(ws); active.delete(state); dirty.delete(state); clearTimeout(state.ackTimer);
    if (state.job) release(state.job, state);
    if (state.comparison) comparisons.get(state.comparison)?.finish('Comparison interrupted · browser disconnected');
    // Completed history should never keep disconnected sockets alive.
    for (const record of history.values()) record.audience.delete(state);
    state.results = []; state.retired = []; state.retiredSent = []; state.job = undefined;
    wake();
  }
  // Submit and skip only act on the request currently assigned to this socket.
  function assigned(state, message) {
    const entry = pending.get(message.id);
    if (!entry) throw new Error('This request is no longer waiting');
    if (Date.now() >= entry.deadline) { finish(entry, 'Timed out waiting for a human answer', 504); throw new Error('This request is no longer waiting'); }
    if (!active.has(state)) throw new Error('The answering screen must be visible');
    if (entry.answers.has(state)) throw new Error('You already answered this request');
    if (state.job !== entry || !entry.participants.has(state)) throw new Error('This request is not assigned to you');
    return entry;
  }
  const handlers = {
    ack(state, message) {
      if (message.version !== state.awaiting || !state.awaiting) return;
      clearTimeout(state.ackTimer); state.awaiting = 0;
      state.retired = state.retired.filter(item => !state.retiredSent.includes(item)); state.retiredSent = [];
      wake();
    },
    ping(state) { send(state, { type: 'pong' }); },
    presence(state, message) {
      if (typeof message.active !== 'boolean') throw new Error('Invalid presence setting');
      if (message.active) active.add(state);
      else { active.delete(state); if (state.job) release(state.job, state); }
      send(state, { type: 'presence', active: message.active }); wake();
    },
    comparison(state, message) {
      const comparison = comparisons.get(message.id);
      if (!comparison || comparison.state !== state) throw new Error('This comparison is no longer waiting');
      if (message.jev) {
        try { comparison.finish('Compared', validateJevResponse(comparison.request, message.jev)); }
        catch { comparison.finish('Comparison failed: invalid Jev response'); }
      } else comparison.finish(typeof message.error === 'string' ? message.error.slice(0, 200) : 'Comparison failed');
    },
    skip(state, message) { release(assigned(state, message), state); },
    submit(state, message) {
      const entry = assigned(state, message);
      if (message.compare !== undefined && typeof message.compare !== 'boolean') throw new Error('Invalid comparison setting');
      const response = answerRequest(entry.request, message.values);
      // Store before sending anything. Retried submissions cannot count twice.
      entry.answers.set(state, { response, compare: message.compare === true });
      if (entry.answers.size === entry.target) finish(entry);
      else { notify(entry); arm(entry); }
    },
  };
  async function request(req) {
    const url = new URL(req.url);
    if (req.method !== 'POST' || !apiPaths.has(url.pathname)) return error('Not found', 404);
    if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) return error('Origin not allowed', 403);
    const length = Number(req.headers.get('content-length'));
    if (length > roomLimits.requestBytes) return error('Request body exceeds 64 KiB', 413);
    // Allow at most two rounds of work for the visible human pool. Reading bodies
    // reserves both a request slot and the maximum bytes before any await.
    const capacity = Math.min(roomLimits.requests, 2 * Math.ceil(active.size / Math.min(roomLimits.panel, active.size || 1)));
    if (stopped || !active.size || readers.size >= roomLimits.readers || pending.size + readers.size >= capacity || pendingBytes + roomLimits.requestBytes > roomLimits.pendingBytes) {
      counters.rejected++; return error('Answering capacity is full', 503);
    }
    const arrival = Number(req.headers.get('X-Reverse-Horse-Arrival'));
    const createdAt = arrival > 0 ? Math.min(arrival, Date.now()) : Date.now(), deadline = createdAt + timeoutMs;
    if (Date.now() >= deadline) return error('Request deadline exceeded', 504);
    const reader = req.body?.getReader();
    let cancel;
    const cancelled = new Promise((_, reject) => { cancel = (message, status) => { reject(Object.assign(new Error(message), { status })); void reader?.cancel().catch(() => {}); }; });
    const admission = { cancel };
    readers.add(admission); pendingBytes += roomLimits.requestBytes;
    const abort = () => cancel('Caller disconnected', 499);
    const timer = setTimeout(() => cancel('Timed out reading request body', 504), Math.max(0, deadline - Date.now()));
    req.signal.addEventListener('abort', abort, { once: true });
    let body, bytes = 0;
    try {
      if (req.signal.aborted) throw Object.assign(new Error('Caller disconnected'), { status: 499 });
      const decoder = new TextDecoder(); let text = '';
      if (reader) while (true) {
        const { done, value } = await Promise.race([reader.read(), cancelled]);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > roomLimits.requestBytes) { void reader.cancel().catch(() => {}); throw Object.assign(new Error('Request body exceeds 64 KiB'), { status: 413 }); }
        text += decoder.decode(value, { stream: true });
      }
      body = validateRequest(JSON.parse(text + decoder.decode()));
      if (Date.now() >= deadline) throw Object.assign(new Error('Timed out reading request body'), { status: 504 });
    } catch (e) { return error(e.message, e.status || 400); }
    finally {
      clearTimeout(timer); req.signal.removeEventListener('abort', abort);
      readers.delete(admission); pendingBytes -= roomLimits.requestBytes;
    }
    return new Promise(resolve => {
      const entry = { id: crypto.randomUUID(), request: body, createdAt, deadline, bytes,
        target: Math.min(roomLimits.panel, active.size), participants: new Set(), audience: new Set(), answers: new Map(), resolve, signal: req.signal };
      // Presence can change while reading. Never admit a zero-vote panel.
      if (stopped || !entry.target) { resolve(error('No answering screens available', 503)); return; }
      entry.abort = () => finish(entry, 'Caller disconnected', 499);
      pending.set(entry.id, entry); pendingBytes += bytes; counters.accepted++;
      req.signal.addEventListener('abort', entry.abort, { once: true });
      if (req.signal.aborted) entry.abort(); else { arm(entry); wake(); }
    });
  }
  return {
    request, close,
    canOpen() { return !stopped && clients.size < roomLimits.clients; },
    open(ws) {
      if (stopped || clients.size >= roomLimits.clients) { try { ws.close(1013, 'Connection capacity is full'); } catch {} return; }
      const state = { ws, version: 0, awaiting: 0, results: [], retired: [], tokens: 40, refillAt: Date.now() };
      clients.set(ws, state); changed(state);
    },
    message(ws, raw) {
      const state = clients.get(ws);
      if (!state || stopped) return;
      // Cloudflare's native receive limit is much larger than ours. Reject large
      // buffers/strings before decoding or allocating a UTF-8 copy of the frame.
      if ((typeof raw === 'string' ? raw.length : raw.byteLength) > roomLimits.messageBytes) { drop(state, 'WebSocket message too large'); return; }
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      if (size(text) > roomLimits.messageBytes) { drop(state, 'WebSocket message too large'); return; }
      try {
        const message = JSON.parse(text);
        const now = Date.now();
        state.tokens = Math.min(40, state.tokens + (now - state.refillAt) / 100); state.refillAt = now;
        if (state.tokens < 1) { drop(state, 'WebSocket message rate exceeded'); return; }
        state.tokens--;
        if (!Object.hasOwn(handlers, message.type)) throw new Error('Unknown message type');
        handlers[message.type](state, message);
      } catch (e) { send(state, { type: 'error', message: e.message }); }
    },
    stats() { return { ...counters, pending: pending.size, readers: readers.size, pendingBytes, clients: clients.size, active: active.size, history: history.size, historyBytes, comparisons: comparisons.size }; },
    stop() {
      stopped = true; clearTimeout(flushTimer); flushTimer = undefined;
      for (const admission of readers) admission.cancel('Server stopped', 503);
      for (const entry of [...pending.values()]) finish(entry, 'Server stopped', 503);
      for (const comparison of [...comparisons.values()]) comparison.finish('Server stopped');
      // The transport owner stops its sockets. Closing Bun sockets here before
      // server.stop(true) makes Bun 1.2.15 wait forever for shutdown.
      for (const state of [...clients.values()]) close(state.ws);
      dirty.clear(); history.clear(); historyBytes = 0;
    },
  };
}
