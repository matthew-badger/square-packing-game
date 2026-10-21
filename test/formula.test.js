// Run from the game folder:  node test/formula.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../src/formula.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK ' : 'BAD'}] ${name}${detail ? '  ' + detail : ''}`);
}

// all sorted n-tuples with sides in 1..M, ties allowed (combinations with replacement)
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
function randomTuples(n, count, maxSide, seed) {
  let x = seed >>> 0;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
  const out = [];
  for (let k = 0; k < count; k++) {
    const s = Array.from({ length: n }, () => 1 + (rnd() % maxSide));
    out.push(s.sort((a, b) => b - a));
  }
  return out;
}

// Independent restatement of the n <= 7 formulas, for cross-checking.
const sum = (s, t) => t.reduce((a, i) => a + s[i], 0);
function L5ref(s) { return Math.max(s[0] + s[1], s[2] + s[3] + s[4]); }
function L6ref(s) { return Math.max(s[0] + s[1], s[2] + s[3] + s[4], s[1] + s[4] + s[5]); }
function L7ref(s) {
  return Math.max(L6ref(s), Math.min(
    sum(s, [1, 4, 5, 6]),
    Math.max(sum(s, [0, 5, 6]), sum(s, [1, 3, 6])),
    Math.max(sum(s, [3, 4, 5, 6]), sum(s, [1, 2, 5]))));
}

// ---------------------------------------------------------------------------------------
console.log('1. Agreement with verify_L8_general.py (fixture)');
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_L8.json'), 'utf8'));
  const ids = F.STRATEGIES[8].map(st => st.id);
  check('arm order identical', JSON.stringify(ids) === JSON.stringify(fx.arm_names));
  let bad6 = 0, bad7 = 0, badArm = 0, badPlace = 0;
  for (const r of fx.rows) {
    const s = r.s;
    if (F.Lstar(s.slice(0, 6)) !== r.L6) bad6++;
    if (F.Lstar(s.slice(0, 7)) !== r.L7) bad7++;
    for (const st of F.STRATEGIES[8]) {
      const v = F.strategyValue(s, st.terms);
      if (v !== r.arms[st.id]) badArm++;
      const P = F.place(st.id, s, Math.max(r.L7, v));
      if (JSON.stringify(P) !== JSON.stringify(r.place[st.id])) badPlace++;
    }
  }
  const n = fx.rows.length;
  check(`L*_6 on ${n.toLocaleString()} tuples`, bad6 === 0, `${bad6} mismatches`);
  check(`L*_7 on ${n.toLocaleString()} tuples`, bad7 === 0, `${bad7} mismatches`);
  check('23 arm values', badArm === 0, `${badArm} mismatches`);
  check('23 placements, coordinate for coordinate', badPlace === 0, `${badPlace} mismatches`);
}

// ---------------------------------------------------------------------------------------
console.log('\n2. Values, placements, chains, classes');

function auditTuple(s, stats) {
  const n = s.length;
  const a = F.analyze(s);
  const L = a.L;
  // values
  if (n === 5 && L !== L5ref(s)) stats.value++;
  if (n === 6 && L !== L6ref(s)) stats.value++;
  if (n === 7 && L !== L7ref(s)) stats.value++;
  if (L < F.Lstar(s.slice(0, n - 1))) stats.monotone++;
  // every strategy valid at max(floor, value), every term a chain there
  for (const e of a.ledger) {
    const Ls = Math.max(a.floor, e.value);
    const P = F.place(e.id, s, Ls);
    if (!F.isPacking(s, P, Ls)) { stats.place++; stats.firstPlace ??= [e.id, s, Ls]; }
    for (const t of e.terms) if (!F.chainAxis(s, P, t.indices)) {
      stats.chain++; stats.firstChain ??= [e.id, t.label, s];
    }
  }
  // reveal packings valid at L*_n, winners' attaining terms tight
  for (const r of a.reveal) {
    if (r.L !== L || !F.isPacking(s, r.positions, L)) stats.reveal++;
    if (r.tightChains.length === 0) { stats.noTight[a.cls]++; stats.firstNoTight ??= s; }
  }
  if (a.cls !== 'free') {
    for (const id of a.winners) {
      const e = a.ledger.find(x => x.id === id);
      if (e.value !== L || e.attaining.length === 0) stats.winner++;
    }
  }
  // class consistency
  const mn = a.ledger.length ? Math.min(...a.ledger.map(e => e.value)) : -Infinity;
  const expect = mn <= a.floor ? 'free' : a.winners.length === 1 ? 'unique' : 'tied';
  if (n >= 5 && a.cls !== expect) stats.cls++;
  stats.count[a.cls]++;
  // attribution: minimal level with the same value, its strategies attain L
  if (a.cls === 'free') {
    const m = a.attribution.level;
    const lv = k => F.Lstar(s.slice(0, k));
    let ok = lv(m) === L;
    for (let k = 2; k < m; k++) if (k !== 3 && k !== 4 && lv(k) === L) ok = false;
    if (m >= 5) {
      const led = F._ledgerAt(s, m);
      for (const id of a.attribution.strategies)
        if (led.find(e => e.id === id).value !== L) ok = false;
      if (!(lv(m - 1) < L)) ok = false;
    }
    if (!ok) stats.attrib++;
    stats.levels[m] = (stats.levels[m] || 0) + 1;
  }
}

function runPopulation(label, gen) {
  const stats = { n: 0, value: 0, monotone: 0, place: 0, chain: 0, reveal: 0, winner: 0,
                  cls: 0, attrib: 0, noTight: { unique: 0, tied: 0, free: 0 },
                  count: { unique: 0, tied: 0, free: 0 }, levels: {} };
  for (const s of gen) { stats.n++; auditTuple(s, stats); }
  console.log(`   ${label}: ${stats.n.toLocaleString()} tuples   unique ${stats.count.unique.toLocaleString()}` +
              `   tied ${stats.count.tied.toLocaleString()}   free ${stats.count.free.toLocaleString()}` +
              `   free-seed floor levels ${JSON.stringify(stats.levels)}`);
  check('L*_n equals the independent statement (n <= 7)', stats.value === 0, `${stats.value}`);
  check('L*_n >= L*_{n-1}', stats.monotone === 0, `${stats.monotone}`);
  check('every strategy packs at max(floor, value)', stats.place === 0,
        stats.place ? `${stats.place}, first ${JSON.stringify(stats.firstPlace)}` : '');
  check('every term is a chain of its strategy\'s packing', stats.chain === 0,
        stats.chain ? `${stats.chain}, first ${JSON.stringify(stats.firstChain)}` : '');
  check('every reveal packs at L*_n', stats.reveal === 0, `${stats.reveal}`);
  check('winners attain L*_n', stats.winner === 0, `${stats.winner}`);
  check('class matches the definition', stats.cls === 0, `${stats.cls}`);
  check('floor attribution is the minimal level', stats.attrib === 0, `${stats.attrib}`);
  const nt = stats.noTight;
  check('every reveal shows a tight chain', nt.unique + nt.tied + nt.free === 0,
        `missing: ${JSON.stringify(nt)}${stats.firstNoTight ? ', first ' + JSON.stringify(stats.firstNoTight) : ''}`);
}

let t = Date.now();
runPopulation('n=4, sides <= 30', tuples(4, 30));
runPopulation('n=5, sides <= 30', tuples(5, 30));
runPopulation('n=6, sides <= 24', tuples(6, 24));
runPopulation('n=7, sides <= 18', tuples(7, 18));
runPopulation('n=8, sides <= 14', tuples(8, 14));
runPopulation('n=7, 100,000 random to side 10^4', randomTuples(7, 100000, 10000, 7));
runPopulation('n=8, 100,000 random to side 10^4', randomTuples(8, 100000, 10000, 8));
console.log(`   (${((Date.now() - t) / 1000).toFixed(1)} s)`);

// ---------------------------------------------------------------------------------------
console.log('\n3. Witnesses on record');
const W8 = [
  [[44, 40, 35, 29, 25, 24, 18, 16], 'eta', 89, 91], [[44, 24, 21, 20, 19, 18, 17, 16], 'sigma', 74, 76],
  [[44, 23, 22, 21, 18, 17, 16, 15], 'tau', 72, 74], [[44, 26, 21, 19, 18, 17, 16, 15], 'upsilon', 70, 74],
  [[44, 43, 38, 37, 13, 12, 11, 10], 'psi', 88, 89], [[28, 26, 24, 21, 19, 19, 16, 15], 'eta', 64, 65],
  [[28, 15, 13, 13, 12, 11, 11, 10], 'sigma', 47, 48], [[28, 15, 14, 13, 11, 11, 11, 10], 'tau', 46, 48],
  [[28, 15, 13, 13, 13, 12, 12, 12], 'upsilon', 50, 51], [[28, 28, 26, 25, 8, 8, 8, 8], 'psi', 59, 60],
  [[44, 30, 27, 24, 23, 16, 14, 13], 'epsilon', 74, 77], [[44, 36, 25, 22, 21, 19, 18, 17], 'epsilon', 80, 81],
  [[39, 38, 33, 32, 12, 10, 9, 9], 'psi', 77, 78], [[78, 76, 66, 64, 24, 20, 18, 17], 'psi', 154, 155],
  [[26, 25, 21, 20, 10, 9, 8], 'right', 51, 52], [[19, 16, 13, 12, 10, 9, 8], 'center', 35, 36],
  [[22, 15, 14, 11, 10, 9, 8], 'top', 37, 38],
];
for (const [s, id, floor, L] of W8) {
  const a = F.analyze(s);
  check(`${id.padStart(8)} (${s.join(',')})`,
        a.cls === 'unique' && a.winners[0] === id && a.floor === floor && a.L === L,
        `${a.cls} ${a.winners.join('/')} floor ${a.floor} L ${a.L}`);
}

// ---------------------------------------------------------------------------------------
console.log('\n4. Input checks');
const throws = s => { try { F.analyze(s); return false; } catch (e) { return e instanceof RangeError; } };
check('rejects unsorted, zero, fractional, too long',
      throws([3, 5, 1, 1]) && throws([5, 3, 0, 0]) && throws([5, 2.5, 1, 1]) && throws(new Array(9).fill(1)));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
