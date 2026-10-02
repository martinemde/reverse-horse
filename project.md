---
name: reverse-horse
status: active
url: https://reverse-horse.poblonko.workers.dev
---

# reverse-horse

Be Jev. A Bun server or Cloudflare Worker accepts TypeSafe System One requests,
shows them live over a WebSocket, and holds the HTTP connection while humans
answer. Each call has 30 seconds from arrival, queue time included. The caller
gets the average of all participating browsers' answers, the average so far at
the deadline, or 504 if nobody answered. Late answers can still be saved and
compared with JEV but never reach the caller.

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
recorded JEV runs. Training never submits to the queue or calls OpenRouter;
practice pauses while it is open, and live requests keep their deadlines. Any
exit (Exit training, Escape, Enter the site) sets
`reverse-horse.training-completed = 1` in local storage. Remove that key to see
the first visit again. **Training** in the nav reopens it.

## Practice

Auto mode shuffles thirty single-question rounds: email classification, simple
video game decisions, and Holy Grail scenes. Every round is used once per
shuffle with no repeat across the boundary. A new round deals four seconds after
the last one completes, and auto mode waits for your answer even after the timer.
Practice pauses while live requests or comparisons are active and stays in the
current tab. Comparisons come from `public/example-results.json`, matched on the
complete request, so edited questions never reuse an old answer.

Submitted cards lock in place. Pink markers show JEV on the same control; green
means a match, pink a mismatch. Matching uses the same choice, the same yes/no
side (0.5 is yes), or the nearest score level (halfway rounds up). New rounds
appear above completed cards.

## OpenRouter comparison

**Connect OpenRouter** runs browser-side PKCE: verifier and state live in session
storage, the callback must come from the initiating tab within ten minutes, and
the key stays in this origin's local storage. It never reaches the server or
other browsers. **Compare with JEV** defaults on at first connection and is
remembered. After everyone submits, one opted-in submitter's browser posts the
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
curl http://127.0.0.1:3000/api/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"model":"jev-latest","state":"My package finally arrived!","questions":{"happy":{"type":"noul","instructions":"Is the customer happy?"},"mood":{"type":"score","instructions":"How does the customer feel?","criteria":["Sad","Neutral","Happy"]},"topic":{"type":"choice","instructions":"What is this about?","criteria":{"shipping":null,"billing":null,"support":null}}}}'
```

`/v1/systemone` also works for SDK clients. No API key; binds to loopback.
Invalid requests return 400. Callers need an HTTP timeout over 30 seconds.
Disconnecting early removes the request. At most 100 unanswered requests,
timed-out ones included.

## Answers

Responses use `model: "reverse-horse"` and zero token usage, following the
[API reference](https://docs.typesafe.ai/api).

Noul is 0–1. Score sliders allow fractional values; probabilities interpolate
between the two adjacent levels, and confidence is one minus normalized Shannon
entropy. Choice bars start empty and fill independently from 0–100%. The fullest
bar is confidence; each bar divided by the total is its probability. Two full bars
give confidence 1 at 0.5/0.5; two half bars give 0.5 at the same split. All-zero
is rejected, ties pick the first option. To reconstruct fullness (on reload, and
for JEV's markers), scale each probability by `confidence / max(probabilities)`.
Neither confidence formula matches JEV's, which is undocumented.

## Averaging and presence

The queue and latest 20 results live in memory; restarts clear them. Only
visible answering pages outside training participate, sending
`{type: "presence", active}`. Each connection submits once per request. Hidden or
disconnected pages stop holding a request open, but saved replies still count.
Noul, Score, probabilities, and confidence are arithmetic means. Choice picks
the highest mean probability, and each person's normalized distribution weighs
equally regardless of fullness. Score averages keep the submitted distributions
rather than interpolating from the mean score. Drafts survive a reconnect but
not a refresh.

## Cloudflare

Deployed at https://reverse-horse.poblonko.workers.dev (API at
`/api/v1/systemone`). `bun run dev:cloudflare` serves on :8787,
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
- `scripts/check-submit.js`: WebKit (`install webkit` first) submit regression, markers, match colors, and a late recorded JEV answer.
- `bun scripts/check-worker.js http://127.0.0.1:8787` (or the deployed origin): two-socket averaging and a real 30-second 504 followed by a late answer.

For live comparison, connect OpenRouter, answer an auto round, and check the
You & JEV panel; repeat with comparison off and after disconnecting.

To record practice answers, put `OPENROUTER_API_KEY` in the ignored `.env` and
run `bun scripts/save-example-results.js`. It calls JEV once per missing request
and saves each result immediately so retries are free. Remove the key afterward.

## Gotchas

Keep the submit button's text node stable during clock ticks. Replacing it
between pointer-down and pointer-up makes WebKit drop the click.

On submission the room removes the request and publishes its result in one
snapshot. An empty intermediate snapshot removes the card before the result
lands. Trim old cards when a new one arrives, not on submit, and decorate the
existing form rather than rebuilding it. Keep completed button sizes and marker
space fixed so mobile scroll anchoring doesn't shift the controls.
