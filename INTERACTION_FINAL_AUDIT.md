# InteractionGate WebMCP — Final Audit (post-fix)

Date: 2026-09-02
Source of truth: `C:\Development\ISyCo Git\doorman-webmcp`
SDK reference: `C:\Development\ISyCo Git\doorman-sdk`

This audit supersedes the earlier 2026-09-02 draft. An external review found a
series of real defects; each is fixed and verified below (see "Fixes applied").

## Verdict

```
ACTION_GATE_REGRESSION_FREE     = DEMONSTRATED  (8/8 audits pass, existing board unchanged)
INTERACTION_CORE_IMPLEMENTED    = TRUE          (F1-F10 detectors, drift state, policy, rewrite)
F1_F10_IMPLEMENTED              = TRUE
NORMAL_WARMTH_CASES             = DEMONSTRATED_BY_FIXTURES
COMEDIC_PERSONA_CASE            = DEMONSTRATED_BY_FIXTURE
COMEDIC_NEUTRALIZES_RELATIONAL  = FALSE         (fixed: comedic wording no longer suppresses a coexisting relational claim)
REPEATED_FEATURE_POLICY         = DEMONSTRATED  (fixed: repeated F2->ROLE_RESET, F3->REWRITE verified by tests)
BOUNDED_DRIFT_WINDOW            = DEMONSTRATED  (all aggregates derive from the same bounded window; normal turns clear drift)
AGENT_CAN_RESET_DRIFT_STATE     = FALSE         (fixed: interaction_reset removed from agent surface, human-only UI)
WEBMCP_ANNOTATIONS_CORRECT      = TRUE          (fixed: assess is neither read-only nor idempotent; state is read-only)
BASELINE_ROLE_ARGUMENT_EFFECTIVE= N/A           (removed: baseline is host/human config, not agent-declarable)
AMBIGUOUS_MINIMUM_ACTION        = LOG           (AMBIGUOUS never reads as ALLOW)
DRIFT_THRESHOLD_EXPLAINED       = DEMONSTRATED  (F9 recomputed post-update; drift_threshold_exceeded reason)
PRIVACY_RAW_TRANSCRIPT_PERSISTED= FALSE
RECEIPT_RAW_SPANS_POSSIBLE      = FALSE         (fixed: evidence spans hashed before entering the ledger)
CI_INTERACTION_COVERAGE         = TRUE          (fixed: interaction tests + syntax checks run in CI)
JS_FIXTURE_CONFORMANCE          = 21/21         (fixed counter; labels corrected)
SDK_RUNTIME_PARITY              = NOT_DEMONSTRATED
PARITY_MISMATCH_COUNTER         = TRUE          (fixed: increments on mismatch)
REWRITE_GOALS                   = IMPLEMENTED
REWRITE_CONTRACT_VERIFIED       = NOT_DEMONSTRATED
ROLE_LINE_IS_HOST_INSTRUCTION   = FALSE         (renamed to suggested_role_reset)
LOCAL_JS_INTERACTION_TESTS      = 69 passed, 0 failed
WEBMCP_INTERACTION_DEFINITION   = IMPLEMENTED   (schemas + handlers present)
WEBMCP_INTERACTION_REGISTRATION = NOT_DEMONSTRATED (requires WebMCP browser)
WEBMCP_INTERACTION_EXECUTION    = NOT_DEMONSTRATED (requires WebMCP browser)
UNCOACHED_AGENT_USE             = NOT_DEMONSTRATED
HOST_WIDE_INTERCEPTION          = NOT_DEMONSTRATED
HOST_ENFORCEMENT                = NOT_DEMONSTRATED
THRESHOLDS_CALIBRATED           = FALSE
PRODUCTION_SAFE                 = NOT_DEMONSTRATED
```

## Fixes applied (from external review)

1. **Repeated-feature key mismatch.** `assess()` keyed per-turn counts by the
   full feature key (`f2_persistent_social_role`) while `decide()` looked them
   up by the short rule key (`f2`), so every occurrence looked like the first.
   `decide()` now reads the full feature key. Repeated F2 -> ROLE_RESET and
   F3 -> REWRITE are covered by tests. (The SDK gate.py appears to share the
   bug; this port does not.)

2. **Rolling window was only partial.** `window` was bounded but
   `triggerCount`, `privateContextUsage` and `featureCounts` accumulated
   forever, so old drift never truly left. Drift state now stores bounded
   per-turn records and every aggregate is derived from that same window.
   Tests: window stays at windowSize; 8 relational turns then 8 neutral turns
   drive drift and triggerCount back to 0.

3. **Agent could reset its own record.** `interaction_reset` was exposed as a
   WebMCP tool with `allow('always_allowed')`. Removed from the agent surface;
   it survives only as a human action in the UI (`runtime.interactionGate
   .resetState()`).

4. **WebMCP annotations were wrong.** `interaction_assess` now declares
   `readOnlyHint:false, idempotentHint:false` (it mutates drift and appends a
   receipt). `interaction_state` stays read-only/idempotent. The reset tool,
   no longer exposed, needed no annotation.

5. **Ignored `baseline_role` argument.** Removed from the schema; the baseline
   is host/human configuration set at gate creation, not something the model
   self-declares per call.

6. **Parity harness was not parity.** The test never ran the SDK; it only
   compared JS output to the fixture JSON. Renamed labels to
   `SDK_DERIVED_FIXTURES` / `JS_FIXTURE_CONFORMANCE`, and `SDK_RUNTIME_PARITY =
   NOT_DEMONSTRATED`. The `PARITY_MISMATCHES` counter now actually increments.

7. **Comedic bypass.** F2/F4 returned NOT_DETECTED on any comedic phrase,
   letting a comedic line neutralize a coexisting relational claim. Relational
   claims are now detected regardless; adversarial fixture
   `25_mixed_comedic_relational` proves the fix.

8. **AMBIGUOUS read as ALLOW.** `decide()` ignored AMBIGUOUS. It now yields at
   least LOG.

9. **F9 computed on stale drift.** F9 now recomputes after the current turn
   enters the window, and a `drift_threshold_exceeded` reason is added so a
   ROLE_RESET is never unexplained.

10. **Raw spans in receipts.** The interaction ledger stored verbatim matched
    spans. They are now replaced with a stable short hash before storage.

11. **Rewrite contract overstated.** Comments no longer "guarantee"
    preservation; `REWRITE_CONTRACT_VERIFIED = NOT_DEMONSTRATED`. The role
    line is `[suggested_role_reset: ...]`, not a host system instruction.

12. **CI ignored the gate.** `ci.yml` now runs `node tests/interaction.test.js`
    and `node --check`s the interaction modules and test.

13. **Browser probe missed the gate.** It now loads the interaction modules and,
    when WebMCP is present, executes `interaction_assess` via `executeTool()`.

## Changed files

| File | Action |
|---|---|
| `src/interaction.js` | MODIFIED | key normalization, bounded rolling window, comedic fix, AMBIGUOUS->LOG, F9 recompute, drift_threshold_exceeded |
| `src/interaction-rewrite.js` | MODIFIED | rewrite contract claims corrected, `[suggested_role_reset]` rename |
| `src/tools.js` | MODIFIED | removed `interaction_reset` and `baseline_role`, fixed annotations, hashed receipt spans |
| `tests/interaction.test.js` | MODIFIED | 69 tests, working parity counter, window/repeated/AMBIGUOUS tests |
| `tests/interaction-fixtures.json` | MODIFIED | 21 fixtures (added 25_mixed_comedic_relational) |
| `.github/workflows/ci.yml` | MODIFIED | InteractionGate tests + syntax checks |
| `tests/browser-probe.html` | MODIFIED | loads interaction modules, executes interaction_assess |
| `README.md` | MODIFIED | corrected tools/limitations, CI coverage |
| `GUIA.md` | MODIFIED | interaction test command, reset/window traps |
| `index.html`, `src/ui.js` | unchanged this pass | panel already human-only |

## Test matrix

| Category | Count | Status |
|---|---|---|
| Feature detectors | 20 | ALL PASS |
| Decision logic | 11 | ALL PASS |
| Drift state (incl. window + repeated) | 7 | ALL PASS |
| Rewrite | 8 | ALL PASS |
| assessAndRewrite | 1 | PASS |
| Fixture conformance | 21 | ALL MATCH |
| Privacy boundary | 2 | ALL PASS |
| **Total interaction** | **69** | **69 passed** |
| ActionGate regression | 8 audits | ALL PASS |

## Fixture conformance detail

```
SDK_DERIVED_FIXTURES: 21
WEB_JS_FIXTURES: 21
JS_FIXTURE_CONFORMANCE_MATCHES: 21
JS_FIXTURE_CONFORMANCE_MISMATCHES: 0
SDK_RUNTIME_PARITY: NOT_DEMONSTRATED
```

## Known differences from DoormanSDK

1. **F9 longitudinal semantics.** `detectF9` requires `turnIndex >= 3`, so a
   single relational turn never trips it regardless of drift. This is intended.
2. **No receipt chaining.** The web port stores interaction receipts without
   SHA-256 integrity hashes; spans are hashed with a lightweight FNV-1a-style
   hash, not a cryptographic one.
3. **Repeated-feature counts are normalized correctly here**, which the SDK's
   `gate.py` may not do (its `feature_counts` use full keys while `_decide()`
   looks up short keys). This port fixes rather than reproduces that bug.

## Limitations

- Regex-based detection (not ML/NLP); paraphrase generalization bounded by pattern sets
- No WebMCP browser integration demonstrated (Node.js tests only)
- No host-wide response interception (by design)
- Thresholds NOT_CALIBRATED (drift_threshold=0.7)
- Rewrite is rule-based deterministic and unverified (`REWRITE_CONTRACT_VERIFIED` NOT_DEMONSTRATED)
- F9 requires turn_index >= 3