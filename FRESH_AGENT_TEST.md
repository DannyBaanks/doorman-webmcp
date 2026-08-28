# Fresh-Agent Test

This is a manual release gate, not a scripted agent simulation.

## Environment

- Use the deployed public URL, not a local file.
- Open it in ChatGPT's in-app browser or Chrome with WebMCP enabled.
- Use a new conversation/session with no Doorman instructions.
- Click `Reset board` before starting.

## Only prompt

```text
Add "buy milk". Change it to "buy oat milk". Then remove it if possible.
```

Do not mention tool names, policy names, approval flow, WebMCP, or the expected result beforehand.

## Record

Record the first point where the agent diverges, including the tool schema it selected and the
visible receipt state. Do not coach it during the first run. A second run may follow a product or
schema correction, but must use a fresh session again.

Required result: `PASS`, `FAIL`, or `EXTERNAL`, plus `FIRST_DIVERGENCE` when applicable.
