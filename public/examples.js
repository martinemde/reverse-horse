// Original practice scenarios inspired by the linked docs and use cases.
// Each exported practice round asks exactly one question. Sources travel with it.
const grailSource = 'https://en.wikipedia.org/wiki/Monty_Python_and_the_Holy_Grail';
const grailDialogue = 'https://en.wikiquote.org/wiki/Monty_Python_and_the_Holy_Grail';
const emailSource = 'https://hackernoon.com/101-real-world-examples-of-how-to-use-jev';
// Minimal pairs: each etiquette question is shared verbatim by several emails that differ
// by one small detail, so the same ruling should land on opposite sides of the policy.
const etiquetteSource = 'https://en.wikipedia.org/wiki/Etiquette_in_technology';
const etiquette = {
  exclamation_act: { type: 'noul', instructions: 'Does this email violate the Exclamation Point Act: no more than one "!" per email, unless something is actually on fire?', criteria: { true: 'More than one "!" and nothing is on fire', false: 'One "!" or fewer, or a genuine emergency' } },
  quick_question: { type: 'noul', instructions: 'Does this email violate the ban on "quick question": an email may only open with "quick question" if it can be answered in one word?', criteria: { true: 'Opens with "quick question" but needs more than a one-word answer', false: 'The question can honestly be answered in one word' } },
  reply_all: { type: 'noul', instructions: 'Does the Reply-All Tribunal permit this reply-all? Reply-all is allowed only if every recipient needs to read the reply.', criteria: { true: 'Every recipient needs to read it', false: 'Some recipients did not need this' } },
  oxford_comma: { type: 'noul', instructions: 'Under the Mandatory Oxford Comma rule, should this email be returned to sender?', criteria: { true: 'A list is missing its Oxford comma', false: 'Every list is properly punctuated' } },
  thanks_in_advance: { type: 'noul', instructions: 'Under the Thanks-in-Advance Prohibition, is this email rude for presuming compliance?', criteria: { true: 'Thanks the recipient for something they have not agreed to do', false: 'Does not presume the recipient will comply' } },
  sign_off: { type: 'choice', instructions: 'What is this sign-off really saying?', criteria: { warm: 'Friendly and glad to be talking', neutral: 'Just closing the email', cold: 'Keeping you at arm’s length', hostile: 'Quietly furious' } },
  email_crime: { type: 'choice', instructions: 'Which crime is this?', criteria: { passive_aggression: 'Politeness used as a weapon', humblebrag: 'A boast disguised as a complaint or aside', guilt_trip: 'Makes you feel bad for the sender’s effort', innocent: 'No crime committed' } },
  meeting_want: { type: 'choice', instructions: 'What does this meeting invite actually want?', criteria: { decision: 'Someone needs to decide something', information: 'Someone needs to tell people something', status_theater: 'Looking busy and aligned', loneliness: 'The organizer wants company' } },
  out_of_office: { type: 'choice', instructions: 'Which genre of out-of-office is this?', criteria: { professional: 'Dates and a contact, nothing more', smug: 'Wants you to know how great their time off is', too_much_information: 'Shares details nobody asked for', cry_for_help: 'The sender is not okay' } },
  emoji_fit: { type: 'score', instructions: 'How appropriate is this emoji in a work email?', criteria: ['Call HR', 'Inappropriate', 'Questionable', 'Fine', 'Perfectly appropriate'] },
  passive_aggression: { type: 'score', instructions: 'Rate the passive aggression in this email.', criteria: ['Sincere', 'Breezy', 'Polite nudge', 'Mild impatience', 'Pointed', 'Clearly annoyed', 'Barely contained', 'Weaponized politeness', 'Open hostility', 'Scorched earth'] },
  lowercase_energy: { type: 'score', instructions: 'Rate the energy of this lowercase reply.', criteria: ['Sloppy', 'Casual', 'Neutral', 'Confident', 'Ominous'] },
  newsletter_spam: { type: 'score', instructions: 'How spammy is this newsletter you technically signed up for?', criteria: ['Eagerly awaited', 'Welcome', 'Fine', 'Tolerable', 'Skimmed at best', 'Ignored', 'Annoying', 'Unsubscribe-worthy', 'Basically spam', 'Pure spam'] },
  hope_sincerity: { type: 'score', instructions: 'How sincere is "Hope this finds you well" in this email?', criteria: ['Pure boilerplate', 'Mostly filler', 'Neutral', 'Somewhat sincere', 'Genuinely sincere'] },
  pray_emoji: { type: 'choice', instructions: 'What does the 🙏 mean here?', criteria: { please: 'Asking for something', thank_you: 'Thanking for something' } },
  iphone_signature: { type: 'choice', instructions: 'Is "Sent from my iPhone" honest or lazy here?', criteria: { honest: 'Fairly explains a short or typo-prone reply', lazy: 'Nobody bothered to delete the default' } },
};
const ask = (title, id, state) => ({ title, source: etiquetteSource, request: { model: 'jev-latest', state, questions: { [id]: etiquette[id] } } });
const signOffBody = 'Subject: Re: Updated timeline\nGot it. I will send the revised draft by Thursday.\n\n';
const emojiBody = 'Subject: PR review\nCan you review my pull request before lunch? ';
const contractBody = '\nThe signed contract is still needed by Friday.';
const etiquetteScenarios = [
  ask('Exclamation Act · cake at 3', 'exclamation_act', 'Subject: Launch!\nThanks! Great work on the launch! Cake in the kitchen at 3!'),
  ask('Exclamation Act · one cake', 'exclamation_act', 'Subject: Launch\nThanks, and great work on the launch. Cake in the kitchen at 3!'),
  ask('Exclamation Act · actual smoke', 'exclamation_act', 'Subject: Server room\nThe server room is filling with smoke! Everyone out now! Do not take the elevator!'),
  ask('Exclamation Act · mild warmth', 'exclamation_act', 'Subject: Server room\nThe server room is a little warm today! Facilities is on it! No action needed!'),
  ask('Quick question · Postgres', 'quick_question', 'Subject: Quick question\nQuick question: are we still using Postgres?'),
  ask('Quick question · the 3 pm review', 'quick_question', 'Subject: Quick question\nQuick question: is the 3 pm review still on?'),
  ask('Quick question · migration plan', 'quick_question', 'Subject: Quick question\nQuick question: how should we migrate off Postgres, and who should own it?'),
  ask('Quick question · Postgres, sort of', 'quick_question', 'Subject: Quick question\nQuick question: are we still using Postgres? The onboarding doc says MongoDB, billing says Postgres, and the CTO said "both, sort of" last week.'),
  ask('Reply-All Tribunal · 200 congrats', 'reply_all', 'To: all-staff (200 recipients)\nSubject: Re: Please welcome Dana as VP of Engineering\nCongrats!!'),
  ask('Reply-All Tribunal · 3 congrats', 'reply_all', 'To: Dana, Sam, Lee (3 recipients)\nSubject: Re: Please welcome Dana as VP of Engineering\nCongrats!!'),
  ask('Reply-All Tribunal · wrong time', 'reply_all', 'To: all-staff (200 recipients)\nSubject: Re: Office closed Friday\nCorrection: the office reopens Monday at 9, not 10 as stated above.'),
  ask('Reply-All Tribunal · me too', 'reply_all', 'To: all-staff (200 recipients)\nSubject: Re: Office closed Friday\nThanks, enjoy the long weekend everyone!'),
  ask('Oxford comma · the interns', 'oxford_comma', 'Subject: Offsite\nAttendees: the interns, Dave and Priya.'),
  ask('Oxford comma · the interns, comma', 'oxford_comma', 'Subject: Offsite\nAttendees: the interns, Dave, and Priya.'),
  ask('Oxford comma · just two', 'oxford_comma', 'Subject: Offsite\nAttendees: Dave and Priya.'),
  ask('Oxford comma · both interns', 'oxford_comma', 'Subject: Offsite\nAttendees: the interns, Dave and Priya (both of whom are interns).'),
  ask('Thanks in advance · TIA to a report', 'thanks_in_advance', 'To: Jordan (your direct report)\nSubject: Q3 numbers\nCan you send the Q3 numbers by Friday? TIA!'),
  ask('Thanks in advance · thanks to a report', 'thanks_in_advance', 'To: Jordan (your direct report)\nSubject: Q3 numbers\nCan you send the Q3 numbers by Friday? Thanks!'),
  ask('Thanks in advance · up the chain', 'thanks_in_advance', 'To: Morgan (the CFO)\nSubject: Q3 budget\nCould you approve my Q3 budget by Friday? Thanks in advance!'),
  ask('Thanks in advance · either way', 'thanks_in_advance', 'To: Jordan (your direct report)\nSubject: Q3 draft\nNo pressure, and feel free to say no: could you skim my Q3 draft if you have time? Thanks in advance either way!'),
  ask('Sign-off · Best', 'sign_off', `${signOffBody}Best,\nSam`),
  ask('Sign-off · Thanks', 'sign_off', `${signOffBody}Thanks,\nSam`),
  ask('Sign-off · Regards', 'sign_off', `${signOffBody}Regards,\nSam`),
  ask('Sign-off · Cheers', 'sign_off', `${signOffBody}Cheers,\nSam`),
  ask('Sign-off · iPhone', 'sign_off', `${signOffBody}Sent from my iPhone`),
  ask('Sign-off · nothing', 'sign_off', signOffBody.trimEnd()),
  ask('Which crime · per my last email', 'email_crime', 'Subject: Re: Re: Deadline\nPer my last email (attached again for convenience), the deadline is Friday.'),
  ask('Which crime · probably buried', 'email_crime', 'Subject: Re: Re: Deadline\nAttaching this again in case it got buried. The deadline is Friday.'),
  ask('Which crime · after the keynote', 'email_crime', 'Subject: Re: Re: Deadline\nAttaching this again. I finished it on the flight home from my keynote, so excuse any typos. The deadline is Friday.'),
  ask('Which crime · until midnight', 'email_crime', 'Subject: Re: Re: Deadline\nAttaching this again. I stayed until midnight finishing it, but no worries if you have not had a chance to look. The deadline is Friday.'),
  ask('Meeting invite · Sync', 'meeting_want', 'Invite: Sync\nRecurring weekly · 30 minutes · 11 attendees\nNo agenda.'),
  ask('Meeting invite · pick a date', 'meeting_want', 'Invite: Sync\nOne time · 30 minutes · 3 attendees\nAgenda: choose October 14 or October 21 for launch.'),
  ask('Meeting invite · Q3 numbers', 'meeting_want', 'Invite: Sync\nOne time · 30 minutes · 40 attendees · cameras optional\nAgenda: finance walks through Q3 results.'),
  ask('Meeting invite · just us', 'meeting_want', 'Invite: Sync\nRecurring weekly · 30 minutes · 2 attendees\nNo agenda. Notes: "just to chat :)"'),
  ask('Out of office · Patagonia', 'out_of_office', 'Subject: Automatic reply\nI’m off grid in Patagonia until the 14th. If urgent, contact Steve. If very urgent, also contact Steve.'),
  ask('Out of office · limited access', 'out_of_office', 'Subject: Automatic reply\nI’m out of the office until the 14th with limited access to email. If urgent, contact Steve.'),
  ask('Out of office · applesauce', 'out_of_office', 'Subject: Automatic reply\nI’m out until the 14th recovering from having my wisdom teeth out. I can only eat applesauce. If urgent, contact Steve.'),
  ask('Out of office · will probably check', 'out_of_office', 'Subject: Automatic reply\nI’m out until the 14th. I may check email. I will probably check email. Please do not make me check email. If urgent, contact Steve.'),
  ask('Emoji · folded hands', 'emoji_fit', `${emojiBody}🙏`),
  ask('Emoji · melting face', 'emoji_fit', `${emojiBody}🫠`),
  ask('Emoji · skull', 'emoji_fit', `${emojiBody}💀`),
  ask('Emoji · eggplant', 'emoji_fit', `${emojiBody}🍆`),
  ask('Passive aggression · following up', 'passive_aggression', `Subject: Re: Contract review\nJust following up!${contractBody}`),
  ask('Passive aggression · circling back', 'passive_aggression', `Subject: Re: Contract review\nJust circling back on this.${contractBody}`),
  ask('Passive aggression · bumping', 'passive_aggression', `Subject: Re: Contract review\nBumping this to the top of your inbox.${contractBody}`),
  ask('Passive aggression · last three emails', 'passive_aggression', `Subject: Re: Contract review\nPer my last three emails:${contractBody}`),
  ask('Passive aggression · your manager', 'passive_aggression', `Subject: Re: Contract review\nLooping in your manager for visibility.${contractBody}`),
  ask('Lowercase · the CEO', 'lowercase_energy', 'From: Priya Shah, CEO\nSubject: Re: My four-page proposal to rework onboarding\nsounds good'),
  ask('Lowercase · the intern', 'lowercase_energy', 'From: Priya Shah, summer intern\nSubject: Re: My four-page proposal to rework onboarding\nsounds good'),
  ask('Lowercase · CEO lunch', 'lowercase_energy', 'From: Priya Shah, CEO\nSubject: Re: Lunch at noon?\nsounds good'),
  ask('Newsletter · the 2019 conference', 'newsletter_spam', 'From: DevSummit 2019\nSubject: This week at DevSummit\nYou are receiving this weekly update because you registered for DevSummit 2019.'),
  ask('Newsletter · the annual reminder', 'newsletter_spam', 'From: DevSummit\nSubject: DevSummit 2027 registration is open\nYou are receiving this once a year because you registered for DevSummit 2019.'),
  ask('Newsletter · last week’s signup', 'newsletter_spam', 'From: DevSummit\nSubject: This week at DevSummit\nYou are receiving this weekly update because you subscribed last Tuesday.'),
  ask('Newsletter · last chance, again', 'newsletter_spam', 'From: DevSummit 2019\nSubject: LAST CHANCE: 40% off ends tonight\nYou are receiving this daily update because you registered for DevSummit 2019.'),
  ask('Hope this finds you well · invoice', 'hope_sincerity', 'Subject: Invoice #4471\nHope this finds you well. I’m writing about your overdue invoice.'),
  ask('Hope this finds you well · surgery', 'hope_sincerity', 'Subject: Checking in\nHope this finds you well. I heard about your surgery and wanted to see how recovery is going.'),
  ask('Hope this finds you well · agenda', 'hope_sincerity', 'Subject: Tuesday\nHope this finds you well. Attached is the agenda for Tuesday.'),
  ask('Hope this finds you well · Lisbon', 'hope_sincerity', 'Subject: Long time\nHope this finds you well. It has been three years since Lisbon, and I still think about your talk.'),
  ask('Folded hands · cover my shift', 'pray_emoji', 'Subject: Saturday\nAny chance you could cover my shift Saturday? 🙏'),
  ask('Folded hands · you covered', 'pray_emoji', 'Subject: Saturday\nThanks for covering my shift Saturday 🙏'),
  ask('Folded hands · just Saturday', 'pray_emoji', 'Subject: Saturday\nSaturday 🙏'),
  ask('iPhone · tomorrow', 'iphone_signature', 'Subject: Re: Budget\nok will do tmrw\n\nSent from my iPhone'),
  ask('iPhone · five paragraphs', 'iphone_signature', 'Subject: Re: Budget\nThanks for the detailed breakdown. I have gone through each line item and have notes in three areas: headcount, tooling, and travel. On headcount, I think we should phase the two hires across Q1 and Q2 rather than front-loading them. On tooling, the observability contract renews in March and we should renegotiate before then. On travel, I would cap offsites at two per year. Happy to walk through any of this live.\n\nSent from my iPhone'),
];
const pokemonSource = 'https://bulbapedia.bulbagarden.net/wiki/Gym';
const starter = { type: 'choice', instructions: 'Which starter Pokémon is best to face off against this gym?', criteria: { Bulbasaur: null, Charmander: null, Squirtle: null } };
const pokemonGym = (leader, place) => ({
  title: `${leader}'s gym · Pokémon`, source: pokemonSource,
  request: { model: 'jev-latest', state: `You are about to enter the ${place} gym to face ${leader}.`, questions: { starter } },
});
// Credit card statements: price questions offer every amount in the email, date questions
// offer every date in the email, so the distractors come from the email itself.
const options = labels => Object.fromEntries(labels.map(label => [label, null]));
const cardStatement = (title, state, prices, dates) => ({
  title, source: emailSource,
  request: { model: 'jev-latest', state, questions: {
    statement_amount: { type: 'choice', instructions: 'What is the statement amount?', criteria: options([...prices, 'Unknown']) },
    due_date: { type: 'choice', instructions: 'What is the payment due date?', criteria: options([...dates, 'Unknown', 'Not specified']) },
    minimum_payment: { type: 'choice', instructions: 'What is the minimum payment amount?', criteria: options([...prices, 'Unknown']) },
  } },
});
const cardStatements = [
  cardStatement('Card statement · everything listed', 'From: Northwind Card\nSubject: Your September statement is ready\nStatement date: September 28, 2026\nStatement balance: $1,248.30\nMinimum payment: $35.00\nPayment due: October 25, 2026', ['$35.00', '$1,248.30'], ['September 28, 2026', 'October 25, 2026']),
  cardStatement('Card statement · no minimum shown', 'From: Northwind Card\nSubject: Your September statement is ready\nStatement date: September 28, 2026\nStatement balance: $1,248.30\nPayment due: October 25, 2026\nLog in to see your minimum payment.', ['$1,248.30'], ['September 28, 2026', 'October 25, 2026']),
  cardStatement('Card statement · no due date', 'From: Northwind Card\nSubject: Your September statement is ready\nStatement date: September 28, 2026\nStatement balance: $1,248.30\nMinimum payment: $35.00\nPay by the due date shown in your account to avoid a late fee.', ['$35.00', '$1,248.30'], ['September 28, 2026']),
  cardStatement('Card statement · autopay', 'From: Northwind Card\nSubject: Your September statement is ready\nStatement date: September 28, 2026\nStatement balance: $1,248.30\nAutopay will draft your minimum payment of $35.00 on October 25, 2026. No action is needed.', ['$35.00', '$1,248.30'], ['September 28, 2026', 'October 25, 2026']),
  cardStatement('Card statement · busy summary', 'From: Harbor Rewards Card\nSubject: Statement summary\nClosing date: September 20, 2026\nPrevious balance: $640.00\nPayments: -$640.00\nPurchases: $1,290.00\nInterest charged: $22.45\nNew balance: $1,312.45\nMinimum payment due: $40.00\nDue date: October 17, 2026\nCredit limit: $5,000.00', ['$22.45', '$40.00', '$640.00', '$1,290.00', '$1,312.45', '$5,000.00'], ['September 20, 2026', 'October 17, 2026']),
  cardStatement('Card statement · small balance', 'From: Harbor Rewards Card\nSubject: Statement summary\nClosing date: September 20, 2026\nNew balance: $18.75\nMinimum payment due: $18.75\nDue date: October 17, 2026', ['$18.75'], ['September 20, 2026', 'October 17, 2026']),
  cardStatement('Card statement · nothing owed', 'From: Harbor Rewards Card\nSubject: Statement summary\nClosing date: September 20, 2026\nNew balance: $0.00\nMinimum payment due: $0.00\nNo payment is due this month.', ['$0.00'], ['September 20, 2026']),
  cardStatement('Card statement · written out', 'From: Cedar Bank Visa\nSubject: Your statement\nHi Alex, your Visa statement dated 10/01/2026 shows a balance of $486.20. Pay at least $25.00 by 10/26/2026 to keep your account in good standing.', ['$25.00', '$486.20'], ['10/01/2026', '10/26/2026']),
];
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
  ...etiquetteScenarios,
  ...cardStatements,
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
  pokemonGym('Brock', 'Pewter City'),
  pokemonGym('Misty', 'Cerulean City'),
  pokemonGym('Lt. Surge', 'Vermilion City'),
  pokemonGym('Erika', 'Celadon City'),
  pokemonGym('Koga', 'Fuchsia City'),
  pokemonGym('Sabrina', 'Saffron City'),
  pokemonGym('Blaine', 'Cinnabar Island'),
  pokemonGym('Giovanni', 'Viridian City'),
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
    title: 'The Black Knight · Holy Grail', source: grailDialogue,
    request: { model: 'jev-latest', state: 'King Arthur has bested the Black Knight. Both of the Black Knight’s arms have been cut off.', questions: {
      flesh_wound: { type: 'noul', instructions: 'Is this but a flesh wound?' },
    } },
  },
  {
    title: 'A shrubbery', source: grailSource,
    request: { model: 'jev-latest', state: 'Arthur brings the knights who say Nee the shrubbery they asked for. They immediately demand another one.', questions: {
      satisfied: { type: 'noul', instructions: 'Are the knights satisfied with what Arthur brought?' },
    } },
  },
  {
    title: 'The killer rabbit', source: grailSource,
    request: { model: 'jev-latest', state: 'A cute white rabbit guards a cave. It has just attacked and killed several armed knights.', questions: {
      risk: { type: 'score', instructions: 'How dangerous is this rabbit?', criteria: ['Harmless', 'Dangerous', 'Deadly'] },
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
