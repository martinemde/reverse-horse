---
name: meat-jev
status: active
---

# meat-jev

Be Jev: a local Bun web server accepts TypeSafe System One requests, shows their
state and questions live over a WebSocket, and holds the HTTP connection while
you answer. Each request has 30 seconds from arrival, including time in the queue.

## Run

```sh
mise install
bun start
```

Open http://127.0.0.1:3000. Set `PORT` to change the port. No dependencies to install.
`bun dev` restarts on server changes; refresh the page after UI edits.

Set `TYPESAFE_API_KEY` in your environment or a local ignored `.env` to enable
comparison. After you submit, the caller immediately receives your answers;
the server then sends the original request directly to
`https://api.typesafe.ai/v1/systemone`. The page shows both answers, probabilities,
and their difference. Without a key, no second lookup happens. The key stays on
the server. A failed or timed-out JEV comparison does not undo your answer.

Auto mode cycles through three examples adapted from the TypeSafe docs. It starts
a round immediately, then waits four seconds after completion/comparison before
dealing another. It pauses while requests or comparisons are active or no page is
connected. Turning it off stops future rounds; the current round still expires.
Real API requests are accepted in either mode.

## Call it

```sh
curl http://127.0.0.1:3000/api/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"model":"jev-latest","state":"My package finally arrived!","questions":{"happy":{"type":"noul","instructions":"Is the customer happy?"},"mood":{"type":"score","instructions":"How does the customer feel?","criteria":["Sad","Neutral","Happy"]},"topic":{"type":"choice","instructions":"What is this about?","criteria":{"shipping":null,"billing":null,"support":null}}}}'
```

`/v1/systemone` is also supported for SDK clients. The local endpoint needs no API
key and binds to loopback. Invalid requests return 400; unanswered requests return
504 after 30 seconds. Callers need an HTTP timeout longer than 30 seconds. Client
disconnects remove their request. A maximum of 100 pending requests is accepted.

Noul maps to 0–1. Choice radio buttons select one option outright; sliders set
relative weights that normalize to probabilities (all-zero weights are rejected).
Ties choose the first option. Score sliders permit fractional values with visible
integer stops; probabilities interpolate between the two adjacent stops.
Structured state, instructions, and criteria are displayed as JSON.

Responses identify the human as `model: "meat-jev"` and report zero token usage.
The answer schema follows the [API reference](https://docs.typesafe.ai/api).
TypeSafe's [confidence documentation](https://docs.typesafe.ai/confidence) does
not specify its formula; human Choice/Score confidence uses one minus normalized
Shannon entropy. It is not numerically equivalent to JEV's confidence.

The queue and latest 20 results live in memory. Reconnecting gets a fresh snapshot;
draft slider values survive a connection interruption while the page stays open,
but not a page refresh. Multiple tabs see the same queue; the first valid submission
wins. Restarting the server clears requests and results.

## Verify

`bun test` exercises real local HTTP/WebSocket connections, all three answer types,
reconnection, duplicate submission, validation, expiration, auto mode, and static
assets. It explicitly disables the optional JEV lookup; there is no fake JEV.
For a live comparison, set the key, run the server, enable auto mode, answer a
round, and check the You & JEV panel. For UI verification, also check a narrow
viewport, keyboard sliders, and expiration without submitting.
