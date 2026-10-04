const KEY = 'reverse-horse.openrouter.key';
const LOGIN = 'reverse-horse.openrouter.login';
const CALLBACK = '/auth/openrouter/callback';
// Move existing credentials only within this browser origin. The comparison
// preference is gone: saved runs always compare and live Jev is asked per question.
export function migrateStorage(storage = localStorage, session = sessionStorage) {
  for (const key of ['meat-jev.openrouter.compare', 'reverse-horse.openrouter.compare']) storage.removeItem(key);
  for (const [store, suffix] of [[storage, 'key'], [session, 'login']]) {
    const old = `meat-jev.openrouter.${suffix}`;
    const key = `reverse-horse.openrouter.${suffix}`;
    const value = store.getItem(old);
    if (value !== null) {
      if (store.getItem(key) === null) store.setItem(key, value);
      store.removeItem(old);
    }
  }
}

const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export async function challenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function getKey(storage = localStorage) { return storage.getItem(KEY) || undefined; }

export function disconnect(storage = localStorage, session = sessionStorage) {
  storage.removeItem(KEY);
  session.removeItem(LOGIN);
}

export async function loginURL(origin, session = sessionStorage) {
  const verifier = random();
  const state = random();
  const callback = new URL(CALLBACK, origin);
  callback.searchParams.set('state', state);
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('callback_url', callback.href);
  url.searchParams.set('code_challenge', await challenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  session.setItem(LOGIN, JSON.stringify({ verifier, state, createdAt: Date.now() }));
  return url.href;
}

export async function completeLogin(url, session = sessionStorage, storage = localStorage) {
  if (url.pathname !== CALLBACK) return false;
  const saved = session.getItem(LOGIN);
  session.removeItem(LOGIN);
  if (url.searchParams.has('error')) throw new Error('OpenRouter authorization was not completed. Try connecting again.');
  let login;
  try { login = JSON.parse(saved); } catch { /* Invalid or missing login must fail closed. */ }
  if (!login || typeof login.verifier !== 'string' || !login.state || url.searchParams.get('state') !== login.state || !Number.isFinite(login.createdAt) || Date.now() - login.createdAt > 10 * 60_000) {
    throw new Error('This login expired or belongs to another tab. Connect to OpenRouter again.');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('OpenRouter did not return an authorization code. Try connecting again.');
  const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: login.verifier, code_challenge_method: 'S256' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OpenRouter login failed (HTTP ${response.status}). Try connecting again.`);
  const data = await response.json();
  if (typeof data.key !== 'string' || !data.key.trim()) throw new Error('OpenRouter did not return an API key.');
  storage.setItem(KEY, data.key);
  return true;
}
