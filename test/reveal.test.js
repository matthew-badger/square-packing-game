// Run from the game folder:  node test/reveal.test.js
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

// invariants of one answer
function audit(a, k) {
  const ans = R.answer(a, k), probs = [];
  const L = a.L;
  if (!B.checkWin(a.s, ans.positions, L)) probs.push('packing invalid');
  // bars: real chains of the packing, with the stated sums, at most 4 per axis,
  // and at least one reaching L
  const per = { h: 0, v: 0 };
  for (const c of ans.chains) {
    per[c.axis]++;
    if (F.chainAxis(a.s, ans.positions, c.indices) === null) probs.push(`bar ${c.label} not a chain`);
    if (c.sum !== F.termSum(a.s, c.indices)) probs.push(`bar ${c.label} sum`);
    if (c.sum > L) probs.push(`bar ${c.label} exceeds L`);
  }
  if (per.h > 4 || per.v > 4) probs.push('too many bars');
  if (!ans.chains.some(c => c.sum === L)) probs.push('no bar reaches L');
  // ledger: one floor row, ascending values, winners at L
  if (a.ledger.length) {
    const rows = ans.ledger;
    if (rows.filter(r => r.floor).length !== 1) probs.push('floor rows');
    const vals = rows.filter(r => !r.floor).map(r => r.value);
    if (vals.some((v, i) => i && v < vals[i - 1])) probs.push('ledger order');
    const fi = rows.findIndex(r => r.floor);
    if (rows.slice(0, fi).some(r => r.value > a.floor) || rows.slice(fi + 1).some(r => r.value <= a.floor))
      probs.push('floor line misplaced');
    if (rows.filter(r => r.win).length !== rows.filter(r => !r.floor && r.value <= L).length) probs.push('winner rows');
    if (a.cls !== 'free' && rows.filter(r => r.win).length !== a.winners.length) probs.push('winner count');
    if (rows.filter(r => r.shown).length !== 1) probs.push('shown row');
  }
  if (!ans.title || !ans.formulaHTML || !ans.verdictHTML) probs.push('missing text');
  if (/undefined|NaN/.test(ans.formulaHTML + ans.verdictHTML + ans.defsHTML)) probs.push('undefined in text');
  return { ans, probs };
}

console.log('1. Every level puzzle (one per strategy)');
for (const w of LV.LEVELS) {
  const a = F.analyze(w.s);
  const { ans, probs } = audit(a, 0);
  check(`${String(w.level).padStart(2)} ${w.id.padStart(10)} (${w.s.join(',')})`,
        (w.n === 4 || (a.cls === 'unique' && ans.title.id === w.id)) && probs.length === 0,
        probs.join('; ') + `  bars ${ans.chains.map(c => c.axis + ':' + c.label + '=' + c.sum).join(' ')}`);
}

console.log(`\n2. Invariants over whole populations (${FULL ? 'every tab' : 'up to 2 tabs'} of every tied seed)`);
for (const [n, M] of POPS) {
  const cnt = { unique: 0, tied: 0, free: 0 }, bad = [];
  let tabs = 0;
  for (const s of tuples(n, M)) {
    const a = F.analyze(s);
    cnt[a.cls]++;
    for (let k = 0; k < Math.min(a.reveal.length, TABS); k++) {
      tabs++;
      const { probs } = audit(a, k);
      if (probs.length && bad.length < 3) bad.push(`(${s.join(',')})#${k}: ${probs.join('; ')}`);
      if (probs.length) bad.count = (bad.count || 0) + 1;
    }
  }
  check(`n=${n}, sides <= ${M}: ${tabs.toLocaleString()} reveals ` +
        `(unique ${cnt.unique}, tied ${cnt.tied}, free ${cnt.free})`, !bad.count,
        bad.count ? `${bad.count} bad, e.g. ${bad.join(' | ')}` : '');
}

console.log('\n3. Text samples');
for (const s of [[19, 16, 13, 12, 10, 9, 8], [26, 25, 21, 20, 10, 9, 8], [5, 4, 3, 2], [6, 5, 5, 4, 3]]) {
  const ans = R.answer(F.analyze(s), 0);
  console.log(`   (${s.join(',')}) ${ans.title.name}: ${ans.formulaHTML.replace(/<br>/g, ' ')}`);
  console.log(`      ${ans.verdictHTML}`);
}
// a tied and a free example
{
  let tied = null, free = null;
  for (const s of tuples(8, 9)) {
    const a = F.analyze(s);
    if (!tied && a.cls === 'tied') tied = a;
    if (!free && a.cls === 'free' && a.attribution.level === 7) free = a;
    if (tied && free) break;
  }
  for (const a of [tied, free]) {
    const ans = R.answer(a, 0);
    console.log(`   (${a.s.join(',')}) ${a.cls}, tabs [${ans.tabs.map(t => t.name).join(' ')}]: ${ans.verdictHTML}`);
  }
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
