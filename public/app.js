import { migrateStorage, getKey, disconnect, loginURL, completeLogin, comparisonEnabled, setComparisonEnabled } from './auth.js';
import { compareWithJev, validateJevResponse } from './compare.js';
import { answerRequest } from './protocol.js';
import { examples } from './examples.js';
import { createTraining } from './training.js';
import { node } from './dom.js';
import { createCard } from './card.js';

const $ = selector => document.querySelector(selector);
let socket;
let reconnectAttempt = 0;
const comparisons = new Map();
const lateDrafts = new Map();
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
  if (training.active || !playing || practice || serverQueue.requests.length || lateDrafts.size || comparisons.size) return;
  const example = nextExample();
  practice = { ...example, id: crypto.randomUUID(), local: true, deadline: Date.now() + 30_000 };
  render();
}
function schedulePractice() {
  clearTimeout(practiceTimer);
  if (!training.active && playing && !practice && !serverQueue.requests.length && !lateDrafts.size && !comparisons.size) practiceTimer = setTimeout(dealPractice, 4000);
}
function submitPractice(item, values, compare) {
  const human = answerRequest(item.request, values);
  const saved = compare && savedExample(item.request);
  const result = { ...item, human, late: Boolean(item.late) || (item.pausedAt ?? Date.now()) >= item.deadline, status: saved ? `Compared with saved Jev run · ${new Date(saved.recordedAt).toLocaleDateString()}` : compare ? 'Asking Jev via OpenRouter…' : 'Answered · comparison off' };
  if (saved) result.jev = saved.jev;
  practiceResults.unshift(result);
  practiceResults.splice(20);
  if (item.late) lateDrafts.delete(item.id); else practice = undefined;
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
  $('#auth-status').textContent = (savedExamples.length ? 'Practice uses saved Jev answers. ' : '') + (connected ? 'OpenRouter connected · live comparisons use your credits.' : 'Connect OpenRouter to compare live requests.');
  $('#compare').disabled = !connected && !savedExamples.length;
  $('#compare').checked = comparisonEnabled(localStorage, savedExamples.length > 0);
}
function makeForm(item, onTrainingSubmit) {
  return createCard(item, {
    connected: () => socket?.readyState === WebSocket.OPEN,
    onError: error => showError(error.message),
    onSkip(item) {
      if (item.late) { lateDrafts.delete(item.id); render(); schedulePractice(); }
      else if (item.local) skipPractice(item); else send({ type: 'skip', id: item.id });
    },
    onSubmit(item, values) {
      if (onTrainingSubmit) { onTrainingSubmit(answerRequest(item.request, values)); return; }
      const compare = $('#compare').checked && Boolean((item.local && savedExample(item.request)) || getKey());
      showError('');
      if (item.local) submitPractice(item, values, compare);
      else send({ type: 'submit', id: item.id, values, compare });
    },
  });
}
function skipPractice(item) {
  if (practice?.id !== item.id) return;
  practice = undefined;
  render();
  schedulePractice();
}
function trimLateDrafts() {
  const count = lateDrafts.size;
  for (const [id, item] of lateDrafts) if (Date.now() > item.deadline + 60_000) lateDrafts.delete(id);
  while (lateDrafts.size > 3) lateDrafts.delete(lateDrafts.keys().next().value);
  return count !== lateDrafts.size;
}
function update(message) {
  offset = message.serverTime - Date.now();
  for (const retired of message.retired || []) {
    const previous = serverQueue.requests.find(item => item.id === retired.id);
    if (!previous?.submitted && !lateDrafts.has(retired.id)) lateDrafts.set(retired.id, { ...retired, deadline: retired.deadline - offset, local: true });
  }
  // Local unfinished cards have a bounded lifetime and never reserve API slots.
  trimLateDrafts();
  serverQueue = message;
  render();
  schedulePractice();
}
function render() {
  current = [...serverQueue.requests, ...lateDrafts.values(), ...(practice ? [practice] : [])];
  const results = [...practiceResults, ...serverQueue.results.filter(result => !lateDrafts.has(result.id) && !practiceResults.some(local => local.id === result.id))];
  const ids = new Set([...current, ...results].map(item => item.id));
  const newQuestion = current.findLast(item => !forms.has(item.id));
  const newCards = [...current, ...results].some(item => !forms.has(item.id));
  let risen;
  // Trimming old history during submission moves the card the user just answered.
  for (const [id, form] of forms) if (!ids.has(id) && (newCards || !form.card.classList.contains('answered'))) { form.card.remove(); forms.delete(id); }
  if (ids.size) {
    $('#requests .empty')?.remove();
    // Submission updates the same card. New rounds go above the older cards.
    for (const item of [...results].reverse().concat(current)) {
      if (!forms.has(item.id)) { const form = makeForm(item); forms.set(item.id, form); $('#requests').prepend(form.card); }
    }
    for (const item of current) forms.get(item.id).setItem(item);
    for (const result of results) forms.get(result.id).finish(result);
    for (const item of serverQueue.requests) forms.get(item.id).progress(item);
    // Unanswered questions stay above anything already submitted, so a waiting
    // example rises back to the top once the live request above it is answered.
    const pending = new Set(current.filter(item => item.local || !item.submitted).map(item => forms.get(item.id).card));
    let slot = 0;
    for (const card of [...$('#requests').children].filter(card => pending.has(card))) {
      const target = $('#requests').children[slot++];
      if (target !== card) { $('#requests').insertBefore(card, target); risen ??= card; }
    }
  } else if (!$('#requests .empty')) {
    $('#requests').append(emptyState(playing));
  } else $('#requests .empty p').textContent = playing ? 'Next example coming up…' : 'Press play to answer questions. Live requests are always welcome.';
  tick();
  if ((newQuestion || risen) && !training.active) {
    const card = newQuestion ? forms.get(newQuestion.id).card : risen;
    const top = card.getBoundingClientRect().top + window.scrollY - $('header').getBoundingClientRect().height - 16;
    window.scrollTo({ top, behavior: 'instant' });
  }
}
function tick() {
  if (trimLateDrafts()) { render(); schedulePractice(); return; }
  for (const item of current) { const form = forms.get(item.id); const seconds = Math.max(0, (item.deadline - (item.pausedAt ?? Date.now()) - (item.local ? 0 : offset)) / 1000); form.clock.textContent = seconds > 0 ? `${seconds.toFixed(1)}s` : 'Timed out'; form.clock.classList.toggle('urgent', seconds < 10); form.validity(); }
}
async function compareInBrowser(message) {
  const connection = socket;
  const controller = new AbortController();
  comparisons.set(message.id, controller);
  const timer = setTimeout(() => controller.abort(), 30_000);
  let result;
  try { result = comparisons.size > 2 ? { error: 'Comparison skipped · browser busy' } : $('#compare').checked ? await compareWithJev(message.request, getKey(), controller.signal) : { error: 'Comparison skipped · comparison off' }; }
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
  const connection = socket;
  socket.addEventListener('open', () => { presence(); $('#connection').textContent = 'Connected'; for (const form of forms.values()) form.reset(); });
  socket.addEventListener('close', () => {
    for (const [id, controller] of comparisons) if (!practiceResults.some(result => result.id === id)) controller.abort();
    // Keep interrupted work in this tab; a reconnect receives fresh assignments.
    for (const item of serverQueue.requests) if (!item.submitted) lateDrafts.set(item.id, { ...item, deadline: item.deadline - offset, local: true, late: true });
    trimLateDrafts();
    serverQueue = { requests: [], results: serverQueue.results }; render();
    $('#connection').textContent = 'Disconnected · reconnecting…';
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt++, 5)) * (0.5 + Math.random());
    setTimeout(connect, delay);
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'queue') { update(message); connection.send(JSON.stringify({ type: 'ack', version: message.version })); }
    if (message.type === 'presence') reconnectAttempt = 0;
    if (message.type === 'compare') void compareInBrowser(message);
    if (message.type === 'cancel-compare') comparisons.get(message.id)?.abort();
    if (message.type === 'error') { showError(message.message); for (const form of forms.values()) form.reset(); }
  });
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
  } catch { showError('Saved Jev answers could not be loaded. Refresh to try again.'); }
  training.refresh();
  try { refreshAuth(); } catch { showError('Browser storage is unavailable. Allow site storage to connect OpenRouter.'); }
  connect();
  dealPractice();
}
setInterval(tick, 100);
setInterval(() => send({ type: 'ping' }), 20_000);
$('#requests').replaceChildren(emptyState(false));
void initialize();
