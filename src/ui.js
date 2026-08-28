/*
 * ui.js — renders the board for a human. No agent involved anywhere in this file.
 *
 * User text never goes near innerHTML. Every item is built with createElement and
 * textContent, so a list entry can never become markup.
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

  function renderItem(item) {
    var row = el('li', 'item');
    row.dataset.id = item.id;

    var main = el('div', 'item-main');
    main.appendChild(el('span', 'item-text', item.text));

    var meta = el('div', 'item-meta');
    meta.appendChild(el('span', 'tag tag-' + item.author, item.author));
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
    board.reset();
    if (global.Doorman.toolsRuntime && global.Doorman.toolsRuntime.resetDemo) {
      global.Doorman.toolsRuntime.resetDemo();
    }
    editingId = null;
    pendingDelete = null;
    flash('Board reset to its sample items.');
    render();
  }

  function setCapabilities(names, webmcpAvailable) {
    var panel = document.getElementById('capabilities');
    if (!panel) return;
    var heading = panel.querySelector('h2');
    var oldCount = heading && heading.querySelector('.count');
    if (oldCount) oldCount.remove();
    var old = panel.querySelector('.capability-list');
    if (old) old.remove();
    var list = el('ul', 'capability-list');
    names.concat(['delete_item']).forEach(function (name) {
      var available = names.indexOf(name) !== -1;
      var row = el('li', 'capability-row');
      row.appendChild(el('code', 'capability-name', name));
      row.appendChild(el('span', available ? 'capability-status available' : 'capability-status unavailable',
        available ? (webmcpAvailable ? 'AVAILABLE' : 'LOCAL ONLY') : 'UNAVAILABLE'));
      list.appendChild(row);
    });
    panel.appendChild(list);
    if (heading) heading.appendChild(el('span', 'count', names.length + ' registered'));
  }

  function setActivity(receipts) {
    var list = document.getElementById('activity-list');
    if (!list) return;
    list.textContent = '';
    if (!receipts.length) {
      list.appendChild(el('li', 'empty', 'No tool activity yet.'));
      return;
    }
    receipts.forEach(function (receipt) {
      var row = el('li', 'receipt');
      row.appendChild(el('span', 'receipt-number', '#' + receipt.number));
      row.appendChild(el('code', 'receipt-tool', receipt.tool));
      row.appendChild(el('strong', 'receipt-decision ' + receipt.decision, receipt.decision.toUpperCase()));
      row.appendChild(el('span', 'receipt-execution', receipt.execution));
      if (receipt.reason) row.appendChild(el('span', 'receipt-reason', receipt.reason));
      list.appendChild(row);
    });
  }

  function setApproval(approval) {
    var panel = document.getElementById('approval');
    if (!panel) return;
    panel.textContent = '';
    if (!approval) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    var item = global.Doorman.board && global.Doorman.board.get(approval.target);
    var label = item ? item.text : approval.target;
    panel.appendChild(el('p', 'approval-copy', approval.status === 'pending'
      ? 'Agent requests permission to delete: "' + label + '"'
      : 'Delete request: "' + label + '" — ' + approval.status.toUpperCase()));
    if (approval.status !== 'pending') return;
    var approve = el('button', 'btn btn-primary', 'Approve once');
    approve.type = 'button';
    approve.dataset.approvalAction = 'approve';
    var deny = el('button', 'btn btn-danger', 'Deny');
    deny.type = 'button';
    deny.dataset.approvalAction = 'deny';
    panel.appendChild(approve);
    panel.appendChild(deny);
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
    setApproval: setApproval
  };
})(window, document);
