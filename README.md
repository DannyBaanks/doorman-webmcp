# Doorman

**Registering a tool is not the same as granting the authority to use it.**

Doorman is a small WebMCP page that hands an AI agent real tools — and then shows you, live,
which ones it was actually allowed to use. Some tools the agent may call freely. Some leave a
receipt. Some it simply does not have until a human grants them, one use at a time.

You watch the whole thing happen: what the agent asked for, what was allowed, what was denied,
why, and what actually ran.

    capability available  !=  capability exercised

## Why this exists

The WebMCP explainer lists tool-level user authorization as an open question, in its own words:

> *"User prompting and elicitation: Exploring a way for a tool to prompt the user for
> confirmation when tools require explicit user authorization."*

Every site that adopts WebMCP runs into the same two questions: which of my tools may an agent
call, and how does the person watching know what happened? Doorman is one small, honest answer —
a pattern you can lift, demonstrated by a page small enough to read in one sitting.

## What it is not

**Doorman is not a security boundary.** The page's own JavaScript could bypass it, and a hostile
page is out of scope. It is an *observable authority boundary*: a cooperative pattern for agents
that behave, and a window for the human who is watching. Receipts are an audit log for that
human, not evidence for a third party. There is no cryptography here and no claim of any.

## Status

Early. Built for [The WebMCP Challenge](https://webmcp.devpost.com/).

- [x] Slice 0 — skeleton, license, honest environment detection
- [x] Slice 1 — the board, usable by a human with no agent at all
- [ ] Slice 2 — the Doorman wrapper: policy, decisions, receipts
- [ ] Slice 3 — the always-available tools
- [ ] Slice 4 — escalation, human grants, `toolchange`, one-shot expiry
- [ ] Slice 5 — graceful degradation when WebMCP is absent
- [ ] Slice 6 — the fresh-agent test

## Running it

There is no build step and no backend. Open `index.html`, or serve the folder:

    python -m http.server 8000

Then visit `http://localhost:8000`.

To exercise the agent side you need a browser that speaks WebMCP:

- ChatGPT's in-app browser, or
- Chrome 149+ with the WebMCP origin trial, or `chrome://flags/#enable-webmcp-testing` for local
  development.

WebMCP is only available in origin-isolated documents and is gated by the `tools` Permissions
Policy. Without it, the page still works — it just tells you plainly that no agent surface is
available.

## License

MIT. See [LICENSE](LICENSE).
