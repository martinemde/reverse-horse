import { expect, test } from 'bun:test';
import { migrateStorage, comparisonEnabled, challenge, loginURL, completeLogin, disconnect, getKey } from './public/auth.js';
import { compareWithJev } from './public/compare.js';

// Browser storage is a boundary; these tests never contact an external service.
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('PKCE uses the RFC 7636 S256 challenge', async () => {
  expect(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('login keeps the verifier in the tab and gives OpenRouter only its challenge', async () => {
  const session = storage();
  const url = new URL(await loginURL('http://127.0.0.1:3000', session));
  const saved = JSON.parse(session.getItem('reverse-horse.openrouter.login'));
  expect(saved.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBe(await challenge(saved.verifier));
  expect(url.searchParams.has('code_verifier')).toBe(false);
  const callback = new URL(url.searchParams.get('callback_url'));
  expect(callback.origin + callback.pathname).toBe('http://127.0.0.1:3000/auth/openrouter/callback');
  expect(callback.searchParams.get('state')).toBe(saved.state);
});

test('unsolicited, mismatched, expired, and denied callbacks cannot exchange a code', async () => {
  for (const mode of ['missing', 'mismatched', 'expired', 'denied', 'no-code']) {
    const session = storage(); const local = storage();
    const url = new URL('http://127.0.0.1:3000/auth/openrouter/callback?code=unused&state=wrong');
    if (mode !== 'missing') {
      const auth = new URL(await loginURL(url.origin, session));
      const callback = new URL(auth.searchParams.get('callback_url'));
      if (mode !== 'mismatched') url.searchParams.set('state', callback.searchParams.get('state'));
      if (mode === 'expired') { const saved = JSON.parse(session.getItem('reverse-horse.openrouter.login')); saved.createdAt = 0; session.setItem('reverse-horse.openrouter.login', JSON.stringify(saved)); }
      if (mode === 'denied') url.searchParams.set('error', 'access_denied');
      if (mode === 'no-code') url.searchParams.delete('code');
    }
    await expect(completeLogin(url, session, local)).rejects.toThrow();
    expect(getKey(local)).toBeUndefined();
    expect(session.getItem('reverse-horse.openrouter.login')).toBeNull();
  }
});

test('disconnect forgets the browser key and any pending login', async () => {
  const local = storage(); const session = storage();
  local.setItem('reverse-horse.openrouter.key', 'local-test-value');
  await loginURL('http://localhost:3000', session);
  expect(getKey(local)).toBe('local-test-value');
  disconnect(local, session);
  expect(getKey(local)).toBeUndefined();
  expect(session.getItem('reverse-horse.openrouter.login')).toBeNull();
});

test('no key skips the Jev call', async () => {
  expect(await compareWithJev({}, undefined)).toEqual({ error: 'Comparison skipped · OpenRouter not connected' });
});

test('renaming preserves browser credentials and opt-out without overwriting newer keys', () => {
  const local = storage(), session = storage();
  local.setItem('meat-jev.openrouter.key', 'old-local-test-key');
  local.setItem('meat-jev.openrouter.compare', 'false');
  session.setItem('meat-jev.openrouter.login', 'pending-login');
  migrateStorage(local, session);
  expect(getKey(local)).toBe('old-local-test-key');
  expect(comparisonEnabled(local, true)).toBe(false);
  expect(session.getItem('reverse-horse.openrouter.login')).toBe('pending-login');
  expect(local.getItem('meat-jev.openrouter.key')).toBeNull();
  expect(session.getItem('meat-jev.openrouter.login')).toBeNull();
  local.setItem('meat-jev.openrouter.key', 'stale-key');
  migrateStorage(local, session);
  expect(getKey(local)).toBe('old-local-test-key');
  disconnect(local, session);
  expect(getKey(local)).toBeUndefined();
});
