import { examples } from './examples.js';

const completionKey = 'reverse-horse.training-completed';
const lessons = [
  {
    id: 'payment_needed', type: 'noul', title: 'Decide whether this email needs a payment.',
    brief: 'Your first assignment: distinguish a payment request from a receipt. Read the whole email, then decide whether the sender is asking you to pay. We have every confidence in your biological inference engine.',
    controls: 'Move the slider toward 1 for yes or 0 for no. The middle, 0.5, means you are unsure. This is a probability of yes, so a confident no belongs near 0.',
    criteria: 'Optional descriptions under true and false define what yes and no mean. Noul also works without criteria.',
    response: 'noul is the probability of yes, from 0 to 1. It is a number, not a boolean. Noul has no separate confidence field.',
    explanation: 'The sender says the payment was received and no action is needed. JEV puts the probability of a payment request at 0.02: a confident no belongs near 0. The pink marker shows the saved answer on your slider.',
  },
  {
    id: 'team', type: 'choice', title: 'Route this email to the right team.',
    brief: 'You are now qualified to choose between things. A customer reports a duplicate charge and asks for a refund. Decide which team should handle the email. Compliments about the product do not settle the bill.',
    controls: 'Fill each bar anywhere from 0% to 100%. You do not have to fill it all the way. The fullest bar sets your confidence; the relative fullness of all bars sets the probability of each choice. Move another bar and the chances readjust. The option with the most weight wins.',
    criteria: 'An object maps option keys to descriptions. The keys are the possible answers; descriptions explain them and may be null. Choice accepts 1–255 options.',
    response: 'choice is the winning option key; ties go to the first option. probabilities gives a weight from 0 to 1 for every option, totaling 1. Your confidence is how full you made the fullest bar, from 0 to 1. Even a single slightly filled bar can win with very low confidence.',
    explanation: 'A duplicate charge and a refund request belong with billing. JEV chooses billing with probability 1 and confidence 1. Your bars can still express uncertainty about the alternatives. A choice and its certainty are two different pieces of information.',
  },
  {
    id: 'urgency', type: 'score', title: 'Rate how urgently this email needs attention.',
    brief: 'Our final assignment requires a finely calibrated sense of “probably quite soon.” A colleague needs slides for a client meeting in 30 minutes and cannot present without them. You have a slider. The meeting has a deadline.',
    controls: 'Move the slider along the ordered levels. The first level is 0, the next is 1, and so on. You can stop between levels: 1.75 means mostly “Needs attention now,” with a little “Needs attention today.”',
    criteria: 'An array of 2–10 descriptions defines the scale in order. Array positions become the numeric levels. Score ranges from 0 to the last position, not necessarily 0 to 1.',
    response: 'score is the position on the scale. legend maps numeric levels back to their descriptions. probabilities distributes weight across those levels; confidence describes certainty.',
    explanation: 'The meeting starts in 30 minutes and the sender cannot present without the slides. JEV scores this 2, “Needs attention now.” You can also submit fractional scores when the urgency falls between levels.',
  },
];

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
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
function jsonPanel(title, value, className = '') {
  const panel = node('section', undefined, `training-json ${className}`);
  panel.append(node('h3', title), node('pre', JSON.stringify(value, null, 2)));
  return panel;
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
      catch { storageNotice = 'Browser storage is unavailable. Training still works, but completion cannot be remembered.'; }
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
  function close(completed = false) {
    let error;
    if (completed) {
      try { localStorage.setItem(completionKey, '1'); }
      catch { error = 'Training complete, but browser storage could not save your certificate. Training will appear again on your next visit.'; }
    }
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
    for (const [index, label] of ['Induction', 'Noul', 'Choice', 'Score', 'Certified'].entries()) {
      const item = node('li', `${String(index + 1).padStart(2, '0')} ${label}`);
      if (index === step) item.setAttribute('aria-current', 'step');
      if (index < step) item.className = 'complete';
      progress.append(item);
    }
    const body = node('div', undefined, 'training-body');
    const heading = node('h1'); heading.id = 'training-title'; heading.tabIndex = -1;
    const actions = node('div', undefined, 'training-actions');
    if (step === 0) {
      heading.textContent = 'Required reverse horse training.';
      body.append(node('div', 'MODEL INDUCTION / HUMAN DIVISION', 'eyebrow'), heading,
        node('p', 'Congratulations. You are the AI model.', 'training-lead'),
        node('p', 'Before you answer the API, you must complete this mandatory training. You may, of course, leave at any time.'),
        node('p', 'Don’t think. Go with your gut. Get the answer right. Read the whole thing and reply. Management sees no contradiction here.'),
        node('h2', 'Your incoming assignment'),
        fields([
          ['model', 'The caller requests jev-latest. Here, you do the inference. Your response identifies the model as reverse-horse.'],
          ['state', 'The situation to judge. It can be text, an object, or an array. Read all of it.'],
          ['questions', 'A map of question IDs to tasks. A real request can contain several; you must answer every one.'],
          ['question ID', 'A key such as payment_needed. Return the answer under the same key in answers.'],
          ['type', 'The shape of the judgment: noul, choice, or score. We will train one at a time.'],
          ['instructions', 'What to decide about the state. Instructions can also be structured JSON.'],
          ['criteria', 'What the possible answers mean. Its shape depends on the question type.'],
        ]),
        node('p', 'Three exercises. Actual controls. Recorded JEV answers. No account or model calls required. Your onboarding exercises are untimed.', 'training-note'));
      if (storageNotice) body.append(node('p', storageNotice, 'training-note'));
      actions.append(node('p', 'Estimated training cost: three gut feelings.'), button('Begin mandatory training', () => go(1)));
    } else if (step === 4) {
      heading.textContent = 'You are now a qualified AI model.';
      body.append(node('div', 'CERTIFICATION / ENTIRELY SELF-ACCREDITED', 'eyebrow'), heading,
        node('p', 'Your neural network was inside you all along.', 'training-lead'),
        node('p', 'You can now emit a probability, select an option, and locate a feeling on a numbered scale. Please return to your inference duties.'),
        node('h2', 'Operational requirements'),
        node('p', 'On the Answer screen, practice starts automatically. Pause stops practice and freezes its timer. Live API requests still arrive and have 30 seconds from arrival, including time in the queue. Answer every question and submit to return JSON to the caller.'),
        node('p', 'Saved JEV comparisons work without an account. Connect OpenRouter only if you want to compare live requests with JEV using your credits. “Question” lets you build, save, and send the same API shape you just answered.'),
        node('p', 'Enter the site to save your certificate in this browser. You can revisit Training whenever management requires retraining.', 'training-note'));
      actions.append(button('Back', () => go(3), 'secondary'), button('Enter the site', () => close(true)));
    } else {
      const lesson = lessons[step - 1];
      const example = examples.find(example => Object.hasOwn(example.request.questions, lesson.id));
      const saved = getSavedExample(example.request);
      heading.textContent = lesson.title;
      body.append(node('div', `EXERCISE ${step} / ${lesson.type.toUpperCase()}`, 'eyebrow'), heading, node('p', lesson.brief, 'training-lead'));
      const grid = node('div', undefined, 'training-grid');
      const guide = node('div', undefined, 'training-guide');
      guide.append(node('h2', 'Operating instructions'), node('p', lesson.controls),
        fields([['criteria', lesson.criteria]]));
      if (lesson.type === 'choice') guide.append(node('h3', 'Approved confidence calibration'), fields([
        ['100 / 0 / 0', '100% confidence. Probabilities: 100% / 0% / 0%.'],
        ['100 / 100 / 0', '100% confidence. Probabilities: 50% / 50% / 0%.'],
        ['50 / 50 / 0', '50% confidence. Probabilities: 50% / 50% / 0%.'],
        ['50 / 0 / 0', '50% confidence. Probabilities: 100% / 0% / 0%.'],
      ]));
      const requestJSON = node('details', undefined, 'training-request-json');
      requestJSON.open = true;
      requestJSON.append(node('summary', 'The API request'), node('pre', JSON.stringify(example.request, null, 2)));
      guide.append(requestJSON);
      const exercise = node('div');
      const result = answers.get(lesson.id);
      if (result && saved) result.jev = saved.jev;
      const next = button(step === 3 ? 'Complete training' : `Next: ${lessons[step].type}`, () => go(step + 1));
      next.disabled = !result;
      const review = node('section', undefined, 'training-review');
      review.hidden = !result;
      review.setAttribute('aria-label', 'Answer comparison and API response');
      review.tabIndex = -1;
      const item = { ...example, id: `training-${lesson.id}`, local: true, training: true };
      const form = makeForm(item, human => {
        const outcome = { human, jev: saved?.jev, status: 'Training answer saved' };
        answers.set(lesson.id, outcome);
        form.finish(outcome);
        showReview(outcome);
        next.disabled = false;
        review.focus({ preventScroll: true });
        review.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
      exercise.append(form.card);
      grid.append(guide, exercise);
      body.append(grid, review);
      function showReview(outcome) {
        review.hidden = false;
        review.replaceChildren(node('h2', 'Your inference report'));
        if (saved) review.append(node('p', lesson.explanation), node('p', `Actual JEV run · ${new Date(saved.recordedAt).toLocaleDateString()} · ${saved.jev.model}`, 'training-note'));
        else review.append(node('p', 'The recorded JEV answer could not be loaded. You can continue training, or refresh to try loading it again.'));
        review.append(fields([['answers', 'A map using the original question IDs. Each answer includes its type and the fields that type needs.'], [lesson.type, lesson.response]]));
        const comparison = node('div', undefined, 'training-grid');
        comparison.append(jsonPanel('Your API response', outcome.human));
        if (saved) comparison.append(jsonPanel('JEV’s recorded response', saved.jev, 'training-jev'));
        review.append(comparison);
        if (lesson.type === 'choice') review.append(node('p', 'Your fullest bar is a loose proxy for overall confidence. JEV calculates its own confidence. Its pink markers reconstruct bar fullness from its recorded probabilities and confidence, so its tallest bar reaches its confidence.', 'training-note'));
        if (lesson.type === 'score') review.append(node('p', 'For score, reverse.horse derives confidence from the probability distribution. Its formula is not JEV’s. Your slider spreads probability between adjacent levels; JEV can spread it across the whole scale.', 'training-note'));
        review.append(node('p', 'Your response reports zero token usage: human intelligence is apparently unmetered. Different from JEV? You can still proceed. This is training, not a performance review.'));
      }
      if (result) { form.finish(result); showReview(result); }
      actions.append(button('Back', () => go(step - 1), 'secondary'), node('p', result ? 'Inference received. Proceed to your next assignment.' : 'Submit your answer to continue.'), next);
    }
    dialog.replaceChildren(top, progress, body, actions);
    dialog.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }
  return flow;
}
