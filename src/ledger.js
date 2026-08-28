/* ledger.js — local, human-readable receipts. Not tamper evidence. */
(function (global) {
  'use strict';

  var KEY = 'doorman.ledger.v1';

  function createLedger(storage) {
    var entries = [];
    var nextNumber = 1;

    function load() {
      try {
        var raw = storage && storage.getItem(KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) entries = parsed;
      } catch (err) {
        entries = [];
      }
      nextNumber = entries.reduce(function (max, entry) {
        return Math.max(max, Number(entry.number) || 0);
      }, 0) + 1;
      return list();
    }

    function save() {
      try {
        if (storage) storage.setItem(KEY, JSON.stringify(entries));
      } catch (err) {
        // The page remains usable when storage is unavailable.
      }
    }

    function record(receipt) {
      var entry = {
        number: nextNumber++,
        timestamp: new Date().toISOString(),
        tool: receipt.tool,
        args: receipt.args || {},
        decision: receipt.decision,
        execution: receipt.execution || (receipt.decision === 'allowed' ? 'executed' : 'not_executed'),
        reason: receipt.reason || null
      };
      if (Object.prototype.hasOwnProperty.call(receipt, 'result')) entry.result = receipt.result;
      entries.push(entry);
      save();
      return Object.assign({}, entry, { args: Object.assign({}, entry.args) });
    }

    function list() { return entries.slice(); }

    function clear() {
      entries = [];
      nextNumber = 1;
      save();
    }

    load();
    return { load: load, record: record, list: list, clear: clear };
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.createLedger = createLedger;
})(typeof window !== 'undefined' ? window : globalThis);
