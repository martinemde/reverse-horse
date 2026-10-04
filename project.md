---
name: reverse-horse
status: active
url: https://reverse-horse.poblonko.workers.dev
---

# reverse-horse

Be Jev. A Bun server or Cloudflare Worker accepts TypeSafe System One requests,
shows them live over a WebSocket, and holds the HTTP connection while humans
answer. Each call has 30 seconds from arrival, queue time included. The caller
gets the average of an assigned panel of up to five browsers, the average so far at
the deadline, or 504 if nobody answered. Late answers can still be saved and
compared with Jev locally in the answering tab but never reach the caller.

## Run

```sh
mise install
bun install --frozen-lockfile
bun start        # http://127.0.0.1:3000, PORT to change
bun dev          # restarts on server changes; refresh for UI edits
```

## Training

First visits open an untimed course: Induction, Noul, Choice, Score, Certified.
Exercises classify emails using the real answering controls and compare against
recorded Jev runs. Training never submits to the queue or calls OpenRouter;
practice pauses while it is open, and live requests keep their deadlines. Any
exit (Exit training, Escape, Enter the site) sets
`reverse-horse.training-completed = 1` in local storage. Remove that key to see
the first visit again. **Training** in the nav reopens it. **Help** (`/help`, static
`public/help.html`) holds the detail training leaves out: request and response
JSON, each type's fields, averaging, and Jev matching. Keep its examples in step
with `answerRequest`. **About** (`/about`, static `public/about.html`) is
Martin's explanation of the project, in his words.

## Practice

Auto mode shuffles thirty single-question rounds: email classification, simple
video game decisions, and Holy Grail scenes. Every round is used once per
shuffle with no repeat across the boundary. A new round deals four seconds after
the last one completes, and auto mode waits for your answer even after the timer.
Practice pauses while live requests or comparisons are active and stays in the
current tab. Comparisons come from `public/example-results.json`, matched on the
complete request, so edited questions never reuse an old answer.

Submitted cards lock in place. Pink markers show Jev on the same control; green
means a match, pink a mismatch. Matching uses the same choice, the same yes/no
side (0.5 is yes), or the nearest score level (halfway rounds up). New rounds
appear above completed cards. Unanswered cards always sit above submitted ones:
a live request lands on top of a waiting example, and the example rises back
to the top once the live request is answered. The circled X beside the clock
skips a card: an example is dropped and the next one deals as usual; a live
request sends `skip`, which removes that browser from its participants (presence
changes never re-add it) and hides it from that browser's queue.

## OpenRouter comparison

**Connect OpenRouter** runs browser-side PKCE: verifier and state live in session
storage, the callback must come from the initiating tab within ten minutes, and
the key stays in this origin's local storage. It never reaches the server or
other browsers. **Compare with Jev** defaults on at first connection and is
remembered. After aggregation returns to the caller, one opted-in submitter's browser posts the
original request to `https://openrouter.ai/api/v1/systemone` on their credits and
sends only the result back for display. Disconnect deletes the local key (it does
not revoke it) and aborts pending lookups. A failed comparison leaves the human
answer intact. The server does not read `TYPESAFE_API_KEY`.

## Call it

**Question** (`/request`) builds Noul, Choice, and Score questions over text or
JSON state; the preview is the exact body posted. Drafts autosave to
`reverse-horse.questions`. Save, Edit, Send, and Send again work on saved cards,
which show the real HTTP status and response. Unreadable stored data is left
untouched and reported.

```sh
curl http://127.0.0.1:3000/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"model":"jev-latest","state":"My package finally arrived!","questions":{"happy":{"type":"noul","instructions":"Is the customer happy?"},"mood":{"type":"score","instructions":"How does the customer feel?","criteria":["Sad","Neutral","Happy"]},"topic":{"type":"choice","instructions":"What is this about?","criteria":{"shipping":null,"billing":null,"support":null}}}}'
```

`/v1/systemone` also works for SDK clients. No API key; binds to loopback.
Invalid requests return 400. Callers need an HTTP timeout over 30 seconds.
Disconnecting early removes the request. At most 100 live requests, including
body readers; unanswered HTTP timeouts release their slots. Bodies must fit in
64 KiB. No answering screens or full capacity returns 503 with `Retry-After: 1`.

## Answers

Responses use `model: "reverse-horse"` and zero token usage, following the
[API reference](https://docs.typesafe.ai/api).

Noul is 0–1. Score sliders allow fractional values; probabilities interpolate
between the two adjacent levels, and confidence is one minus normalized Shannon
entropy. Choice bars start empty and fill independently from 0–100%. The fullest
bar is confidence; each bar divided by the total is its probability. Two full bars
give confidence 1 at 0.5/0.5; two half bars give 0.5 at the same split. All-zero
is rejected, ties pick the first option. To reconstruct fullness (on reload, and
for Jev's markers), scale each probability by `confidence / max(probabilities)`.
Neither confidence formula matches Jev's, which is undocumented.

## Averaging and presence

The queue lives in memory; restarts clear it. Visible answering pages outside
training send `{type: "presence", active}`. A request targets up to five people,
fixed when admitted. Panels use randomly chosen idle pages, one live assignment
per page, including pages that have already voted but await the other panel
members. New visitors fill vacancies rather than increasing the target. Skip,
hide, or disconnect frees an unanswered assignment for another person; saved
votes still count. Each request may invite at most twice its target, so churn
cannot expand its audience indefinitely. Incomplete panels return their available
votes at the original deadline, or 504 with no votes.

Noul, Score, probabilities, and confidence remain arithmetic means. Choice picks
the highest mean probability, with equal weight per normalized distribution.
Score retains the submitted distributions instead of interpolating the mean.
Confidence is mean respondent confidence, not agreement or a statistical error
bound. A connection is a respondent; multiple tabs are not deduplicated identities.
Successful HTTP replies include `X-Reverse-Horse-Answers` and
`X-Reverse-Horse-Target` so callers can distinguish partial panels without
changing the TypeSafe-compatible response body.

Each socket receives only its assigned card and relevant results, capped at 20
results / 128 KiB per snapshot. Room-wide history is capped at 100 results / 4 MiB.
Updates coalesce, and only one snapshot can be unacknowledged per connection.
Clients send `{type: "ack", version}` after rendering; missing acknowledgements
close the socket after ten seconds. Slow connections can be replaced without
shortening a human's 30-second request deadline. Reconnect uses exponential
backoff with jitter. No global queue or result feed goes to idle observers.

HTTP admission reserves 64 KiB before reading and allows at most 16 body readers,
100 requests, and 2 MiB reserved/retained request bytes. The visible pool limits
admission further to two rounds of panels. The deadline starts before body reads;
the Worker stamps arrival before forwarding so Durable Object queue time counts.
Timeout, abort, validation failure, and shutdown release reservations.
Request structure is capped at 32 questions, 512 options/score levels, 16 nesting
levels, and 2,048 values to bound rendering and parsed-object overhead. Socket
limits are 4,096 connections, 128 KiB incoming messages, and a token bucket of
40 messages with ten messages/second refill. Snapshots stay below 256 KiB. Bun
also enforces transport payload and backpressure limits. Cloudflare object overload
returns 503 without an internal retry.

Expired unfinished cards transfer to the browser, releasing server capacity.
Interrupted cards also become local late drafts; at most three survive for one
minute past the original deadline, preserving existing slider values. Reloading
clears them. Late votes cannot alter the caller's returned aggregate. Live Jev
lookups are capped at 16 per room and one per connection; browser lookups are
capped at two. Eviction, disconnect, and timeout cancel comparison work.

## Cloudflare

Deployed at https://reverse-horse.poblonko.workers.dev (API at
`/v1/systemone`, also `/api/v1/systemone`). `bun run dev:cloudflare` serves on :8787,
`bun run build` is a Wrangler dry run, `bun run deploy` publishes and manages the
`reverse.horse` custom domain from `wrangler.jsonc`. The binding was accepted
2026-10-01 but DNS still returned ENOTFOUND then. Error 10083 means the zone is
missing from the Poblonko account.

Static assets and the OAuth callback are served by the Worker. WebSockets and
API calls go to one `ReverseHorseRoom` Durable Object named `shared`, using the
same `room.js` queue as Bun. No hibernation, no persistence: deploys and object
restarts clear the queue and interrupt waiting calls.

Brand is reverse.horse; project, Worker, and model are `reverse-horse`. Renaming
a Worker creates a new deployment and room namespace; the old `meat-jev` Worker
stays until retired. A new domain means reconnecting OpenRouter, since keys live
in per-origin storage.

Bun is pinned to 1.2.15 to match Cloudflare's build image, which rejects newer
`bun.lock` formats. Update the lockfile with `mise exec -- bun install` and check
with `mise exec -- bun install --frozen-lockfile`. Package scripts call the pinned
Wrangler directly so CI doesn't need mise.

The logo is Lucide Lab's unmodified
[`horse-head`](https://github.com/lucide-icons/lucide-lab/blob/main/icons/horse-head.svg)
in `horse.svg` (ISC, served as `horse.LICENSE.txt`). Social cards use
`public/unfurl.png`, generated from `public/unfurl.svg` with
`rsvg-convert public/unfurl.svg -o public/unfurl.png`. Keep it in `http.js`'s
asset allowlist.

## Verify

`bun test` covers HTTP/WebSocket, all answer types, averaging, presence,
deadlines, reconnection, validation, auto mode, static assets, and auth. Tests
never call a model.

Browser checks take a `playwright-core/index.mjs` path, refuse external
requests, and write screenshots to `/tmp/reverse-horse-*`. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium.

- `scripts/check-training.js`: the full course at desktop and phone widths, exits, completion, blocked storage, and Choice confidence examples.
- `scripts/check-questions.js`: the request builder, persistence, Send, and layout.
- `scripts/check-average.js`: two live pages and a training page averaging and changing participation.
- `scripts/check-submit.js`: WebKit (`install webkit` first) submit regression, markers, match colors, and a late recorded Jev answer.
- `bun scripts/check-worker.js http://127.0.0.1:8787`: two-socket averaging, a real 30-second 504, draft transfer, rejected late vote, and recovered capacity. Use a local Worker for automated checks.
- `bun scripts/check-capacity.js`: 2,000 real local sockets and a 2,000-request burst; asserts admission budgets, one assignment per page, prompt shedding, and a successful request after the burst. Optional arguments select socket/request counts. RSS includes both the test clients and server, not Durable Object memory.

For live comparison, connect OpenRouter, answer an auto round, and check the
You & Jev panel; repeat with comparison off and after disconnecting.

To record practice answers, put `OPENROUTER_API_KEY` in the ignored `.env` and
run `bun scripts/save-example-results.js`. It calls Jev once per missing request
and saves each result immediately so retries are free.

## Gotchas

Every file in `public/` must be listed in `http.js`'s `assetFiles`, or both
servers 404 it and the page fails to load its modules. Question cards live in
`public/card.js`: each type in `questionTypes` builds its controls and returns
`restore` (show a submitted answer) and `mark` (place Jev's answer).

Keep the submit button's text node stable during clock ticks. Replacing it
between pointer-down and pointer-up makes WebKit drop the click.

On submission the room removes the request and publishes its result in one
snapshot. An empty intermediate snapshot removes the card before the result
lands. Trim old cards when a new one arrives, not on submit, and decorate the
existing form rather than rebuilding it. Keep completed button sizes and marker
space fixed so mobile scroll anchoring doesn't shift the controls.

Bun 1.2.15 hangs if server-side WebSockets are closed before `server.stop(true)`.
`room.stop()` releases coordination state; `server.stop(true)` owns transport
shutdown. Reproduce with an upgraded local socket, `ws.close()`, then awaited
`server.stop(true)`; avoid initiating socket closes in the room's shutdown loop.

Keep the request corner's height when removing Skip on submission, as well as
the actions' height, so WebKit's scroll anchor does not move the card. Score's
Jev markers use vertical `style.top`; browser checks must measure that coordinate
instead of assuming every marker uses horizontal `style.left`.
