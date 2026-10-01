---
name: meat-jev
status: active
url: https://meat-jev.poblonko.workers.dev
---

# meat-jev

Be Jev: a Bun server or Cloudflare Worker accepts TypeSafe System One requests, shows their
state and questions live over a WebSocket, and holds the HTTP connection while
you answer. Each API call has 30 seconds from arrival, including time in the queue.
After that the caller receives 504, but the questions and your draft remain on
the page. You can save late answers and optionally compare them with JEV; late
answers cannot reach the expired caller. Auto mode waits for your answer before
dealing the next round, even after its timer expires.

## Run

```sh
mise install
bun start
```

Open http://127.0.0.1:3000. Set `PORT` to change the port. No dependencies to install.
`bun dev` restarts on server changes; refresh the page after UI edits.

Click **Connect OpenRouter** to authorize your own key. **Compare with JEV** is
enabled on your first connection. Turn it off whenever you like; your choice is
saved in this browser and survives refreshes and reconnects. Without a connection,
comparison stays off. The OAuth flow follows the blog's browser-side PKCE implementation:
a random verifier and state are kept in session storage, the callback exchanges
the code directly with OpenRouter, and the key stays in this origin's local
storage. Callbacks expire after ten minutes and must match the initiating tab.

After submission, the caller immediately receives your answers. If comparison is
enabled, that browser sends the original request directly to
`https://openrouter.ai/api/v1/systemone`. Only the comparison result returns to
the local server for display and reconnects; the key is never sent to it or to
another browser. Requests use the submitter's OpenRouter credits. No connection
or an unchecked toggle means no JEV lookup. Disconnect removes the stored key;
disconnecting or turning comparison off aborts outstanding browser lookups.
Already sent requests may still incur usage. Disconnect does not revoke the key
at OpenRouter. A failed comparison does not undo your human answer.

The server no longer reads `TYPESAFE_API_KEY`. A live comparison requires the
page to stay connected. OAuth and inference use the documented
[PKCE flow](https://openrouter.ai/docs/guides/overview/auth/oauth) and
[System One endpoint](https://openrouter.ai/docs/api/api-reference/systemone/submit-a-system-one-request).

Auto mode cycles through eleven short examples inspired by the TypeSafe docs and
[these JEV use cases](https://hackernoon.com/101-real-world-examples-of-how-to-use-jev),
including eight email classification scenarios. Each round has at most two questions. It starts
a round immediately, then waits four seconds after completion/comparison before
dealing another. Practice requests, answers, and history stay in the current tab;
optional JEV comparisons go directly from that browser to OpenRouter. Practice
works without a WebSocket connection and pauses new rounds while live requests or
comparisons are active. Turning it off stops future rounds; the current round
remains answerable after its timer ends. Real API requests still use the shared
WebSocket queue in either mode. Reloading the page clears local practice.

## Call it

Use **Make a request** (`/request`) to compose the state and add Noul, Choice,
and Score questions in a form. Choice options have unique keys and optional
descriptions; Score levels run from lowest to highest. Text and structured JSON
state are supported. The preview is the exact body posted to `/api/v1/systemone`.
The screen shows the actual HTTP status and response JSON. Keep it open while
someone answers, or open the answering screen in another tab. A 504 ends the
builder's API call even though the answering screen still accepts late answers.

```sh
curl http://127.0.0.1:3000/api/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"model":"jev-latest","state":"My package finally arrived!","questions":{"happy":{"type":"noul","instructions":"Is the customer happy?"},"mood":{"type":"score","instructions":"How does the customer feel?","criteria":["Sad","Neutral","Happy"]},"topic":{"type":"choice","instructions":"What is this about?","criteria":{"shipping":null,"billing":null,"support":null}}}}'
```

`/v1/systemone` is also supported for SDK clients. The local endpoint needs no API
key and binds to loopback. Invalid requests return 400; unanswered requests return
504 after 30 seconds. Callers need an HTTP timeout longer than 30 seconds. Client
disconnects before the deadline remove their request. A maximum of 100 unanswered
requests (including timed-out ones) is accepted.

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

## Cloudflare

Live site: https://meat-jev.poblonko.workers.dev. The API is available at
`https://meat-jev.poblonko.workers.dev/api/v1/systemone`.

`bun run dev:cloudflare` runs the Worker locally at http://127.0.0.1:8787.
`bun run build` previews deployment with Wrangler's dry run; `bun run deploy`
publishes the `meat-jev` Worker to the Cloudflare account used by martinemde.com.
Wrangler is pinned through mise. Static assets and the OpenRouter callback route
are served by the Worker; WebSockets and API calls go to one `MeatJevRoom`
Durable Object named `shared`. The Bun and Cloudflare adapters use the same
queue implementation in `room.js`.

This is one shared room: every connected browser sees the same requests and
results, and the first valid answer wins. Standard WebSockets keep that object
active while browsers are connected (no hibernation). The queue is still in
memory, not persisted; object restarts and deployments can clear it and interrupt
waiting API calls. OpenRouter keys remain exclusively in each browser.

Run `bun scripts/check-worker.js http://127.0.0.1:8787` against the local Worker,
or pass the deployed HTTPS origin after publishing. It sends two labeled test
requests, checks two sockets racing to answer, and waits the actual 30 seconds
to verify a 504 followed by a saved late answer. It does not call OpenRouter.

## Verify

`bun test` exercises real local HTTP/WebSocket connections, all three answer types,
reconnection, duplicate submission, validation, expiration, auto mode, and static
assets. Auth tests check PKCE, callback rejection, and browser key removal.
Tests never call a model; there is no fake JEV. For a live comparison, connect
OpenRouter in the page, check Compare with JEV, enable auto mode, answer a round,
and check the You & JEV panel. Also submit with comparison off to verify it skips
the lookup, and disconnect to forget the key. For UI verification, check a narrow
viewport, keyboard sliders, and expiration without submitting.
