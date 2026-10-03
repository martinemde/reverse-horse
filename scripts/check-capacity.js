// Local only: bun scripts/check-capacity.js [socket-count] [request-count]
import assert from 'node:assert/strict';
import { startServer } from '../server.js';
import { roomLimits } from '../room.js';

const socketCount = Number(process.argv[2] || 2000), requestCount = Number(process.argv[3] || 2000);
assert(socketCount >= 5 && socketCount <= roomLimits.clients);
assert(requestCount > 0 && requestCount <= 10_000);
const app = startServer({ port: 0, timeoutMs: 300 });
const peers = [], errors = [];
let answer = false, activeAssignments = 0, peakAssignments = 0, peakPending = 0, peakReaders = 0, peakBytes = 0, peakRss = process.memoryUsage().rss;
const request = { model: 'jev-latest', state: 'Local burst check', questions: { yes: { type: 'noul', instructions: 'Yes?' } } };
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(new URL('/ws', app.server.url).href.replace('http:', 'ws:'), { headers: { Origin: app.server.url.origin } });
    const peer = { ws, assigned: 0, submitted: new Set(), frames: 0 }; peers.push(peer);
    let presence = false, queue = false;
    const timer = setTimeout(() => reject(new Error('Connection setup timed out')), 5000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'presence', active: true })));
    ws.addEventListener('error', () => errors.push('WebSocket error'));
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data); peer.frames++;
      if (message.type === 'error') errors.push(message.message);
      if (message.type === 'presence') presence = true;
      if (message.type === 'queue') {
        queue = true;
        assert(message.requests.length <= 1, 'One assignment per browser');
        activeAssignments += message.requests.length - peer.assigned; peer.assigned = message.requests.length;
        peakAssignments = Math.max(peakAssignments, activeAssignments);
        ws.send(JSON.stringify({ type: 'ack', version: message.version }));
        if (answer) for (const item of message.requests) if (!peer.submitted.has(item.id)) {
          peer.submitted.add(item.id); ws.send(JSON.stringify({ type: 'submit', id: item.id, values: { yes: 1 } }));
        }
      }
      if (presence && queue) { clearTimeout(timer); resolve(peer); }
    });
  });
}
const sample = setInterval(() => {
  const stats = app.stats();
  peakPending = Math.max(peakPending, stats.pending); peakReaders = Math.max(peakReaders, stats.readers);
  peakBytes = Math.max(peakBytes, stats.pendingBytes); peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 5);
const post = () => fetch(new URL('/v1/systemone', app.server.url), { method: 'POST', body: JSON.stringify(request) });
try {
  for (let i = 0; i < socketCount; i += 100) await Promise.all(Array.from({ length: Math.min(100, socketCount - i) }, connect));
  await Bun.sleep(20);
  const baseline = app.stats(), started = performance.now();
  const responses = await Promise.all(Array.from({ length: requestCount }, post));
  const statuses = responses.reduce((counts, response) => { counts[response.status] = (counts[response.status] || 0) + 1; return counts; }, {});
  assert(responses.every(r => [503, 504].includes(r.status)));
  assert(statuses[503] > 0 && statuses[504] > 0);
  assert(peakPending <= roomLimits.requests && peakReaders <= roomLimits.readers && peakBytes <= roomLimits.pendingBytes);
  assert(app.stats().pending === 0 && app.stats().readers === 0 && app.stats().pendingBytes === 0);
  await Bun.sleep(30);
  const burst = app.stats();
  answer = true;
  const recovered = await post();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).answers.yes.noul, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sockets: socketCount, requests: requestCount, statuses,
    burstMs: Math.round(performance.now() - started), snapshotFrames: burst.frames - baseline.frames,
    serializedMiB: Number(((burst.sentBytes - baseline.sentBytes) / 1048576).toFixed(3)),
    peakPending, peakReaders, peakPendingBytes: peakBytes, peakAssignments,
    combinedServerAndClientRssMiB: Math.round(peakRss / 1048576), recovered: recovered.status }, null, 2));
} finally { clearInterval(sample); for (const peer of peers) peer.ws.close(); await app.stop(); }
