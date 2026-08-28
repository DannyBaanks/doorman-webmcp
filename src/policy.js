/*
 * policy.js — the app-level decision made after WebMCP has exposed a tool.
 *
 * This is observable authority, not a security boundary. A policy returns a
 * small, serialisable decision so the ledger and the UI can explain it.
 */
(function (global) {
  'use strict';

  function allow(reason) {
    return { decision: 'allowed', reason: reason || 'policy_allowed' };
  }

  function deny(reason) {
    return { decision: 'denied', reason: reason || 'policy_denied' };
  }

  function decide(rule, args, session) {
    if (typeof rule !== 'function') return allow();
    var result = rule(args || {}, session || {});
    if (!result || (result.decision !== 'allowed' && result.decision !== 'denied')) {
      throw new Error('A policy must return an allowed or denied decision.');
    }
    return { decision: result.decision, reason: result.reason || 'policy_' + result.decision };
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.policy = { allow: allow, deny: deny, decide: decide };
})(typeof window !== 'undefined' ? window : globalThis);
