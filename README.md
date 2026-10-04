# [reverse.horse](https://reverse.horse)

## What is this?

Reverse.horse is something between a tutorial and an art project.

It is a functioning API that matches the [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) `/v1/systemone` format. It presents the questions asked on the API to anyone that is connected, and their results become the answer to the API.

It’s also a tutorial intended to help you understand exactly what Jev is and what the [3 question types](https://reverse.horse/help#types) do. By using your human brain to answer in place of the model, you get an intuitive sense of what Jev is doing.

It becomes immediately apparent that you suck at this. Jev can usually answer in under 1/10th of a second, and it can do thousands of questions like this in the time it takes you to answer a single one. You may even notice that for every answer that you carefully answer correctly, Jev is within a few points of what you answered. Remarkable, isn’t it?

## Why “Reverse Horse”?

The name comes from Cory Doctorow’s [reverse centaur](https://pluralistic.net/2022/04/17/revenge-of-the-chickenized-reverse-centaurs/), a situation created by AI that places the human in the position of being a meat body that does what the AI tells it. Instead of a good centaur, a human brain controlling a powerful horse body, you have the opposite: an “unthinking” horse brain controlling the feeble human body.

The irony here is that I’ve inverted it. By using your feeble human brain to answer as the “unthinking” AI, I’m pointing out just how slow you are at it, and how impressively fast an accurate Jev is. When I started the project, the example questions were actually too complex to answer within a reasonable timeout, so I had to break them down.

## Why Jev?

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is based on the idea that if we make “good enough” intelligence *cheap* and *fast*, it will explode in usefulness, expanding the use of intelligence into more places than we ever thought practical. It’s a different direction than most LLMs have taken. ChatGPT and Claude try to be ever bigger and smarter to take over for your brain, while Jev asks only for ever-more-decomposed questions.

The API route `systemone` and the name show its two influences. System One comes from Daniel Kahneman’s [*Thinking, Fast and Slow*](https://en.wikipedia.org/wiki/Thinking,_Fast_and_Slow), which defines it as quick, gut-reaction thinking. System Two is what almost all modern LLMs are doing: *Reasoning…*

## Why the 30 second timeout?

It’s kind of stressful, right? It’s there for 2 reasons:

1. I’m trying to make you give your gut reaction to the question. The timer makes it clear just how slow we are at this. 30 seconds is 300 times longer than Jev usually takes to respond.
2. This is a real, if impractical, API. You can actually [send a request to it](https://reverse.horse/request) with curl. 30 seconds seemed like the longest reasonable timeout for a held-open request. I’m waiting for the moment when this 30 second timeout causes the poor server to get overloaded.

## How does it work?

In theory, everyone answering questions is connected to a websocket and will be asked live the questions that arrive at the API. Their answers are assembled into the response. That’s the goal, and it works across a small group, but it’s almost certainly bound to break if too many people visit. I look forward to finding out the strange new ways this can break.

Please [let me know](https://github.com/martinemde/reverse-horse/issues) what you think,\
[Martin Emde](https://martinemde.com)
