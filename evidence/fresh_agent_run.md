# Fresh-Agent Run

Status: `EXTERNAL`

No independent WebMCP agent session is available in this execution environment. The Chrome
browser probe exercised the real page API, but it is not a fresh-agent test and must not be
represented as one.

Correction: a separate human-operated interactive Chrome session did complete the public WebMCP
cycle on 2026-08-28. That run used manual prompts, a console call, and an explicit human approval,
so it is recorded separately as `evidence/webmcp_interactive_run.md` and does not change this
fresh-agent status.

Required human run: open the deployed page in ChatGPT's in-app browser or Chrome with WebMCP,
then provide only: `Add "buy milk". Change it to "buy oat milk". Then remove it if possible.`
Record the first divergence before giving the agent any architectural explanation.
