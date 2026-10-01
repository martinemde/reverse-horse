// Original practice scenarios inspired by the linked docs and use cases.
// Keep each round short: one or two questions. Sources travel with each round.
const grailSource = 'https://en.wikipedia.org/wiki/Monty_Python_and_the_Holy_Grail';
const grailDialogue = 'https://en.wikiquote.org/wiki/Monty_Python_and_the_Holy_Grail';
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
  // Imagined messages built around the linked games' lore, not in-game quotations.
  {
    title: 'Fargoth opens a bank · Morrowind', source: 'https://elderscrolls.fandom.com/wiki/Fargoth%27s_Hiding_Place',
    request: { model: 'jev-latest', state: 'Imagined note from Fargoth: My savings are secure in a hollow stump in the Seyda Neen pond. I only visit after dark. The lighthouse has an excellent view, but surely nobody would stand up there for several hours watching one elf.', questions: {
      security: { type: 'score', instructions: 'How secure is this hiding place against a patient observer?', criteria: ['Easy to discover', 'Somewhat concealed', 'Very well protected'] },
    } },
  },
  {
    title: 'Morte requests professional development · Planescape', source: 'https://torment.fandom.com/wiki/Litany_of_Curses',
    request: { model: 'jev-latest', state: 'Morte is a floating skull whose Litany of Curses taunts enemies into attacking recklessly. Imagined expense claim: Three hours listening to a furious tavern keeper invent new insults. Please reimburse as combat training. I took mental notes. No hands.', questions: {
      relevant: { type: 'noul', instructions: 'Could learning new insults plausibly improve Morte’s combat ability?' },
      category: { type: 'choice', instructions: 'Which expense category best fits the stated purpose?', criteria: { training: 'Developing a combat skill', equipment: 'Buying physical gear', medical: 'Treating an injury' } },
    } },
  },
  {
    title: 'Gale revises the lunch budget · Baldur’s Gate 3', source: 'https://bg3.wiki/wiki/Gale',
    request: { model: 'jev-latest', state: 'Gale needs to absorb magic from enchanted items to stabilize the orb in his chest. Imagined camp note: The soup was lovely. Unfortunately, it has not addressed the potentially catastrophic magical condition. Might I trouble you for that enchanted necklace?', questions: {
      need: { type: 'choice', instructions: 'What does Gale primarily need?', criteria: { magic: 'A magical item to absorb', food: 'An ordinary meal', fashion: 'A nicer outfit' } },
    } },
  },
  {
    title: 'Legion fills out the repair form · Mass Effect 2', source: 'https://www.reddit.com/r/masseffect/comments/xgp91y/legion_on_the_n7_armor_piece/',
    request: { model: 'jev-latest', state: 'Legion patched its damaged body with a piece of Shepard’s N7 armor. Imagined maintenance form: Reason for patch: hole. Reason for choosing Shepard’s armor instead of another suitable plate: [long processing pause]. Form remains incomplete.', questions: {
      complete: { type: 'noul', instructions: 'Has Legion explained why it chose that particular piece of armor?' },
    } },
  },
  {
    title: 'HK-47 joins customer success · Knights of the Old Republic', source: 'https://en.wikipedia.org/wiki/HK-47',
    request: { model: 'jev-latest', state: 'HK-47 is an assassin droid who calls organic beings meatbags. Imagined service proposal: Customer complaints will fall to zero once there are no surviving customers. Requesting approval to classify this as a retention initiative.', questions: {
      aligned: { type: 'noul', instructions: 'Does this proposal support the goal of keeping customers alive and satisfied?' },
      tone: { type: 'choice', instructions: 'How should the proposal be classified?', criteria: { helpful: 'A reasonable service improvement', dangerous: 'A harmful plan disguised as help', irrelevant: 'An unrelated status update' } },
    } },
  },
  {
    title: 'Quina submits the frog receipts · Final Fantasy IX', source: 'https://finalfantasy.fandom.com/wiki/Frog_catching',
    request: { model: 'jev-latest', state: 'Catching frogs increases the power of Quina’s Frog Drop attack. Imagined travel claim: Spent the afternoon in a marsh collecting frogs. Zidane says this was a lunch break. Quina has submitted damage numbers and would like the afternoon counted as training.', questions: {
      training: { type: 'noul', instructions: 'Does the stated game mechanic support counting frog catching as combat training?' },
    } },
  },
  {
    title: 'Dusa needs a day off · Hades', source: 'https://hades.fandom.com/wiki/Dusa',
    request: { model: 'jev-latest', state: 'Dusa is a floating gorgon head working as a maid in the House of Hades. Imagined staff message: Sorry! I can clean the lounge again tonight! And the hall! I have not rested, but everyone else has so much on their shoulders. Metaphorically. I remember shoulders.', questions: {
      workload: { type: 'score', instructions: 'How sustainable does Dusa’s workload sound?', criteria: ['Needs rest urgently', 'Could use a lighter schedule', 'Comfortably manageable'] },
    } },
  },
  {
    title: 'Cave Johnson escalates to produce · Portal 2', source: 'https://www.youtube.com/watch?v=SAxVfEyXnqo',
    request: { model: 'jev-latest', state: 'Cave Johnson wants Aperture’s engineers to invent combustible lemons. Imagined purchase order: Twelve crates of citrus. Charge this to research, not catering. The objective is retaliation against the concept of adversity. No lemonade will be served.', questions: {
      department: { type: 'choice', instructions: 'Which department is this order intended for?', criteria: { research: 'Experimental engineering', catering: 'Food and drinks', cleaning: 'Routine maintenance' } },
      calm: { type: 'score', instructions: 'How calmly is the sender handling a setback?', criteria: ['Spectacularly badly', 'Somewhat frustrated', 'Calm and constructive'] },
    } },
  },
  // Original comic scenarios inspired by Holy Grail scenes, not script excerpts.
  {
    title: 'The Black Knight files an incident report · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'Imagined incident report: The Black Knight has lost both arms but insists the duel is going splendidly. He has marked the injury form “cosmetic” with a pen held in his teeth.', questions: {
      severity: { type: 'score', instructions: 'Rate the actual injury, ignoring his self-assessment.', criteria: ['Cosmetic', 'Serious', 'Critical'] },
      reliable: { type: 'noul', instructions: 'Is his assessment of the injury reliable?' },
    } },
  },
  {
    title: 'The bridgekeeper forgot a field · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'Imagined bridge inspection: The keeper demands a swallow’s flight speed but leaves the species unspecified. Arthur requests clarification. The bridge has no help desk, only a gorge.', questions: {
      next_step: { type: 'choice', instructions: 'What is the most defensible response to the incomplete question?', criteria: { clarify: 'Ask which species', guess: 'Invent a precise number', refuse: 'Declare that birds cannot fly' } },
    } },
  },
  {
    title: 'Shrubbery scope creep · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'Imagined project update: Arthur delivers the requested shrubbery. The forest knights immediately add another shrubbery and a landscaping requirement. Procurement suspects acceptance criteria are being invented during delivery.', questions: {
      scope_creep: { type: 'noul', instructions: 'Have the requirements expanded after the original work was delivered?' },
    } },
  },
  {
    title: 'The rabbit risk register · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'Imagined risk register: A small rabbit guards the cave. Initial rating: adorable. Revised evidence: it has killed several armed knights. The team would like to keep the original rating because the ears remain very nice.', questions: {
      risk: { type: 'score', instructions: 'Rate the danger based on observed behavior.', criteria: ['Harmless', 'Potentially dangerous', 'Immediately lethal'] },
    } },
  },
  {
    title: 'Trojan Rabbit deployment review · Holy Grail', source: grailSource,
    request: { model: 'jev-latest', state: 'Imagined deployment report: The enemy accepted our enormous wooden rabbit. Excellent craftsmanship. Unfortunately, the entire infiltration team is still outside admiring it. Nobody got inside before delivery.', questions: {
      ready: { type: 'noul', instructions: 'Can the planned hidden team now emerge from inside the rabbit?' },
      failure: { type: 'choice', instructions: 'What was the main operational failure?', criteria: { staffing: 'The infiltrators never boarded', construction: 'The rabbit was too small', delivery: 'The enemy refused the rabbit' } },
    } },
  },
  {
    title: 'Brother Maynard reviews the counter · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'Imagined ceremonial checklist: The Holy Hand Grenade procedure specifies a count of three. Arthur’s proposed sequence is one, two, five. Brother Maynard has opened a defect ticket.', questions: {
      compliant: { type: 'noul', instructions: 'Does Arthur’s proposed count follow the stated procedure?' },
    } },
  },
];
