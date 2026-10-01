import { buildRequest } from './builder-data.js';

const $ = selector => document.querySelector(selector);
const cards = [];
let nextId = 1;
let sending = false;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
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
function draft() {
  return buildRequest({ state: $('#state').value, stateFormat: $('#state-format').value, questions: cards.map(card => card.read()) });
}
function preview() {
  $('#copy-status').textContent = '';
  try {
    $('#preview').value = JSON.stringify(draft(), null, 2);
    $('#builder-error').hidden = true;
    $('#copy-json').disabled = false;
    $('#send').disabled = sending;
  } catch (e) {
    $('#preview').value = '';
    $('#builder-error').textContent = e.message;
    $('#builder-error').hidden = false;
    $('#send').disabled = true;
    $('#copy-json').disabled = true;
  }
}
function addQuestion() {
  const card = node('section', undefined, 'builder-panel');
  const heading = node('div', undefined, 'panel-heading');
  const id = field('Question ID', `question_${nextId++}`);
  const typeLabel = node('label', 'Type', 'field');
  const type = node('select');
  for (const [value, label] of [['noul', 'Noul · yes / no'], ['choice', 'Choice · pick an option'], ['score', 'Score · a position on a scale']]) {
    const option = node('option', label); option.value = value; type.append(option);
  }
  typeLabel.append(type);
  const instructions = field('Question / instructions', '', true);
  const criteria = node('div');
  const no = field('No means (optional)'); const yes = field('Yes means (optional)');
  const options = []; const levels = [];
  function addOption() {
    const key = field('Option key'); const description = field('Description (optional)');
    const row = node('div', undefined, 'option-editor');
    const entry = { key, description, row }; options.push(entry);
    row.append(key.wrapper, description.wrapper, removeButton(() => { options.splice(options.indexOf(entry), 1); renderCriteria(); preview(); }));
  }
  function addLevel() {
    const description = field('Level description');
    const row = node('div', undefined, 'level-editor');
    const number = node('span', '', 'eyebrow');
    const entry = { description, row, number }; levels.push(entry);
    row.append(number, description.wrapper, removeButton(() => { levels.splice(levels.indexOf(entry), 1); renderCriteria(); preview(); }));
  }
  function renderCriteria() {
    criteria.replaceChildren();
    if (type.value === 'noul') criteria.append(no.wrapper, yes.wrapper);
    if (type.value === 'choice') {
      const add = node('button', 'Add option', 'secondary'); add.type = 'button'; add.disabled = options.length >= 255;
      add.addEventListener('click', () => { addOption(); renderCriteria(); preview(); options.at(-1).key.input.focus(); });
      criteria.append(...options.map(option => option.row), add);
    }
    if (type.value === 'score') {
      levels.forEach((level, index) => { level.number.textContent = index; level.description.input.setAttribute('aria-label', `Level ${index} description`); });
      const add = node('button', 'Add level', 'secondary'); add.type = 'button'; add.disabled = levels.length >= 10;
      add.addEventListener('click', () => { addLevel(); renderCriteria(); preview(); levels.at(-1).description.input.focus(); });
      criteria.append(node('p', 'Arrange levels from lowest to highest. Answers can fall between them.'), ...levels.map(level => level.row), add);
    }
  }
  const entry = { read: () => ({ id: id.input.value, type: type.value, instructions: instructions.input.value, no: no.input.value, yes: yes.input.value, options: options.map(option => ({ key: option.key.input.value, description: option.description.input.value })), levels: levels.map(level => level.description.input.value) }) };
  cards.push(entry);
  heading.append(node('h2', 'Question'), removeButton(() => { cards.splice(cards.indexOf(entry), 1); card.remove(); preview(); }));
  type.addEventListener('change', () => { renderCriteria(); preview(); });
  card.append(heading, id.wrapper, typeLabel, instructions.wrapper, criteria);
  addOption(); addOption(); addLevel(); addLevel();
  $('#questions').append(card); renderCriteria(); preview();
  return instructions.input;
}

$('#builder').addEventListener('input', preview);
$('#state-format').addEventListener('change', preview);
$('#add-question').addEventListener('click', () => addQuestion().focus());
$('#copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#preview').value); $('#copy-status').textContent = 'Copied.'; }
  catch { $('#copy-status').textContent = 'Select the JSON and copy it manually.'; }
});
$('#builder').addEventListener('submit', async event => {
  event.preventDefault();
  if (sending) return;
  let request;
  try { request = draft(); } catch (e) { preview(); return; }
  sending = true; $('#draft').disabled = true; $('#send').disabled = true;
  $('#response-panel').hidden = false; $('#response').textContent = '';
  const started = Date.now();
  const updateClock = () => { const remaining = Math.max(0, 30 - (Date.now() - started) / 1000); $('#response-status').textContent = remaining ? `Waiting for a human answer · ${remaining.toFixed(0)}s` : 'Waiting for the API response…'; };
  updateClock(); const timer = setInterval(updateClock, 250);
  try {
    const response = await fetch('/api/v1/systemone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(40_000) });
    const body = await response.json();
    clearInterval(timer);
    $('#response-status').textContent = response.ok ? `HTTP ${response.status} · Answer received` : response.status === 504 ? 'HTTP 504 · No answer within 30 seconds. A late answer can still be saved on the answering screen, but this API call has ended.' : `HTTP ${response.status} · Request failed`;
    $('#response').textContent = JSON.stringify(body, null, 2);
  } catch (e) { $('#response-status').textContent = e.name === 'TimeoutError' ? 'The connection timed out before a response arrived.' : `Could not send the request: ${e.message}`; }
  finally { clearInterval(timer); sending = false; $('#draft').disabled = false; preview(); }
});
addQuestion();

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
  $('#curl-example').append(node('h2', 'Try the API with curl'), node('p', 'An editable example with all three question types. Copy it into your terminal to send a request.'), controls, input);
}
showCurlExample();
