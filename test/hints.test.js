// Run from the game folder:  node test/hints.test.js
'use strict';
// --full sweeps the larger populations (npm run test:full); the default is a quick sample
const FULL = process.argv.includes('--full');
const TABS = FULL ? Infinity : 2;      // tabs checked per tied seed
const POPS = FULL ? [[4, 14], [5, 14], [6, 13], [7, 12], [8, 10]]
  : [[4, 10], [5, 10], [6, 9], [7, 9], [8, 8]];
const F = require('../src/formula.js');
const R = require('../src/reveal.js');
const B = require('../src/board.js');
const LV = require('../src/levels.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK ' : 'BAD'}] ${name}${detail ? '  ' + detail : ''}`);
}
function* tuples(n, M) {
  const s = new Array(n).fill(M);
  for (;;) {
    yield s.slice();
    let i = n - 1;
    while (i >= 0 && s[i] === 1) i--;
    if (i < 0) return;
    s[i]--;
    for (let j = i + 1; j < n; j++) s[j] = s[i];
  }
}

function audit(a, k) {
  const h = R.hints(a, k), probs = [];
  const P = R.answer(a, k).positions, s = a.s, L = a.L;
  if (h.steps.length !== 4) probs.push('step count');
  if (h.steps.some(st => !st.html || /undefined|NaN/.test(st.html))) probs.push('text');
  // corners: the listed square really holds that corner; an empty corner holds none
  const tests = {
    ll: (x, y, t) => x === 0 && y === 0, lr: (x, y, t) => x + t === L && y === 0,
    ul: (x, y, t) => x === 0 && y + t === L, ur: (x, y, t) => x + t === L && y + t === L,
  };
  for (const c of h.overlay.corners) {
    const holders = s.map((t, j) => j).filter(j => tests[c.name](P[j][0], P[j][1], s[j]));
    if (holders.length > 1) probs.push('two squares in a corner');
    if (c.i < 0 ? holders.length : holders[0] !== c.i) probs.push(`corner ${c.name}`);
    if (c.i >= 0 && (c.pos[0] !== P[c.i][0] || c.pos[1] !== P[c.i][1])) probs.push('corner position');
  }
  // groups: 1 to 3 chains of the canonical packing, each reaching L, ordered along their axis
  const g = h.overlay.groups;
  if (g.length < 1 || g.length > 3) probs.push(`${g.length} groups`);
  for (const grp of g) {
    if (F.termSum(s, grp.indices) !== L) probs.push('group sum');
    if (F.chainAxis(s, P, grp.indices) === null) probs.push('group not a chain');
    const k2 = grp.axis === 'h' ? 0 : 1;
    if (grp.indices.some((i, j) => j && P[i][k2] < P[grp.indices[j - 1]][k2])) probs.push('group order');
  }
  // ghost: in place, and not a corner square unless every square holds a corner
  const gh = h.overlay.ghost;
  const corner = new Set(h.overlay.corners.map(c => c.i));
  if (!gh) { if (s.some((_, i) => !corner.has(i))) probs.push('no ghost'); }
  else {
    if (gh.pos[0] !== P[gh.i][0] || gh.pos[1] !== P[gh.i][1]) probs.push('ghost position');
    if (corner.has(gh.i)) probs.push('ghost is a corner square');
  }
  return probs;
}

console.log(`1. Hints over whole populations (${FULL ? 'every tab' : 'up to 2 tabs'} of every seed)`);
for (const [n, M] of POPS) {
  let count = 0, bad = 0, first = null;
  const corners = { 4: 0 }, emptyCorner = { n: 0 };
  for (const s of tuples(n, M)) {
    const a = F.analyze(s);
    for (let k = 0; k < Math.min(a.reveal.length, TABS); k++) {
      count++;
      const p = audit(a, k);
      if (p.length) { bad++; first = first || `(${s})#${k}: ${p.join(', ')}`; }
      const h = R.hints(a, k);
      if (h.overlay.corners.some(c => c.i < 0)) emptyCorner.n++;
    }
  }
  check(`n=${n}, sides <= ${M}: ${count.toLocaleString()} hint ladders`, bad === 0,
        (bad ? `${bad} bad, first ${first}; ` : '') + `${emptyCorner.n} with an empty corner`);
}

console.log('\n2. Every level puzzle');
for (const w of LV.LEVELS) {
  const a = F.analyze(w.s);
  const p = audit(a, 0);
  const h = R.hints(a, 0);
  check(`${String(w.level).padStart(2)} ${w.id.padStart(10)}`, !p.length, p.join(', ') + `  ghost ${h.overlay.ghost ? a.s[h.overlay.ghost.i] : '-'}, groups ` +
        h.overlay.groups.map(g => g.axis + ':' + g.indices.map(i => 's' + i).join('+')).join(' '));
}

console.log('\n3. Sample text');
for (const s of [[19, 16, 13, 12, 10, 9, 8], [20, 19, 13, 13, 12, 10, 9, 8], [5, 4, 3, 2]]) {
  const h = R.hints(F.analyze(s), 0);
  console.log(`   (${s.join(',')})`);
  h.steps.forEach((st, k) => console.log(`     ${k + 1}. ${st.html}`));
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
