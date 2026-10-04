import { afterEach, expect, test } from 'bun:test';
import { createRoom, roomLimits } from './room.js';

const rooms = [];
afterEach(() => { for (const room of rooms) room.stop(); rooms.length = 0; });
const body = { model: 'jev-latest', state: 'Capacity test', questions: { yes: { type: 'noul', instructions: 'Yes?' } } };
function create(options) { const room = createRoom(options); rooms.push(room); return room; }
function post(room, options = {}) { return room.request(new Request('http://localhost/v1/systemone', { method: 'POST', body: JSON.stringify(body), ...options })); }
const tick = () => Bun.sleep(5);
// Websocket transports are the app boundary. These peers can lose sends or
// withhold acknowledgements without mocking the coordinator or its scheduler.
function peer(room, { ack = true, active = true } = {}) {
  const messages = [];
  const ws = { broken: false, closed: false,
    send(raw) {
      if (ws.broken) throw new Error('Transport closed');
      const message = JSON.parse(raw); messages.push(message);
      if (ack && message.type === 'queue') queueMicrotask(() => room.message(ws, JSON.stringify({ type: 'ack', version: message.version })));
      return raw.length;
    }, close(code) { ws.closed = code; },
  };
  room.open(ws); room.message(ws, JSON.stringify({ type: 'presence', active }));
  return { ws, messages, send(message) { room.message(ws, JSON.stringify(message)); },
    get item() { return messages.findLast(m => m.type === 'queue')?.requests[0]; } };
}

test('a thousand-request burst has bounded fanout and recovers after every deadline', async () => {
  const room = create({ timeoutMs: 150 });
  const peers = Array.from({ length: 1000 }, () => peer(room));
  await tick();
  const before = room.stats();
  const calls = Array.from({ length: 1000 }, () => post(room));
  await tick();
  const admitted = room.stats().accepted;
  expect(admitted).toBeGreaterThan(0);
  expect(admitted).toBeLessThanOrEqual(roomLimits.readers);
  const assigned = peers.flatMap(p => p.item ? [p.item] : []);
  expect(assigned).toHaveLength(admitted * roomLimits.panel);
  for (const id of new Set(assigned.map(item => item.id))) expect(assigned.filter(item => item.id === id)).toHaveLength(5);
  expect(room.stats().frames - before.frames).toBe(admitted * 5);
  expect(room.stats().sentBytes - before.sentBytes).toBeLessThan(100_000);
  const responses = await Promise.all(calls);
  expect(responses.filter(r => r.status === 503)).toHaveLength(1000 - admitted);
  expect(responses.filter(r => r.status === 504)).toHaveLength(admitted);
  expect(responses.find(r => r.status === 503).headers.get('Retry-After')).toBe('1');
  expect(room.stats().pending).toBe(0); expect(room.stats().pendingBytes).toBe(0);
  expect(room.stats().historyBytes).toBeLessThanOrEqual(roomLimits.historyBytes);
  expect((await post(room)).status).toBe(504);
});

test('a skip replaces a panel member without expanding votes or assigning two cards', async () => {
  const room = create(); const peers = Array.from({ length: 6 }, () => peer(room));
  await tick(); const call = post(room); await tick();
  const panel = peers.filter(p => p.item), reserve = peers.find(p => !p.item);
  expect(panel).toHaveLength(5);
  const id = panel[0].item.id;
  panel[0].send({ type: 'skip', id }); await tick();
  expect(panel[0].item).toBeUndefined(); expect(reserve.item.id).toBe(id);
  expect(reserve.item.expected).toBe(5);
  for (const p of panel.slice(1)) p.send({ type: 'submit', id, values: { yes: 0 } });
  reserve.send({ type: 'submit', id, values: { yes: 1 } });
  const response = await call;
  expect(response.headers.get('X-Reverse-Horse-Answers')).toBe('5');
  expect(response.headers.get('X-Reverse-Horse-Target')).toBe('5');
  expect((await response.json()).answers.yes.noul).toBe(0.2);
});

test('lost websocket sends are isolated from healthy responders and HTTP completion', async () => {
  const room = create(); const first = peer(room), broken = peer(room), spare = peer(room, { active: false });
  await tick(); const call = post(room); await tick();
  const id = first.item.id; broken.ws.broken = true;
  first.send({ type: 'submit', id, values: { yes: 0 } }); await tick();
  expect(broken.ws.closed).toBe(1013);
  spare.send({ type: 'presence', active: true }); await tick();
  expect(spare.item.id).toBe(id);
  spare.send({ type: 'submit', id, values: { yes: 1 } });
  expect((await (await call).json()).answers.yes.noul).toBe(0.5);
  await tick(); expect(first.messages.findLast(m => m.type === 'queue').results[0].human.answers.yes.noul).toBe(0.5);
});

test('unacknowledged snapshots coalesce and cannot block the HTTP deadline', async () => {
  const room = create({ timeoutMs: 50 }); const slow = peer(room, { ack: false });
  await tick(); const initial = slow.messages.find(m => m.type === 'queue');
  // Let the assignment through, then stop reading/acknowledging.
  slow.send({ type: 'ack', version: initial.version });
  const call = post(room); await tick();
  const assignment = slow.item; expect(assignment).toBeDefined();
  const frames = room.stats().frames;
  slow.send({ type: 'submit', id: assignment.id, values: { yes: 1 } });
  expect((await call).status).toBe(200); await tick();
  expect(room.stats().frames).toBe(frames);
  slow.send({ type: 'ack', version: initial.version }); await tick();
  expect(room.stats().frames).toBe(frames); // Stale acknowledgements release nothing.
  slow.send({ type: 'ack', version: slow.messages.findLast(m => m.type === 'queue').version }); await tick();
  const final = slow.messages.findLast(m => m.type === 'queue');
  expect(final.requests).toEqual([]); expect(final.results[0].human.answers.yes.noul).toBe(1);
});

test('slow body readers reserve capacity, expire from arrival, and are cancelled', async () => {
  const room = create({ timeoutMs: 50 }); Array.from({ length: 100 }, () => peer(room)); await tick();
  let cancelled = 0;
  const calls = Array.from({ length: roomLimits.readers }, () => post(room, {
    body: new ReadableStream({ cancel() { cancelled++; } }), duplex: 'half',
  }));
  expect(room.stats().readers).toBe(16);
  const overflow = await post(room);
  expect(overflow.status).toBe(503);
  expect((await Promise.all(calls)).every(r => r.status === 504)).toBe(true);
  expect(cancelled).toBe(16); expect(room.stats().readers).toBe(0); expect(room.stats().pendingBytes).toBe(0);
  expect((await post(room)).status).toBe(504);
});

test('body cancellation and server shutdown release reservations without waiting for input', async () => {
  const room = create(); peer(room); await tick(); const controller = new AbortController();
  const abandoned = post(room, { signal: controller.signal, body: new ReadableStream(), duplex: 'half' });
  controller.abort(); expect((await abandoned).status).toBe(499);
  expect(room.stats().pendingBytes).toBe(0);
  const waiting = post(room, { body: new ReadableStream(), duplex: 'half' });
  room.stop(); expect((await waiting).status).toBe(503);
  expect(room.stats().readers).toBe(0); expect(room.stats().pendingBytes).toBe(0);
});

test('oversized and deeply nested requests cannot consume a panel', async () => {
  const room = create(); peer(room); await tick();
  expect((await post(room, { headers: { 'Content-Length': String(roomLimits.requestBytes + 1) } })).status).toBe(413);
  expect((await post(room, { body: JSON.stringify({ ...body, state: 'x'.repeat(roomLimits.requestBytes) }) })).status).toBe(413);
  let state = 'deep'; for (let i = 0; i < 20; i++) state = { state };
  expect((await post(room, { body: JSON.stringify({ ...body, state }) })).status).toBe(400);
  expect((await post(room, { body: JSON.stringify({ ...body, state: Array.from({ length: 3000 }, () => ({})) }) })).status).toBe(400);
  expect(room.stats().accepted).toBe(0); expect(room.stats().pendingBytes).toBe(0);
});

test('connections, inbound message sizes, and message rates have hard limits', async () => {
  const room = create(); const peers = Array.from({ length: roomLimits.clients }, () => peer(room, { active: false }));
  expect(room.canOpen()).toBe(false); const extra = peer(room); expect(extra.ws.closed).toBe(1013);
  expect(room.stats().clients).toBe(roomLimits.clients);
  const flooder = peers[0];
  for (let i = 0; i < 45; i++) flooder.send({ type: 'ping' });
  expect(flooder.ws.closed).toBe(1013);
  room.message(peers[1].ws, 'x'.repeat(roomLimits.messageBytes + 1));
  expect(peers[1].ws.closed).toBe(1013); expect(room.canOpen()).toBe(true);
  room.message(peers[2].ws, new Uint8Array(roomLimits.messageBytes + 1));
  expect(peers[2].ws.closed).toBe(1013);
});

test('history byte eviction keeps every snapshot within its budget', async () => {
  const room = create(); const peers = Array.from({ length: 300 }, () => peer(room)); await tick();
  const large = { ...body, state: 'x'.repeat(60 * 1024) };
  for (let i = 0; i < 75; i++) {
    const call = post(room, { body: JSON.stringify(large) }); await tick();
    const panel = peers.filter(p => p.item && !p.item.submitted);
    expect(panel).toHaveLength(5);
    for (const p of panel) p.send({ type: 'submit', id: p.item.id, values: { yes: 1 } });
    expect((await call).status).toBe(200); await tick();
    expect(room.stats().historyBytes).toBeLessThanOrEqual(roomLimits.historyBytes);
  }
  expect(room.stats().history).toBeLessThan(75);
  for (const p of peers) for (const message of p.messages) expect(new TextEncoder().encode(JSON.stringify(message)).byteLength).toBeLessThanOrEqual(roomLimits.frameBytes);
});

test('missing acknowledgements disconnect stalled sockets without retaining their request', async () => {
  const room = create({ timeoutMs: 50 }); const stalled = peer(room, { ack: false });
  await tick(); const call = post(room);
  expect((await call).status).toBe(504);
  expect(room.stats().pending).toBe(0); expect(room.stats().pendingBytes).toBe(0);
  await Bun.sleep(roomLimits.ackMs + 25);
  expect(stalled.ws.closed).toBe(1013); expect(room.stats().clients).toBe(0);
}, 12_000);
