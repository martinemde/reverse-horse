// Usage: bun scripts/check-submit.js /path/to/playwright-core/index.mjs
// Requires Playwright's WebKit browser (use its CLI: install webkit).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';
import { examples } from '../public/examples.js';
import recordings from '../public/example-results.json';
import { answerRequest } from '../public/protocol.js';
import { matchesJev } from '../public/compare.js';

if (!process.argv[2]) throw new Error('Pass the path to an installed playwright-core/index.mjs');
const { webkit } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await webkit.launch({ headless: true });
const app = startServer({ port: 0, timeoutMs: 100 });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], externalRequests = [], dealt = [];
  page.on('request', request => { if (new URL(request.url()).origin !== app.server.url.origin) externalRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  assert.equal(await page.locator('#compare').isChecked(), true);
  const active = page.locator('form.request:not(.answered)');
  const setRange = (input, value) => input.evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.locator('#auto').check();
  for (let i = 0; i < examples.length; i++) {
    await active.waitFor();
    await page.locator('#auto').uncheck();
    assert.equal(await active.locator('fieldset.question').count(), 1);
    const title = await active.locator('h2').textContent();
    const id = await active.locator('fieldset').getAttribute('data-question');
    const run = recordings.find(run => run.title === title && Object.hasOwn(run.request.questions, id));
    assert.ok(run);
    const question = run.request.questions[id], jev = run.jev.answers[id];
    dealt.push(JSON.stringify(run.request));
    const choices = active.locator('input[type=radio]');
    if (await choices.count()) {
      assert.equal(await active.locator('input[type=radio]:checked').count(), 0);
      assert.equal(await active.locator('button').isDisabled(), true);
      assert.deepEqual(await active.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), Array(await choices.count()).fill(0));
      await choices.first().check();
      assert.equal(await active.locator('button').isEnabled(), true);
      const keys = Object.keys(question.criteria);
      const chosen = i % 2 ? keys.find(key => key !== jev.choice) : jev.choice;
      await choices.nth(keys.indexOf(chosen)).check();
      // Add a second option, and verify both sliders are actual probabilities.
      await setRange(active.locator('input[type=range]').nth((keys.indexOf(chosen) + 1) % keys.length), 0.2);
      const probabilities = await active.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value)));
      assert.ok(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 0.001);
      assert.ok(probabilities.includes(0.2));
    } else {
      const matching = question.type === 'noul' ? (jev.noul >= 0.5 ? 0.8 : 0.2) : Math.round(jev.score);
      const different = question.type === 'noul' ? (jev.noul >= 0.5 ? 0.2 : 0.8) : (Math.round(jev.score) === 0 ? question.criteria.length - 1 : 0);
      await setRange(active.locator('input[type=range]'), i % 2 ? different : matching);
    }
    await active.locator('button').scrollIntoViewIfNeeded();
    const original = await active.elementHandle();
    const before = await original.evaluate(el => ({ top: el.getBoundingClientRect().top, values: [...el.querySelectorAll('input[type=range]')].map(input => input.value), sliders: [...el.querySelectorAll('input[type=range]')].map(input => input.getBoundingClientRect().top) }));
    await active.locator('button').click({ delay: 350 });
    await page.waitForFunction(el => el.isConnected && el.classList.contains('answered'), original);
    const after = await original.evaluate(el => ({ top: el.getBoundingClientRect().top, values: [...el.querySelectorAll('input[type=range]')].map(input => input.value), sliders: [...el.querySelectorAll('input[type=range]')].map(input => input.getBoundingClientRect().top) }));
    assert.deepEqual(after.values, before.values);
    assert.ok(Math.abs(after.top - before.top) < 1, `Card moved at round ${i + 1}: ${title} ${JSON.stringify({before, after, scroll: await page.evaluate(() => scrollY)})}`);
    assert.deepEqual(after.sliders, before.sliders, `Slider moved: ${title}`);
    const card = page.locator(`form[data-id="${await original.getAttribute('data-id')}"]`);
    const values = question.type === 'choice' ? Object.fromEntries(Object.keys(question.criteria).map((key, index) => [key, Number(before.values[index])])) : Number(before.values[0]);
    const human = answerRequest(run.request, { [id]: values }).answers[id];
    const matched = matchesJev(human, jev);
    assert.equal(await card.locator('fieldset').getAttribute('class'), `question ${matched ? 'answer-match' : 'answer-miss'}`);
    assert.equal(await card.locator('.question-feedback').textContent(), matched ? 'Matched JEV' : 'Different from JEV');
    const markers = await card.locator('.jev-marker').evaluateAll(markers => markers.map(marker => ({ hidden: marker.hidden, percent: parseFloat(marker.style.left) })));
    const expected = question.type === 'choice' ? Object.keys(question.criteria).map(key => jev.probabilities[key] * 100) : [question.type === 'noul' ? jev.noul * 100 : jev.score / (question.criteria.length - 1) * 100];
    markers.forEach((marker, index) => { assert.equal(marker.hidden, false); assert.ok(Math.abs(marker.percent - expected[index]) < 0.001); });
    assert.equal(await card.locator('input:enabled').count(), 0);
    assert.equal(await page.locator('#history').count(), 0);
    if (i < 3) await page.screenshot({ path: `/tmp/meat-jev-inline-${i}.png` });
    if (i + 1 < examples.length) await page.locator('#auto').check();
  }
  assert.equal(new Set(dealt).size, examples.length);
  // A second deck must not immediately repeat the last question.
  await page.locator('#compare').uncheck();
  await page.locator('#auto').check();
  await page.locator('#auto').uncheck();
  const nextTitle = await active.locator('h2').textContent(), nextId = await active.locator('fieldset').getAttribute('data-question');
  const next = recordings.find(run => run.title === nextTitle && Object.hasOwn(run.request.questions, nextId));
  assert.notEqual(JSON.stringify(next.request), dealt.at(-1));
  if (await active.locator('input[type=radio]').count()) await active.locator('input[type=radio]').first().check();
  const off = await active.elementHandle();
  await active.locator('button').click({ delay: 350 });
  assert.match(await off.textContent(), /Answered · comparison off/);
  assert.equal(await off.$eval('.jev-marker', marker => marker.hidden), true);

  // Deliver an actual recorded JEV response later through the real WebSocket
  // protocol. No model is mocked and no external inference is made by this test.
  const peer = new WebSocket(new URL('/ws', app.server.url).href.replace('http:', 'ws:'), { headers: { Origin: app.server.url.origin } });
  await new Promise(resolve => peer.addEventListener('open', resolve, { once: true }));
  const run = recordings[0];
  let requestId;
  const comparison = new Promise(resolve => peer.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'compare') resolve(message); }));
  const response = fetch(new URL('/api/v1/systemone', app.server.url), { method: 'POST', body: JSON.stringify(run.request) });
  await active.waitFor();
  const live = await active.elementHandle();
  requestId = await live.getAttribute('data-id');
  assert.equal((await response).status, 504);
  const values = Object.fromEntries(Object.entries(run.jev.answers).map(([id, answer]) => [id, answer.type === 'choice' ? answer.probabilities : answer.type === 'noul' ? answer.noul : answer.score]));
  peer.send(JSON.stringify({ type: 'submit', id: requestId, values, compare: true }));
  await comparison;
  await page.waitForFunction(el => el.classList.contains('answered'), live);
  assert.equal(await live.$eval('.jev-marker', marker => marker.hidden), true);
  peer.send(JSON.stringify({ type: 'comparison', id: requestId, jev: run.jev }));
  await page.waitForFunction(el => !el.querySelector('.jev-marker').hidden, live);
  assert.equal(await live.evaluate(el => el.isConnected), true);
  assert.match(await live.textContent(), /Answered after timeout/);
  peer.close();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('form.answered .jev-marker:not([hidden])'));
  assert.equal(await page.locator('form.answered input:enabled').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(`WebKit: ${examples.length} shuffled rounds stayed in place with correct markers, colors, and unchanged slider positions; late comparison and comparison-off passed.`);
} finally {
  await browser.close();
  await app.stop();
}
