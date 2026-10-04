// Usage: bun scripts/check-questions.js /path/to/playwright-core/index.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';

const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const app = startServer({ port: 0 });
const errors = [], posts = [], external = [];
const localOnly = route => {
  const request = route.request();
  if (new URL(request.url()).origin !== app.server.url.origin) { external.push(request.url()); return route.abort(); }
  if (request.method() === 'POST') posts.push(request.postDataJSON());
  return route.continue();
};
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', localOnly);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/request', app.server.url).href);
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 1, 'The Question editor has a Save action');
  assert.equal(await page.getByRole('link', { name: 'Question', exact: true }).count(), 1);
  const editor = page.locator('#new-question .question-editor');
  await editor.getByLabel('State', { exact: true }).fill('An unfinished draft');
  await editor.getByLabel('Question / instructions', { exact: true }).fill('Is it ready?');
  await page.reload();
  assert.equal(await editor.getByLabel('State', { exact: true }).inputValue(), 'An unfinished draft');
  await editor.getByLabel('State format', { exact: true }).selectOption('json');
  await editor.getByLabel('State', { exact: true }).fill('{"message":"The package is here"}');
  await editor.getByLabel('No means (optional)').fill('Not ready');
  await editor.getByLabel('Yes means (optional)').fill('Ready');
  await editor.getByRole('button', { name: 'Add question', exact: true }).click();
  const questions = editor.locator('[data-part="questions"] > section');
  await questions.nth(1).getByLabel('Question ID').fill('route');
  await questions.nth(1).getByLabel('Type', { exact: true }).selectOption('choice');
  await questions.nth(1).getByLabel('Question / instructions').fill('Where?');
  await questions.nth(1).getByLabel('Option key').nth(0).fill('shipping');
  await questions.nth(1).getByLabel('Option key').nth(1).fill('support');
  await questions.nth(1).getByLabel('Description (optional)').nth(0).fill('Packages');
  await editor.getByRole('button', { name: 'Add question', exact: true }).click();
  await questions.nth(2).getByLabel('Question ID').fill('mood');
  await questions.nth(2).getByLabel('Type', { exact: true }).selectOption('score');
  await questions.nth(2).getByLabel('Question / instructions').fill('How happy?');
  await questions.nth(2).getByLabel('Level 0 description').fill('Sad');
  await questions.nth(2).getByLabel('Level 1 description').fill('Happy');
  const original = JSON.parse(await editor.getByLabel('Generated request JSON').inputValue());
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = page.locator('#saved-questions > article');
  assert.equal(await saved.count(), 1);
  assert.equal(await saved.locator('.question-editor').count(), 0);
  assert.equal(await editor.getByLabel('State', { exact: true }).inputValue(), '');
  assert.equal(await saved.evaluate(el => el.getBoundingClientRect().top > document.querySelector('#new-question').getBoundingClientRect().top), true);
  assert.deepEqual(posts, [], 'Saving stays local');
  await page.reload();
  assert.equal(await saved.count(), 1);
  await saved.getByRole('button', { name: 'Edit', exact: true }).click();
  const inline = saved.locator('.question-editor');
  assert.deepEqual(JSON.parse(await inline.getByLabel('Generated request JSON').inputValue()), original, 'All three types survive reload and edit');
  await inline.getByLabel('State', { exact: true }).fill('{"message":"Edited package"}');
  const edited = JSON.parse(await inline.getByLabel('Generated request JSON').inputValue());
  await page.reload();
  await saved.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.deepEqual(JSON.parse(await inline.getByLabel('Generated request JSON').inputValue()), edited, 'Inline edits autosave before clicking Save');
  await inline.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await saved.count(), 1, 'Editing updates the same saved question');
  assert.equal(await saved.locator('.question-editor').count(), 0);
  await page.screenshot({ path: '/tmp/reverse-horse-questions-mobile.png', fullPage: true });

  const ws = new WebSocket(new URL('/ws', app.server.url).href.replace('http:', 'ws:'), { headers: { Origin: app.server.url.origin } });
  const registered = new Promise(resolve => ws.addEventListener('message', event => { if (JSON.parse(event.data).type === 'presence') resolve(); }));
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'presence', active: true })));
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'queue') ws.send(JSON.stringify({ type: 'ack', version: message.version }));
    for (const item of message.requests || []) {
      const values = Object.fromEntries(Object.entries(item.request.questions).map(([id, q]) => [id, q.type === 'choice' ? Object.fromEntries(Object.keys(q.criteria).map((key, i) => [key, i ? 0 : 1])) : q.type === 'noul' ? 1 : 0.5]));
      ws.send(JSON.stringify({ type: 'submit', id: item.id, values }));
    }
  });
  await registered;
  for (let i = 0; i < 2; i++) {
    await saved.getByRole('button', { name: i ? 'Send again' : 'Send', exact: true }).click();
    await saved.locator('[data-part="response-status"]').filter({ hasText: 'HTTP 200' }).waitFor();
    assert.deepEqual(posts.at(-1), edited);
    assert.equal(JSON.parse(await saved.locator('[data-part="response"]').textContent()).answers.mood.score, 0.5);
  }
  assert.equal(await saved.count(), 1, 'Resending does not duplicate the saved card');

  // Ask Jev too: the modal explains the key, then a mocked OpenRouter login and
  // lookup run entirely in the browser.
  const jevCalls = [];
  const jev = { model: 'jev-latest', answers: {
    question_1: { type: 'noul', noul: 0.9 },
    route: { type: 'choice', choice: 'support', confidence: 0.8, probabilities: { shipping: 0.2, support: 0.8 } },
    mood: { type: 'score', score: 0.4, confidence: 0.7, probabilities: { 0: 0.6, 1: 0.4 } },
  } };
  await context.route('https://openrouter.ai/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth') {
      const callback = new URL(url.searchParams.get('callback_url')); callback.searchParams.set('code', 'test-code');
      return route.fulfill({ status: 302, headers: { Location: callback.href } });
    }
    if (url.pathname === '/api/v1/auth/keys') return route.fulfill({ json: { key: 'test-openrouter-key' } });
    if (url.pathname === '/api/v1/systemone') { jevCalls.push({ auth: route.request().headers().authorization, body: route.request().postDataJSON() }); return route.fulfill({ json: jev }); }
    return route.abort();
  });
  await saved.getByRole('button', { name: 'Ask Jev too', exact: true }).click();
  const modal = page.locator('#jev-connect');
  assert.equal(await modal.isVisible(), true);
  assert.match(await modal.textContent(), /stays in your local browser/);
  await modal.getByRole('button', { name: 'Not now', exact: true }).click();
  assert.equal(await modal.isVisible(), false);
  assert.deepEqual(jevCalls, [], 'Nothing reaches OpenRouter without a key');
  await saved.getByRole('button', { name: 'Ask Jev too', exact: true }).click();
  await modal.getByRole('button', { name: 'Connect OpenRouter', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/request');
  const comparison = saved.locator('.jev-comparison');
  await comparison.waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('reverse-horse.openrouter.key')), 'test-openrouter-key');
  assert.deepEqual(jevCalls, [{ auth: 'Bearer test-openrouter-key', body: edited }], 'The answer survives the login redirect and Jev gets the sent request');
  assert.deepEqual(await comparison.locator('.difference').allTextContents(), ['Matched Jev', 'Different from Jev', 'Different from Jev']);
  assert.equal(await page.locator('#openrouter').isVisible(), true);
  await page.screenshot({ path: '/tmp/reverse-horse-questions-jev.png', fullPage: true });
  await saved.getByRole('button', { name: 'Send again', exact: true }).click();
  await saved.locator('[data-part="response-status"]').filter({ hasText: 'HTTP 200' }).waitFor();
  await comparison.waitFor();
  assert.equal(jevCalls.length, 2, 'Once connected, every answer also asks Jev');
  await page.getByRole('button', { name: 'Disconnect OpenRouter', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('reverse-horse.openrouter.key')), null);
  await page.reload();
  await saved.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.deepEqual(JSON.parse(await inline.getByLabel('Generated request JSON').inputValue()), edited);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile page fits the viewport');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/reverse-horse-questions-desktop.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await inline.getByRole('button', { name: 'Save', exact: true }).click();
  await editor.getByLabel('State', { exact: true }).fill('A second saved question');
  await editor.getByLabel('Question / instructions').fill('Ready again?');
  const newRequest = JSON.parse(await editor.getByLabel('Generated request JSON').inputValue());
  await editor.getByRole('button', { name: 'Send', exact: true }).click();
  assert.equal(await saved.count(), 2, 'Sending a new question also saves it below the editor');
  await saved.first().locator('[data-part="response-status"]').filter({ hasText: 'HTTP 200' }).waitFor();
  assert.deepEqual(posts.at(-1), newRequest);
  ws.close();
  await page.reload();
  assert.equal(await saved.count(), 2);

  const corrupt = await browser.newContext();
  await corrupt.route('**/*', localOnly);
  await corrupt.addInitScript(() => localStorage.setItem('reverse-horse.questions', '{broken'));
  const corruptPage = await corrupt.newPage();
  await corruptPage.goto(new URL('/request', app.server.url).href);
  assert.equal(await corruptPage.locator('#library-error').isVisible(), true);
  await corruptPage.getByLabel('State', { exact: true }).fill('Preserve existing data');
  assert.equal(await corruptPage.evaluate(() => localStorage.getItem('reverse-horse.questions')), '{broken');
  await corrupt.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: draft autosave, saved questions, inline edit, reload, real API send/resend, Ask Jev too login and comparison, and desktop/mobile layout.');
} finally { await browser.close(); await app.stop(); }
