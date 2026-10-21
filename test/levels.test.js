// Run from the game folder:  node test/levels.test.js
// Checks every claim in src/levels.js, including the searches showing that the 5- and
// 6-square puzzles and the level 12 (psi) puzzle are the smallest of their kind.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const F = require('../src/formula.js');
const LV = require('../src/levels.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK ' : 'BAD'}] ${name}${detail ? '  ' + detail : ''}`);
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const L = LV.LEVELS;

console.log('coverage');
const expected = ['4:windowpane', '5:shelf', '6:column',
  ...F.STRATEGIES[7].map(s => '7:' + s.id), ...F.STRATEGIES[8].map(s => '8:' + s.id)];
const got = L.map(l => `${l.n}:${l.id}`);
check('29 levels', L.length === 29 && LV.COUNT === 29);
check('every strategy exactly once', got.length === new Set(got).size &&
  expected.every(k => got.includes(k)) && got.every(k => expected.includes(k)));
check('numbered 1..29 in order', L.every((l, i) => l.level === i + 1));
check('get() and byStrategy()', LV.get(12).id === 'psi' && LV.byStrategy(7, 'top').level === 6 && !LV.get(30));

console.log('puzzles');
for (const l of L) {
  const s = l.s, tag = `level ${l.level} ${l.id}`;
  const sorted = s.length === l.n && s.every((x, i) => Number.isInteger(x) && x > 0 && (i === 0 || x <= s[i - 1]));
  const prim = s.reduce(gcd) === 1;
  const Ls = F.Lstar(s.slice());
  let winner = true, packs;
  if (l.n === 4) {
    packs = F.isPacking(s, F.analyze(s.slice()).reveal[0].positions, Ls);
  } else {
    const a = F.analyze(s.slice());
    winner = a.cls === 'unique' && a.winners.length === 1 && a.winners[0] === l.id &&
      Ls > F.Lstar(s.slice(0, l.n - 1));
    packs = F.isPacking(s, F.place(l.id, s, Ls), Ls);
  }
  const distinct = new Set(s).size === s.length;
  const sidesOk = l.id === 'psi'
    ? s[0] > s[1] && s[1] > s[2] && s[2] > s[3] && s[3] > s[4] && s[4] === s[5] && s[5] === s[6] && s[6] === s[7]
    : distinct;
  check(`${tag}: ${s.join(' ')}, frame ${l.L}`,
    sorted && prim && Ls === l.L && winner && packs && sidesOk,
    [!sorted && 'not sorted', !prim && 'not primitive', Ls !== l.L && `L* is ${Ls}`,
     !winner && 'not the only winner above the floor', !packs && 'canonical packing invalid',
     !sidesOk && 'side pattern'].filter(Boolean).join(', '));
}

console.log('puzzle sources');
// 5 and 6 squares: no all-different puzzle with a smaller largest side (or the same largest
// side and a smaller frame) makes the strategy the only winner above the floor.
function* desc(n, max) {
  const a = [];
  function* r(top, k) { if (!k) { yield a.slice(); return; } for (let v = top; v >= 1; v--) { a.push(v); yield* r(v - 1, k - 1); a.pop(); } }
  yield* r(max, n);
}
for (const n of [5, 6]) {
  const lv = L.find(l => l.n === n);
  let better = null;
  for (const s of desc(n, lv.s[0])) {
    const a = F.analyze(s);
    if (a.cls !== 'unique' || a.L <= F.Lstar(s.slice(0, n - 1))) continue;
    if (s[0] < lv.s[0] || a.L < lv.L) { better = s; break; }
  }
  check(`${n} squares: ${lv.s.join(' ')} is the smallest all-different puzzle`, !better, better ? `found ${better.join(' ')}` : '');
}
{
  const lv = LV.get(12);
  let first = null;
  for (let s0 = 5; s0 <= lv.s[0] && !first; s0++)
    for (let s1 = s0 - 1; s1 >= 2 && !first; s1--) for (let s2 = s1 - 1; s2 >= 2 && !first; s2--)
      for (let s3 = s2 - 1; s3 >= 2 && !first; s3--) for (let t = s3 - 1; t >= 1; t--) {
        const s = [s0, s1, s2, s3, t, t, t, t];
        if (s1 + 4 * t <= F.Lstar(s.slice(0, 7))) continue;
        const a = F.analyze(s);
        if (a.cls === 'unique' && a.winners.length === 1 && a.winners[0] === 'psi') { first = s; break; }
      }
  check('psi: no puzzle with four equal smallest sides and a smaller largest side',
    first && first.join() === lv.s.join(), first ? `first found ${first.join(' ')}` : 'none found');
}

console.log('stars and reduction');
const REDUCE = { shelf: 'windowpane', column: 'shelf', center: 'column', right: 'column',
  beta: 'center', theta: 'center', pi: 'center', rho: 'center', chi: 'center',
  omicron: 'top', phi: 'top', nu: 'right', tau: 'right', psi: 'right' };
check('reduces-to matches the paper\'s list', L.every(l => (REDUCE[l.id] || null) === l.reducesTo));
const starsFor = l => l.n <= 6 ? 1 : l.n === 7 ? (l.reducesTo ? 2 : 3) : (l.reducesTo ? 3 : 4);
check('stars follow the rule (reduce = one star easier)', L.every(l => l.stars === starsFor(l)),
  L.filter(l => l.stars !== starsFor(l)).map(l => l.id).join(' '));
check('stars never go down along the path', L.every((l, i) => i === 0 || l.stars >= L[i - 1].stars));
check('top comes before the 3-star 8-square levels', LV.byStrategy(7, 'top').level <
  Math.min(...L.filter(l => l.n === 8 && l.stars === 3).map(l => l.level)));
check('a reducing level builds on an earlier level of that strategy',
  L.filter(l => l.reducesTo).every(l => LV.get(l.buildsOn).id === l.reducesTo && l.buildsOn < l.level));

console.log('fixed shuffle');
let order = null;
try { order = execFileSync('python3', [path.join(__dirname, '..', 'tools', 'level_order.py')], { encoding: 'utf8' }).trim().split('\n'); }
catch (e) { console.log('  [ - ] python3 not available; shuffle not re-derived'); }
if (order) check('order equals tools/level_order.py (seeds 20261021, 20261022)', order.join() === L.map(l => l.id).join());

console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
