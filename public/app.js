import { migrateStorage, getKey, disconnect, loginURL, completeLogin, comparisonEnabled, setComparisonEnabled } from './auth.js';
import { compareWithJev, validateJevResponse, matchesJev } from './compare.js';
import { answerRequest, choiceWeights } from './protocol.js';
import { examples } from './examples.js';
import { createTraining } from './training.js';

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
let serverQueue = { requests: [], results: [] };
let practice;
const practiceResults = [];
let savedExamples = [];
function savedExample(request) {
  return savedExamples.find(run => JSON.stringify(run.request) === JSON.stringify(request));
}
let playing = true;
let practiceTimer;
let exampleDeck = [];
let lastExample;
function nextExample() {
  if (!exampleDeck.length) {
    exampleDeck = [...examples];
    for (let i = exampleDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [exampleDeck[i], exampleDeck[j]] = [exampleDeck[j], exampleDeck[i]];
    }
    if (exampleDeck.length > 1 && exampleDeck.at(-1) === lastExample) {
      const last = exampleDeck.length - 1;
      [exampleDeck[0], exampleDeck[last]] = [exampleDeck[last], exampleDeck[0]];
    }
  }
  lastExample = exampleDeck.pop();
  return lastExample;
}
function dealPractice() {
  if (training.active || !playing || practice || serverQueue.requests.length || comparisons.size) return;
  const example = nextExample();
  practice = { ...example, id: crypto.randomUUID(), local: true, deadline: Date.now() + 30_000 };
  render();
}
function schedulePractice() {
  clearTimeout(practiceTimer);
  if (!training.active && playing && !practice && !serverQueue.requests.length && !comparisons.size) practiceTimer = setTimeout(dealPractice, 4000);
}
function submitPractice(item, values, compare) {
  const human = answerRequest(item.request, values);
  const saved = compare && savedExample(item.request);
  const result = { ...item, human, late: (item.pausedAt ?? Date.now()) >= item.deadline, status: saved ? `Compared with saved JEV run · ${new Date(saved.recordedAt).toLocaleDateString()}` : compare ? 'Asking JEV via OpenRouter…' : 'Answered · comparison off' };
  if (saved) result.jev = saved.jev;
  practiceResults.unshift(result);
  practiceResults.splice(20);
  practice = undefined;
  render();
  if (compare && !saved) void compareInBrowser(item);
  else schedulePractice();
}
function emptyState(playing) {
  const empty = node('div', undefined, 'empty');
  empty.append(node('div', '?', 'waiting-mark'), node('h2', 'No questions yet'), node('p', playing ? 'Next example coming up…' : 'Press play to answer questions. Live requests are always welcome.'));
  return empty;
}
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function presence() { send({ type: 'presence', active: document.visibilityState === 'visible' && !training.active }); }
function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function refreshAuth() {
  const connected = Boolean(getKey());
  $('#auth').textContent = connected ? 'Disconnect' : 'Connect OpenRouter';
  $('#auth-status').textContent = (savedExamples.length ? 'Practice uses saved JEV answers. ' : '') + (connected ? 'OpenRouter connected · live comparisons use your credits.' : 'Connect OpenRouter to compare live requests.');
  $('#compare').disabled = !connected && !savedExamples.length;
  $('#compare').checked = comparisonEnabled(localStorage, savedExamples.length > 0);
}
function paintRange(input) { input.style.setProperty('--fill', `${100 * Number(input.value) / Number(input.max)}%`); }
function range(label, max, value, changed) {
  const input = node('input');
  input.type = 'range'; input.min = '0'; input.max = String(max); input.step = '0.001'; input.value = String(value);
  input.setAttribute('aria-label', label);
  paintRange(input);
  input.addEventListener('input', () => { paintRange(input); changed(Number(input.value)); });
  return input;
}
function makeForm(item, onTrainingSubmit) {
  const values = Object.create(null);
  const views = new Map();
  let submitting = false;
  let completed = false;
  let submitted = false;
  let outcomeSignature = '';
  const card = node('form', undefined, 'request');
  card.dataset.id = item.id;
  card.classList.toggle('live-request', !item.local);
  const head = node('div', undefined, 'request-head');
  const label = node('div', item.training ? 'TRAINING EXERCISE' : item.source ? 'PRACTICE ROUND' : 'LIVE REQUEST', 'eyebrow');
  const clock = node('span', item.training ? 'Untimed' : '30.0s', 'clock'); clock.setAttribute('aria-label', item.training ? 'No time limit' : 'Time remaining');
  head.append(label, clock);
  const state = node('div', undefined, 'state'); state.append(node('div', 'STATE', 'eyebrow'), node('pre', text(item.request.state)));
  const questions = node('div', undefined, 'questions');
  function track(slider) {
    const wrapper = node('div', undefined, 'slider-track');
    const overlay = node('div', undefined, 'slider-overlay');
    const marker = node('span', undefined, 'jev-marker');
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    overlay.append(marker); wrapper.append(slider, overlay);
    return { wrapper, marker };
  }
  function mark(control, value, max, label) {
    control.marker.style[control.vertical ? 'top' : 'left'] = `${100 * value / max}%`;
    control.marker.hidden = false;
    control.jev.textContent = `JEV ${label}`;
    control.jev.classList.remove('pending');
  }
  for (const [id, q] of Object.entries(item.request.questions)) {
    const field = node('fieldset', undefined, 'question');
    field.dataset.question = id;
    field.append(node('legend', `${q.type.toUpperCase()} / ${id}`), node('div', text(q.instructions), 'instructions'));
    const feedback = node('p', '', 'question-feedback');
    feedback.setAttribute('role', 'status');
    const view = { field, feedback };
    views.set(id, view);
    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      values[id] = Object.fromEntries(keys.map(key => [key, 0]));
      const controls = [];
      const certainty = node('output', 'Confidence 0%', 'choice-confidence');
      const refresh = () => {
        const total = Object.values(values[id]).reduce((a, b) => a + b, 0);
        const best = keys.reduce((a, b) => values[id][b] > values[id][a] ? b : a);
        certainty.textContent = `Confidence ${(100 * Math.max(...Object.values(values[id]))).toFixed(1)}%`;
        for (const c of controls) {
          c.fullness.textContent = `${(100 * values[id][c.key]).toFixed(1)}% full`;
          c.output.textContent = total ? `${(100 * values[id][c.key] / total).toFixed(1)}% chance` : '0% chance';
          c.option.classList.toggle('human-picked', total > 0 && c.key === best);
          c.slider.value = String(values[id][c.key]);
          paintRange(c.slider);
        }
        validity();
      };
      for (const key of keys) {
        const option = node('div', undefined, 'choice');
        const row = node('div', undefined, 'range-row');
        const label = node('span', key, 'choice-name');
        if (q.criteria[key] !== null) label.append(node('span', `: ${text(q.criteria[key])}`, 'choice-description'));
        const fullness = node('output');
        const output = node('output', undefined, 'choice-probability');
        const jev = node('span', 'JEV', 'jev-value pending');
        const numbers = node('div', undefined, 'range-values'); numbers.append(fullness);
        const slider = range(`${id}: ${key}`, 1, 0, value => {
          values[id][key] = value;
          refresh();
        });
        const scale = track(slider);
        const probabilities = node('div', undefined, 'choice-probabilities'); probabilities.append(output, jev);
        controls.push({ key, slider, fullness, output, jev, option, marker: scale.marker });
        row.append(label, numbers); option.append(row);
        option.append(scale.wrapper, probabilities); field.append(option);
      }
      const summary = node('div', undefined, 'choice-summary');
      summary.append(certainty, node('p', 'Fill any bars from 0–100%. The tallest bar sets confidence; their relative fullness sets the chances.'));
      field.append(summary);
      Object.assign(view, { controls, refresh });
      queueMicrotask(refresh);
    } else {
      const max = q.type === 'noul' ? 1 : q.criteria.length - 1;
      values[id] = max / 2;
      const row = node('div', undefined, 'range-row');
      const output = node('output', values[id].toFixed(3));
      const jev = node('span', 'JEV', 'jev-value pending');
      const numbers = node('div', undefined, 'range-values'); numbers.append(output, jev);
      row.append(node('span', q.type === 'noul' ? 'Probability of yes' : 'Your score'), numbers);
      const slider = range(id, max, values[id], value => { values[id] = value; output.textContent = value.toFixed(3); });
      const scale = track(slider);
      Object.assign(view, { slider, output, jev, max, marker: scale.marker, vertical: q.type === 'score' });
      if (q.type === 'noul') {
        field.append(row, scale.wrapper);
        const ends = node('div', undefined, 'ends');
        ends.append(node('span', `No · 0${q.criteria?.false !== undefined ? '\n' + text(q.criteria.false) : ''}`), node('span', `Yes · 1${q.criteria?.true !== undefined ? '\n' + text(q.criteria.true) : ''}`));
        field.append(ends);
      } else {
        // Vertical, lowest level on top, so labels read horizontally beside their level.
        const levels = node('div', undefined, 'score-levels');
        q.criteria.forEach((label, i) => {
          const level = node('span'); level.style.top = `${100 * i / max}%`;
          level.append(node('b', i), node('span', text(label)));
          levels.append(level);
        });
        const vertical = node('div', undefined, 'score-scale'); vertical.style.setProperty('--steps', max);
        vertical.append(scale.wrapper, levels);
        field.append(row, vertical);
      }
    }
    field.append(feedback);
    questions.append(field);
  }
  const actions = node('div', undefined, 'actions');
  const button = node('button', item.training ? 'Submit & see JEV’s answer' : 'Submit answers'); button.type = 'submit';
  const hint = node('p', '');
  actions.append(hint, button); card.append(head, state, questions, actions);
  function validity() {
    if (completed) return;
    const invalidChoice = Object.values(values).some(v => typeof v === 'object' && !Object.values(v).some(n => n > 0));
    // Keep the button DOM stable: WebKit drops clicks if its text changes mid-press.
    button.disabled = submitted || submitting || (!item.local && socket?.readyState !== WebSocket.OPEN) || invalidChoice;
  }
  card.addEventListener('submit', event => {
    event.preventDefault(); validity(); if (button.disabled) return;
    try {
      if (onTrainingSubmit) { onTrainingSubmit(answerRequest(item.request, values)); return; }
      const compare = $('#compare').checked && Boolean((item.local && savedExample(item.request)) || getKey());
      submitting = true; validity(); showError('');
      if (item.local) submitPractice(item, values, compare);
      else send({ type: 'submit', id: item.id, values, compare });
    } catch (error) { submitting = false; validity(); showError(error.message); }
  });
  function finish(result) {
    const signature = JSON.stringify(result);
    if (signature === outcomeSignature) return;
    outcomeSignature = signature;
    if (!completed) {
      completed = true;
      actions.style.minHeight = `${actions.getBoundingClientRect().height}px`;
      button.style.minWidth = `${button.getBoundingClientRect().width}px`;
      card.classList.add('answered');
      clock.style.width = `${clock.getBoundingClientRect().width}px`;
      clock.textContent = 'Done'; clock.classList.remove('urgent'); clock.setAttribute('aria-label', 'Answered');
      button.disabled = true; button.textContent = 'Submitted';
      for (const [id, view] of views) {
        view.field.disabled = true;
        const human = result.human?.answers[id];
        if (!human) continue;
        if (human.type === 'choice') { values[id] = choiceWeights(human); view.refresh(); }
        else {
          values[id] = human.type === 'noul' ? human.noul : human.score;
          view.slider.value = String(values[id]); paintRange(view.slider);
          view.output.textContent = values[id].toFixed(3);
        }
      }
    }
    hint.textContent = result.answerCount > 1 ? `Average of ${result.answerCount} answers${result.jev ? '' : ` · ${result.status}`}` : result.jev ? '' : result.status;
    for (const [id, view] of views) {
      const human = result.human?.answers[id];
      const jev = result.jev?.answers[id];
      if (!human || !jev) continue;
      const match = matchesJev(human, jev);
      view.field.classList.toggle('answer-match', match);
      view.field.classList.toggle('answer-miss', !match);
      const rule = human.type === 'choice' ? 'Same choice' : human.type === 'noul' ? 'Same yes/no side' : 'Same nearest level';
      view.feedback.textContent = match ? 'Matched JEV' : 'Different from JEV';
      view.feedback.title = `${rule} counts as a match`;
      if (human.type === 'choice') {
        const weights = choiceWeights(jev);
        for (const control of view.controls) {
          mark(control, weights[control.key], 1, `${(100 * jev.probabilities[control.key]).toFixed(1)}% chance`);
          control.jev.title = 'Pink markers scale JEV probabilities so its tallest bar equals its confidence';
          control.option.classList.toggle('human-picked', human.choice === control.key);
          control.option.classList.toggle('jev-picked', jev.choice === control.key);
        }
      } else mark(view, human.type === 'noul' ? jev.noul : jev.score, view.max, (human.type === 'noul' ? jev.noul : jev.score).toFixed(3));
    }
  }
  function progress(item) {
    submitted = Boolean(item.submitted);
    const label = submitted ? 'Submitted' : 'Submit answers';
    if (button.textContent !== label) button.textContent = label;
    for (const view of views.values()) view.field.disabled = submitted;
    if (submitted) submitting = false;
    hint.textContent = submitted ? `Waiting for answers · ${item.received}/${item.expected} received` : `${item.received}/${item.expected} answers received`;
    validity();
  }
  return { card, clock, validity, finish, progress, reset() { if (!completed) { submitting = false; validity(); } } };
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
  const ids = new Set([...current, ...results].map(item => item.id));
  const newQuestion = current.findLast(item => !forms.has(item.id));
  const newCards = [...current, ...results].some(item => !forms.has(item.id));
  // Trimming old history during submission moves the card the user just answered.
  for (const [id, form] of forms) if (!ids.has(id) && (newCards || !form.card.classList.contains('answered'))) { form.card.remove(); forms.delete(id); }
  if (ids.size) {
    $('#requests .empty')?.remove();
    // Submission updates the same card. New rounds go above the older cards.
    for (const item of [...results].reverse().concat(current)) {
      if (!forms.has(item.id)) { const form = makeForm(item); forms.set(item.id, form); $('#requests').prepend(form.card); }
    }
    for (const result of results) forms.get(result.id).finish(result);
    for (const item of serverQueue.requests) forms.get(item.id).progress(item);
  } else if (!$('#requests .empty')) {
    $('#requests').append(emptyState(playing));
  } else $('#requests .empty p').textContent = playing ? 'Next example coming up…' : 'Press play to answer questions. Live requests are always welcome.';
  tick();
  if (newQuestion && !training.active) {
    const card = forms.get(newQuestion.id).card;
    const top = card.getBoundingClientRect().top + window.scrollY - $('header').getBoundingClientRect().height - 16;
    window.scrollTo({ top, behavior: 'instant' });
  }
}
function tick() { for (const item of current) { const form = forms.get(item.id); const seconds = Math.max(0, (item.deadline - (item.pausedAt ?? Date.now()) - (item.local ? 0 : offset)) / 1000); form.clock.textContent = seconds > 0 ? `${seconds.toFixed(1)}s` : 'Timed out'; form.clock.classList.toggle('urgent', seconds < 10); form.validity(); } }
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
  socket.addEventListener('open', () => { presence(); $('#connection').textContent = 'Connected'; for (const form of forms.values()) form.reset(); });
  socket.addEventListener('close', () => { for (const [id, controller] of comparisons) if (!practiceResults.some(result => result.id === id)) controller.abort(); $('#connection').textContent = 'Disconnected · reconnecting…'; tick(); setTimeout(connect, 1000); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'queue') update(message); if (message.type === 'compare') void compareInBrowser(message); if (message.type === 'error') { showError(message.message); for (const form of forms.values()) form.reset(); } });
}
function setPlaying(value) {
  playing = value;
  if (practice) {
    if (playing && practice.pausedAt !== undefined) {
      practice.deadline += Date.now() - practice.pausedAt;
      delete practice.pausedAt;
    } else if (!playing && practice.pausedAt === undefined) practice.pausedAt = Date.now();
  }
  $('#play').setAttribute('aria-pressed', String(playing));
  $('#play').setAttribute('aria-label', playing ? 'Pause practice' : 'Play practice');
  $('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('#play-label').textContent = playing ? 'Pause' : 'Play';
  clearTimeout(practiceTimer);
  if (playing) dealPractice();
  render();
  schedulePractice();
}
$('#play').addEventListener('click', () => setPlaying(!playing));
let resumePractice;
const training = createTraining({
  dialog: $('#training'), makeForm, getSavedExample: savedExample,
  onOpen() { resumePractice = playing; setPlaying(false); presence(); },
  onClose(error) { setPlaying(resumePractice); presence(); if (error) showError(error); },
});
$('#train').addEventListener('click', () => training.open());
// Other pages link Training to /#training.
if (location.hash === '#training') { history.replaceState(null, '', location.pathname + location.search); training.open(); }
else training.start();
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
document.addEventListener('visibilitychange', presence);
async function initialize() {
  try { migrateStorage(); } catch { showError("Could not migrate browser storage. Allow site storage to connect OpenRouter."); }
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
  try {
    const response = await fetch('/example-results.json');
    if (!response.ok) throw new Error('Saved examples unavailable');
    const runs = await response.json();
    savedExamples = runs.map(run => ({ ...run, jev: validateJevResponse(run.request, run.jev) }));
  } catch { showError('Saved JEV answers could not be loaded. Refresh to try again.'); }
  training.refresh();
  try { refreshAuth(); } catch { showError('Browser storage is unavailable. Allow site storage to connect OpenRouter.'); }
  connect();
  dealPractice();
}
setInterval(tick, 100);
setInterval(() => send({ type: 'ping' }), 20_000);
$('#requests').replaceChildren(emptyState(false));
void initialize();
