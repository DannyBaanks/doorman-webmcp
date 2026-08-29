# Deployment

Doorman is a static site. It needs no build command, server state, secrets, or backend.

## Release package

Publish the repository to an authorized public GitHub, GitLab, or Bitbucket repository with the MIT
license visible in the repository About section. Deploy the repository root to an authorized static
host such as GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another equivalent provider.

## Smoke test after publication

Open the public URL in a normal browser and verify:

1. The page loads over HTTPS.
2. The human board can add, edit, delete, and reset.
3. The page says either `WebMCP available` or `WebMCP not available in this browser` honestly.
4. With WebMCP enabled, the browser probe can be opened at `/tests/browser-probe.html`.
5. The fresh-agent procedure in `FRESH_AGENT_TEST.md` is run in a new session.

Current public URL:

```text
https://dannybaanks.github.io/doorman-webmcp/
```

Verified interactive result: the page reported `WebMCP available`; the first four tools were
discoverable, `request_approval` produced a pending human decision, approval registered
`delete_item` as a one-shot tool, and the successful delete removed that registration again.
This does not replace the separate uncoached fresh-agent gate.

Do not submit until the URL, repository, description, video, and testing instructions are frozen.
Danny must choose the provider, authorize publication, and complete Devpost submission.
