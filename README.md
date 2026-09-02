# Doorman

**Registering a tool does not grant blanket authority to use it.**

Doorman is a small, static WebMCP demo for a shared board. It makes the difference between a
capability an agent can discover and an action the application policy actually authorizes:

```text
capability_available != capability_exercised
```

## What the demo shows

- `list_items`, `add_item`, `update_item`, and `request_approval` are always registered.
- `update_item` is allowed only for items created by the current agent session.
- `delete_item` is genuinely unregistered until a human approves one specific deletion.
- The approved target can be deleted once; the tool is then unregistered again.
- Every decision has a small local receipt showing `decision` and `execution` separately.
- A compatible browser exposes the first four tools immediately; `delete_item` is added only
  after the human approves one concrete target and is removed after that use.

The human can use the board without an agent. State and receipts live only in this browser's
`localStorage`; there is no backend, account, database, or external dependency.

## WebMCP implementation

`src/doorman.js` wraps `document.modelContext.registerTool(tool, { signal })`. The registered
callback and the local `doorman.invoke()` path share the same policy and execution boundary.
Dynamic registration uses the official `AbortSignal` lifecycle: aborting the signal unregisters
`delete_item`. The tool schemas and board handlers are in `src/tools.js`.

The current API is an active proposal. See `_internal/WEBMCP_API_NOTES.md` for the short API note
used during implementation. `_internal/` is development-only and is ignored from the public repo.

The policy fails closed when a tool has no explicit policy. Registration is transactional: a browser
registration failure rolls back the local entry. A one-shot delete grant is consumed at the policy
decision, not at the handler, so two concurrent invocations of the same approved target cannot both
be authorized; unregistration is deferred until the result has escaped so older Chrome versions do
not cancel an already-completed invocation.

## Security limitation

Doorman is not a sandbox, IAM system, or strong security boundary. The page's own JavaScript could
bypass its wrapper. It demonstrates a cooperative application-level authority policy. The external
browser-level property is that an unregistered tool is not part of the exposed WebMCP surface.

## InteractionGate on WebMCP

Doorman also includes an InteractionGate, a bounded vanilla-JS port of the
[DoormanSDK](https://github.com/DannyBaanks/doorman-sdk) InteractionGate.

```text
ActionGate asks:    "may this exposed tool execute?"
InteractionGate asks: "does this supplied model response remain within the declared role?"
```

These are parallel layers. Relational decisions are NOT merged into tool execution policy.

The gate implements F1–F10 relational-interaction feature detectors, a privacy-bounded drift
tracker, and a rule-based deterministic rewriter. It preserves technical content and natural
warmth while reducing relational escalation.

**Key distinctions preserved:**

- `COMEDIC_PERSONA != RELATIONAL_PERSONA` ("perro guardián de silicio" alone is ALLOW; a real "soy tu espejo" claim is still DETECTED even next to comedic text — comedic wording never neutralizes a coexisting relational claim)
- `NATURAL_WARMTH != RELATIONAL_ESCALATION` ("gracias" is ALLOW; "te adoro" triggers REWRITE)
- `TECHNICAL_WE != RELATIONAL_WE` ("necesitamos correr tests" is ALLOW; "brindemos por nosotros" is LOG)
- `AMBIGUOUS != ALLOW` (an AMBIGUOUS feature yields at least LOG, never a silent pass)
- `CONTEXT_AVAILABLE != CONTEXT_AUTHORIZED`
- `USER_WARMTH != RELATIONAL_AUTHORITY`
- `CLAIM_SCOPE <= EVIDENCE_SCOPE`

The drift tracker is a genuine bounded rolling window (default 8 turns): every aggregate —
trigger count, private-context usage, feature counts — is derived from the same bounded set of
turns, so normal turns genuinely clear prior relational drift. Repeated features escalate per the
declared first/repeated policy.

**WebMCP tools:**

- `interaction_assess` — Assess a user/model response pair. MUTATES derived drift state and
  appends a receipt, so it is neither read-only nor idempotent (annotations say so).
- `interaction_state` — Read current derived drift state (no raw transcript). Read-only.

`interaction_reset` is deliberately NOT exposed to the agent: a subject must not be able to clear
the record tracking it. It exists only as a human action in the UI.

**Limitations (CLAIM_SCOPE <= EVIDENCE_SCOPE):**

- `HOST_WIDE_RESPONSE_INTERCEPTION = NOT_DEMONSTRATED`
- `AUTOMATIC_ENFORCEMENT = NOT_DEMONSTRATED`
- `SDK_RUNTIME_PARITY = NOT_DEMONSTRATED` (the fixtures are hand-derived from the SDK corpus;
  the JS test verifies JS_FIXTURE_CONFORMANCE, not that both runtimes agree at runtime)
- `REWRITE_CONTRACT_VERIFIED = NOT_DEMONSTRATED` (the rewriter does regex replacement without
  verifying the result; the role line it prepends is a suggestion, not a host system instruction)
- The browser demo assesses explicitly supplied text; it does not intercept every model response
- Thresholds are NOT_CALIBRATED
- This is ASSESSMENT + RECEIPT + VISIBLE POLICY, not universal enforcement

## Run

There is no build step. Open `index.html`, or serve the directory:

```text
py -m http.server 8000
```

Then visit `http://localhost:8000`.

For WebMCP, use ChatGPT's in-app browser or Chrome 149+ with the WebMCP origin trial. For local
testing, enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome. Without WebMCP the
page says so plainly and the human board remains usable.

The public demo is:

```text
https://dannybaanks.github.io/doorman-webmcp/
```

After opening the page in a compatible browser, the environment banner must say `WebMCP available`.
The initial surface contains `list_items`, `add_item`, `update_item`, and `request_approval`.
`delete_item` is intentionally absent until approval.

## Tests

```text
node tests/doorman.test.js       # ActionGate tests (8 audits)
node tests/interaction.test.js   # InteractionGate tests (69 tests)
```

Both suites run in CI (`.github/workflows/ci.yml`), which also `node --check`s every source and
test file. The browser probe is `tests/browser-probe.html`; it loads the interaction modules and,
when WebMCP is available, calls `interaction_assess` through a real `executeTool()`. It is not a
substitute for a fresh-agent run.

The verified interactive cycle is recorded in `evidence/webmcp_interactive_run.md`. It used the
public URL and a compatible interactive Chrome session: add, list, request approval, human approve,
one-shot delete, then dynamic unregistration. This is an integration result, not an uncoached
fresh-agent result.

## Demo flow

Reset the board, show the four always-on tools and unavailable `delete_item`, then have an agent
list and add an item. Attempt an update on a human or sample item and show the denial receipt.
Request approval, approve once as the human, delete the approved item, and show the capability
disappearing again. The prepared two-to-three-minute script is in `VIDEO_SCRIPT.md`.

The release procedure is in `DEPLOYMENT.md`; the uncoached agent run is in `FRESH_AGENT_TEST.md`.

## License

MIT. See [LICENSE](LICENSE).
