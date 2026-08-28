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
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'sample-1' })).status, 'DENIED');
  assert.notStrictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'human-1' })).status, 'ALLOWED');
  assert.strictEqual(runtime.toolNames().indexOf('delete_item'), -1);
  assert.strictEqual((await runtime.invoke('delete_item', { id: 'human-1' })).status, 'DENIED');
  assert.strictEqual(registered[4].options.signal.aborted, true, 'consumed tool is removed by aborting its signal');
  assert.ok(runtimeReceipts.some(function (receipt) { return receipt.reason === 'target_not_approved'; }));
  assert.ok(runtimeReceipts.some(function (receipt) {
    return receipt.tool === 'delete_item' && receipt.execution === 'executed';
  }));
  var selfApprove = await runtime.invoke('request_approval', {
    action: 'delete_item', target: 'missing-item', approved: true
  });
  assert.strictEqual(selfApprove.status, 'DENIED');
  assert.strictEqual(selfApprove.receipt.reason, 'invalid_approval_request');

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

  console.log('slice 3: 3 always-on tools and ownership policy passed');
  console.log('slice 4: human approval and one-shot delete passed');
  console.log('slice 5: no-WebMCP initialization path passed');
}

run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
