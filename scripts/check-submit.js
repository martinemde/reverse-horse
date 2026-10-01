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
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  await page.locator('#auto').check();
  for (let i = 0; i < examples.length; i++) {
    await page.locator('form.request').waitFor();
    await page.locator('#auto').uncheck();
    for (const slider of await page.locator('form.request input[type=range]').all()) {
      await slider.focus();
      await page.keyboard.press('ArrowRight');
    }
    // Span several timer ticks between press and release. Replacing button text
    // here used to suppress WebKit's click event, leaving the form on screen.
    await page.locator('form.request button').click({ delay: 350 });
    await page.locator('form.request').waitFor({ state: 'detached', timeout: 1500 });
    assert.equal(await page.locator('#history .result').count(), i + 1);
    if (i + 1 < examples.length) await page.locator('#auto').check();
  }
  const response = fetch(new URL('/api/v1/systemone', app.server.url), {
    method: 'POST', body: JSON.stringify(examples[0].request),
  });
  await page.locator('form.request').waitFor();
  assert.equal((await response).status, 504);
  await page.locator('form.request button').click({ delay: 350 });
  await page.locator('form.request').waitFor({ state: 'detached', timeout: 1500 });
  assert.equal(await page.locator('#history .result').count(), examples.length + 1);
  assert.deepEqual(errors, []);
  console.log(`WebKit: submitted ${examples.length} practice rounds and a timed-out API request using slow clicks.`);
} finally {
  await browser.close();
  await app.stop();
}
