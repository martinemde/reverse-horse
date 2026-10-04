import { examples } from './examples.js';
import { node } from './dom.js';

const completionKey = 'reverse-horse.training-completed';
const lessons = [
  {
    id: 'payment_needed', type: 'noul', title: 'Does this email need a payment?',
    concept: 'Named after Jacob Bernoulli (not the Bernoulli Principle Bernoulli; that’s Daniel, his nephew). Jacob proved that as you repeat an experiment, the observed frequency of an outcome converges to its true probability: the law of large numbers. Noul is short for “Bernoulli trial”: a true/false outcome and how often it occurs.',
    controls: 'Slide toward 1 for yes, 0 for no. 0.5 means you can’t tell.',
    explanation: 'The email says payment was received and nothing is needed. Jev says 0.02. The pink marker shows its answer.',
  },
  {
    id: 'team', type: 'choice', title: 'Which team should handle this email?',
    concept: 'Jev picks between the choices you give it. Usually you want an “unknown” or “not available” choice too. Force “how will the coin land?” between heads and tails and it picks heads; offer “unknowable” and it honestly says it can’t be known.',
    controls: 'Fill each bar from 0 to 100%. Your fullest bar is your confidence; relative fullness sets each probability.',
    explanation: 'A duplicate charge and refund belong with billing. Jev picks billing with probability 1 and confidence 1.',
  },
  {
    id: 'urgency', type: 'score', title: 'How urgent is this email?',
    concept: 'Picture one of those sliders from “Strongly Disagree” to “Strongly Agree.” A score isn’t discrete: the answer doesn’t have to land on a step. With five levels, Jev could return 1.3, between “disagree” and “neutral.”',
    controls: 'Slide along the levels. The first is 0, the next 1, and so on. Stop between them if that fits.',
    explanation: 'The meeting is in 30 minutes and the slides are blocking. Jev scores it 2, “Needs attention now.”',
  },
];

function button(text, action, className) {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}
function fields(entries) {
  const list = node('dl', undefined, 'training-fields');
  for (const [name, description] of entries) {
    const term = node('dt'); term.append(node('code', name));
    list.append(term, node('dd', description));
  }
  return list;
}

export function createTraining({ dialog, makeForm, getSavedExample, onOpen, onClose }) {
  let step = 0;
  let storageNotice = '';
  const answers = new Map();
  const flow = {
    get active() { return dialog.open; },
    start() {
      let completed = false;
      try { completed = localStorage.getItem(completionKey) === '1'; }
      catch { storageNotice = 'Browser storage is unavailable, so completion won’t be remembered.'; }
      if (!completed) flow.open();
    },
    open() {
      if (dialog.open) return;
      step = 0;
      answers.clear();
      dialog.showModal();
      document.body.classList.add('in-training');
      onOpen();
      render();
    },
    refresh() { if (dialog.open) render(); },
  };
  // Any exit counts: training opens once on a first visit and never nags again.
  function close(completed = false) {
    let error;
    try { localStorage.setItem(completionKey, '1'); }
    catch { if (completed) error = 'Training complete, but storage is blocked, so it will reopen next visit.'; }
    dialog.close();
    document.body.classList.remove('in-training');
    onClose(error);
    document.querySelector('#train').focus();
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function go(next) { step = next; render(); }
  function render() {
    const top = node('div', undefined, 'training-top');
    const brand = node('div', undefined, 'training-brand');
    const horse = node('img'); horse.src = '/horse.svg'; horse.alt = ''; horse.width = 32; horse.height = 32;
    brand.append(horse, node('span', 'reverse.horse / personnel development'));
    top.append(brand, button('Exit training', () => close(), 'secondary'));
    const progress = node('ol', undefined, 'training-progress');
    progress.setAttribute('aria-label', 'Training progress');
    for (const [index, label] of ['Induction', 'System One', 'Noul', 'Choice', 'Score', 'Certified'].entries()) {
      const item = node('li');
      const jump = button(`${String(index + 1).padStart(2, '0')} ${label}`, () => go(index));
      if (index === step) jump.setAttribute('aria-current', 'step');
      if (index < step) item.className = 'complete';
      item.append(jump);
      progress.append(item);
    }
    const body = node('div', undefined, 'training-body');
    const heading = node('h1'); heading.id = 'training-title'; heading.tabIndex = -1;
    const actions = node('div', undefined, 'training-actions');
    if (step === 0) {
      heading.textContent = 'Congratulations. You are the AI model.';
      body.append(heading,
        node('p', 'Requests arrive through the API. Everyone on the site sees them. You answer.', 'training-lead'));
      if (storageNotice) body.append(node('p', storageNotice, 'training-note'));
      actions.append(button('Next: System One', () => go(1)));
    } else if (step === 1) {
      heading.textContent = 'You are a System One model.';
      const warning = node('p'); warning.append(node('strong', 'Don’t let the API request time out!'));
      body.append(heading,
        node('p', 'A fast, automatic, gut reaction. (Daniel Kahneman would be proud.)', 'training-lead'),
        node('p', 'Every request has a 30-second time limit.'),
        warning,
        node('p', 'Real API requests are holding the connection open until you answer. (Sorry, Cloudflare 😬)'));
      actions.append(button('Back', () => go(0), 'secondary'), button('Begin mandatory training', () => go(2)));
    } else if (step === 5) {
      heading.textContent = 'You are now a qualified AI model.';
      body.append(heading,
        node('p', 'Your neural network was inside you all along.', 'training-lead'),
        node('p', 'Practice rounds start on the Answer screen; Pause stops them. Live API requests have 30 seconds from arrival. Question lets you build and send your own, then Ask Jev too for a fresh answer from the real Jev.'),
        node('p', 'Reopen Training from the navigation anytime.', 'training-note'));
      actions.append(button('Back', () => go(4), 'secondary'), button('Enter the site', () => close(true)));
    } else {
      const lesson = lessons[step - 2];
      const example = examples.find(example => Object.hasOwn(example.request.questions, lesson.id));
      const saved = getSavedExample(example.request);
      heading.textContent = lesson.title;
      const grid = node('div', undefined, 'training-grid');
      const guide = node('div', undefined, 'training-guide');
      guide.append(heading, node('h2', lesson.type), node('p', lesson.concept), node('h3', 'Controls'), node('p', lesson.controls));
      if (lesson.type === 'choice') guide.append(fields([
        ['100 / 100 / 0', 'Confidence 100%, probabilities 50 / 50 / 0.'],
        ['50 / 50 / 0', 'Confidence 50%, same probabilities.'],
      ]));
      const exercise = node('div', undefined, 'training-exercise');
      const result = answers.get(lesson.id);
      if (result && saved) result.jev = saved.jev;
      const status = node('p', result ? '' : 'Submit your answer to continue.');
      const next = button(step === 4 ? 'Complete training' : `Next: ${lessons[step - 1].type}`, () => go(step + 1));
      next.disabled = !result;
      const review = node('section', undefined, 'training-review');
      review.hidden = !result;
      review.setAttribute('aria-label', 'What Jev said');
      review.tabIndex = -1;
      const item = { ...example, id: `training-${lesson.id}`, local: true, training: true };
      const form = makeForm(item, human => {
        const outcome = { human, jev: saved?.jev, status: 'Training answer saved' };
        answers.set(lesson.id, outcome);
        form.finish(outcome);
        showReview();
        next.disabled = false;
        status.textContent = '';
        review.focus({ preventScroll: true });
        review.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
      exercise.append(form.card);
      grid.append(guide, exercise);
      body.append(grid, review);
      function showReview() {
        review.hidden = false;
        review.replaceChildren(node('h2', 'What Jev said'));
        if (saved) review.append(node('p', lesson.explanation), node('p', `Actual Jev run · ${new Date(saved.recordedAt).toLocaleDateString()} · ${saved.jev.model}`, 'training-note'));
        else review.append(node('p', 'The recorded Jev answer didn’t load. Refresh to retry, or continue.'));
      }
      if (result) { form.finish(result); showReview(); }
      actions.append(button('Back', () => go(step - 1), 'secondary'), status, next);
    }
    dialog.replaceChildren(top, progress, body, actions);
    dialog.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }
  return flow;
}
