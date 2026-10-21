// node tools/build_bank.js  ->  src/bank.js
//
// The seed bank.  For every n = 4..8 it scans all primitive sorted tuples with
// s_0 in WINDOW (ties allowed) and files each tuple under the keys it can be served for:
//   u:<id>  unique   -- strategy <id> is the only winner, strictly above L*_{n-1}
//   t:<id>  tied     -- <id> is one of two or more winners, strictly above L*_{n-1}
//   f:<id>  free     -- L*_n = L*_{n-1}; <id> is the strategy binding at the smallest level
//                       m with L*_m = L*_n (pair, shelf, column, top, center or right)
// For each key it keeps up to K tuples with distinct sides and K with a repeated side,
// at most one per value of s_0, best first:
//   unique         larger relative depth min(up, down) / L*, where down = L* - L*_{n-1} and
//                  up = (smallest strategy value above L*) - L*
//   tied           fewer winners, then larger relative depth
//   free           fewer strategies that fit, then a larger margin L* - L*_{m-1} at the
//                  binding level
// One s_0 window for every strategy keeps the size of the numbers from giving away which
// strategy a seed tests.
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../src/formula.js');

const WINDOW = [12, 30];
const K = 10;
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

const levels = {};   // n -> [{ id, terms }]
for (let n = 5; n <= 8; n++) levels[n] = F.STRATEGIES[n].map(st => ({ id: st.id, terms: st.terms }));
const val = (s, terms) => { let v = 0; for (const t of terms) { let x = 0; for (const i of t) x += s[i]; if (x > v) v = x; } return v; };

// lstar for each prefix length, computed once per tuple
function prefixL(s) {
  const n = s.length, out = new Array(n + 1);
  out[1] = s[0];
  for (let m = 2; m <= n; m++) {
    if (m <= 4) { out[m] = s[0] + s[1]; continue; }
    let mn = Infinity;
    for (const st of levels[m]) { const v = val(s, st.terms); if (v < mn) mn = v; }
    out[m] = Math.max(out[m - 1], mn);
  }
  return out;
}

const pools = {};   // n -> key -> { d: Map(s0 -> cand), r: Map(s0 -> cand) }
function file(n, key, s, score) {
  const P = (pools[n] ||= {});
  const k = (P[key] ||= { d: new Map(), r: new Map() });
  const distinct = s.every((v, i) => i === 0 || v < s[i - 1]);
  const m = distinct ? k.d : k.r;
  const b = m.get(s[0]);
  if (!b || score > b.score) m.set(s[0], { s: s.slice(), score });
}

function consider(s) {
  const n = s.length;
  let g = s[0];
  for (let i = 1; i < n && g > 1; i++) g = gcd(g, s[i]);
  if (g !== 1) return;
  const Lp = prefixL(s), L = Lp[n], floor = Lp[n - 1];
  if (n >= 5) {
    const vals = levels[n].map(st => val(s, st.terms));
    let mn = Infinity;
    for (const v of vals) if (v < mn) mn = v;
    if (mn > floor) {
      let next = Infinity;
      for (const v of vals) if (v > mn && v < next) next = v;
      const up = next === Infinity ? mn : next - mn;
      const score = Math.min(up, mn - floor) / mn;
      const winners = levels[n].filter((st, i) => vals[i] === mn).map(st => st.id);
      if (winners.length === 1) file(n, 'u:' + winners[0], s, score);
      // tied: as few winners as possible (two is a real choice; ten is noise), then depth
      else for (const id of winners) file(n, 't:' + id, s, score - 1000 * (winners.length - 2));
      return;
    }
  }
  // free: the smallest level with the same value, and its binding strategies
  let m = 2;
  while (m < n && Lp[m] !== L) m++;
  const fit = n >= 5 ? levels[n].filter(st => val(s, st.terms) <= L).length : 1;
  const score = -1000 * fit + (L - Lp[m - 1]) / L;
  if (m <= 4) { file(n, 'f:pair', s, score); return; }
  for (const st of levels[m]) if (val(s, st.terms) === L) file(n, 'f:' + st.id, s, score);
}

function scan(n, s0) {
  const s = new Array(n).fill(s0);
  for (;;) {
    consider(s);
    let i = n - 1;
    while (i >= 1 && s[i] === 1) i--;
    if (i < 1) return;
    s[i]--;
    for (let j = i + 1; j < n; j++) s[j] = s[i];
  }
}

const t0 = Date.now();
for (let n = 4; n <= 8; n++) {
  for (let s0 = WINDOW[0]; s0 <= WINDOW[1]; s0++) scan(n, s0);
  console.log(`n=${n} scanned  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// pick the K best of each pool, one per s_0
const bank = { window: WINDOW, K };
const report = [];
for (let n = 4; n <= 8; n++) {
  const out = {};
  for (const key of Object.keys(pools[n]).sort()) {
    const pick = m => [...m.values()].sort((a, b) => b.score - a.score || a.s[0] - b.s[0]).slice(0, K).map(c => c.s);
    const d = pick(pools[n][key].d), r = pick(pools[n][key].r);
    out[key] = d.concat(r);
    report.push([n, key, d.length, r.length]);
  }
  bank[n] = out;
}
const short = report.filter(([, , d, r]) => d + r < 2 * K);
console.log(`\n${report.length} keys; ${report.filter(([, , d]) => d === K).length} with ${K} distinct-sided seeds`);
for (const [n, key, d, r] of report) if (d < K) console.log(`  n=${n} ${key.padEnd(10)} distinct ${d}, with repeated sides ${r}`);
if (short.length) console.log(`(${short.length} keys hold fewer than ${2 * K} seeds in all)`);

const body = JSON.stringify(bank);
fs.writeFileSync(path.join(__dirname, '..', 'src', 'bank.js'),
  '// Generated by tools/build_bank.js -- the seed bank (see that file for the rules).\n' +
  '(function (root) {\n  const BANK = ' + body + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = BANK; else root.SPBank = BANK;\n" +
  "})(typeof globalThis !== 'undefined' ? globalThis : this);\n");
console.log(`wrote src/bank.js (${(body.length / 1024).toFixed(1)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
