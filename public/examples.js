// Original practice scenarios inspired by the linked docs and use cases.
// Each exported practice round asks exactly one question. Sources travel with it.
const grailSource = 'https://en.wikipedia.org/wiki/Monty_Python_and_the_Holy_Grail';
const grailDialogue = 'https://en.wikiquote.org/wiki/Monty_Python_and_the_Holy_Grail';
const emailSource = 'https://hackernoon.com/101-real-world-examples-of-how-to-use-jev';
const scenarios = [
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
  {
    title: 'Another castle · Mario', source: 'https://mario.nintendo.com/',
    request: { model: 'jev-latest', state: 'Mario reaches the end of the castle. Toad tells him the princess is somewhere else.', questions: {
      another_castle: { type: 'noul', instructions: 'Is the princess in another castle?' },
    } },
  },
  {
    title: 'Mind the gap · Mario', source: 'https://mario.nintendo.com/',
    request: { model: 'jev-latest', state: 'Mario is running toward a pit. The next platform is close enough to jump to.', questions: {
      next_move: { type: 'choice', instructions: 'What should Mario do to cross safely?', criteria: { Jump: null, 'Keep running': null, 'Stand still': null } },
    } },
  },
  {
    title: 'One heart left · Zelda', source: 'https://www.zelda.com/breath-of-the-wild/features/',
    request: { model: 'jev-latest', state: 'Link has one heart left. Another hit could defeat him. He has food that restores health.', questions: {
      healing: { type: 'score', instructions: 'How urgently should Link heal?', criteria: ['No hurry', 'Soon', 'Right now'] },
    } },
  },
  {
    title: 'Pick an attack · Pokémon', source: 'https://diamondpearl.pokemon.com/en-us/trainersguide/fundamentals/battling/',
    request: { model: 'jev-latest', state: 'The opponent is weak to water. Your Pokémon can use either Water Gun or a weaker normal attack.', questions: {
      attack: { type: 'choice', instructions: 'Which attack takes advantage of the weakness?', criteria: { 'Water Gun': null, 'Normal attack': null } },
    } },
  },
  {
    title: 'That hissing sound · Minecraft', source: 'https://www.minecraft.net/en-us/article/minecraft-mobs',
    request: { model: 'jev-latest', state: 'A creeper beside you is hissing and about to explode. There is open space behind you.', questions: {
      retreat: { type: 'noul', instructions: 'Should you move away from the creeper?' },
    } },
  },
  {
    title: 'The ghosts turned blue · Pac-Man', source: 'https://en.wikipedia.org/wiki/Pac-Man',
    request: { model: 'jev-latest', state: 'Pac-Man just ate a power pellet. The ghosts are blue and can briefly be eaten for bonus points.', questions: {
      chase: { type: 'noul', instructions: 'Can Pac-Man safely chase a nearby blue ghost right now?' },
    } },
  },
  {
    title: 'Favorite color · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'You are Sir Lancelot at the Bridge of Death. Answer as he does in Monty Python and the Holy Grail.', questions: {
      color: { type: 'choice', instructions: 'What is your favorite color?', criteria: { blue: 'Blue', yellow: 'Yellow', red: 'Red' } },
    } },
  },
  {
    title: 'Airspeed of a swallow · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'You are King Arthur at the Bridge of Death. Give his response from Monty Python and the Holy Grail.', questions: {
      swallow: { type: 'choice', instructions: 'What is the airspeed velocity of an unladen swallow?', criteria: { species: 'African or European?', speed: '24 miles per hour', impossible: 'Swallows cannot fly' } },
    } },
  },
  {
    title: 'The Black Knight · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'The Black Knight has lost both arms but insists he can keep fighting.', questions: {
      severity: { type: 'score', instructions: 'How serious are his injuries?', criteria: ['Minor', 'Serious', 'Critical'] },
      reliable: { type: 'noul', instructions: 'Is he being realistic about his condition?' },
    } },
  },
  {
    title: 'A shrubbery · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'Arthur brings the knights the shrubbery they asked for. They immediately demand another one.', questions: {
      satisfied: { type: 'noul', instructions: 'Are the knights satisfied with what Arthur brought?' },
    } },
  },
  {
    title: 'The killer rabbit · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'A cute white rabbit guards a cave. It has just attacked and killed several armed knights.', questions: {
      risk: { type: 'score', instructions: 'How dangerous is this rabbit?', criteria: ['Harmless', 'Dangerous', 'Deadly'] },
    } },
  },
  {
    title: 'The wooden rabbit · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'The knights send a giant wooden rabbit into the enemy castle. They forgot to hide inside it.', questions: {
      ready: { type: 'noul', instructions: 'Can any knights now sneak out of the rabbit?' },
      failure: { type: 'choice', instructions: 'What went wrong?', criteria: { empty: 'Nobody climbed inside', small: 'The rabbit was too small', refused: 'The castle refused delivery' } },
    } },
  },
  {
    title: 'The Holy Hand Grenade · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'Arthur must count to three. He counts one, two, five.', questions: {
      compliant: { type: 'noul', instructions: 'Did Arthur count correctly?' },
    } },
  },
];

// Keep the shared situation, but deal each judgment as its own independent round.
export const examples = scenarios.flatMap(example =>
  Object.entries(example.request.questions).map(([id, question]) => ({
    ...example,
    request: { ...example.request, questions: { [id]: question } },
  }))
);
