import { getKey, disconnect, loginURL, completeLogin, comparisonEnabled, setComparisonEnabled } from './auth.js';
import { compareWithJev } from './compare.js';
import { answerRequest } from './protocol.js';
import { examples } from './examples.js';

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
let serverQueue = { requests: [], results: [] };
let practice;
const practiceResults = [];
let auto = false;
let autoTimer;
let exampleIndex = Math.floor(Math.random() * examples.length);
function dealPractice() {
  if (!auto || practice || serverQueue.requests.length || comparisons.size) return;
  const example = examples[exampleIndex++ % examples.length];
  practice = { ...example, id: crypto.randomUUID(), local: true, deadline: Date.now() + 30_000 };
  render();
}
function schedulePractice() {
  clearTimeout(autoTimer);
  if (auto && !practice && !serverQueue.requests.length && !comparisons.size) autoTimer = setTimeout(dealPractice, 4000);
}
function submitPractice(item, values, compare) {
  const human = answerRequest(item.request, values);
  const result = { ...item, human, late: Date.now() >= item.deadline, status: compare ? 'Asking JEV via OpenRouter…' : 'Answered · comparison off' };
  practiceResults.unshift(result);
  practiceResults.splice(20);
  practice = undefined;
  render();
  if (compare) void compareInBrowser(item);
  else schedulePractice();
}
const exampleRequest = {
  "model": "jev-latest",
  "state": "My package arrived two days late, but everything inside looks great.",
  "questions": {
    "damaged": { "type": "noul", "instructions": "Did anything arrive damaged?" },
    "topic": { "type": "choice", "instructions": "What is this message about?", "criteria": { "shipping": "Delivery and packages", "billing": "Charges and payments", "support": "Technical help" } },
    "mood": { "type": "score", "instructions": "How does the customer feel overall?", "criteria": ["Unhappy", "Mixed or neutral", "Happy"] }
  }
};
function emptyState(auto) {
  const empty = node('div', undefined, 'empty');
  const command = `curl '${location.origin}/api/v1/systemone' \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @- <<'JSON'\n${JSON.stringify(exampleRequest, null, 2)}\nJSON`;
  const input = node('textarea', undefined, 'curl-example');
  input.value = command;
  input.rows = 16;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Editable curl request');
  const copy = node('button', 'Copy', 'secondary');
  copy.type = 'button';
  const copyStatus = node('span', '', 'copy-status');
  copyStatus.setAttribute('role', 'status');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(input.value); copyStatus.textContent = 'Copied. Paste it into your terminal and edit it.'; }
    catch { copyStatus.textContent = 'Could not copy. Select the command below and copy it manually.'; }
  });
  const controls = node('div', undefined, 'curl-controls');
  controls.append(copy, copyStatus);
  empty.append(node('div', '?', 'waiting-mark'), node('h2', 'No questions yet'), node('p', auto ? 'Next example coming up…' : 'Waiting for a request, or turn on auto mode.'), controls, input);
  return empty;
}
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function refreshAuth() {
  const connected = Boolean(getKey());
  $('#auth').textContent = connected ? 'Disconnect' : 'Connect OpenRouter';
  $('#auth-status').textContent = connected ? 'OpenRouter connected · comparisons use your credits.' : 'Connect your OpenRouter account to compare with JEV.';
  $('#compare').disabled = !connected;
  $('#compare').checked = comparisonEnabled();
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
        q.criteria.forEach((label, i) => { const tick = node('span'); tick.append(node('b', i)); ticks.append(tick); legend.append(node('span', text(label))); });
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
    const late = Date.now() + (item.local ? 0 : offset) >= item.deadline;
    // Keep the button DOM stable: WebKit drops clicks if its text changes mid-press.
    hint.textContent = item.local ? 'Practice stays in this browser. You can answer after the timer ends.' : late ? 'The deadline passed. You can still save your answers and compare with JEV; the API caller already timed out.' : 'Your answers go back to the caller. JEV comparison is optional.';
    button.disabled = submitting || (!item.local && socket?.readyState !== WebSocket.OPEN) || invalidChoice;
  }
  card.addEventListener('submit', event => {
    event.preventDefault(); validity(); if (button.disabled) return;
    try {
      const compare = $('#compare').checked && Boolean(getKey());
      submitting = true; validity(); showError('');
      if (item.local) submitPractice(item, values, compare);
      else send({ type: 'submit', id: item.id, values, compare });
    } catch { showError('Browser storage is unavailable. Allow site storage to submit answers.'); }
  });
  return { card, clock, validity, reset() { submitting = false; validity(); } };
}
function resultCard(result) {
  const card = node('article', undefined, 'result');
  const head = node('div', undefined, 'result-head');
  const heading = node('div'); heading.append(node('h2', result.title), node('p', result.late ? `Answered after timeout · ${result.status}` : result.status)); head.append(heading);
  if (result.source) { const link = node('a', 'Example source', 'source'); link.href = result.source; link.target = '_blank'; link.rel = 'noreferrer'; head.append(link); }
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
  offset = message.serverTime - Date.now();
  serverQueue = message;
  render();
  schedulePractice();
}
function render() {
  current = [...serverQueue.requests, ...(practice ? [practice] : [])];
  const results = [...practiceResults, ...serverQueue.results];
  const ids = new Set(current.map(item => item.id));
  for (const [id, form] of forms) if (!ids.has(id)) { form.card.remove(); forms.delete(id); }
  if (current.length) {
    $('#requests .empty')?.remove();
    for (const item of current) if (!forms.has(item.id)) { const form = makeForm(item); forms.set(item.id, form); $('#requests').append(form.card); }
  } else if (!$('#requests .empty')) {
    $('#requests').append(emptyState(auto));
  } else $('#requests .empty p').textContent = auto ? 'Next example coming up…' : 'Waiting for a request, or turn on auto mode.';
  const signature = JSON.stringify(results);
  if (signature !== resultSignature) { resultSignature = signature; $('#results').hidden = !results.length; $('#history').replaceChildren(...results.map(resultCard)); }
  tick();
}
function tick() { for (const item of current) { const form = forms.get(item.id); const seconds = Math.max(0, (item.deadline - Date.now() - (item.local ? 0 : offset)) / 1000); form.clock.textContent = seconds > 0 ? `${seconds.toFixed(1)}s` : 'Timed out'; form.clock.classList.toggle('urgent', seconds < 10); form.validity(); } }
async function compareInBrowser(message) {
  const connection = socket;
  const controller = new AbortController();
  comparisons.set(message.id, controller);
  const timer = setTimeout(() => controller.abort(), 30_000);
  let result;
  try { result = $('#compare').checked ? await compareWithJev(message.request, getKey(), controller.signal) : { error: 'Comparison skipped · comparison off' }; }
  catch (e) { result = { error: e.name === 'AbortError' ? 'Comparison stopped or timed out' : `Comparison failed: ${e.message}` }; }
  finally { clearTimeout(timer); comparisons.delete(message.id); }
  if (message.local) {
    const saved = practiceResults.find(result => result.id === message.id);
    if (saved) { saved.status = result.jev ? 'Compared' : result.error; if (result.jev) saved.jev = result.jev; }
    render();
  } else if (connection?.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'comparison', id: message.id, ...result }));
  schedulePractice();
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.addEventListener('open', () => { $('#connection').textContent = 'Connected'; for (const form of forms.values()) form.reset(); });
  socket.addEventListener('close', () => { for (const [id, controller] of comparisons) if (!practiceResults.some(result => result.id === id)) controller.abort(); $('#connection').textContent = 'Disconnected · reconnecting…'; tick(); setTimeout(connect, 1000); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'queue') update(message); if (message.type === 'compare') void compareInBrowser(message); if (message.type === 'error') { showError(message.message); for (const form of forms.values()) form.reset(); } });
}
$('#auto').addEventListener('change', event => { auto = event.target.checked; clearTimeout(autoTimer); if (auto) dealPractice(); render(); schedulePractice(); });
$('#auth').addEventListener('click', async () => {
  $('#auth').disabled = true;
  try {
    showError('');
    if (getKey()) { disconnect(); for (const controller of comparisons.values()) controller.abort(); refreshAuth(); }
    else location.assign(await loginURL(location.origin));
  } catch (e) { showError(e.message); }
  finally { $('#auth').disabled = false; }
});
$('#compare').addEventListener('change', () => {
  if (!$('#compare').checked) for (const controller of comparisons.values()) controller.abort();
  try { setComparisonEnabled($('#compare').checked); }
  catch { showError('Could not save your comparison preference in browser storage.'); }
});
window.addEventListener('storage', () => { try { refreshAuth(); if (!$('#compare').checked) for (const controller of comparisons.values()) controller.abort(); } catch { /* Storage may be disabled. */ } });
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
$('#requests').replaceChildren(emptyState(false));
void initialize();
