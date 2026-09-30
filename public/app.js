import { getKey, disconnect, loginURL, completeLogin } from './auth.js';
import { compareWithJev } from './compare.js';

const $ = selector => document.querySelector(selector);
const text = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
function node(tag, content, className) {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (className) el.className = className;
  return el;
}
let socket;
const comparisons = new Map();
let offset = 0;
let current = [];
const forms = new Map();
let resultSignature = '';
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function refreshAuth() {
  const connected = Boolean(getKey());
  $('#auth').textContent = connected ? 'Disconnect' : 'Connect OpenRouter';
  $('#auth-status').textContent = connected ? 'OpenRouter connected · comparisons use your credits.' : 'Connect your OpenRouter account to compare with JEV.';
  $('#compare').disabled = !connected;
  if (!connected) $('#compare').checked = false;
}
function range(label, max, value, changed) {
  const input = node('input');
  input.type = 'range'; input.min = '0'; input.max = String(max); input.step = '0.001'; input.value = String(value);
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => changed(Number(input.value)));
  return input;
}
function makeForm(item) {
  const values = Object.create(null);
  const card = node('form', undefined, 'request');
  const head = node('div', undefined, 'request-head');
  const title = node('div'); title.append(node('div', item.source ? 'PRACTICE ROUND' : 'LIVE REQUEST', 'eyebrow'), node('h2', item.title));
  const clock = node('span', '30.0s', 'clock'); clock.setAttribute('aria-label', 'Time remaining');
  head.append(title, clock);
  const state = node('div', undefined, 'state'); state.append(node('div', 'STATE', 'eyebrow'), node('pre', text(item.request.state)));
  const questions = node('div', undefined, 'questions');
  for (const [id, q] of Object.entries(item.request.questions)) {
    const field = node('fieldset', undefined, 'question');
    field.append(node('legend', `${q.type.toUpperCase()} / ${id}`), node('div', text(q.instructions), 'instructions'));
    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      values[id] = Object.fromEntries(keys.map(key => [key, 1 / keys.length]));
      const controls = [];
      const refresh = () => {
        const total = Object.values(values[id]).reduce((a, b) => a + b, 0);
        const best = keys.reduce((a, b) => values[id][b] > values[id][a] ? b : a);
        for (const c of controls) { c.output.textContent = total ? `${(100 * values[id][c.key] / total).toFixed(1)}%` : '0%'; c.radio.checked = total > 0 && c.key === best; }
        validity();
      };
      for (const key of keys) {
        const option = node('div', undefined, 'choice');
        const row = node('div', undefined, 'range-row');
        const label = node('label', undefined, 'choice-name');
        const radio = node('input'); radio.type = 'radio'; radio.name = `${item.id}-${id}`;
        label.append(radio, node('span', key));
        const output = node('output');
        const slider = range(`${id}: ${key}`, 1, values[id][key], value => { values[id][key] = value; refresh(); });
        radio.addEventListener('change', () => { for (const c of controls) { values[id][c.key] = c.key === key ? 1 : 0; c.slider.value = String(values[id][c.key]); } refresh(); });
        controls.push({ key, radio, slider, output });
        row.append(label, output); option.append(row);
        if (q.criteria[key] !== null) option.append(node('p', text(q.criteria[key])));
        option.append(slider); field.append(option);
      }
      field.append(node('p', 'Sliders set relative weights; percentages always add to 100%.'));
      // Wait until the submit button exists before refreshing validity.
      queueMicrotask(refresh);
    } else {
      const max = q.type === 'noul' ? 1 : q.criteria.length - 1;
      values[id] = max / 2;
      const row = node('div', undefined, 'range-row');
      const output = node('output', values[id].toFixed(3));
      row.append(node('span', q.type === 'noul' ? 'Probability of yes' : 'Your score'), output);
      field.append(row, range(id, max, values[id], value => { values[id] = value; output.textContent = value.toFixed(3); }));
      if (q.type === 'noul') {
        const ends = node('div', undefined, 'ends');
        ends.append(node('span', `No · 0${q.criteria?.false !== undefined ? '\n' + text(q.criteria.false) : ''}`), node('span', `Yes · 1${q.criteria?.true !== undefined ? '\n' + text(q.criteria.true) : ''}`));
        field.append(ends);
      } else {
        const ticks = node('div', undefined, 'scale');
        const legend = node('div', undefined, 'legend');
        q.criteria.forEach((label, i) => { ticks.append(node('span')); const stop = node('span'); stop.append(node('b', i), document.createTextNode(text(label))); legend.append(stop); });
        field.append(ticks, legend);
      }
    }
    questions.append(field);
  }
  const actions = node('div', undefined, 'actions');
  const button = node('button', 'Submit answers'); button.type = 'submit';
  const hint = node('p', 'Your answers go back to the caller. JEV comparison is optional.');
  actions.append(hint, button); card.append(head, state, questions, actions);
  let submitting = false;
  function validity() {
    const invalidChoice = Object.values(values).some(v => typeof v === 'object' && !Object.values(v).some(n => n > 0));
    button.disabled = submitting || socket?.readyState !== WebSocket.OPEN || Date.now() + offset >= item.deadline || invalidChoice;
  }
  card.addEventListener('submit', event => {
    event.preventDefault(); validity(); if (button.disabled) return;
    try {
      const compare = $('#compare').checked && Boolean(getKey());
      submitting = true; validity(); showError('');
      send({ type: 'submit', id: item.id, values, compare });
    } catch { showError('Browser storage is unavailable. Allow site storage to submit answers.'); }
  });
  return { card, clock, validity, reset() { submitting = false; validity(); } };
}
function resultCard(result) {
  const card = node('article', undefined, 'result');
  const head = node('div', undefined, 'result-head');
  const heading = node('div'); heading.append(node('h2', result.title), node('p', result.status)); head.append(heading);
  if (result.source) { const link = node('a', 'Doc example', 'source'); link.href = result.source; link.target = '_blank'; link.rel = 'noreferrer'; head.append(link); }
  card.append(head);
  const details = node('details'); details.append(node('summary', 'State & questions'), node('pre', text({ state: result.request.state, questions: result.request.questions }))); card.append(details);
  if (!result.human) return card;
  for (const [id, human] of Object.entries(result.human.answers)) {
    const jev = result.jev?.answers[id];
    const question = result.request.questions[id];
    const block = node('div', undefined, 'comparison'); block.append(node('h3', text(question.instructions)));
    const grid = node('div', undefined, 'compare-grid');
    for (const [label, answer] of [['YOU', human], ['JEV', jev]]) {
      const column = node('div'); column.append(node('div', label, 'eyebrow'));
      if (!answer) column.append(node('span', '—', 'answer-value'));
      else {
        const value = answer.type === 'choice' ? answer.choice : answer.type === 'noul' ? `${(answer.noul * 100).toFixed(1)}% yes` : answer.score.toFixed(3);
        column.append(node('strong', value, 'answer-value'));
        if (answer.probabilities) for (const [key, probability] of Object.entries(answer.probabilities)) {
          const row = node('div', undefined, 'probability');
          row.append(node('span', answer.type === 'score' ? `${key} · ${text(question.criteria[key])}` : key), node('span', `${(probability * 100).toFixed(1)}%`)); column.append(row);
        }
      }
      grid.append(column);
    }
    block.append(grid);
    if (jev) {
      const difference = human.type === 'choice' ? human.choice === jev.choice ? 'Same choice' : 'Different choices' : human.type === 'noul' ? `${(Math.abs(human.noul - jev.noul) * 100).toFixed(1)} percentage points apart` : `${Math.abs(human.score - jev.score).toFixed(3)} levels apart`;
      block.append(node('p', difference, 'difference'));
    }
    card.append(block);
  }
  return card;
}
function update(message) {
  offset = message.serverTime - Date.now(); current = message.requests;
  $('#auto').checked = message.auto;
  const ids = new Set(current.map(item => item.id));
  for (const [id, form] of forms) if (!ids.has(id)) { form.card.remove(); forms.delete(id); }
  if (current.length) {
    $('#requests .empty')?.remove();
    for (const item of current) if (!forms.has(item.id)) { const form = makeForm(item); forms.set(item.id, form); $('#requests').append(form.card); }
  } else if (!$('#requests .empty')) {
    const empty = node('div', undefined, 'empty'); empty.append(node('div', '?', 'waiting-mark'), node('h2', 'No questions yet'), node('p', message.auto ? 'Next example coming up…' : 'Waiting for a request, or turn on auto mode.'), node('code', 'POST /api/v1/systemone')); $('#requests').append(empty);
  } else $('#requests .empty p').textContent = message.auto ? 'Next example coming up…' : 'Waiting for a request, or turn on auto mode.';
  const signature = JSON.stringify(message.results);
  if (signature !== resultSignature) { resultSignature = signature; $('#results').hidden = !message.results.length; $('#history').replaceChildren(...message.results.map(resultCard)); }
  tick();
}
function tick() { for (const item of current) { const form = forms.get(item.id); const seconds = Math.max(0, (item.deadline - Date.now() - offset) / 1000); form.clock.textContent = `${seconds.toFixed(1)}s`; form.clock.classList.toggle('urgent', seconds < 10); form.validity(); } }
async function compareInBrowser(message) {
  const connection = socket;
  const controller = new AbortController();
  comparisons.set(message.id, controller);
  const timer = setTimeout(() => controller.abort(), 30_000);
  let result;
  try { result = $('#compare').checked ? await compareWithJev(message.request, getKey(), controller.signal) : { error: 'Comparison skipped · comparison off' }; }
  catch (e) { result = { error: e.name === 'AbortError' ? 'Comparison stopped or timed out' : `Comparison failed: ${e.message}` }; }
  finally { clearTimeout(timer); comparisons.delete(message.id); }
  if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'comparison', id: message.id, ...result }));
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.addEventListener('open', () => { $('#connection').textContent = 'Connected'; $('#auto').disabled = false; for (const form of forms.values()) form.reset(); });
  socket.addEventListener('close', () => { for (const controller of comparisons.values()) controller.abort(); $('#connection').textContent = 'Disconnected · reconnecting…'; $('#auto').disabled = true; tick(); setTimeout(connect, 1000); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'queue') update(message); if (message.type === 'compare') void compareInBrowser(message); if (message.type === 'error') { showError(message.message); for (const form of forms.values()) form.reset(); } });
}
$('#auto').addEventListener('change', event => send({ type: 'auto', enabled: event.target.checked }));
$('#auth').addEventListener('click', async () => {
  $('#auth').disabled = true;
  try {
    showError('');
    if (getKey()) { disconnect(); for (const controller of comparisons.values()) controller.abort(); refreshAuth(); }
    else location.assign(await loginURL(location.origin));
  } catch (e) { showError(e.message); }
  finally { $('#auth').disabled = false; }
});
$('#compare').addEventListener('change', () => { if (!$('#compare').checked) for (const controller of comparisons.values()) controller.abort(); });
window.addEventListener('storage', () => { try { if (!getKey()) for (const controller of comparisons.values()) controller.abort(); refreshAuth(); } catch { /* Storage may be disabled. */ } });
async function initialize() {
  const callback = new URL(location.href);
  if (callback.pathname === '/auth/openrouter/callback') {
    // Remove the authorization code from history before loading any other state.
    history.replaceState(null, '', '/');
    $('#auth').disabled = true;
    $('#auth-status').textContent = 'Connecting to OpenRouter…';
    try { await completeLogin(callback); }
    catch (e) { showError(e.name === 'TimeoutError' ? 'OpenRouter login timed out. Try connecting again.' : e.message); }
    finally { $('#auth').disabled = false; }
  }
  try { refreshAuth(); } catch { showError('Browser storage is unavailable. Allow site storage to connect OpenRouter.'); }
  connect();
}
setInterval(tick, 100);
setInterval(() => send({ type: 'ping' }), 20_000);
void initialize();
