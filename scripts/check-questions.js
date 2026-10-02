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
  console.log('PASS: draft autosave, saved questions, inline edit, reload, real API send/resend, and desktop/mobile layout.');
} finally { await browser.close(); await app.stop(); }
