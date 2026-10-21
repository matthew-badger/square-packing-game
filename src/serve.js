/*
 * serve.js — which Free play puzzle comes next.
 *
 * A draw picks a class (unique / tied / free) by weight, then a strategy from a shuffled
 * deck for that n, dealt without replacement and reshuffled after a full pass, then a
 * seed of that class in which that strategy wins (for free seeds: binds the floor) that
 * has not been served since that key's pool was last exhausted.  Unique and tied draws
 * share one deck, so over a pass every strategy is the answer exactly once.  Free draws
 * use their own deck over the floor strategies (pair, shelf, column, top, center, right).
 *
 * All state lives in one plain object, safe to JSON-serialize for localStorage.
 *
 * Browser global: SPServe (needs SPFormula, SPBank).  Node: module.exports.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const F = node ? require('./formula.js') : root.SPFormula;
  const BANK = node ? require('./bank.js') : root.SPBank;

  const CLASSES = ['unique', 'tied', 'free'];
  const PREFIX = { unique: 'u', tied: 't', free: 'f' };

  // how often each class is served: one winner, a tie, or a free last square
  const WEIGHTS = { unique: 80, tied: 10, free: 10 };

  function newState() { return { decks: {}, seen: {} }; }

  // ids that have at least one seed under `prefix` for n
  function idsFor(n, prefix) {
    return Object.keys(BANK[n] || {}).filter(k => k.startsWith(prefix + ':')).map(k => k.slice(2));
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /** Deal the next id from the named deck, reshuffling after a full pass. */
  function deal(state, name, ids, rnd) {
    let d = state.decks[name];
    const sameSet = d && d.order.length === ids.length && ids.every(id => d.order.includes(id));
    if (!sameSet) d = state.decks[name] = { order: shuffle(ids.slice(), rnd), pos: 0, pass: 0 };
    if (d.pos >= d.order.length) {
      const last = d.order[d.order.length - 1];
      d.order = shuffle(d.order.slice(), rnd);
      // never deal the same strategy twice in a row across the reshuffle
      if (d.order.length > 1 && d.order[0] === last) [d.order[0], d.order[1]] = [d.order[1], d.order[0]];
      d.pos = 0;
      d.pass++;
    }
    return d.order[d.pos++];
  }

  /** An unseen seed from BANK[n][key]; the pool restarts once every seed was served. */
  function pick(state, n, key, rnd) {
    const all = BANK[n][key] || [];
    const idx = all.map((_, i) => i);
    const seenKey = `${n}|${key}`;
    let seen = state.seen[seenKey] || [];
    let fresh = idx.filter(i => !seen.includes(i));
    if (!fresh.length) { seen = []; fresh = idx; }
    const i = fresh[rnd(fresh.length)];
    state.seen[seenKey] = seen.concat(i);
    return all[i].slice();
  }

  function classesFor(n) {
    if (n <= 4) return ['free'];
    return CLASSES.filter(c => idsFor(n, PREFIX[c]).length);
  }

  /*
   * Next puzzle with n squares.  Returns { s, n, cls, id, key, pass } where id is the
   * strategy the seed was drawn for.  `rnd(k)` returns an integer in [0, k).
   */
  function next(state, n, rnd) {
    rnd = rnd || (k => Math.floor(Math.random() * k));

    // class by weight, over the classes this n can have
    const avail = classesFor(n);
    let r = rnd(avail.reduce((t, c) => t + WEIGHTS[c], 0));
    let cls = avail.find(c => (r -= WEIGHTS[c]) < 0) || avail[0];

    // unique and tied share the strategy deck; a strategy with no seeds of the drawn
    // class is served from the other one, so the deck stays a full pass
    const deckIds = cls === 'free' ? idsFor(n, 'f') : F.STRATEGIES[n].map(st => st.id);
    const name = `${n}|${cls === 'free' ? 'free' : 'strategy'}`;
    const id = deal(state, name, deckIds, rnd);
    const pass = state.decks[name].pass;
    if (cls !== 'free' && !(BANK[n][`${PREFIX[cls]}:${id}`] || []).length) cls = cls === 'tied' ? 'unique' : 'tied';
    const key = `${PREFIX[cls]}:${id}`;
    return { s: pick(state, n, key, rnd), n, cls, id, key, pass };
  }

  const api = { next, newState, WEIGHTS, classesFor, idsFor };
  if (node) module.exports = api;
  else root.SPServe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
