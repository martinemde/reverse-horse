// Usage: bun scripts/check-submit.js /path/to/playwright-core/index.mjs
// Requires Playwright's WebKit browser (use its CLI: install webkit).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../server.js';
import { examples } from '../public/examples.js';
import recordings from '../public/example-results.json';
import { answerRequest, choiceWeights } from '../public/protocol.js';
import { matchesJev } from '../public/compare.js';

if (!process.argv[2]) throw new Error('Pass the path to an installed playwright-core/index.mjs');
const { webkit } = await import(pathToFileURL(resolve(process.argv[2])).href);
const browser = await webkit.launch({ headless: true });
const app = startServer({ port: 0, timeoutMs: 100 });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem('reverse-horse.training-completed', '1'));
  const errors = [], externalRequests = [], dealt = [];
  page.on('request', request => { if (new URL(request.url()).origin !== app.server.url.origin) externalRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.server.url.href);
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
  assert.equal(await page.locator('#compare').isChecked(), true);
  const active = page.locator('form.request:not(.answered)');
  const setRange = (input, value) => input.evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'true');
  for (let i = 0; i < examples.length; i++) {
    await active.waitFor();
    const cardTop = await active.evaluate(el => el.getBoundingClientRect().top);
    const headerBottom = await page.locator('header').evaluate(el => el.getBoundingClientRect().bottom);
    assert.ok(Math.abs(cardTop - headerBottom - 16) < 2, `New question scrolls beneath the fixed navigation: ${JSON.stringify({ cardTop, headerBottom, scroll: await page.evaluate(() => ({y: scrollY, height: innerHeight, total: document.documentElement.scrollHeight})) })}`);
    assert.equal(await active.getAttribute('data-id'), await page.locator('#requests > form').first().getAttribute('data-id'));
    await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
    if (i === 0) {
      const paused = await active.locator('.clock').textContent();
      await page.waitForTimeout(900);
      assert.equal(await active.locator('.clock').textContent(), paused, 'Practice clock freezes while paused');
      await page.getByRole('button', { name: 'Play practice', exact: true }).click();
      const resumed = parseFloat(await active.locator('.clock').textContent());
      assert.ok(Math.abs(resumed - parseFloat(paused)) < 0.3, 'Resume preserves remaining time');
      await page.waitForTimeout(700);
      assert.ok(parseFloat(await active.locator('.clock').textContent()) < resumed - 0.4, 'Practice clock resumes counting down');
      await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
    }
    assert.equal(await active.locator('fieldset.question').count(), 1);
    assert.equal(await active.locator('h2').count(), 0);
    const state = await active.locator('.state pre').textContent();
    const id = await active.locator('fieldset').getAttribute('data-question');
    const run = recordings.find(run => run.request.state === state && Object.hasOwn(run.request.questions, id));
    assert.ok(run);
    const title = run.title;
    const question = run.request.questions[id], jev = run.jev.answers[id];
    dealt.push(JSON.stringify(run.request));
    const choices = active.locator('input[type=range]');
    assert.equal(await active.locator('input[type=radio]').count(), 0);
    if (question.type === 'choice') {
      assert.equal(await active.locator('button').isDisabled(), true);
      assert.deepEqual(await active.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value))), Array(await choices.count()).fill(0));
      await setRange(choices.first(), 0.5);
      assert.equal(await active.locator('button').isEnabled(), true);
      await setRange(choices.first(), 0);
      const keys = Object.keys(question.criteria);
      const chosen = i % 2 ? keys.find(key => key !== jev.choice) : jev.choice;
      await setRange(choices.nth(keys.indexOf(chosen)), 0.5);
      // Adding a second bar changes the distribution without changing the first.
      await setRange(active.locator('input[type=range]').nth((keys.indexOf(chosen) + 1) % keys.length), 0.2);
      const weights = await active.locator('input[type=range]').evaluateAll(inputs => inputs.map(input => Number(input.value)));
      assert.equal(weights[keys.indexOf(chosen)], 0.5);
      assert.equal(weights[(keys.indexOf(chosen) + 1) % keys.length], 0.2);
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
    assert.equal(await card.locator('.question-feedback').textContent(), matched ? 'Matched Jev' : 'Different from Jev');
    const markers = await card.locator('.jev-marker').evaluateAll(markers => markers.map(marker => ({ hidden: marker.hidden, percent: parseFloat(marker.style.left) })));
    const expected = question.type === 'choice' ? Object.values(choiceWeights(jev)).map(weight => weight * 100) : [question.type === 'noul' ? jev.noul * 100 : jev.score / (question.criteria.length - 1) * 100];
    markers.forEach((marker, index) => { assert.equal(marker.hidden, false); assert.ok(Math.abs(marker.percent - expected[index]) < 0.001); });
    assert.equal(await card.locator('input:enabled').count(), 0);
    assert.equal(await page.locator('#history').count(), 0);
    if (i < 3) await page.screenshot({ path: `/tmp/reverse-horse-inline-${i}.png` });
    if (i + 1 < examples.length) await page.getByRole('button', { name: 'Play practice', exact: true }).click();
  }
  assert.equal(new Set(dealt).size, examples.length);
  await page.waitForTimeout(4200);
  assert.equal(await active.count(), 0, 'Paused practice does not deal another question');
  assert.equal(await page.locator('header').evaluate(el => el.getBoundingClientRect().top), 0);
  // A second deck must not immediately repeat the last question.
  await page.locator('#compare').uncheck();
  await page.getByRole('button', { name: 'Play practice', exact: true }).click();
  await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
  const nextState = await active.locator('.state pre').textContent(), nextId = await active.locator('fieldset').getAttribute('data-question');
  const next = recordings.find(run => run.request.state === nextState && Object.hasOwn(run.request.questions, nextId));
  assert.notEqual(JSON.stringify(next.request), dealt.at(-1));
  await setRange(active.locator('input[type=range]').first(), 0.5);
  const off = await active.elementHandle();
  await active.locator('button').click({ delay: 350 });
  assert.match(await off.textContent(), /Answered · comparison off/);
  assert.equal(await off.$eval('.jev-marker', marker => marker.hidden), true);

  // Deliver an actual recorded Jev response later through the real WebSocket
  // protocol. No model is mocked and no external inference is made by this test.
  const peer = new WebSocket(new URL('/ws', app.server.url).href.replace('http:', 'ws:'), { headers: { Origin: app.server.url.origin } });
  await new Promise(resolve => peer.addEventListener('open', resolve, { once: true }));
  peer.send(JSON.stringify({ type: 'presence', active: true }));
  const run = recordings[0];
  let requestId;
  const comparison = new Promise(resolve => peer.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'compare') resolve(message); }));
  const response = fetch(new URL('/v1/systemone', app.server.url), { method: 'POST', body: JSON.stringify(run.request) });
  await active.waitFor();
  const live = await active.elementHandle();
  requestId = await live.getAttribute('data-id');
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  assert.equal(await live.evaluate(el => getComputedStyle(el).borderTopColor), await page.locator('#play').evaluate(el => getComputedStyle(el).color), 'Live request border uses the brand color');
  assert.equal((await response).status, 504);
  await page.waitForFunction(el => el.querySelector('.clock').textContent === 'Timed out', live);

  const values = Object.fromEntries(Object.entries(run.jev.answers).map(([id, answer]) => [id, answer.type === 'choice' ? answer.probabilities : answer.type === 'noul' ? answer.noul : answer.score]));
  peer.send(JSON.stringify({ type: 'submit', id: requestId, values, compare: true }));
  await page.locator('#compare').uncheck();
  for (const [id, question] of Object.entries(run.request.questions)) {
    const inputs = page.locator(`form[data-id="${requestId}"] fieldset[data-question="${id}"] input[type=range]`);
    if (question.type === 'choice') {
      for (const [index, weight] of Object.values(values[id]).entries()) await setRange(inputs.nth(index), weight);
    } else await setRange(inputs, values[id]);
  }
  await page.locator(`form[data-id="${requestId}"] button`).click({ delay: 350 });
  await comparison;
  await page.waitForFunction(el => el.classList.contains('answered'), live);
  assert.equal(await live.$eval('.jev-marker', marker => marker.hidden), true);
  peer.send(JSON.stringify({ type: 'comparison', id: requestId, jev: run.jev }));
  await page.waitForFunction(el => !el.querySelector('.jev-marker').hidden, live);
  assert.equal(await live.evaluate(el => el.isConnected), true);
  assert.equal(await live.$eval('.actions p', el => el.textContent), 'Average of 2 answers');
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
