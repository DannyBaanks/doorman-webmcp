# WebMCP Challenge Checklist

Checked against the official Devpost rules and overview on 2026-08-28.

| Requirement | Source | Status | Evidence / Action |
|---|---|---|---|
| WebMCP-powered web app | Official Rules, Project Requirements | PASS | Static page with imperative `registerTool` source |
| Human and agent collaboration | Official Rules, What to Create | PASS | Board, policy, approval, receipts |
| Working live URL | Official Rules, Submission Requirements | HUMAN_ACTION_REQUIRED | Deploy static site and record URL |
| Public source repository | Official Rules, Submission Requirements | PASS | `https://github.com/DannyBaanks/doorman-webmcp`, public, default branch `main` |
| Open-source license visible | Official Rules, repository requirements | PASS | GitHub detects MIT; `LICENSE` is present |
| CI | Release quality | PASS | GitHub Actions run for commit `78cbaca`; Node 20 and 22 green |
| `document.modelContext.registerTool` present | Official Rules, repository requirements | PASS | `src/doorman.js`, `src/tools.js` |
| English submission materials | Official Rules, Language Requirements | PASS | README, script, checklist, UI are English |
| Video under three minutes with audio | Official Rules, video requirement | NOT_YET | `VIDEO_SCRIPT.md` ready; record and upload public YouTube video |
| Video has no unauthorized marks/music | Official Rules, video requirement | NOT_YET | Use original narration and UI only |
| Text description covers fit, UX, collaboration, implementation | Official Rules, text description | PASS locally | README covers all four; paste into Devpost |
| Project runs consistently | Official Rules, Functionality | PASS local / EXTERNAL real dynamic | Node mock passes; interactive WebMCP run remains required |
| Real WebMCP environment | Official Rules, testing | EXTERNAL | Headless Chrome detected API but dynamic discovery had transient failure |
| Fresh-agent run | Product gate | EXTERNAL | Requires ChatGPT in-app browser or interactive WebMCP agent |
| Submission freeze after deadline | Official Rules, Section 6 | HUMAN_ACTION_REQUIRED | Freeze repo, URL, description, video before deadline |
| Devpost submission | Official Rules, Section 4 | HUMAN_ACTION_REQUIRED | Danny must submit; no automated submission performed |
| Eligibility / representative | Official Rules, Sections 3 and 4 | HUMAN_ACTION_REQUIRED | Danny confirms eligibility and representative role |
