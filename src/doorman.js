/*
 * doorman.js — the adoption-sized wrapper around document.modelContext.
 *
 * Registration controls what the browser can discover. Policy controls what
 * an exposed tool may do. They are intentionally separate decisions.
 */
(function (global) {
  'use strict';

  function create(options) {
    options = options || {};
    var context = options.modelContext || null;
    var ledger = options.ledger || global.Doorman.createLedger(options.storage || global.localStorage);
    var session = options.session || { id: 'session_' + Date.now().toString(36) };
    var receiptListener = options.onReceipt || null;
    var tools = Object.create(null);

    function normaliseArgs(args) {
      return args == null ? {} : args;
    }

    function record(receipt) {
      var result = ledger.record(receipt);
      if (receiptListener) receiptListener(result);
      return result;
    }

    function registerTool(descriptor, rule, registrationOptions) {
      if (!descriptor || typeof descriptor.name !== 'string' || !descriptor.name) {
        throw new Error('A tool needs a name.');
      }
      if (typeof descriptor.execute !== 'function') throw new Error('A tool needs an execute function.');
      if (typeof rule !== 'function' && typeof descriptor.policy !== 'function') {
        throw new Error('A tool needs an explicit policy.');
      }
      if (tools[descriptor.name]) throw new Error('Tool already registered: ' + descriptor.name + '.');

      var original = descriptor.execute;
      var wrapped = Object.assign({}, descriptor, {
        execute: function (args, executionOptions) {
          return invoke(descriptor.name, args, executionOptions).then(function (outcome) {
            if (outcome.status === 'ALLOWED') return outcome.result;
            return {
              content: [{ type: 'text', text: JSON.stringify({
                status: outcome.status, reason: outcome.receipt.reason, tool: descriptor.name
              }) }]
            };
          });
        }
      });
      // Policy belongs to Doorman, not to the WebMCP descriptor.
      delete wrapped.policy;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var entry = tools[descriptor.name] = {
        descriptor: wrapped,
        original: original,
        rule: rule || descriptor.policy,
        controller: controller
      };

      if (context && typeof context.registerTool === 'function') {
        var optionsForRegistration = Object.assign({}, registrationOptions || {});
        if (controller) optionsForRegistration.signal = controller.signal;
        return Promise.resolve().then(function () {
          return context.registerTool(wrapped, optionsForRegistration);
        }).then(function () {
          return { registered: true, name: descriptor.name };
        }).catch(function (error) {
          if (tools[descriptor.name] === entry) delete tools[descriptor.name];
          if (controller) controller.abort();
          throw error;
        });
      }
      return Promise.resolve({ registered: false, name: descriptor.name, reason: 'webmcp_unavailable' });
    }

    function invoke(name, args, executionOptions) {
      var item = tools[name];
      var cleanArgs = normaliseArgs(args);
      if (!item) {
        return Promise.resolve(record({
          tool: name, args: cleanArgs, decision: 'denied', execution: 'not_executed', reason: 'unknown_tool'
        })).then(function (receipt) { return { status: 'DENIED', receipt: receipt }; });
      }

      var decision = global.Doorman.policy.decide(item.rule, cleanArgs, session);
      if (decision.decision === 'denied') {
        return Promise.resolve(record({
          tool: name, args: cleanArgs, decision: 'denied', execution: 'not_executed', reason: decision.reason
        })).then(function (receipt) { return { status: 'DENIED', receipt: receipt }; });
      }

      return Promise.resolve().then(function () {
        return item.original(cleanArgs, session, executionOptions || {});
      }).then(function (result) {
        var receipt = record({
          tool: name, args: cleanArgs, decision: 'allowed', execution: 'executed',
          reason: decision.reason, result: result
        });
        return { status: 'ALLOWED', result: result, receipt: receipt };
      }).catch(function (error) {
        var receipt = record({
          tool: name,
          args: cleanArgs,
          decision: 'allowed',
          execution: 'execution_error',
          reason: 'execution_error',
          result: { error: error && error.message ? error.message : 'Tool execution failed.' }
        });
        return { status: 'ERROR', receipt: receipt };
      });
    }

    function toolNames() { return Object.keys(tools); }
    function receipts() { return ledger.list(); }

    function unregisterTool(name) {
      var item = tools[name];
      if (!item) return false;
      if (item.controller) item.controller.abort();
      delete tools[name];
      return true;
    }

    function setReceiptListener(listener) { receiptListener = listener; }

    return {
      registerTool: registerTool,
      invoke: invoke,
      unregisterTool: unregisterTool,
      setReceiptListener: setReceiptListener,
      toolNames: toolNames,
      receipts: receipts,
      ledger: ledger,
      session: session
    };
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.create = create;
})(typeof window !== 'undefined' ? window : globalThis);
