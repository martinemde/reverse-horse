import { buildRequest } from './builder-data.js';
import { requestLimits } from './protocol.js';
import { node } from './dom.js';
import { migrateStorage, getKey, disconnect, loginURL, completeLogin } from './auth.js';
import { compareWithJev, matchesJev } from './compare.js';

const $ = selector => document.querySelector(selector);
function field(label, value = '', multiline = false) {
  const wrapper = node('label', label, 'field');
  const input = node(multiline ? 'textarea' : 'input');
  input.value = value;
  if (multiline) input.rows = 2;
  wrapper.append(input);
  return { wrapper, input };
}
function removeButton(action) {
  const button = node('button', 'Remove', 'secondary');
  button.type = 'button'; button.addEventListener('click', action);
  return button;
}
function createEditor(fields, { onChange, onSave, onSend }) {
  const root = document.querySelector('#question-editor').content.firstElementChild.cloneNode(true);
  for (const element of root.querySelectorAll('[id]')) { element.dataset.part = element.id; element.removeAttribute('id'); }
  const $ = selector => root.querySelector(selector.replace(/#([\w-]+)/g, '[data-part="$1"]'));
  const cards = [];
  let nextId = 1;
  const read = () => ({ state: $('#state').value, stateFormat: $('#state-format').value, questions: cards.map(card => card.read()) });
  function draft() {
    return buildRequest(read());
  }
  function preview() {
    $('#copy-status').textContent = '';
    $('#add-question').disabled = cards.length >= requestLimits.questions;
    try {
      $('#preview').value = JSON.stringify(draft(), null, 2);
      $('#builder-error').hidden = true;
      $('#copy-json').disabled = false;
      $('#send').disabled = false;
      $('#save').disabled = false;
    } catch (e) {
      $('#preview').value = '';
      $('#builder-error').textContent = e.message;
      $('#builder-error').hidden = false;
      $('#send').disabled = true;
      $('#save').disabled = true;
      $('#copy-json').disabled = true;
    }
  }
  function addQuestion(saved = {}) {
    const card = node('section', undefined, 'builder-panel');
    const heading = node('div', undefined, 'panel-heading');
    while (cards.some(card => card.read().id === `question_${nextId}`)) nextId++;
    const id = field('Question ID', saved.id ?? `question_${nextId++}`);
    const typeLabel = node('label', 'Type', 'field');
    const type = node('select');
    type.setAttribute('aria-label', 'Type');
    for (const [value, label] of [['noul', 'Noul · yes / no'], ['choice', 'Choice · pick an option'], ['score', 'Score · a position on a scale']]) {
      const option = node('option', label); option.value = value; type.append(option);
    }
    typeLabel.append(type);
    type.value = saved.type ?? 'noul';
    const instructions = field('Question / instructions', saved.instructions ?? '', true);
    const criteria = node('div');
    const no = field('No means (optional)', saved.no); const yes = field('Yes means (optional)', saved.yes);
    const options = []; const levels = [];
    function addOption(saved = {}) {
      const key = field('Option key', saved.key); const description = field('Description (optional)', saved.description);
      const row = node('div', undefined, 'option-editor');
      const entry = { key, description, row }; options.push(entry);
      row.append(key.wrapper, description.wrapper, removeButton(() => { options.splice(options.indexOf(entry), 1); renderCriteria(); changed(); }));
    }
    function addLevel(saved = '') {
      const description = field('Level description', saved);
      const row = node('div', undefined, 'level-editor');
      const number = node('span', '', 'eyebrow');
      const entry = { description, row, number }; levels.push(entry);
      row.append(number, description.wrapper, removeButton(() => { levels.splice(levels.indexOf(entry), 1); renderCriteria(); changed(); }));
    }
    function renderCriteria() {
      criteria.replaceChildren();
      if (type.value === 'noul') criteria.append(no.wrapper, yes.wrapper);
      if (type.value === 'choice') {
        const add = node('button', 'Add option', 'secondary'); add.type = 'button'; add.disabled = options.length >= 255;
        add.addEventListener('click', () => { addOption(); renderCriteria(); changed(); options.at(-1).key.input.focus(); });
        criteria.append(...options.map(option => option.row), add);
      }
      if (type.value === 'score') {
        levels.forEach((level, index) => { level.number.textContent = index; level.description.input.setAttribute('aria-label', `Level ${index} description`); });
        const add = node('button', 'Add level', 'secondary'); add.type = 'button'; add.disabled = levels.length >= 10;
        add.addEventListener('click', () => { addLevel(); renderCriteria(); changed(); levels.at(-1).description.input.focus(); });
        criteria.append(node('p', 'Arrange levels from lowest to highest. Answers can fall between them.'), ...levels.map(level => level.row), add);
      }
    }
    const entry = { read: () => ({ id: id.input.value, type: type.value, instructions: instructions.input.value, no: no.input.value, yes: yes.input.value, options: options.map(option => ({ key: option.key.input.value, description: option.description.input.value })), levels: levels.map(level => level.description.input.value) }) };
    cards.push(entry);
    heading.append(node('h2', 'Question'), removeButton(() => { cards.splice(cards.indexOf(entry), 1); card.remove(); changed(); }));
    type.addEventListener('change', () => { renderCriteria(); changed(); });
    card.append(heading, id.wrapper, typeLabel, instructions.wrapper, criteria);
    for (const option of saved.options ?? [{}, {}]) addOption(option);
    for (const level of saved.levels ?? ['', '']) addLevel(level);
    $('#questions').append(card); renderCriteria(); preview();
    return instructions.input;
  }

  function changed() { preview(); onChange(read()); }
  $('#builder').addEventListener('input', changed);
  $('#state-format').addEventListener('change', changed);
  $('#add-question').addEventListener('click', () => { const input = addQuestion(); changed(); input.focus(); });
  $('#copy-json').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#preview').value); $('#copy-status').textContent = 'Copied.'; }
    catch { $('#copy-status').textContent = 'Select the JSON and copy it manually.'; }
  });
  $('#save').addEventListener('click', () => { try { draft(); onSave(read()); } catch { preview(); } });
  $('#builder').addEventListener('submit', event => {
    event.preventDefault();
    try { draft(); onSend(read()); } catch { preview(); }
  });
  $('#state').value = fields.state;
  $('#state-format').value = fields.stateFormat;
  for (const question of fields.questions) addQuestion(question);
  preview();
  return { root };
}

const storageKey = 'reverse-horse.questions';
// The saved question that asked to connect, so it can ask Jev after the redirect.
const askAfterLogin = 'reverse-horse.openrouter.ask';
function showError(message = '') { $('#error').textContent = message; $('#error').hidden = !message; }
function storedKey() { try { return getKey(); } catch { return undefined; } }
function refreshAuth() { $('#openrouter').hidden = !storedKey(); }
function percent(n) { return `${(100 * n).toFixed(1)}%`; }
function describe(answer, question) {
  if (answer.type === 'noul') return `${answer.noul >= 0.5 ? 'Yes' : 'No'} · ${answer.noul.toFixed(3)}`;
  if (answer.type === 'choice') return `${answer.choice} · ${percent(answer.probabilities[answer.choice])}`;
  return `${answer.score.toFixed(2)} · ${question.criteria[Math.round(answer.score)]}`;
}
const matchRules = { noul: 'Same yes/no side', choice: 'Same choice', score: 'Same nearest level' };
function comparisonView(request, human, jev) {
  const panel = node('section', undefined, 'builder-panel jev-comparison');
  panel.append(node('h2', 'Compared with Jev'));
  for (const [id, question] of Object.entries(request.questions)) {
    const ours = human.answers[id]; const theirs = jev.answers[id];
    const row = node('div', undefined, 'comparison');
    const match = matchesJev(ours, theirs);
    const verdict = node('p', match ? 'Matched Jev' : 'Different from Jev', `difference ${match ? 'match' : 'miss'}`);
    verdict.title = `${matchRules[question.type]} counts as a match`;
    const grid = node('div', undefined, 'compare-grid');
    for (const [label, answer] of [['Humans', ours], ['Jev', theirs]]) {
      const cell = node('div'); cell.append(node('span', label, 'eyebrow'), node('span', describe(answer, question), 'answer-value'));
      grid.append(cell);
    }
    row.append(node('h3', `${question.type.toUpperCase()} / ${id}`), grid, verdict);
    panel.append(row);
  }
  return panel;
}
const blank = () => ({ state: '', stateFormat: 'text', questions: [{ id: 'question_1', type: 'noul', instructions: '', no: '', yes: '', options: [{ key: '', description: '' }, { key: '', description: '' }], levels: ['', ''] }] });
let library = { draft: blank(), questions: [] };
const cards = new Map();
let readable = true;
function libraryError(message = '') { $('#library-error').textContent = message; $('#library-error').hidden = !message; }
function validFields(fields) {
  return fields && typeof fields.state === 'string' && ['text', 'json'].includes(fields.stateFormat) && Array.isArray(fields.questions) && fields.questions.every(q =>
    q && ['id', 'instructions', 'no', 'yes'].every(key => typeof q[key] === 'string') && ['noul', 'choice', 'score'].includes(q.type) &&
    Array.isArray(q.options) && q.options.every(o => o && typeof o.key === 'string' && typeof o.description === 'string') &&
    Array.isArray(q.levels) && q.levels.every(level => typeof level === 'string'));
}
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const saved = JSON.parse(stored);
    if (!validFields(saved.draft) || !Array.isArray(saved.questions) || !saved.questions.every(q => q && typeof q.id === 'string' && validFields(q.fields)) || new Set(saved.questions.map(q => q.id)).size !== saved.questions.length) throw new Error('Invalid saved questions');
    library = saved;
  }
} catch {
  readable = false;
  libraryError('Could not load saved questions. Allow browser storage and reload. Existing stored data has been left unchanged.');
}
function persist(next = library) {
  if (!readable) return false;
  try { localStorage.setItem(storageKey, JSON.stringify(next)); library = next; libraryError(); return true; }
  catch { libraryError('Could not save your questions in this browser. Your edits are still on this page.'); return false; }
}
function showNewEditor() {
  const editor = createEditor(library.draft, {
    onChange(fields) { library.draft = fields; persist(); },
    onSave: saveNew,
    onSend(fields) { const card = saveNew(fields); if (card) void card.send(); },
  });
  editor.root.querySelector('[data-part="builder"]').id = 'builder';
  $('#new-question').replaceChildren(editor.root);
}
function saveNew(fields) {
  const record = { id: crypto.randomUUID(), fields };
  if (!persist({ draft: blank(), questions: [record, ...library.questions] })) return;
  const card = savedCard(record);
  cards.set(record.id, card);
  $('#saved-questions').prepend(card.root);
  showNewEditor();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) card.root.animate([{ opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250, easing: 'ease-out' });
  card.root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  return card;
}
function savedCard(record) {
  const root = node('article', undefined, 'saved-question'); root.dataset.id = record.id;
  const summary = node('div', undefined, 'saved-question-summary');
  const heading = node('div', undefined, 'panel-heading');
  const title = node('h2');
  const controls = node('div', undefined, 'question-buttons');
  const edit = node('button', 'Edit', 'secondary'); edit.type = 'button';
  const send = node('button', record.sent ? 'Send again' : 'Send'); send.type = 'button';
  const state = node('pre', undefined, 'saved-state');
  const details = node('p');
  const response = node('section', undefined, 'builder-panel question-response'); response.hidden = true;
  const status = node('p'); status.dataset.part = 'response-status'; status.setAttribute('role', 'status');
  const body = node('pre'); body.dataset.part = 'response';
  const jevControls = node('div', undefined, 'question-buttons'); jevControls.hidden = true;
  const askJev = node('button', 'Ask Jev too', 'secondary'); askJev.type = 'button';
  const jevStatus = node('p'); jevStatus.setAttribute('role', 'status');
  jevControls.append(askJev);
  response.append(node('h2', 'Response'), status, body, jevControls, jevStatus);
  let jevPanel;
  controls.append(edit, send); heading.append(title, controls); summary.append(heading, state, details); root.append(summary, response);
  let sending = false;
  let asking;
  function clearJev() {
    asking?.abort(); jevPanel?.remove(); jevPanel = undefined; jevStatus.textContent = ''; jevControls.hidden = true;
  }
  function showAnswer() {
    const { status: code, answer } = record.response;
    response.hidden = false;
    status.textContent = `HTTP ${code} · Answer received`;
    body.textContent = JSON.stringify(answer, null, 2);
    jevControls.hidden = false;
  }
  async function compare() {
    if (!record.response || asking) return;
    const key = storedKey();
    if (!key) {
      $('#jev-connect').dataset.id = record.id;
      $('#jev-connect').showModal();
      return;
    }
    const request = record.response.request;
    asking = new AbortController();
    const timer = setTimeout(() => asking.abort(), 30_000);
    askJev.disabled = true; jevPanel?.remove(); jevPanel = undefined;
    jevStatus.textContent = 'Asking Jev via OpenRouter…';
    try {
      const { jev } = await compareWithJev(request, key, asking.signal);
      // A newer send replaces the answer this lookup was comparing against.
      if (record.response?.request !== request) return;
      jevStatus.textContent = `Fresh answer from ${jev.model} via OpenRouter`;
      jevPanel = comparisonView(request, record.response.answer, jev);
      root.append(jevPanel);
    } catch (e) {
      jevStatus.textContent = e.name === 'AbortError' ? 'Jev lookup stopped or timed out.' : `Could not ask Jev: ${e.message}`;
    } finally { clearTimeout(timer); asking = undefined; askJev.disabled = false; }
  }
  askJev.addEventListener('click', () => void compare());
  function refresh() {
    title.textContent = record.fields.questions[0]?.instructions || 'Saved question';
    state.textContent = record.fields.state;
    const count = record.fields.questions.length;
    details.textContent = `${count} ${count === 1 ? 'question' : 'questions'} · Saved in this browser`;
  }
  function finishEditing(fields, editor) {
    record.fields = fields;
    if (!persist()) return false;
    editor.root.remove(); summary.hidden = false; refresh();
    return true;
  }
  edit.addEventListener('click', () => {
    const editor = createEditor(record.fields, {
      onChange(fields) { record.fields = fields; persist(); },
      onSave(fields) { finishEditing(fields, editor); },
      onSend(fields) { if (finishEditing(fields, editor)) void sendRequest(); },
    });
    summary.hidden = true; root.insertBefore(editor.root, response);
    editor.root.querySelector('[data-part="state"]').focus({ preventScroll: true });
  });
  async function sendRequest() {
    if (sending) return;
    let request;
    try { request = buildRequest(record.fields); }
    catch (e) { response.hidden = false; status.textContent = e.message; body.textContent = ''; return; }
    if (!persist()) return;
    sending = true; send.disabled = true; edit.disabled = true;
    record.sent = true; delete record.response; persist();
    clearJev();
    response.hidden = false; body.textContent = '';
    const started = Date.now();
    const updateClock = () => { const remaining = Math.max(0, 30 - (Date.now() - started) / 1000); status.textContent = remaining ? `Waiting for human answers · ${remaining.toFixed(0)}s` : 'Waiting for the API response…'; };
    updateClock(); const timer = setInterval(updateClock, 250);
    try {
      const result = await fetch('/v1/systemone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(40_000) });
      const answer = await result.json();
      clearInterval(timer);
      if (result.ok) {
        // Kept so the comparison survives the OpenRouter login redirect.
        record.response = { status: result.status, request, answer }; persist();
        showAnswer();
        if (storedKey()) void compare();
      } else {
        status.textContent = result.status === 504 ? 'HTTP 504 · No answer within 30 seconds. You can send this question again.' : `HTTP ${result.status} · Request failed`;
        body.textContent = JSON.stringify(answer, null, 2);
      }
    } catch (e) { status.textContent = e.name === 'TimeoutError' ? 'The connection timed out before a response arrived.' : `Could not send the question: ${e.message}`; }
    finally { clearInterval(timer); sending = false; send.disabled = false; edit.disabled = false; send.textContent = 'Send again'; }
  }
  send.addEventListener('click', () => void sendRequest());
  refresh();
  if (record.response) showAnswer();
  return { root, send: sendRequest, compare };
}
showNewEditor();
for (const record of library.questions) { const card = savedCard(record); cards.set(record.id, card); $('#saved-questions').append(card.root); }

$('#connect').addEventListener('click', async () => {
  $('#connect').disabled = true;
  try {
    sessionStorage.setItem(askAfterLogin, $('#jev-connect').dataset.id);
    location.assign(await loginURL(location.origin));
  } catch (e) { $('#jev-connect').close(); showError(e.message); $('#connect').disabled = false; }
});
$('#disconnect').addEventListener('click', () => {
  try { disconnect(); } catch { showError('Could not remove the OpenRouter key from browser storage.'); }
  refreshAuth();
});
window.addEventListener('storage', refreshAuth);
async function initializeAuth() {
  try { migrateStorage(); } catch { /* Storage may be disabled; connecting reports it. */ }
  const callback = new URL(location.href);
  if (callback.pathname !== '/auth/openrouter/callback') { refreshAuth(); return; }
  // Remove the authorization code from history before doing anything else.
  history.replaceState(null, '', '/request');
  let ask;
  try { ask = sessionStorage.getItem(askAfterLogin); sessionStorage.removeItem(askAfterLogin); } catch { /* Nothing to resume. */ }
  $('#openrouter-status').textContent = 'Connecting to OpenRouter…'; $('#openrouter').hidden = false;
  try {
    await completeLogin(callback);
    $('#openrouter-status').textContent = 'OpenRouter connected · Ask Jev too uses your key from this browser.';
    const card = cards.get(ask);
    if (card) { card.root.scrollIntoView({ block: 'start' }); void card.compare(); }
  } catch (e) { showError(e.name === 'TimeoutError' ? 'OpenRouter login timed out. Try connecting again.' : e.message); }
  refreshAuth();
}
void initializeAuth();

const exampleRequest = {
  "model": "jev-latest",
  "state": "My package arrived two days late, but everything inside looks great.",
  "questions": {
    "damaged": { "type": "noul", "instructions": "Did anything arrive damaged?" },
    "topic": { "type": "choice", "instructions": "What is this message about?", "criteria": { "shipping": "Delivery and packages", "billing": "Charges and payments", "support": "Technical help" } },
    "mood": { "type": "score", "instructions": "How does the customer feel overall?", "criteria": ["Unhappy", "Mixed or neutral", "Happy"] }
  }
};
function showCurlExample() {
  const command = `curl '${location.origin}/v1/systemone' \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @- <<'JSON'\n${JSON.stringify(exampleRequest, null, 2)}\nJSON`;
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
  $('#curl-example').append(node('h2', 'Try the API with curl'), node('p', 'An editable example with all three question types. Copy it into your terminal to send a request.'), controls, input);
}
showCurlExample();
