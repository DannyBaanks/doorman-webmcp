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

The human can use the board without an agent. State and receipts live only in this browser's
`localStorage`; there is no backend, account, database, or external dependency.

## WebMCP implementation

`src/doorman.js` wraps `document.modelContext.registerTool(tool, { signal })`. The registered
callback and the local `doorman.invoke()` path share the same policy and execution boundary.
Dynamic registration uses the official `AbortSignal` lifecycle: aborting the signal unregisters
`delete_item`. The tool schemas and board handlers are in `src/tools.js`.

The current API is an active proposal. See `_internal/WEBMCP_API_NOTES.md` for the short API note
used during implementation. `_internal/` is development-only and is ignored from the public repo.

## Security limitation

Doorman is not a sandbox, IAM system, or strong security boundary. The page's own JavaScript could
bypass its wrapper. It demonstrates a cooperative application-level authority policy. The external
browser-level property is that an unregistered tool is not part of the exposed WebMCP surface.

## Run

There is no build step. Open `index.html`, or serve the directory:

```text
py -m http.server 8000
```

Then visit `http://localhost:8000`.

For WebMCP, use ChatGPT's in-app browser or Chrome 149+ with the WebMCP origin trial. For local
testing, enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome. Without WebMCP the
page says so plainly and the human board remains usable.

## Tests

```text
node tests/doorman.test.js
```

The browser probe is `tests/browser-probe.html`. It exercises actual `getTools()` and
`executeTool()` when opened in a compatible browser; it is not a substitute for a fresh-agent run.

## Demo flow

Reset the board, show the four always-on tools and unavailable `delete_item`, then have an agent
list and add an item. Attempt an update on a human or sample item and show the denial receipt.
Request approval, approve once as the human, delete the approved item, and show the capability
disappearing again. The prepared two-to-three-minute script is in `VIDEO_SCRIPT.md`.

## License

MIT. See [LICENSE](LICENSE).
