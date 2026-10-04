// Usage: bun scripts/check-average.js /path/to/playwright-core/index.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';

if (!process.argv[2]) throw new Error('Pass the path to an installed playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const app = startServer({ port: 0, timeoutMs: 5000 });
const errors = [], externalRequests = [];
const request = { model: 'jev-latest', state: 'Average browser replies', questions: {
  yes: { type: 'noul', instructions: 'Yes?' },
  pick: { type: 'choice', instructions: 'Pick', criteria: { a: null, b: null } },
  score: { type: 'score', instructions: 'Rate', criteria: ['Low', 'Middle', 'High'] },
} };
const setRange = (input, value) => input.evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
async function pageFor(trained = true) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === app.server.url.origin) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  if (trained) await context.addInitScript(() => localStorage.setItem('reverse-horse.training-completed', '1'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  if (trained) { await page.getByRole('button', { name: 'Pause practice', exact: true }).click(); }
  return page;
}
const post = () => fetch(new URL('/v1/systemone', app.server.url), { method: 'POST', body: JSON.stringify(request) });
async function submit(card, values) {
  for (const [index, value] of values.entries()) await setRange(card.locator('input[type=range]').nth(index), value);
  await card.locator('button[type=submit]').click({ delay: 350 });
}
try {
  const first = await pageFor(), second = await pageFor(), trainee = await pageFor(false);
  const response = post();
  const card = page => page.locator('form.live-request:not(.answered)').last();
  await card(first).waitFor(); await card(second).waitFor();
  assert.equal(await card(first).locator('.actions p').textContent(), '0/2 answers received', 'Training does not count as a live answering screen');
  const firstCard = await card(first).elementHandle();
  await submit(card(first), [0.25, 0.5, 0, 0]);
  await first.waitForFunction(el => el.querySelector('.actions p').textContent === 'Waiting for answers · 1/2 received', firstCard);
  assert.equal(await firstCard.$eval('button[type=submit]', el => el.disabled), true);
  assert.equal(await firstCard.$$eval('input:enabled', inputs => inputs.length), 0);
  assert.equal(await firstCard.evaluate(el => el.classList.contains('answered')), false);
  await submit(card(second), [0.75, 0, 1, 2]);
  const result = await response;
  assert.equal(result.status, 200);
  const human = await result.json();
  assert.equal(human.answers.yes.noul, 0.5);
  assert.deepEqual(human.answers.pick, { type: 'choice', choice: 'a', probabilities: { a: 0.5, b: 0.5 }, confidence: 0.75 });
  assert.equal(human.answers.score.score, 1);
  await first.waitForFunction(el => el.classList.contains('answered'), firstCard);
  assert.deepEqual(await firstCard.$$eval('input[type=range]', inputs => inputs.map(input => Number(input.value))), [0.5, 0.75, 0.75, 1]);
  assert.equal(await firstCard.$eval('.actions p', el => el.textContent), 'Average of 2 answers · Answered · no saved Jev run for this question');
  await first.screenshot({ path: '/tmp/reverse-horse-average.png' });

  const next = post();
  await card(first).waitFor();
  const waitingCard = await card(first).elementHandle();
  await submit(card(first), [1, 1, 0, 2]);
  await first.waitForFunction(el => el.querySelector('.actions p').textContent === 'Waiting for answers · 1/2 received', waitingCard);
  await second.getByRole('button', { name: 'Training', exact: true }).click();
  assert.equal((await next).status, 200, 'Saved votes return at the deadline when a panel member opens training');
  await first.waitForFunction(el => el.classList.contains('answered'), waitingCard);
  await trainee.getByRole('button', { name: 'Exit training' }).click();
  const joined = post();
  await card(first).waitFor(); await card(trainee).waitFor();
  assert.equal(await card(first).locator('.actions p').textContent(), '0/2 answers received');
  await submit(card(first), [0, 1, 0, 0]);
  await submit(card(trainee), [1, 0, 1, 2]);
  assert.equal((await (await joined).json()).answers.yes.noul, 0.5);

  await Promise.all([first, second, trainee].map(page => page.close()));
  const solo = await pageFor();
  await solo.getByRole('button', { name: 'Play practice', exact: true }).click();
  const example = solo.locator('form:not(.live-request):not(.answered)');
  await example.waitFor({ timeout: 10_000 });
  const exampleCard = await example.elementHandle();
  const interrupted = post();
  await card(solo).waitFor();
  const topCard = () => solo.locator('#requests > form').first().elementHandle();
  assert.equal(await (await topCard()).evaluate(el => el.classList.contains('live-request')), true, 'A live request goes above a waiting example');
  await submit(card(solo), [1, 1, 0, 2]);
  assert.equal((await interrupted).status, 200);
  await solo.waitForFunction(el => el.parentElement.firstElementChild === el, exampleCard);
  assert.equal(await exampleCard.evaluate(el => el.classList.contains('answered')), false, 'The waiting example rises back to the top unanswered');
  assert.equal(await solo.locator('form.answered .skip').count(), 0, 'Answered cards cannot be skipped');
  await solo.locator(`form[data-id="${await exampleCard.getAttribute('data-id')}"] .skip`).click();
  await solo.waitForFunction(el => !el.isConnected, exampleCard);
  const skipped = post();
  await card(solo).waitFor();
  const liveCard = await card(solo).elementHandle();
  await card(solo).locator('.skip').click();
  await solo.waitForFunction(el => !el.isConnected, liveCard);
  skipped.catch(() => {});
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('PASS: two live UIs average replies, lock submissions while waiting, display the mean, exclude training, and float a waiting example back above an answered live request.');
} finally { await browser.close(); await app.stop(); }
