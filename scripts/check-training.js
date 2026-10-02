// Usage: bun scripts/check-training.js /path/to/playwright-core/index.mjs
// Uses Chromium. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE for an existing browser.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';
import recordings from '../public/example-results.json';
import { answerRequest } from '../public/protocol.js';

if (!process.argv[2]) throw new Error('Pass the path to an installed playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const app = startServer({ port: 0 });
const errors = [], externalRequests = [], submissions = [];
const choiceCases = [
  [[1, 0, 0], 1, [1, 0, 0]],
  [[1, 1, 0], 1, [0.5, 0.5, 0]],
  [[0.5, 0.5, 0], 0.5, [0.5, 0.5, 0]],
  [[0.5, 0, 0], 0.5, [1, 0, 0]],
  [[0.01, 0, 0], 0.01, [1, 0, 0]],
];
async function pageFor(viewport, init) {
  const context = await browser.newContext({ viewport });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === app.server.url.origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framesent', ({ payload }) => {
    const message = JSON.parse(payload);
    if (message.type === 'submit' || message.type === 'comparison') submissions.push(message);
  }));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  return { context, page };
}
const setRange = (input, value) => input.evaluate((el, value) => {
  el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
async function noOverflow(page) {
  assert.equal(await page.locator('#training').evaluate(el => el.scrollWidth > el.clientWidth), false, 'Training fits the viewport');
}
function sameResponse(actual, expected) {
  for (const [id, answer] of Object.entries(expected.answers)) {
    if (answer.confidence !== undefined) {
      assert.ok(Math.abs(actual.answers[id].confidence - answer.confidence) < 1e-12, 'Confidence agrees across JS engines');
      answer.confidence = actual.answers[id].confidence;
    }
  }
  assert.deepEqual(actual, expected);
}
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await pageFor(viewport);
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.isVisible(), true, 'First visit opens induction');
    assert.equal(await page.locator('#requests form').count(), 0, 'Training does not deal practice');
    await noOverflow(page);
    await page.screenshot({ path: `/tmp/reverse-horse-training-${viewport.width}-induction.png` });
    await dialog.getByRole('button', { name: 'Begin mandatory training' }).click();
    for (const [index, id] of ['payment_needed', 'team', 'urgency'].entries()) {
      const card = dialog.locator('form');
      await card.locator(`[data-question="${id}"]`).waitFor();
      const run = recordings.find(run => Object.hasOwn(run.request.questions, id));
      assert.deepEqual(JSON.parse(await dialog.locator('.training-request-json pre').textContent()), run.request);
      assert.equal(await dialog.locator('.training-actions button').last().isDisabled(), true);
      let values;
      if (id === 'team') {
        assert.equal(await card.getByRole('button').isDisabled(), true, 'Choice needs a selection');
        assert.equal(await card.getByRole('radio').count(), 0);
        for (const [weights, confidence, probabilities] of choiceCases) {
          for (let index = 0; index < weights.length; index++) await setRange(card.locator('input[type=range]').nth(index), weights[index]);
          assert.equal(parseFloat((await card.locator('.choice-confidence').textContent()).replace('Confidence ', '')), confidence * 100);
          assert.deepEqual(await card.locator('.choice-probability').evaluateAll(outputs => outputs.map(output => parseFloat(output.textContent))), probabilities.map(p => p * 100));
          assert.deepEqual(await card.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), weights);
        }
        await setRange(card.locator('input[type=range]').first(), 0.5);
        await setRange(card.locator('input[type=range]').nth(1), 0.2);
        values = { billing: 0.5, technical: 0.2, sales: 0 };
      } else {
        values = id === 'urgency' ? 0.75 : 0.9;
        await setRange(card.locator('input[type=range]'), values);
      }
      await noOverflow(page);
      await page.screenshot({ path: `/tmp/reverse-horse-training-${viewport.width}-${id}.png` });
      await card.getByRole('button').click();
      sameResponse(JSON.parse(await dialog.locator('.training-json pre').first().textContent()), answerRequest(run.request, { [id]: values }));
      assert.deepEqual(JSON.parse(await dialog.locator('.training-jev pre').textContent()), run.jev);
      assert.equal(await card.locator('input:enabled').count(), 0);
      assert.equal(await card.locator('.jev-marker:not([hidden])').count(), id === 'team' ? 3 : 1);
      assert.equal(await dialog.locator('.training-actions button').last().isEnabled(), true, 'A mismatch still permits progress');
      if (index === 0) {
        await dialog.getByRole('button', { name: 'Back', exact: true }).click();
        await dialog.getByRole('button', { name: 'Begin mandatory training' }).click();
        sameResponse(JSON.parse(await dialog.locator('.training-json pre').first().textContent()), answerRequest(run.request, { [id]: values }));
      }
      await page.screenshot({ path: `/tmp/reverse-horse-training-${viewport.width}-${id}-review.png` });
      await noOverflow(page);
      await dialog.locator('.training-actions button').last().click();
    }
    await dialog.getByRole('button', { name: 'Enter the site' }).click();
    assert.equal(await dialog.isVisible(), false);
    await page.locator('#requests form').waitFor();
    await page.reload();
    await page.locator('#requests form').waitFor();
    assert.equal(await dialog.isVisible(), false, 'Completion survives reload');
    await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
    const paused = await page.locator('#requests form .clock').first().textContent();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#requests form .clock').first().textContent(), paused);
    await dialog.getByRole('button', { name: 'Exit training' }).click();
    assert.equal(await page.getByRole('button', { name: 'Play practice', exact: true }).isVisible(), true, 'Replay preserves Pause');
    await context.close();
  }
  // Leaving any stage also saves completion, so training never reopens on its own.
  for (let exitStep = 0; exitStep <= 4; exitStep++) {
    const { context, page } = await pageFor({ width: 390, height: 844 });
    const dialog = page.getByRole('dialog');
    if (exitStep > 0) await dialog.getByRole('button', { name: 'Begin mandatory training' }).click();
    for (let step = 1; step < exitStep; step++) {
      const card = dialog.locator('form');
      await setRange(card.locator('input[type=range]').first(), 0.5);
      await card.getByRole('button').click();
      await dialog.locator('.training-actions button').last().click();
    }
    if (exitStep === 2) await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Exit training' }).click();
    await page.locator('#requests form').waitFor();
    assert.equal(await dialog.isVisible(), false);
    await page.reload();
    assert.equal(await dialog.isVisible(), false, 'Exit saves completion');
    await context.close();
  }
  const { context, page } = await pageFor({ width: 390, height: 844 }, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Begin mandatory training' }).click();
  await dialog.locator('form button').click();
  assert.equal(await dialog.locator('.training-jev').isVisible(), true, 'Recorded comparison works with blocked storage');
  await dialog.getByRole('button', { name: 'Exit training' }).click();
  await page.locator('#requests form').waitFor();
  await context.close();
  assert.deepEqual(submissions, [], 'Training never submits to the shared API queue');
  assert.deepEqual(externalRequests, [], 'Training never calls an external service');

  // Verify the same bars by submitting real live requests, including reload.
  const entry = await pageFor({ width: 390, height: 844 }, () => localStorage.setItem('reverse-horse.training-completed', '1'));
  await entry.page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  await entry.page.locator('#compare').uncheck();
  const request = { model: 'jev-latest', state: 'Choice confidence calibration', questions: {
    pick: { type: 'choice', instructions: 'Which option?', criteria: { a: null, b: null, c: null } },
  } };
  for (const [weights, confidence, probabilities] of choiceCases) {
    const response = fetch(new URL('/api/v1/systemone', app.server.url), { method: 'POST', body: JSON.stringify(request) });
    const card = entry.page.locator('.live-request:not(.answered)');
    await card.waitFor();
    assert.equal(await card.getByRole('radio').count(), 0);
    assert.equal(await card.getByRole('button').isDisabled(), true);
    for (let index = 0; index < weights.length; index++) await setRange(card.locator('input[type=range]').nth(index), weights[index]);
    const submitted = await card.elementHandle();
    await card.getByRole('button').click({ delay: 350 });
    const result = await response;
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).answers.pick, {
      type: 'choice', choice: 'a', confidence,
      probabilities: { a: probabilities[0], b: probabilities[1], c: probabilities[2] },
    });
    await entry.page.waitForFunction(el => el.classList.contains('answered'), submitted);
    assert.deepEqual(await submitted.$$eval('input[type=range]', inputs => inputs.map(input => Number(input.value))), weights, 'Submission preserves bar fullness');
  }
  const latest = await entry.page.locator('.live-request').first().getAttribute('data-id');
  await entry.page.reload();
  const restored = entry.page.locator(`form[data-id="${latest}"]`);
  await restored.waitFor();
  assert.deepEqual(await restored.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), [0.01, 0, 0], 'Reload preserves low confidence');
  await entry.context.close();
  assert.equal(submissions.length, choiceCases.length);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  console.log('Training: desktop/mobile, all API shapes, recorded JEV, back/completion/replay/exit/Escape, blocked storage, and all Choice confidence examples in training and live submissions passed.');
} finally {
  await browser.close();
  await app.stop();
}
