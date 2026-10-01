// Adapted from TypeSafe documentation examples. Sources travel with each round.
export const examples = [
  {
    title: 'The broken integration', source: 'https://docs.typesafe.ai/introduction/quickstart',
    request: { model: 'jev-latest', state: 'Three days of trying and Stripe still will not connect. Customers cannot pay me. I need someone to fix this today.', questions: {
      department: { type: 'choice', instructions: 'Where would you route this support request?', criteria: { billing: 'Charges and plans', technical: 'Software failures and connections', sales: 'Buying or expanding service' } },
      frustration: { type: 'score', instructions: 'Rate the frustration in this message.', criteria: ['Matter-of-fact', 'Annoyed but polite', 'Furious'] },
      is_urgent: { type: 'noul', instructions: 'Does this need prompt attention according to the customer?' },
    } },
  },
  {
    title: 'A browser-specific bug', source: 'https://docs.typesafe.ai/primitives/score',
    request: { model: 'jev-latest', state: 'Exporting takes down the settings screen in Safari. Chrome exports successfully, but some customers rely entirely on Safari.', questions: {
      bug_severity: { type: 'score', instructions: 'Rate the impact of this bug.', criteria: ['Appearance only; everything works', 'Functionality fails, with an alternative available', 'Work cannot continue and there is no alternative'] },
    } },
  },
  {
    title: 'Can I talk to a person?', source: 'https://docs.typesafe.ai/primitives/noul',
    request: { model: 'jev-latest', state: 'This is my third attempt to get help. Please connect me with an actual person.', questions: {
      is_human_escalation: { type: 'noul', instructions: 'Does this person want to speak with a human?' },
      is_repeat_contact: { type: 'noul', instructions: 'Does the message indicate an earlier support attempt?', criteria: { true: 'Refers to having already tried to get help', false: 'Nothing indicates an earlier attempt' } },
    } },
  },
];
