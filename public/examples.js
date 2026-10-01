// Original practice scenarios inspired by the linked docs and use cases.
// Keep each round short: one or two questions. Sources travel with each round.
const emailSource = 'https://hackernoon.com/101-real-world-examples-of-how-to-use-jev';
export const examples = [
  {
    title: 'The broken integration', source: 'https://docs.typesafe.ai/introduction/quickstart',
    request: { model: 'jev-latest', state: 'Three days of trying and Stripe still will not connect. Customers cannot pay me. I need someone to fix this today.', questions: {
      department: { type: 'choice', instructions: 'Where would you route this support request?', criteria: { billing: 'Charges and plans', technical: 'Software failures and connections', sales: 'Buying or expanding service' } },
      frustration: { type: 'score', instructions: 'Rate the frustration in this message.', criteria: ['Matter-of-fact', 'Annoyed but polite', 'Furious'] },
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
  {
    title: 'An invoice without “invoice”', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: September services\nHi Alex, attached is our bill for September: $240, due October 15. Thanks for working with us!', questions: {
      category: { type: 'choice', instructions: 'Which inbox should receive this email?', criteria: { invoices: 'Bills requesting payment', general: 'Everything else' } },
    } },
  },
  {
    title: 'Already paid', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: Your payment went through\nWe received your $24 payment for this month. This receipt is for your records. No action is needed.', questions: {
      payment_needed: { type: 'noul', instructions: 'Is the sender asking you to make a payment?' },
    } },
  },
  {
    title: 'The weekly newsletter', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: This week in gardening\nThree tips for happier tomatoes, a tour of our greenhouse, and 15% off seeds this weekend. You received this because you subscribed.', questions: {
      category: { type: 'choice', instructions: 'What kind of email is this?', criteria: { newsletter: 'A recurring update for subscribers', personal: 'A message written specifically to you', receipt: 'Confirmation of a purchase' } },
      reply_needed: { type: 'noul', instructions: 'Does this email ask for a personal reply?' },
    } },
  },
  {
    title: 'A suspicious account warning', source: emailSource,
    request: { model: 'jev-latest', state: 'From: security@account-check.example\nSubject: Mailbox deletion in 20 minutes\nReply with your email password immediately to keep your account. Do not contact your IT team; they cannot stop this process.', questions: {
      suspicious: { type: 'noul', instructions: 'Does this email show signs of phishing?' },
    } },
  },
  {
    title: 'A duplicate charge', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: Charged twice\nHi, I see two $49 charges for the same order. Could you refund the extra charge? The product itself works great.', questions: {
      team: { type: 'choice', instructions: 'Which team should handle this email?', criteria: { billing: 'Payments and refunds', technical: 'Problems using the product', sales: 'Questions about buying' } },
    } },
  },
  {
    title: 'Before the meeting', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: Slides for the 2 pm meeting\nIt is 1:30 pm now. Could you send me the final slides before our client meeting at 2? I cannot present without them.', questions: {
      urgency: { type: 'score', instructions: 'How soon does this email need attention?', criteria: ['Can wait a few days', 'Needs attention today', 'Needs attention now'] },
      reply_needed: { type: 'noul', instructions: 'Is the sender asking you to send something back?' },
    } },
  },
  {
    title: 'A lukewarm thank-you', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: Re: Replacement delivered\nThanks for sending another one. It works, although waiting three weeks was frustrating. I suppose we can close this now.', questions: {
      tone: { type: 'score', instructions: 'How positive is the sender about the overall experience?', criteria: ['Negative', 'Mixed or neutral', 'Positive'] },
    } },
  },
  {
    title: 'Just keeping you posted', source: emailSource,
    request: { model: 'jev-latest', state: 'Subject: Friday delivery\nQuick update: your replacement keyboard will arrive Friday instead of Thursday. The tracking link will update tonight. No need to reply unless Friday is a problem.', questions: {
      intent: { type: 'choice', instructions: 'What is the main purpose of this email?', criteria: { update: 'Share information', request: 'Ask you to do something', promotion: 'Encourage a purchase' } },
      reply_needed: { type: 'noul', instructions: 'Assuming Friday works for you, does this email require a reply?' },
    } },
  },
];
