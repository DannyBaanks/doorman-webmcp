/*
 * board.js — the small shared list the tools will eventually act on.
 *
 * Deliberately dull, and deliberately pure: no DOM, no agent, no policy. Slice 1 is
 * the part that has to stand on its own, because a page that only makes sense once an
 * agent shows up is not a page.
 *
 * Classic script on purpose (no modules, no build): the repo has to work when someone
 * opens index.html straight off a clean clone.
 */
(function (global) {
  'use strict';

  var KEY = 'doorman.board.v1';

  // Authorship is not decoration. Later slices decide what an agent may touch based on
  // who created an item, so the field exists from the first commit that stores anything.
  var AUTHORS = { SAMPLE: 'sample', HUMAN: 'you', AGENT: 'agent' };

  var SEED = [
    { text: 'Water the plant by the window', author: AUTHORS.SAMPLE },
    { text: 'Ask the landlord about the leak', author: AUTHORS.SAMPLE },
    { text: 'Return the library book', author: AUTHORS.SAMPLE }
  ];

  var items = [];

  function newId() {
    return 'itm_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  // Storage can throw, not just come back empty: private windows and blocked site data
  // both fail on access. The board must survive that without losing its mind.
  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function write() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(items));
      return true;
    } catch (err) {
      return false; // in-memory only for this session; the page keeps working
    }
  }

  function seed() {
    var now = Date.now();
    return SEED.map(function (s, i) {
      return { id: newId(), text: s.text, author: s.author, createdAt: new Date(now + i).toISOString() };
    });
  }

  function load() {
    var stored = read();
    items = stored || seed();
    if (!stored) write();
    return list();
  }

  function list(filter) {
    if (!filter) return items.slice();
    var needle = String(filter).toLowerCase();
    return items.filter(function (it) {
      return it.text.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function get(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  function add(text, author, metadata) {
    var clean = String(text == null ? '' : text).trim();
    if (!clean) throw new Error('An item needs some text.');
    if (clean.length > 140) throw new Error('Keep it under 140 characters.');
    var item = {
      id: newId(),
      text: clean,
      author: author || AUTHORS.HUMAN,
      sessionId: metadata && metadata.sessionId ? String(metadata.sessionId) : null,
      createdAt: new Date().toISOString()
    };
    items.push(item);
    write();
    return item;
  }

  function update(id, text) {
    var item = get(id);
    if (!item) throw new Error('No item with id ' + id + '.');
    var clean = String(text == null ? '' : text).trim();
    if (!clean) throw new Error('An item needs some text.');
    if (clean.length > 140) throw new Error('Keep it under 140 characters.');
    item.text = clean;
    write();
    return item;
  }

  function remove(id) {
    var item = get(id);
    if (!item) throw new Error('No item with id ' + id + '.');
    items = items.filter(function (it) { return it.id !== id; });
    write();
    return item;
  }

  function reset() {
    items = seed();
    write();
    return list();
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.board = {
    AUTHORS: AUTHORS,
    load: load,
    list: list,
    get: get,
    add: add,
    update: update,
    remove: remove,
    reset: reset
  };
})(window);
