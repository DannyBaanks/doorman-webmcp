/*
 * ui.js — renders the board, the agent surface, and the receipt log for a
 * human. No agent involved anywhere in this file, and no authority decision
 * is made here: this module only describes decisions other modules made.
 *
 * User text never goes near innerHTML. Every node is built with createElement
 * and textContent, so a list entry can never become markup.
 */
(function (global, document) {
  'use strict';

  var board = global.Doorman.board;
  var els = {};
  var pendingDelete = null; // id awaiting a second click; no browser dialogs here

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function timeOf(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function sep() {
    return el('span', 'sep', '·');
  }

  /* Anything that is not already a string is serialised before it reaches
   * textContent, so a stale or malformed receipt can never render as
   * "[object Object]". */
  function asText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (err) { return String(value); }
  }

  function quote(text) {
    return '“' + text + '”';
  }

  var AUTHOR_LABELS = {
    sample: 'Sample',
    you: 'Human-created',
    agent: 'Agent-created'
  };

  /* A receipt and an approval both outlive the item they refer to: once a
   * delete executes, the board can no longer name the target. Item text seen
   * during a render is remembered so those surfaces can still say what was
   * deleted instead of falling back to a bare id. Display only. */
  var itemLabels = {};

  function rememberItem(item) {
    if (item && item.id && typeof item.text === 'string') itemLabels[item.id] = item.text;
  }

  function labelFor(id) {
    var item = board.get && board.get(id);
    if (item && typeof item.text === 'string') {
      rememberItem(item);
      return quote(item.text);
    }
    return itemLabels[id] ? quote(itemLabels[id]) : null;
  }

  // ---------------------------------------------------------------- board

  function renderItem(item) {
    var row = el('li', 'item');
    row.dataset.id = item.id;

    var main = el('div', 'item-main');
    main.appendChild(el('span', 'item-text', item.text));

    var meta = el('div', 'item-meta');
    var authorClass = 'item-author' + (item.author === board.AUTHORS.AGENT ? ' is-agent' : '');
    meta.appendChild(el('span', authorClass, AUTHOR_LABELS[item.author] || item.author));
    meta.appendChild(sep());
    meta.appendChild(el('span', 'time', timeOf(item.createdAt)));
    main.appendChild(meta);
    row.appendChild(main);

    var actions = el('div', 'item-actions');
    if (pendingDelete === item.id) {
      actions.appendChild(el('span', 'confirm-label', 'Delete?'));
      var yes = el('button', 'btn btn-danger', 'Yes');
      yes.type = 'button';
      yes.dataset.action = 'delete-confirm';
      var no = el('button', 'btn', 'No');
      no.type = 'button';
      no.dataset.action = 'delete-cancel';
      actions.appendChild(yes);
      actions.appendChild(no);
    } else {
      var edit = el('button', 'btn', 'Edit');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      var del = el('button', 'btn', 'Delete');
      del.type = 'button';
      del.dataset.action = 'delete';
      actions.appendChild(edit);
      actions.appendChild(del);
    }
    row.appendChild(actions);
    return row;
  }

  function renderEditRow(item) {
    var row = el('li', 'item editing');
    row.dataset.id = item.id;

    var input = el('input', 'edit-input');
    input.type = 'text';
    input.value = item.text;
    input.maxLength = 140;
    input.setAttribute('aria-label', 'Edit item text');
    row.appendChild(input);

    var actions = el('div', 'item-actions');
    var save = el('button', 'btn btn-primary', 'Save');
    save.type = 'button';
    save.dataset.action = 'save';
    var cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.dataset.action = 'cancel';
    actions.appendChild(save);
    actions.appendChild(cancel);
    row.appendChild(actions);
    return row;
  }

  var editingId = null;

  function render() {
    var items = board.list();
    els.list.textContent = '';

    if (!items.length) {
      els.list.appendChild(el('li', 'empty', 'The board is empty. Add something above.'));
    } else {
      items.forEach(function (item) {
        rememberItem(item);
        els.list.appendChild(item.id === editingId ? renderEditRow(item) : renderItem(item));
      });
    }
    els.count.textContent = items.length === 1 ? '1 item' : items.length + ' items';
  }

  function flash(message, isError) {
    els.message.textContent = message || '';
    els.message.className = 'message' + (isError ? ' error' : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    try {
      board.add(els.input.value, board.AUTHORS.HUMAN);
      els.input.value = '';
      flash('');
      editingId = null;
      pendingDelete = null;
      render();
    } catch (err) {
      flash(err.message, true);
    }
    els.input.focus();
  }

  function onListClick(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;
    var row = button.closest('[data-id]');
    if (!row) return;
    var id = row.dataset.id;
    var action = button.dataset.action;

    try {
      if (action === 'edit') {
        editingId = id;
        pendingDelete = null;
      } else if (action === 'cancel') {
        editingId = null;
      } else if (action === 'save') {
        board.update(id, row.querySelector('.edit-input').value);
        editingId = null;
      } else if (action === 'delete') {
        pendingDelete = id;
        editingId = null;
      } else if (action === 'delete-cancel') {
        pendingDelete = null;
      } else if (action === 'delete-confirm') {
        board.remove(id);
        pendingDelete = null;
      }
      flash('');
      render();
      if (editingId) {
        var input = els.list.querySelector('.edit-input');
        if (input) { input.focus(); input.select(); }
      }
    } catch (err) {
      flash(err.message, true);
      render();
    }
  }

  function onReset() {
    itemLabels = {};
    board.reset();
    if (global.Doorman.toolsRuntime && global.Doorman.toolsRuntime.resetDemo) {
      global.Doorman.toolsRuntime.resetDemo();
    }
    editingId = null;
    pendingDelete = null;
    flash('Board reset to its sample items.');
    render();
  }

  // ------------------------------------------------------------ authority

  /* Each tool's state is spelled out in words as well as colour, so the row
   * still reads correctly to someone who cannot see the indicator. */
  function capabilityState(name, available, webmcpAvailable) {
    if (!available) return { words: ['Unavailable'], tone: 'withheld' };
    var reach = webmcpAvailable ? 'Available' : 'Local only';
    if (name === 'update_item') return { words: [reach, 'Conditional'], tone: 'conditional' };
    if (name === 'delete_item') return { words: [reach, 'Granted once'], tone: 'granted' };
    return { words: [reach, 'Allowed'], tone: 'allowed' };
  }

  // null until the first paint, so nothing animates when the page loads.
  var previousSurface = null;

  function setCapabilities(names, webmcpAvailable) {
    var panel = document.getElementById('capabilities');
    if (!panel) return;
    var heading = panel.querySelector('.panel-title');
    var oldCount = heading && heading.querySelector('.count');
    if (oldCount) oldCount.remove();
    var old = panel.querySelector('.capability-list');
    if (old) old.remove();

    var list = el('ul', 'capability-list');
    var allNames = ['list_items', 'add_item', 'update_item', 'request_approval', 'delete_item'];

    allNames.forEach(function (name) {
      var available = names.indexOf(name) !== -1;
      var state = capabilityState(name, available, webmcpAvailable);
      var className = 'capability-row is-' + state.tone;

      /* A capability that changed presence since the previous paint is the
       * one moment this page exists to make visible. It is marked so the CSS
       * can show it arriving or leaving, and the change is also stated in
       * words for anyone not watching the colour. */
      var transition = null;
      if (previousSurface) {
        var wasThere = previousSurface.indexOf(name) !== -1;
        if (available && !wasThere) { className += ' just-granted'; transition = 'granted for one use'; }
        if (!available && wasThere) { className += ' just-consumed'; transition = 'grant consumed'; }
      }

      var row = el('li', className);
      row.appendChild(el('code', 'capability-name', name));

      var stateEl = el('span', 'capability-state');
      state.words.forEach(function (word, index) {
        if (index) stateEl.appendChild(sep());
        stateEl.appendChild(el('span', null, word));
      });
      if (transition) {
        stateEl.appendChild(sep());
        stateEl.appendChild(el('span', 'capability-flash', transition));
      }
      row.appendChild(stateEl);
      list.appendChild(row);
    });

    panel.appendChild(list);
    previousSurface = names.slice();
    if (heading) {
      heading.appendChild(el('span', 'count', names.length + (webmcpAvailable ? ' registered' : ' local')));
    }
  }

  // -------------------------------------------------------------- receipts

  /* Tool results arrive wrapped as {content:[{type:'text', text:'<json>'}]}.
   * The envelope is protocol noise; a person reading a receipt wants the
   * payload. Unwrapping happens for display only — the ledger keeps the raw
   * value untouched. */
  function unwrapContent(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.content)) return value;
    for (var i = 0; i < value.content.length; i += 1) {
      var part = value.content[i];
      if (part && part.type === 'text' && typeof part.text === 'string') return part.text;
    }
    return value;
  }

  function parsedResult(value) {
    var inner = unwrapContent(value);
    if (typeof inner !== 'string') return inner;
    try { return JSON.parse(inner); } catch (err) { return null; }
  }

  function formatPayload(value) {
    var inner = unwrapContent(value);
    if (typeof inner === 'string') {
      try { return JSON.stringify(JSON.parse(inner), null, 2); } catch (err) { return inner; }
    }
    try { return JSON.stringify(inner, null, 2); } catch (err) { return String(inner); }
  }

  /* An item referenced by a receipt may already be gone from the board — a
   * delete receipt is exactly that case — so the deleted item is recovered
   * from the receipt's own result before falling back to the bare id. */
  function subjectFor(id, receipt) {
    if (!id) return '';
    var known = labelFor(id);
    if (known) return known;
    var result = receipt && parsedResult(receipt.result);
    if (result && result.item && typeof result.item.text === 'string') return quote(result.item.text);
    return id;
  }

  /* One receipt, one sentence. The vocabulary here mirrors the reasons that
   * policy.js and tools.js actually emit; an unrecognised reason falls back
   * to the raw tool name rather than inventing a story. */
  var DENIAL_NOTES = {
    not_owned_by_agent_session: 'not created by this agent session',
    active_grant_exists: 'a grant is already active',
    invalid_approval_request: 'the request was not a valid deletion request',
    human_approval_required: 'no human approval',
    target_not_approved: 'a different item was approved',
    human_denied: 'the human declined',
    unknown_tool: 'the tool is not registered',
    no_policy: 'no policy covers this tool',
    execution_error: 'the tool failed while running'
  };

  function describe(receipt) {
    var args = receipt.args || {};
    var denied = receipt.decision === 'denied';
    var out = { title: '', subject: '', note: null };

    if (receipt.tool === 'list_items') {
      out.title = denied ? 'Agent attempted to read the board' : 'Agent read the board';
    } else if (receipt.tool === 'add_item') {
      out.title = denied ? 'Agent attempted to add an item' : 'Agent added an item';
      if (args.text) out.subject = quote(asText(args.text));
    } else if (receipt.tool === 'update_item') {
      out.title = denied ? 'Agent attempted to update an item' : 'Agent updated an item';
      /* Always name the target, never the attempted replacement text: on a
       * denial the replacement was never applied, and showing it reads as if
       * an item by that name existed. An allowed update already resolves to
       * the new text through the board. */
      out.subject = subjectFor(args.id, receipt);
    } else if (receipt.tool === 'request_approval') {
      if (receipt.reason === 'human_approved_once') {
        out.title = 'Human granted one use';
        out.subject = 'delete_item, for ' + subjectFor(args.target, receipt);
        out.note = 'valid for that item only';
      } else if (receipt.reason === 'human_denied') {
        out.title = 'Human denied the request';
        out.subject = 'delete_item, for ' + subjectFor(args.target, receipt);
      } else {
        out.title = denied ? 'Agent attempted to request approval' : 'Agent requested approval';
        out.subject = 'Delete ' + subjectFor(args.target, receipt);
        if (!denied) out.note = 'pending human decision';
      }
    } else if (receipt.tool === 'delete_item') {
      out.title = denied ? 'Agent attempted to delete an item' : 'Agent deleted an item';
      out.subject = subjectFor(args.id, receipt);
      if (!denied) out.note = 'grant consumed';
    } else {
      out.title = 'Agent called ' + asText(receipt.tool);
    }

    if (denied) out.note = DENIAL_NOTES[receipt.reason] || asText(receipt.reason) || null;
    return out;
  }

  function payloadBlock(parent, label, value) {
    parent.appendChild(el('span', 'payload-label', label));
    parent.appendChild(el('pre', 'receipt-payload', formatPayload(value)));
  }

  function setActivity(receipts) {
    var list = document.getElementById('activity-list');
    if (!list) return;
    list.textContent = '';
    if (!receipts.length) {
      list.appendChild(el('li', 'empty', 'Nothing has been decided yet.'));
      return;
    }

    receipts.forEach(function (receipt) {
      var described = describe(receipt);
      var row = el('li', 'receipt');

      row.appendChild(el('span', 'receipt-title', described.title));
      row.appendChild(el('span', 'receipt-time', timeOf(receipt.timestamp)));
      if (described.subject) {
        row.appendChild(el('span', 'receipt-subject', described.subject));
      }

      /* The decision and its execution are two separate facts, and keeping
       * them apart is the whole point of the page. They are never run
       * together into one string. */
      var verdict = el('div', 'receipt-verdict');
      var decisionWord = receipt.decision === 'denied' ? 'Denied' : 'Allowed';
      verdict.appendChild(el('span', 'badge is-' + (receipt.decision === 'denied' ? 'deny' : 'allow'), decisionWord));
      if (described.note) {
        verdict.appendChild(sep());
        verdict.appendChild(el('span', null, described.note));
      }
      if (receipt.execution === 'not_executed') {
        verdict.appendChild(sep());
        verdict.appendChild(el('span', null, 'not executed'));
      }
      row.appendChild(verdict);

      var hasArgs = receipt.args && Object.keys(receipt.args).length;
      var hasResult = Object.prototype.hasOwnProperty.call(receipt, 'result') && receipt.result;
      if (hasArgs || hasResult) {
        var raw = el('details', 'receipt-raw');
        raw.appendChild(el('summary', null, 'View details'));
        if (hasArgs) payloadBlock(raw, 'arguments', receipt.args);
        if (hasResult) payloadBlock(raw, 'result', receipt.result);
        row.appendChild(raw);
      }

      list.appendChild(row);
    });
  }

  // -------------------------------------------------------------- approval

  /* Four states, all of them dry: a request waiting on a person, a grant that
   * exists, a grant that has been spent, and a refusal. Nothing here claims
   * the grant is enforced by anything stronger than this page. */
  var APPROVAL_COPY = {
    pending: {
      heading: 'Approval requested',
      body: 'The agent does not currently have this capability.'
    },
    approved: {
      heading: 'Granted for one use',
      body: 'delete_item is temporarily available, for this item only.'
    },
    consumed: {
      heading: 'Grant consumed',
      body: 'delete_item is unavailable again.'
    },
    denied: {
      heading: 'Request denied',
      body: 'delete_item was not granted.'
    }
  };

  function setApproval(approval) {
    var panel = document.getElementById('approval');
    if (!panel) return;
    panel.textContent = '';
    if (!approval) {
      panel.hidden = true;
      panel.className = 'panel approval';
      return;
    }

    var status = APPROVAL_COPY[approval.status] ? approval.status : 'pending';
    var copy = APPROVAL_COPY[status];
    panel.hidden = false;
    panel.className = 'panel approval is-' + status;

    var head = el('div', 'approval-head');
    var dot = el('span', 'dot');
    dot.setAttribute('aria-hidden', 'true');
    head.appendChild(dot);
    head.appendChild(el('span', null, copy.heading));
    panel.appendChild(head);

    panel.appendChild(el('p', 'approval-subject', 'Delete ' + (labelFor(approval.target) || approval.target)));
    panel.appendChild(el('p', 'approval-copy', copy.body));

    if (status !== 'pending') return;

    var actions = el('div', 'approval-actions');
    var deny = el('button', 'btn btn-danger', 'Deny');
    deny.type = 'button';
    deny.dataset.approvalAction = 'deny';
    var approve = el('button', 'btn btn-primary', 'Approve once');
    approve.type = 'button';
    approve.dataset.approvalAction = 'approve';
    actions.appendChild(deny);
    actions.appendChild(approve);
    panel.appendChild(actions);
  }

  function setEnvironmentFailure(error) {
    var env = document.getElementById('env');
    var label = document.getElementById('env-label');
    var detail = document.getElementById('env-detail');
    if (!env || !label || !detail) return;
    env.className = 'absent';
    label.textContent = 'WebMCP registration failed';
    detail.textContent = '— ' + (error && error.message ? error.message : 'the human board remains available.');
  }

  function onApprovalClick(event) {
    var button = event.target.closest('button[data-approval-action]');
    var runtime = global.Doorman.toolsRuntime;
    if (!button || !runtime || !runtime.getApproval) return;
    var current = runtime.getApproval();
    if (!current) return;
    var action = button.dataset.approvalAction;
    var result = action === 'approve'
      ? runtime.approveRequest(current.id)
      : runtime.denyRequest(current.id);
    if (result && typeof result.then === 'function') result.catch(function (error) { console.error(error); });
  }

  function init() {
    els.list = document.getElementById('board-list');
    els.form = document.getElementById('board-form');
    els.input = document.getElementById('board-input');
    els.count = document.getElementById('board-count');
    els.message = document.getElementById('board-message');
    els.reset = document.getElementById('board-reset');

    board.load();
    els.form.addEventListener('submit', onSubmit);
    els.list.addEventListener('click', onListClick);
    els.reset.addEventListener('click', onReset);
    var approval = document.getElementById('approval');
    if (approval) approval.addEventListener('click', onApprovalClick);
    render();
  }

  global.Doorman.ui = {
    init: init,
    render: render,
    setCapabilities: setCapabilities,
    setActivity: setActivity,
    setApproval: setApproval,
    setEnvironmentFailure: setEnvironmentFailure
  };
})(window, document);
