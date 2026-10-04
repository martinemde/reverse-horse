import { choiceWeights } from './protocol.js';
import { matchesJev } from './compare.js';
import { node } from './dom.js';

const text = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
export function paintRange(input) { input.style.setProperty('--fill', `${100 * Number(input.value) / Number(input.max)}%`); }
function range(label, max, value, changed) {
  const input = node('input');
  input.type = 'range'; input.min = '0'; input.max = String(max); input.step = '0.001'; input.value = String(value);
  input.setAttribute('aria-label', label);
  paintRange(input);
  input.addEventListener('input', () => { paintRange(input); changed(Number(input.value)); });
  return input;
}
function track(slider) {
  const wrapper = node('div', undefined, 'slider-track');
  const overlay = node('div', undefined, 'slider-overlay');
  const marker = node('span', undefined, 'jev-marker');
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  overlay.append(marker); wrapper.append(slider, overlay);
  return { wrapper, marker };
}
function place(control, value, max, label) {
  control.marker.style[control.vertical ? 'top' : 'left'] = `${100 * value / max}%`;
  control.marker.hidden = false;
  control.jev.textContent = `Jev ${label}`;
  control.jev.classList.remove('pending');
}

// One slider with its readout, shared by Noul and Score.
function scale(id, values, max, caption, vertical) {
  values[id] = max / 2;
  const row = node('div', undefined, 'range-row');
  const output = node('output', values[id].toFixed(3));
  const jev = node('span', 'Jev', 'jev-value pending');
  const numbers = node('div', undefined, 'range-values'); numbers.append(output, jev);
  row.append(node('span', caption), numbers);
  const slider = range(id, max, values[id], value => { values[id] = value; output.textContent = value.toFixed(3); });
  const { wrapper, marker } = track(slider);
  const control = { jev, marker, vertical };
  return {
    row, wrapper,
    restore(value) { values[id] = value; slider.value = String(value); paintRange(slider); output.textContent = value.toFixed(3); },
    mark(value) { place(control, value, max, value.toFixed(3)); },
  };
}

// Each type builds its controls into the fieldset and returns how to restore a
// submitted answer and how to show Jev's answer on the same controls.
const questionTypes = {
  noul(field, id, q, values) {
    const s = scale(id, values, 1, 'Probability of yes', false);
    const ends = node('div', undefined, 'ends');
    ends.append(node('span', `No · 0${q.criteria?.false !== undefined ? '\n' + text(q.criteria.false) : ''}`), node('span', `Yes · 1${q.criteria?.true !== undefined ? '\n' + text(q.criteria.true) : ''}`));
    field.append(s.row, s.wrapper, ends);
    return { rule: 'Same yes/no side', restore: human => s.restore(human.noul), mark: (human, jev) => s.mark(jev.noul) };
  },
  score(field, id, q, values) {
    const max = q.criteria.length - 1;
    const s = scale(id, values, max, 'Your score', true);
    // Vertical, lowest level on top, so labels read horizontally beside their level.
    const levels = node('div', undefined, 'score-levels');
    q.criteria.forEach((label, i) => {
      const level = node('span'); level.style.top = `${100 * i / max}%`;
      level.append(node('b', i), node('span', text(label)));
      levels.append(level);
    });
    const vertical = node('div', undefined, 'score-scale'); vertical.style.setProperty('--steps', max);
    vertical.append(s.wrapper, levels);
    field.append(s.row, vertical);
    return { rule: 'Same nearest level', restore: human => s.restore(human.score), mark: (human, jev) => s.mark(jev.score) };
  },
  choice(field, id, q, values, changed) {
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
      changed();
    };
    for (const key of keys) {
      const option = node('div', undefined, 'choice');
      const label = node('div', key, 'choice-name');
      if (q.criteria[key] !== null) label.append(node('span', `: ${text(q.criteria[key])}`, 'choice-description'));
      const fullness = node('output', undefined, 'choice-fullness');
      const output = node('output', undefined, 'choice-probability');
      const jev = node('span', 'Jev', 'jev-value pending');
      const numbers = node('div', undefined, 'range-values'); numbers.append(output, jev, fullness);
      const slider = range(`${id}: ${key}`, 1, 0, value => {
        values[id][key] = value;
        refresh();
      });
      const scale = track(slider);
      // Slider and its numbers share one line so long choice lists stay on screen.
      const line = node('div', undefined, 'range-row choice-line'); line.append(scale.wrapper, numbers);
      controls.push({ key, slider, fullness, output, jev, option, marker: scale.marker });
      option.append(label, line); field.append(option);
    }
    const summary = node('div', undefined, 'choice-summary');
    summary.append(certainty);
    field.append(summary);
    queueMicrotask(refresh);
    return {
      rule: 'Same choice',
      restore(human) { values[id] = choiceWeights(human); refresh(); },
      mark(human, jev) {
        const weights = choiceWeights(jev);
        for (const control of controls) {
          place(control, weights[control.key], 1, `${(100 * jev.probabilities[control.key]).toFixed(1)}% chance`);
          control.jev.title = 'Pink markers scale Jev probabilities so its tallest bar equals its confidence';
          control.option.classList.toggle('human-picked', human.choice === control.key);
          control.option.classList.toggle('jev-picked', jev.choice === control.key);
        }
      },
    };
  },
};

// A card answers one request. The page decides what submit and skip mean;
// onSubmit may throw to put the card back in an editable state.
export function createCard(item, { onSubmit, onSkip, onError, connected }) {
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
  const corner = node('div', undefined, 'request-corner');
  corner.append(clock);
  const skip = node('button', undefined, 'skip'); skip.type = 'button';
  skip.setAttribute('aria-label', 'Skip this question'); skip.title = 'Skip';
  skip.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  skip.addEventListener('click', () => {
    skip.disabled = true;
    onSkip(item);
  });
  if (!item.training) corner.append(skip);
  head.append(label, corner);
  const state = node('div', undefined, 'state'); state.append(node('div', 'STATE', 'eyebrow'), node('pre', text(item.request.state)));
  const questions = node('div', undefined, 'questions');
  for (const [id, q] of Object.entries(item.request.questions)) {
    const field = node('fieldset', undefined, 'question');
    field.dataset.question = id;
    field.append(node('legend', `${q.type.toUpperCase()} / ${id}`), node('div', text(q.instructions), 'instructions'));
    const feedback = node('p', '', 'question-feedback');
    feedback.setAttribute('role', 'status');
    views.set(id, { field, feedback, ...questionTypes[q.type](field, id, q, values, () => validity()) });
    field.append(feedback);
    questions.append(field);
  }
  const actions = node('div', undefined, 'actions');
  const button = node('button', item.training ? 'Submit & see Jev’s answer' : 'Submit answers'); button.type = 'submit';
  const hint = node('p', '');
  actions.append(hint, button); card.append(head, state, questions, actions);
  function validity() {
    if (completed) return;
    const invalidChoice = Object.values(values).some(v => typeof v === 'object' && !Object.values(v).some(n => n > 0));
    // Keep the button DOM stable: WebKit drops clicks if its text changes mid-press.
    button.disabled = submitted || submitting || (!item.local && !connected()) || invalidChoice;
  }
  card.addEventListener('submit', event => {
    event.preventDefault(); validity(); if (button.disabled) return;
    try {
      // Training answers finish the card immediately; there is nothing to wait for.
      if (!item.training) { submitting = true; validity(); }
      onSubmit(item, values);
    } catch (error) { submitting = false; validity(); onError(error); }
  });
  function finish(result) {
    const signature = JSON.stringify(result);
    if (signature === outcomeSignature) return;
    outcomeSignature = signature;
    if (!completed) {
      completed = true;
      actions.style.minHeight = `${actions.getBoundingClientRect().height}px`;
      corner.style.minHeight = `${corner.getBoundingClientRect().height}px`;
      button.style.minWidth = `${button.getBoundingClientRect().width}px`;
      card.classList.add('answered');
      skip.remove();
      clock.style.width = `${clock.getBoundingClientRect().width}px`;
      clock.textContent = 'Done'; clock.classList.remove('urgent'); clock.setAttribute('aria-label', 'Answered');
      button.disabled = true; button.textContent = 'Submitted';
      for (const [id, view] of views) {
        view.field.disabled = true;
        const human = result.human?.answers[id];
        if (human) view.restore(human);
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
      view.feedback.textContent = match ? 'Matched Jev' : 'Different from Jev';
      view.feedback.title = `${view.rule} counts as a match`;
      view.mark(human, jev);
    }
  }
  function progress(item) {
    submitted = Boolean(item.submitted);
    const label = submitted ? 'Submitted' : 'Submit answers';
    if (button.textContent !== label) button.textContent = label;
    for (const view of views.values()) view.field.disabled = submitted;
    if (submitted) { submitting = false; corner.style.minHeight = `${corner.getBoundingClientRect().height}px`; skip.remove(); }
    hint.textContent = submitted ? `Waiting for answers · ${item.received}/${item.expected} received` : `${item.received}/${item.expected} answers received`;
    validity();
  }
  return { card, clock, validity, finish, progress,
    setItem(next) {
      item = next;
      if (next.late && !completed) {
        submitted = submitting = false; skip.disabled = false;
        label.textContent = 'LATE ANSWER'; hint.textContent = 'The caller has moved on. This answer stays in your tab.';
        for (const view of views.values()) view.field.disabled = false;
        validity();
      }
    },
    reset() { if (!completed) { submitting = false; skip.disabled = false; validity(); } } };
}
