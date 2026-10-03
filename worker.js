import { DurableObject } from 'cloudflare:workers';
import { createRoom } from './room.js';
import { apiPaths, assetFiles, assetHeaders } from './http.js';

// A single instance owns the shared queue and every WebSocket connection.
// Standard WebSockets keep its in-memory state alive while browsers are connected.
export class ReverseHorseRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = createRoom();
  }

  fetch(request) {
    if (new URL(request.url).pathname !== '/ws') return this.room.request(request);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
    if (!this.room.canOpen()) return new Response('Connection capacity is full', { status: 503, headers: { 'Retry-After': '1' } });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.addEventListener('message', event => this.room.message(server, event.data));
    server.addEventListener('close', () => this.room.close(server));
    server.addEventListener('error', () => { this.room.close(server); server.close(1011, 'WebSocket error'); });
    this.room.open(server);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const arrival = Date.now();
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('origin') !== url.origin) return new Response('Origin not allowed', { status: 403 });
    } else {
      const asset = assetFiles.get(url.pathname);
      if (request.method === 'GET' && asset) {
        url.pathname = asset === 'index.html' ? '/' : `/${asset.replace(/\.html$/, '')}`;
        url.search = '';
        const response = await env.ASSETS.fetch(new Request(url, request));
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(assetHeaders)) headers.set(key, value);
        return new Response(response.body, { status: response.status, headers });
      }
      if (request.method !== 'POST' || !apiPaths.has(url.pathname)) return new Response('Not found', { status: 404 });
    }
    const headers = new Headers(request.headers);
    headers.set('X-Reverse-Horse-Arrival', String(arrival));
    try { return await env.ROOM.getByName('shared').fetch(new Request(request, { headers })); }
    catch (error) {
      if (!error.overloaded) throw error;
      return Response.json({ error: { message: 'Answering capacity is full' } }, { status: 503, headers: { 'Retry-After': '1' } });
    }
  },
};
