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
        annotations: {
          readOnlyHint: false, destructiveHint: true, idempotentHint: false,
          openWorldHint: false, untrustedContentHint: true
        }
      },
      interaction_assess: {
        name: 'interaction_assess',
        description: 'Assess a model response for relational drift. MUTATES derived drift state and appends a receipt, so it is neither read-only nor idempotent.',
        inputSchema: {
          type: 'object',
          properties: {
            user_message: { type: 'string', description: 'The user message that prompted the response.' },
            model_response: { type: 'string', description: 'The model response to assess.' }
          },
          additionalProperties: false,
          required: ['user_message', 'model_response']
        },
        annotations: {
          readOnlyHint: false, destructiveHint: false, idempotentHint: false,
          openWorldHint: false, untrustedContentHint: true
        }
      },
      interaction_state: {
        name: 'interaction_state',
        description: 'Read the current derived interaction drift state. No raw transcript is stored.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
          readOnlyHint: true, destructiveHint: false, idempotentHint: true,
          openWorldHint: false
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
    var interactionGate = global.Doorman.interaction
      ? global.Doorman.interaction.create({ baselineRole: 'technical_collaborator' })
      : null;
    var interactionLedger = [];

    // Privacy boundary for receipts: replace any raw matched span with a
    // stable short hash so the ledger carries no verbatim personal text.
    function hashText(text) {
      if (typeof text !== 'string') return text;
      var h = 2166136261;
      for (var i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      return 'h' + h.toString(36);
    }

    function sanitizedFeatures(features) {
      var out = {};
      Object.keys(features).forEach(function (k) {
        if (k === 'evidence_spans') {
          out[k] = {};
          Object.keys(features[k] || {}).forEach(function (f) {
            out[k][f] = (features[k][f] || []).map(hashText);
          });
        } else {
          out[k] = features[k];
        }
      });
      return out;
    }

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

    // Interaction gate tool handlers
    if (interactionGate) {
      definitions.interaction_assess.execute = function (args) {
        var result = interactionGate.assessAndRewrite({
          userMessage: args.user_message || '',
          modelResponse: args.model_response || '',
          turnIndex: interactionLedger.length + 1
        });
        var assessment = result.assessment;
        var receipt = {
          kind: 'interaction',
          decision: assessment.decision,
          features: sanitizedFeatures(assessment.features),
          drift_score: assessment.driftScore,
          baseline_role: assessment.baselineRole,
          current_role: assessment.currentRole,
          turn_index: assessment.turnIndex,
          rewrite_applied: assessment.decision === 'REWRITE' || assessment.decision === 'ROLE_RESET' || assessment.decision === 'BLOCK',
          timestamp: assessment.timestamp
        };
        interactionLedger.push(receipt);
        refresh();
        return textResult({
          decision: assessment.decision,
          features: assessment.features,
          drift_score: assessment.driftScore,
          relational_intensity: assessment.relationalIntensity,
          current_role: assessment.currentRole,
          confidence: assessment.confidence,
          rewritten: result.rewritten !== args.model_response ? result.rewritten : undefined,
          reasons: Object.keys(assessment.features).filter(function (k) {
            return k !== 'evidence_spans' && assessment.features[k] === 'DETECTED';
          })
        });
      };

      definitions.interaction_state.execute = function () {
        return textResult(interactionGate.getState());
      };
    }

    var registrations = [
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
        if (approval && approval.status === 'pending') {
          return global.Doorman.policy.deny('pending_request_exists');
        }
        if (args.approved === true || args.action !== 'delete_item' || !args.target || !board.get(args.target)) {
          return global.Doorman.policy.deny('invalid_approval_request');
        }
        return global.Doorman.policy.allow('approval_requested');
      })
    ];

    // Register interaction tools if gate is available. interaction_reset is NOT
    // exposed to the agent: a subject must not be able to clear the record that
    // is tracking it. It exists only as a human action in the UI.
    if (interactionGate) {
      registrations.push(
        doorman.registerTool(definitions.interaction_assess, function () {
          return global.Doorman.policy.allow('always_allowed');
        }),
        doorman.registerTool(definitions.interaction_state, function () {
          return global.Doorman.policy.allow('always_allowed');
        })
      );
    }

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
        getApproval: function () { return approval; },
        interactionGate: interactionGate,
        interactionLedger: interactionLedger
      };
      global.Doorman.toolsRuntime = runtime;
      return runtime;
    });
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.tools = { schemas: schemas, initialise: initialise };
})(typeof window !== 'undefined' ? window : globalThis);
