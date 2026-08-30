/* Slice 2 tests. Run with: node tests/doorman.test.js */
'use strict';

var assert = require('assert');
require('../src/policy.js');
require('../src/ledger.js');
require('../src/doorman.js');
require('../src/tools.js');

function makeDoorman() {
  var saved = [];
  var ledger = {
    record: function (receipt) {
      var entry = Object.assign({ number: saved.length + 1 }, receipt);
      saved.push(entry);
      return entry;
    },
    list: function () { return saved.slice(); }
  };
  return { doorman: global.Doorman.create({ ledger: ledger }), entries: saved };
}

async function run() {
  var setup = makeDoorman();
  var calls = 0;
  setup.doorman.registerTool({
    name: 'add_item',
    description: 'Add an item',
    inputSchema: { type: 'object' },
    execute: function (args) { calls++; return { text: args.text }; }
  }, global.Doorman.policy.allow);

  var allowed = await setup.doorman.invoke('add_item', { text: 'parcel' });
  assert.strictEqual(allowed.status, 'ALLOWED');
  assert.deepStrictEqual(allowed.result, { text: 'parcel' });
  assert.strictEqual(calls, 1);
  assert.strictEqual(setup.entries[0].decision, 'allowed');

  setup.doorman.registerTool({
    name: 'delete_item',
    execute: function () { calls++; return 'deleted'; }
  }, function () { return global.Doorman.policy.deny('human_approval_required'); });

  var denied = await setup.doorman.invoke('delete_item', { id: 'not-yours' });
  assert.strictEqual(denied.status, 'DENIED');
  assert.strictEqual(denied.receipt.reason, 'human_approval_required');
  assert.strictEqual(calls, 1, 'a denied tool must not execute');

  var unknown = await setup.doorman.invoke('export_data', {});
  assert.strictEqual(unknown.status, 'DENIED');
  assert.strictEqual(unknown.receipt.reason, 'unknown_tool');
  assert.deepStrictEqual(setup.doorman.toolNames(), ['add_item', 'delete_item']);
  assert.strictEqual(setup.entries.length, 3, 'allowed, denied, and unknown all leave receipts');

  var items = [
    { id: 'sample-1', text: 'sample', author: 'sample', sessionId: null },
    { id: 'human-1', text: 'human', author: 'you', sessionId: null },
    { id: 'other-1', text: 'other agent', author: 'agent', sessionId: 'other-session' }
  ];
  var fakeBoard = {
    AUTHORS: { SAMPLE: 'sample', HUMAN: 'you', AGENT: 'agent' },
    list: function (filter) { return filter ? items.filter(function (item) { return item.text.indexOf(filter) !== -1; }) : items.slice(); },
    get: function (id) { return items.find(function (item) { return item.id === id; }) || null; },
    add: function (text, author, metadata) {
      var item = { id: 'agent-1', text: text, author: author, sessionId: metadata.sessionId };
      items.push(item);
      return item;
    },
    update: function (id, text) {
      var item = this.get(id);
      item.text = text;
      return item;
    },
    remove: function (id) {
      var item = this.get(id);
      items = items.filter(function (candidate) { return candidate.id !== id; });
      return item;
    }
  };
  var registered = [];
  var runtimeReceipts = [];
  var runtime = global.Doorman.create({
    ledger: {
      record: function (value) { runtimeReceipts.push(value); return value; },
      list: function () { return runtimeReceipts.slice(); },
      clear: function () { runtimeReceipts.length = 0; }
    },
    session: { id: 'current-session' },
    modelContext: {
      registerTool: function (descriptor, options) {
        registered.push({ descriptor: descriptor, options: options });
        return Promise.resolve();
      }
    }
  });
  await global.Doorman.tools.initialise({ board: fakeBoard, doorman: runtime });
  assert.deepStrictEqual(registered.map(function (entry) { return entry.descriptor.name; }), [
    'list_items', 'add_item', 'update_item', 'request_approval'
  ]);
  assert.ok(registered.every(function (entry) { return entry.options.signal instanceof AbortSignal; }));
  var added = await runtime.invoke('add_item', { text: 'buy milk' });
  assert.strictEqual(added.status, 'ALLOWED');
  assert.strictEqual(fakeBoard.get('agent-1').sessionId, 'current-session');
  assert.strictEqual((await runtime.invoke('update_item', { id: 'agent-1', text: 'buy oat milk' })).status, 'ALLOWED');
  assert.strictEqual((await runtime.invoke('update_item', { id: 'human-1', text: 'changed' })).status, 'DENIED');
  assert.strictEqual((await runtime.invoke('update_item', { id: 'sample-1', text: 'changed' })).status, 'DENIED');
  assert.strictEqual((await runtime.invoke('update_item', { id: 'other-1', text: 'changed' })).status, 'DENIED');
  assert.strictEqual((await runtime.invoke('list_items', {})).status, 'ALLOWED');
  var webResult = await registered[1].descriptor.execute({ text: 'from webmcp callback' });
  assert.ok(webResult.content && webResult.content[0].text.indexOf('from webmcp callback') !== -1);

  var request = await runtime.invoke('request_approval', {
    action: 'delete_item', target: 'human-1', reason: 'The user asked me to remove it'
  });
  assert.strictEqual(request.status, 'ALLOWED');
  var approvalId = global.Doorman.toolsRuntime.getApproval().id;
  assert.strictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  assert.strictEqual(await global.Doorman.toolsRuntime.denyRequest(approvalId), true);
  assert.strictEqual(runtime.toolNames().indexOf('delete_item'), -1);

  await runtime.invoke('request_approval', { action: 'delete_item', target: 'human-1' });
  var approvedId = global.Doorman.toolsRuntime.getApproval().id;
  await global.Doorman.toolsRuntime.approveRequest(approvedId);
  assert.notStrictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  var activeGrantRequest = await runtime.invoke('request_approval', { action: 'delete_item', target: 'sample-1' });
  assert.strictEqual(activeGrantRequest.status, 'DENIED');
  assert.strictEqual(activeGrantRequest.receipt.reason, 'active_grant_exists');
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'sample-1' })).status, 'DENIED');
  assert.notStrictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'human-1' })).status, 'ALLOWED');
  assert.notStrictEqual(runtime.toolNames().indexOf('delete_item'), -1, 'tool remains until result escapes');
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  assert.strictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'human-1' })).status, 'DENIED');
  assert.strictEqual(registered[4].options.signal.aborted, true, 'consumed tool is removed by aborting its signal');
  assert.ok(runtimeReceipts.some(function (receipt) { return receipt.reason === 'target_not_approved'; }));
  assert.ok(runtimeReceipts.some(function (receipt) {
    return receipt.tool === 'delete_item' && receipt.execution === 'executed';
  }));
  await runtime.invoke('request_approval', { action: 'delete_item', target: 'sample-1' });
  await global.Doorman.toolsRuntime.approveRequest(global.Doorman.toolsRuntime.getApproval().id);
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'sample-1' })).status, 'ALLOWED');
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  assert.strictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  var selfApprove = await runtime.invoke('request_approval', {
    action: 'delete_item', target: 'missing-item', approved: true
  });
  assert.strictEqual(selfApprove.status, 'DENIED');
  assert.strictEqual(selfApprove.receipt.reason, 'invalid_approval_request');

  var declared = global.Doorman.tools.schemas();
  assert.strictEqual(declared.list_items.annotations.readOnlyHint, true);
  assert.strictEqual(declared.list_items.annotations.untrustedContentHint, true);
  assert.strictEqual(declared.add_item.inputSchema.properties.text.maxLength, 140);
  assert.strictEqual(declared.update_item.inputSchema.additionalProperties, false);

  var noWebmcpBoard = {
    AUTHORS: { SAMPLE: 'sample', HUMAN: 'you', AGENT: 'agent' },
    list: function () { return []; },
    get: function () { return null; },
    add: function (text, author, metadata) { return { text: text, author: author, sessionId: metadata.sessionId }; },
    update: function () { throw new Error('not used'); },
    remove: function () { throw new Error('not used'); }
  };
  var noWebmcpRegistrations = [];
  var noWebmcp = global.Doorman.create({
    ledger: { record: function (value) { return value; }, list: function () { return []; }, clear: function () {} },
    modelContext: null
  });
  var noWebmcpRuntime = await global.Doorman.tools.initialise({ board: noWebmcpBoard, doorman: noWebmcp });
  noWebmcpRuntime.registrations.forEach(function (registration) { noWebmcpRegistrations.push(registration); });
  assert.ok(noWebmcpRegistrations.every(function (registration) { return registration.registered === false; }));
  assert.deepStrictEqual(noWebmcp.toolNames(), ['list_items', 'add_item', 'update_item', 'request_approval']);

  var registrationFailure = global.Doorman.create({
    ledger: { record: function (value) { return value; }, list: function () { return []; } },
    modelContext: { registerTool: function () { throw new Error('tools permission denied'); } }
  });
  await assert.rejects(function () {
    return registrationFailure.registerTool({ name: 'blocked', execute: function () {} }, global.Doorman.policy.allow);
  }, /tools permission denied/);
  assert.deepStrictEqual(registrationFailure.toolNames(), [], 'failed registration rolls back internal state');

  assert.throws(function () {
    global.Doorman.create({ ledger: { record: function (x) { return x; }, list: function () { return []; } } })
      .registerTool({ name: 'unprotected', execute: function () {} });
  }, /explicit policy/);

  assert.strictEqual((await global.Doorman.create({ ledger: { record: function (x) { return x; }, list: function () { return []; } } }).invoke('no_policy', {})).status, 'DENIED');

  /* ---------------------------------------------------------------------
   * Audit fixes. Each of these failed before the change that follows it.
   * ------------------------------------------------------------------- */

  function boardWith(entries) {
    var rows = entries.slice();
    return {
      AUTHORS: { SAMPLE: 'sample', HUMAN: 'you', AGENT: 'agent' },
      list: function () { return rows.slice(); },
      get: function (id) { return rows.find(function (r) { return r.id === id; }) || null; },
      add: function (text, author, metadata) {
        var row = { id: 'added-' + rows.length, text: text, author: author, sessionId: metadata && metadata.sessionId };
        rows.push(row);
        return row;
      },
      update: function (id, text) { var r = this.get(id); r.text = text; return r; },
      remove: function (id) { var r = this.get(id); rows = rows.filter(function (c) { return c.id !== id; }); return r; }
    };
  }

  function runtimeOn(board, registerImpl) {
    var receipts = [];
    var core = global.Doorman.create({
      ledger: {
        record: function (v) { receipts.push(v); return v; },
        list: function () { return receipts.slice(); },
        clear: function () { receipts.length = 0; }
      },
      session: { id: 'audit-session' },
      modelContext: { registerTool: registerImpl || function () { return Promise.resolve(); } }
    });
    return { core: core, receipts: receipts, board: board };
  }

  // 1. A pending human decision must not be replaceable by the agent.
  //    Before the fix the second request was ALLOWED and quietly retargeted
  //    the card the human was already looking at.
  var supersede = runtimeOn(boardWith([
    { id: 'alpha', text: 'ITEM ALPHA', author: 'you', sessionId: null },
    { id: 'beta', text: 'ITEM BETA', author: 'you', sessionId: null }
  ]));
  await global.Doorman.tools.initialise({ board: supersede.board, doorman: supersede.core });
  var firstRequest = await supersede.core.invoke('request_approval', { action: 'delete_item', target: 'alpha' });
  assert.strictEqual(firstRequest.status, 'ALLOWED');
  var pendingBefore = global.Doorman.toolsRuntime.getApproval();
  var secondRequest = await supersede.core.invoke('request_approval', { action: 'delete_item', target: 'beta' });
  assert.strictEqual(secondRequest.status, 'DENIED', 'a pending decision may not be superseded');
  assert.strictEqual(secondRequest.receipt.reason, 'pending_request_exists');
  var pendingAfter = global.Doorman.toolsRuntime.getApproval();
  assert.strictEqual(pendingAfter.id, pendingBefore.id, 'the pending approval is unchanged');
  assert.strictEqual(pendingAfter.target, 'alpha', 'the human still decides on the item they were shown');

  // 2. Every tool states its nature in the protocol's own vocabulary, and the
  //    one destructive tool says so.
  var schemas = global.Doorman.tools.schemas();
  Object.keys(schemas).forEach(function (name) {
    assert.ok(schemas[name].annotations, name + ' must carry annotations');
    assert.strictEqual(typeof schemas[name].annotations.readOnlyHint, 'boolean', name + ' must declare readOnlyHint');
    assert.strictEqual(typeof schemas[name].annotations.destructiveHint, 'boolean', name + ' must declare destructiveHint');
  });
  assert.strictEqual(schemas.delete_item.annotations.destructiveHint, true, 'delete_item is destructive');
  assert.strictEqual(schemas.list_items.annotations.readOnlyHint, true, 'list_items reads only');
  assert.strictEqual(schemas.add_item.annotations.destructiveHint, false, 'add_item is not destructive');
  assert.strictEqual(schemas.request_approval.annotations.destructiveHint, false, 'asking is not destructive');

  // 3. A grant that the browser refused to register must not be recorded as
  //    one the human successfully gave.
  var refused = runtimeOn(boardWith([
    { id: 'target', text: 'TARGET', author: 'you', sessionId: null }
  ]), function (descriptor) {
    if (descriptor.name === 'delete_item') return Promise.reject(new Error('tools permission denied'));
    return Promise.resolve();
  });
  await global.Doorman.tools.initialise({ board: refused.board, doorman: refused.core });
  await refused.core.invoke('request_approval', { action: 'delete_item', target: 'target' });
  var refusedId = global.Doorman.toolsRuntime.getApproval().id;
  var granted = await global.Doorman.toolsRuntime.approveRequest(refusedId);
  assert.strictEqual(granted, false, 'approveRequest reports that no grant was issued');
  assert.strictEqual(refused.core.toolNames().indexOf('delete_item'), -1, 'the tool never reached the surface');
  assert.notStrictEqual(global.Doorman.toolsRuntime.getApproval().status, 'approved',
    'a refused registration must not leave an approved-looking grant');
  assert.ok(!refused.receipts.some(function (r) { return r.reason === 'human_approved_once'; }),
    'no receipt may claim the human granted a use that never existed');
  assert.ok(refused.receipts.some(function (r) { return r.reason === 'grant_registration_failed'; }),
    'the refusal itself leaves a receipt');
  assert.strictEqual((await refused.core.invoke('delete_item', { id: 'target' })).status, 'DENIED');

  // 4. A one-shot grant is atomic at the decision, not the handler. Two
  //    concurrent invocations of the same approved target must not both be
  //    authorized: exactly one ALLOWED + executed, one DENIED + not_executed.
  var atomic = runtimeOn(boardWith([
    { id: 'one', text: 'ONLY ONE', author: 'you', sessionId: null }
  ]));
  await global.Doorman.tools.initialise({ board: atomic.board, doorman: atomic.core });
  await atomic.core.invoke('request_approval', { action: 'delete_item', target: 'one' });
  await global.Doorman.toolsRuntime.approveRequest(global.Doorman.toolsRuntime.getApproval().id);
  var concurrent = await Promise.all([
    atomic.core.invoke('delete_item', { id: 'one' }),
    atomic.core.invoke('delete_item', { id: 'one' })
  ]);
  var wins = concurrent.filter(function (r) { return r.status === 'ALLOWED'; });
  var loses = concurrent.filter(function (r) { return r.status === 'DENIED'; });
  assert.strictEqual(wins.length, 1, 'exactly one concurrent delete is authorized');
  assert.strictEqual(loses.length, 1, 'exactly one concurrent delete is denied');
  assert.strictEqual(wins[0].receipt.execution, 'executed');
  assert.strictEqual(loses[0].receipt.execution, 'not_executed');
  assert.strictEqual(loses[0].receipt.reason, 'human_approval_required');
  var executedDeletes = atomic.receipts.filter(function (r) {
    return r.tool === 'delete_item' && r.execution === 'executed';
  });
  assert.strictEqual(executedDeletes.length, 1, 'the board is mutated exactly once');

  console.log('slice 3: 3 always-on tools and ownership policy passed');
  console.log('slice 4: human approval and one-shot delete passed');
  console.log('slice 5: no-WebMCP initialization path passed');
  console.log('registration failures: surfaced as a handled rejection');
  console.log('audit 1: a pending human decision cannot be superseded');
  console.log('audit 2: every tool declares its nature in annotations');
  console.log('audit 3: a refused registration issues no grant');
  console.log('audit 4: a one-shot grant is atomic under concurrent invoke');
}

run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
