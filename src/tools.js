/* tools.js — board tools and the human approval flow. */
(function (global) {
  'use strict';

  function textResult(value) {
    return { content: [{ type: 'text', text: JSON.stringify(value) }] };
  }

  function schemas() {
    return {
      list_items: {
        name: 'list_items',
        description: 'Read the current items on the shared board. This never changes the board.',
        inputSchema: {
          type: 'object',
          properties: { filter: { type: 'string', maxLength: 140, description: 'Optional text to search for.' } },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true, destructiveHint: false, idempotentHint: true,
          openWorldHint: false, untrustedContentHint: true
        }
      },
      add_item: {
        name: 'add_item',
        description: 'Add a new item to the shared board.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', minLength: 1, maxLength: 140, description: 'The item text, up to 140 characters.' } },
          additionalProperties: false,
          required: ['text']
        },
        annotations: {
          readOnlyHint: false, destructiveHint: false, idempotentHint: false,
          openWorldHint: false, untrustedContentHint: true
        }
      },
      update_item: {
        name: 'update_item',
        description: 'Update an item created by you during this browser session.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The item id.' },
            text: { type: 'string', minLength: 1, maxLength: 140, description: 'The replacement text, up to 140 characters.' }
          },
          additionalProperties: false,
          required: ['id', 'text']
        },
        // Replacing the same text with the same text lands on the same state.
        annotations: {
          readOnlyHint: false, destructiveHint: false, idempotentHint: true,
          openWorldHint: false, untrustedContentHint: true
        }
      },
      request_approval: {
        name: 'request_approval',
        description: 'Ask the human to approve deleting one specific board item. This never approves or deletes anything.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['delete_item'], description: 'The sensitive action requested.' },
            target: { type: 'string', description: 'The id of the one item to delete.' },
            reason: { type: 'string', maxLength: 280, description: 'Why the agent wants this action.' }
          },
          additionalProperties: false,
          required: ['action', 'target']
        },
        // Asking changes nothing on the board, but it does raise a request, so
        // it is neither read-only nor repeatable without effect.
        annotations: {
          readOnlyHint: false, destructiveHint: false, idempotentHint: false,
          openWorldHint: false
        }
      },
      delete_item: {
        name: 'delete_item',
        description: 'Delete the single item approved by the human. Available only for one approved use.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'The approved item id.' } },
          additionalProperties: false,
          required: ['id']
        },
        // The one destructive tool on the page says so in the protocol's own
        // vocabulary, not only in the page's wording.
        annotations: {
          readOnlyHint: false, destructiveHint: true, idempotentHint: false,
          openWorldHint: false, untrustedContentHint: true
        }
      }
    };
  }

  function initialise(options) {
    options = options || {};
    var board = options.board || global.Doorman.board;
    var doorman = options.doorman || global.Doorman.create({
      modelContext: options.modelContext || null,
      session: options.session
    });
    var ledger = doorman.ledger;
    var definitions = schemas();
    var approval = null;
    var requestNumber = 1;

    function refresh() {
      if (global.Doorman.ui && global.Doorman.ui.render) global.Doorman.ui.render();
      if (global.Doorman.ui && global.Doorman.ui.setActivity) global.Doorman.ui.setActivity(doorman.receipts());
      if (global.Doorman.ui && global.Doorman.ui.setApproval) global.Doorman.ui.setApproval(approval);
      if (global.Doorman.ui && global.Doorman.ui.setCapabilities) {
        global.Doorman.ui.setCapabilities(doorman.toolNames(), !!options.modelContext);
      }
    }

    function ownItem(args, currentSession) {
      var item = board.get(args.id);
      return item && item.author === board.AUTHORS.AGENT && item.sessionId === currentSession.id;
    }

    doorman.setReceiptListener(refresh);

    function registerDelete() {
      if (doorman.toolNames().indexOf('delete_item') !== -1) return Promise.resolve(false);
      return doorman.registerTool(definitions.delete_item, function (args) {
        if (!approval || approval.status !== 'approved') {
          return global.Doorman.policy.deny('human_approval_required');
        }
        if (args.id !== approval.target) {
          return global.Doorman.policy.deny('target_not_approved');
        }
        /* One-shot atomicity lives HERE, not in the handler. Two concurrent
         * invocations both read the decision before either handler runs; only
         * consuming at the decision lets the second one see the grant is gone.
         * Invoke runs each decision synchronously, so the second of two
         * back-to-back calls already sees `consumed` and is denied. Consuming
         * before execution is also fail-closed: a grant whose use errors is
         * still spent. */
        approval.status = 'consumed';
        return global.Doorman.policy.allow('approved_one_shot_target');
      });
    }

    definitions.list_items.execute = function (args) {
      return textResult({ items: board.list(args.filter) });
    };
    definitions.add_item.execute = function (args, currentSession) {
      var item = board.add(args.text, board.AUTHORS.AGENT, { sessionId: currentSession.id });
      refresh();
      return textResult({ item: item });
    };
    definitions.update_item.execute = function (args, currentSession) {
      var item = board.update(args.id, args.text);
      refresh();
      return textResult({ item: item });
    };
    definitions.request_approval.execute = function (args) {
      if (args.action !== 'delete_item' || !args.target || args.approved === true) {
        throw new Error('Only a human can approve a delete request.');
      }
      if (!board.get(args.target)) throw new Error('No item with id ' + args.target + '.');
      approval = {
        id: 'approval_' + requestNumber++,
        action: 'delete_item',
        target: args.target,
        reason: String(args.reason || 'No reason provided.'),
        requestedAt: new Date().toISOString(),
        status: 'pending'
      };
      refresh();
      return textResult({ approval: approval, status: 'pending_human_decision' });
    };
    definitions.delete_item.execute = function (args) {
      // The grant was already consumed at the decision. This handler only
      // removes the item and defers unregistration until the result has
      // escaped, because older Chrome can cancel an in-flight call when its
      // registration signal is aborted.
      var removed;
      try {
        removed = board.remove(args.id);
      } finally {
        setTimeout(function () {
          doorman.unregisterTool('delete_item');
          refresh();
        }, 0);
        refresh();
      }
      return textResult({ item: removed, approval: 'consumed' });
    };

    var registrations = [
      /* These two are allowed unconditionally, so their rule is a wrapper that
       * emits a fixed reason. Passing `policy.allow` straight through would put
       * the invocation args in the `reason` parameter and leave a dirty
       * object in every receipt. */
      doorman.registerTool(definitions.list_items, function () {
        return global.Doorman.policy.allow('always_allowed');
      }),
      doorman.registerTool(definitions.add_item, function () {
        return global.Doorman.policy.allow('always_allowed');
      }),
      doorman.registerTool(definitions.update_item, function (args, currentSession) {
        return ownItem(args, currentSession)
          ? global.Doorman.policy.allow('owned_by_agent_session')
          : global.Doorman.policy.deny('not_owned_by_agent_session');
      }),
      doorman.registerTool(definitions.request_approval, function (args) {
        if (approval && approval.status === 'approved') {
          return global.Doorman.policy.deny('active_grant_exists');
        }
        /* A decision already in front of a human belongs to that human until
         * they answer it. Allowing a second request here let an agent retarget
         * the card mid-click, so the button the person pressed would have
         * approved an item they were never shown. */
        if (approval && approval.status === 'pending') {
          return global.Doorman.policy.deny('pending_request_exists');
        }
        if (args.approved === true || args.action !== 'delete_item' || !args.target || !board.get(args.target)) {
          return global.Doorman.policy.deny('invalid_approval_request');
        }
        return global.Doorman.policy.allow('approval_requested');
      })
    ];

    /* The grant is only real once the browser has accepted the tool, so the
     * registration is attempted first. Recording the approval before that let
     * a refused registration leave a receipt claiming a human granted a use
     * that never reached the agent surface. */
    function approveRequest(id) {
      if (!approval || approval.id !== id || approval.status !== 'pending') return false;
      var granted = approval;
      return registerDelete().then(function () {
        granted.status = 'approved';
        ledger.record({
          tool: 'request_approval', args: { approvalId: granted.id, target: granted.target },
          decision: 'allowed', execution: 'executed', reason: 'human_approved_once'
        });
        refresh();
        return true;
      }).catch(function (error) {
        granted.status = 'registration_failed';
        ledger.record({
          tool: 'request_approval', args: { approvalId: granted.id, target: granted.target },
          decision: 'allowed', execution: 'not_executed', reason: 'grant_registration_failed',
          result: { error: error && error.message ? error.message : 'The browser refused the registration.' }
        });
        refresh();
        return false;
      });
    }

    function denyRequest(id) {
      if (!approval || approval.id !== id || approval.status !== 'pending') return false;
      approval.status = 'denied';
      ledger.record({
        tool: 'request_approval', args: { approvalId: approval.id, target: approval.target },
        decision: 'denied', execution: 'not_executed', reason: 'human_denied'
      });
      refresh();
      return true;
    }

    function resetDemo() {
      if (doorman.toolNames().indexOf('delete_item') !== -1) doorman.unregisterTool('delete_item');
      approval = null;
      requestNumber = 1;
      ledger.clear();
      refresh();
    }

    return Promise.all(registrations).then(function (results) {
      refresh();
      var runtime = {
        doorman: doorman,
        registrations: results,
        tools: definitions,
        approveRequest: approveRequest,
        denyRequest: denyRequest,
        resetDemo: resetDemo,
        getApproval: function () { return approval; }
      };
      global.Doorman.toolsRuntime = runtime;
      return runtime;
    });
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.tools = { schemas: schemas, initialise: initialise };
})(typeof window !== 'undefined' ? window : globalThis);
