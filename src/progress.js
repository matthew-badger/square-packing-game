/*
 * progress.js — what the game remembers between visits, kept in the browser only.
 *
 * One JSON record under the key 'square-packing.v2':
 *   { v: 2,
 *     levels: { "<level>": { seen, solved, best, bestMs } },   // level = 1..29
 *     current: <level the Levels screen opens on>,
 *     prefs: { lang, labels, theme, advanced, freeN },
 *     serve: <Free play deck state from serve.js, or null> }
 * A level record: seen = its answer or puzzle was shown; solved = times solved; best = fewest
 * hints used on a solve (5 = solved after seeing the answer); bestMs = fastest solve.
 *
 * First visit after v0.1.0: its Atlas progress carries over.  A strategy solved there marks
 * that strategy's level solved, with the same count and best; seen carries over too.  The
 * v0.1.0 settings for language and labels carry over; its keys are left in
 * place, untouched.
 *
 * Storage may be missing, full, or throw (private windows, blocked site data): every read
 * and write is guarded, and the game runs from the in-memory record regardless.  Whatever is
 * read back is checked field by field, so a damaged or edited record cannot break the game.
 *
 * Browser global: SPProgress (needs SPLevels).  Node: module.exports.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const LV = node ? require('./levels.js') : root.SPLevels;

  const KEY = 'square-packing.v2';
  const V1 = 'square-packing-game.v1';
  const MAX_HINTS = 5;          // 4 hints; 5 = the answer was shown
  const PREF_DEFAULTS = Object.freeze({
    lang: null, labels: 'value', theme: 'auto', advanced: false, freeN: 7,
  });
  const PREF_CHOICES = {
    labels: ['value', 'index', 'none'], theme: ['auto', 'dark', 'light'],
  };

  function fresh() {
    return { v: 2, levels: {}, current: 1, prefs: Object.assign({}, PREF_DEFAULTS), serve: null };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  function cleanLevel(r) {
    if (!r || typeof r !== 'object') return null;
    const out = {};
    if (r.seen === true) out.seen = true;
    if (isInt(r.solved, 1, 1e9)) {
      out.solved = r.solved;
      out.seen = true;
      out.best = isInt(r.best, 0, MAX_HINTS) ? r.best : MAX_HINTS;
      if (isInt(r.bestMs, 1, 1e10)) out.bestMs = r.bestMs;
    }
    return Object.keys(out).length ? out : null;
  }

  function cleanPrefs(p) {
    const out = Object.assign({}, PREF_DEFAULTS);
    if (!p || typeof p !== 'object') return out;
    if (typeof p.lang === 'string' && /^[a-z]{2,3}$/.test(p.lang)) out.lang = p.lang;
    for (const k in PREF_CHOICES) if (PREF_CHOICES[k].includes(p[k])) out[k] = p[k];
    if (typeof p.advanced === 'boolean') out.advanced = p.advanced;
    if (isInt(p.freeN, 4, 8)) out.freeN = p.freeN;
    return out;
  }

  /** A v2 record checked field by field; anything malformed is dropped. */
  function clean(raw) {
    const st = fresh();
    if (!raw || typeof raw !== 'object' || raw.v !== 2) return st;
    if (raw.levels && typeof raw.levels === 'object')
      for (let l = 1; l <= LV.COUNT; l++) {
        const r = cleanLevel(raw.levels[l]);
        if (r) st.levels[l] = r;
      }
    if (isInt(raw.current, 1, LV.COUNT)) st.current = raw.current;
    st.prefs = cleanPrefs(raw.prefs);
    if (raw.serve && typeof raw.serve === 'object') st.serve = raw.serve;
    return st;
  }

  function readJSON(storage, key) {
    try {
      const s = storage && storage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  /** v0.1.0's progress and settings as a v2 record, or null if there is nothing to carry. */
  function fromV1(storage) {
    const prog = readJSON(storage, V1 + '.progress');
    const prefs = readJSON(storage, V1 + '.prefs');
    if (!prog && !prefs) return null;
    const st = fresh();
    const atlas = prog && prog.atlas && typeof prog.atlas === 'object' ? prog.atlas : {};
    for (const key of Object.keys(atlas)) {
      const m = /^([4-8]):([a-z]+)$/.exec(key);
      const lvl = m && LV.byStrategy(+m[1], m[2]);
      const r = lvl && cleanLevel(atlas[key]);
      if (r) st.levels[lvl.level] = r;
    }
    if (prefs && typeof prefs === 'object') {
      st.prefs = cleanPrefs({ lang: prefs.lang, labels: prefs.labels, theme: prefs.theme, freeN: prefs.n });
    }
    st.current = nextUnsolved(st, 1) || 1;
    return st;
  }

  /** The saved record, else v0.1.0's carried over, else a fresh one. */
  function load(storage) {
    const raw = readJSON(storage, KEY);
    if (raw) return clean(raw);
    return fromV1(storage) || fresh();
  }

  /** Write the record; false if storage refused (the game carries on from memory). */
  function save(storage, st) {
    try { storage.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; }
  }

  const rec = (st, level) => (st.levels[level] ||= {});
  const isSolved = (st, level) => !!(st.levels[level] && st.levels[level].solved);

  /** The first unsolved level at or after `from`, wrapping round; null when all are solved. */
  function nextUnsolved(st, from) {
    for (let k = 0; k < LV.COUNT; k++) {
      const l = ((from - 1 + k) % LV.COUNT) + 1;
      if (!isSolved(st, l)) return l;
    }
    return null;
  }

  function markSeen(st, level) {
    if (!isInt(level, 1, LV.COUNT)) return;
    rec(st, level).seen = true;
  }

  /**
   * Record a solve of `level`.  hints = hints used (0..4), answered = the answer was shown
   * first, ms = time taken (omit if the timer did not run).  The Levels screen then opens on
   * the next unsolved level after this one.  Returns { first, fewerHints, faster }.
   */
  function recordSolve(st, level, o) {
    if (!isInt(level, 1, LV.COUNT)) throw new RangeError('no level ' + level);
    o = o || {};
    const used = o.answered ? MAX_HINTS : Math.max(0, Math.min(MAX_HINTS - 1, o.hints | 0));
    const r = rec(st, level);
    const first = !r.solved;
    const fewerHints = first || used < r.best;
    const faster = isInt(o.ms, 1, 1e10) && (r.bestMs === undefined || o.ms < r.bestMs);
    r.seen = true;
    r.solved = (r.solved || 0) + 1;
    if (fewerHints) r.best = used;
    if (faster) r.bestMs = o.ms;
    st.current = nextUnsolved(st, level + 1) || level;
    return { first, fewerHints: !first && fewerHints, faster: !first && faster };
  }

  function solvedCount(st) {
    let k = 0;
    for (let l = 1; l <= LV.COUNT; l++) if (isSolved(st, l)) k++;
    return k;
  }

  const api = {
    KEY, V1, MAX_HINTS, PREF_DEFAULTS,
    fresh, clean, load, save, fromV1,
    markSeen, recordSolve, isSolved, solvedCount, nextUnsolved,
  };
  if (node) module.exports = api;
  else root.SPProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
