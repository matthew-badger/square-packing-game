// Run from the game folder:  node test/progress.test.js
'use strict';
const P = require('../src/progress.js');
const LV = require('../src/levels.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK ' : 'BAD'}] ${name}${detail ? '  ' + detail : ''}`);
}
function store(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

console.log('loading');
{
  const st = P.load(store());
  check('empty storage gives a fresh record', st.v === 2 && st.current === 1 && Object.keys(st.levels).length === 0 &&
    st.prefs.labels === 'value' && st.prefs.theme === 'auto' && st.prefs.advanced === false && st.prefs.freeN === 7 && st.serve === null);
  check('storage that throws gives a fresh record', P.load(throwing).current === 1);
  check('no storage at all gives a fresh record', P.load(null).current === 1);
  check('saving to storage that throws reports false', P.save(throwing, st) === false);
  check('unreadable JSON gives a fresh record', P.load(store({ [P.KEY]: '{oops' })).current === 1);
  check('another version gives a fresh record', P.load(store({ [P.KEY]: JSON.stringify({ v: 3, current: 9 }) })).current === 1);
}
{
  const raw = { v: 2, current: 40, levels: { 1: { solved: 2, best: 1, bestMs: 5000 }, 2: { solved: 'x' }, 3: { seen: true },
    4: { solved: 1, best: 9 }, 30: { solved: 1 }, 0: { solved: 1 } }, prefs: { labels: 'nope', lang: '<b>', advanced: 'yes', freeN: 12, theme: 'neon', snap: 'lattice' } };
  const st = P.load(store({ [P.KEY]: JSON.stringify(raw) }));
  check('a damaged record keeps only well-formed fields',
    st.levels[1].solved === 2 && st.levels[1].best === 1 && st.levels[1].bestMs === 5000 &&
    !st.levels[2] && st.levels[3].seen && !st.levels[3].solved && st.levels[4].best === 5 &&
    !st.levels[30] && !st.levels[0] && st.current === 1, JSON.stringify(st.levels));
  check('bad settings fall back to defaults, good ones stay',
    st.prefs.labels === 'value' && st.prefs.lang === null &&
    st.prefs.advanced === false && st.prefs.freeN === 7 && st.prefs.theme === 'auto');
  check('settings that no longer exist are dropped', !('snap' in st.prefs) && !('goal' in st.prefs));
}

console.log('solving');
{
  const st = P.fresh();
  let r = P.recordSolve(st, 1, { hints: 2, ms: 30000 });
  check('first solve', r.first && st.levels[1].solved === 1 && st.levels[1].best === 2 && st.levels[1].bestMs === 30000);
  check('the Levels screen moves on to level 2', st.current === 2);
  r = P.recordSolve(st, 1, { hints: 3, ms: 20000 });
  check('a slower-hinted, faster solve keeps the best hints and takes the time',
    !r.first && !r.fewerHints && r.faster && st.levels[1].best === 2 && st.levels[1].bestMs === 20000 && st.levels[1].solved === 2);
  r = P.recordSolve(st, 1, { hints: 0 });
  check('fewer hints improves best; no time leaves the time', r.fewerHints && !r.faster && st.levels[1].best === 0 && st.levels[1].bestMs === 20000);
  P.recordSolve(st, 5, { answered: true, hints: 1 });
  check('solving after seeing the answer counts as 5', st.levels[5].best === 5);
  check('after level 5 the next unsolved is 6', st.current === 6);
  P.recordSolve(st, 29, {});
  check('after the last level it wraps round to the first unsolved', st.current === 2);
  for (let l = 1; l <= LV.COUNT; l++) P.recordSolve(st, l, {});
  check('all solved: count 29, nothing left, the screen stays on the last level solved',
    P.solvedCount(st) === 29 && P.nextUnsolved(st, 1) === null && st.current === 29);
  let threw = false;
  try { P.recordSolve(st, 30, {}); } catch (e) { threw = true; }
  check('an unknown level is refused', threw);
  const s2 = P.fresh();
  P.markSeen(s2, 7);
  check('seeing a level is remembered without solving it', s2.levels[7].seen && !P.isSolved(s2, 7) && P.solvedCount(s2) === 0);
}
{
  const s = store();
  const st = P.fresh();
  P.recordSolve(st, 3, { hints: 1, ms: 9000 });
  st.prefs.advanced = true;
  st.prefs.theme = 'dark';
  st.serve = { decks: { 8: ['alpha'] } };
  check('save and load round-trip', P.save(s, st) && JSON.stringify(P.load(s)) === JSON.stringify(st));
}

console.log('carrying over v0.1.0');
{
  const v1 = {
    [P.V1 + '.progress']: JSON.stringify({ atlas: {
      '4:windowpane': { seen: true, solved: 3, best: 0 },
      '7:center': { seen: true, solved: 1, best: 2 },
      '8:psi': { seen: true, solved: 2, best: 5 },
      '8:beta': { seen: true },
      '8:nonsense': { solved: 4, best: 1 },
      'junk': 7 }, ladder: { order: [], pos: 3, results: [] } }),
    [P.V1 + '.prefs']: JSON.stringify({ n: 8, mode: 'specific', lang: 'fr', labels: 'index', snap: 'lattice', goal: 'open', timer: true }),
  };
  const s = store(v1);
  const st = P.load(s);
  check('solved strategies mark their levels solved, with count and best',
    st.levels[1].solved === 3 && st.levels[1].best === 0 &&
    st.levels[LV.byStrategy(7, 'center').level].solved === 1 && st.levels[LV.byStrategy(7, 'center').level].best === 2 &&
    st.levels[12].solved === 2 && st.levels[12].best === 5);
  check('seen carries over without a solve', st.levels[LV.byStrategy(8, 'beta').level].seen && !P.isSolved(st, LV.byStrategy(8, 'beta').level));
  check('unknown strategies and junk are ignored', Object.keys(st.levels).length === 4);
  check('language, labels and square count carry over; snapping and goal do not',
    st.prefs.lang === 'fr' && st.prefs.labels === 'index' && st.prefs.freeN === 8 && !('snap' in st.prefs) && !('goal' in st.prefs));
  check('the Levels screen opens on the first unsolved level', st.current === 2);
  check('the v0.1.0 keys are left as they were', s.map.get(P.V1 + '.progress') === v1[P.V1 + '.progress'] && !s.map.has(P.KEY));
  const s2 = store(Object.assign({ [P.KEY]: JSON.stringify(P.fresh()) }, v1));
  check('a v2 record, once saved, wins over v0.1.0', Object.keys(P.load(s2).levels).length === 0);
  check('v0.1.0 settings alone still carry over', P.load(store({ [P.V1 + '.prefs']: v1[P.V1 + '.prefs'] })).prefs.lang === 'fr');
  check('unreadable v0.1.0 data gives a fresh record', P.load(store({ [P.V1 + '.progress']: '][' })).current === 1);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
