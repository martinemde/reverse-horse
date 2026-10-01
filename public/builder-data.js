export function buildRequest({ state, stateFormat, questions }) {
  if (!state.trim()) throw new Error('Add the state you want evaluated.');
  let parsedState = state;
  if (stateFormat === 'json') {
    try { parsedState = JSON.parse(state); } catch { throw new Error('State must be valid JSON.'); }
    if (parsedState === null || !['string', 'object'].includes(typeof parsedState)) throw new Error('JSON state must be a string, object, or array.');
  }
  if (!questions.length) throw new Error('Add at least one question.');
  const ids = new Set();
  const entries = questions.map(q => {
    const id = q.id.trim();
    if (!id) throw new Error('Give every question an ID.');
    if (ids.has(id)) throw new Error(`Question ID “${id}” is used more than once.`);
    ids.add(id);
    if (!q.instructions.trim()) throw new Error(`Add instructions for “${id}”.`);
    const question = { type: q.type, instructions: q.instructions.trim() };
    if (q.type === 'choice') {
      if (!q.options.length || q.options.length > 255) throw new Error(`“${id}” needs 1–255 options.`);
      const keys = new Set();
      question.criteria = Object.fromEntries(q.options.map(option => {
        const key = option.key.trim();
        if (!key || keys.has(key)) throw new Error(`Give each option in “${id}” a unique key.`);
        keys.add(key);
        return [key, option.description.trim() || null];
      }));
    } else if (q.type === 'score') {
      if (q.levels.length < 2 || q.levels.length > 10 || q.levels.some(level => !level.trim())) throw new Error(`“${id}” needs 2–10 described levels, lowest to highest.`);
      question.criteria = q.levels.map(level => level.trim());
    } else if (q.type === 'noul') {
      const criteria = Object.fromEntries([['false', q.no], ['true', q.yes]].filter(([, value]) => value?.trim()).map(([key, value]) => [key, value.trim()]));
      if (Object.keys(criteria).length) question.criteria = criteria;
    } else throw new Error('Choose a supported question type.');
    return [id, question];
  });
  return { model: 'jev-latest', state: parsedState, questions: Object.fromEntries(entries) };
}
