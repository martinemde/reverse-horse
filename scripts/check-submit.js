// Usage: bun scripts/check-submit.js /path/to/playwright-core/index.mjs
// Requires Playwright's WebKit browser (use its CLI: install webkit).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';
import { examples } from '../public/examples.js';

if (!process.argv[2]) throw new Error('Pass the path to an installed playwright-core/index.mjs');
const { webkit } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await webkit.launch({ headless: true });
const app = startServer({ port: 0, timeoutMs: 100 });
try {
  const page = await browser.newPage();
  const errors = [];
  const externalRequests = [];
  page.on('request', request => { if (new URL(request.url()).origin !== app.server.url.origin) externalRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  assert.equal(await page.locator('#compare').isChecked(), true);
  await page.locator('#auto').check();
  for (let i = 0; i < examples.length; i++) {
    await page.locator('form.request').waitFor();
    await page.locator('#auto').uncheck();
    assert.equal(await page.locator('form.request fieldset.question').count(), 1);
    const choices = page.locator('form.request input[type=radio]');
    if (await choices.count()) {
      assert.equal(await page.locator('form.request input[type=radio]:checked').count(), 0);
      assert.equal(await page.locator('form.request button').isDisabled(), true);
      assert.deepEqual(await page.locator('form.request input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), Array(await choices.count()).fill(0));
      // The first option must be selectable too, without an earlier default choice.
      await choices.first().check();
      assert.equal(await page.locator('form.request button').isEnabled(), true);
      assert.deepEqual(await page.locator('form.request input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), [1, ...Array(await choices.count() - 1).fill(0)]);
    }
    for (const slider of await page.locator('form.request input[type=range]').all()) {
      await slider.focus();
      await page.keyboard.press('ArrowRight');
    }
    if (await choices.count()) {
      const percentages = await page.locator('form.request output').allTextContents();
      const total = percentages.reduce((sum, text) => sum + parseFloat(text), 0);
      assert.ok(Math.abs(total - 100) < 0.2);
      assert.ok(parseFloat(percentages[1]) > 0);
    }
    // Span several timer ticks between press and release. Replacing button text
    // here used to suppress WebKit's click event, leaving the form on screen.
    await page.locator('form.request button').click({ delay: 350 });
    await page.locator('form.request').waitFor({ state: 'detached', timeout: 1500 });
    assert.equal(await page.locator('#history .result').count(), Math.min(i + 1, 20));
    assert.match(await page.locator('#history .result').first().textContent(), /Compared with saved JEV run/);
    assert.match(await page.locator('#history .result').first().locator('.comparison .answer-value').first().textContent(), /^(Matched JEV|Different from JEV)$/);
    if (i + 1 < examples.length) await page.locator('#auto').check();
  }
  await page.locator('#compare').uncheck();
  await page.locator('#auto').check();
  await page.locator('#auto').uncheck();
  if (await page.locator('form.request input[type=radio]').count()) await page.locator('form.request input[type=radio]').first().check();
  await page.locator('form.request button').click({ delay: 350 });
  await page.locator('form.request').waitFor({ state: 'detached', timeout: 1500 });
  assert.match(await page.locator('#history .result').first().textContent(), /Answered · comparison off/);
  const response = fetch(new URL('/api/v1/systemone', app.server.url), {
    method: 'POST', body: JSON.stringify(examples[0].request),
  });
  await page.locator('form.request').waitFor();
  assert.equal((await response).status, 504);
  if (await page.locator('form.request input[type=radio]').count()) await page.locator('form.request input[type=radio]').first().check();
  await page.locator('form.request button').click({ delay: 350 });
  await page.locator('form.request').waitFor({ state: 'detached', timeout: 1500 });
  assert.equal(await page.locator('#history .result').count(), Math.min(examples.length + 1, 20) + 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(`WebKit: submitted ${examples.length} practice rounds and a timed-out API request using slow clicks.`);
} finally {
  await browser.close();
  await app.stop();
}
