// Run from the game folder:  node test/serve.test.js
'use strict';
const F = require('../src/formula.js');
const BANK = require('../src/bank.js');
const S = require('../src/serve.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'OK ' : 'BAD'}] ${name}${detail ? '  ' + detail : ''}`);
}
let seed = 20261019;
const rnd = k => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * k); };
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

// ----------------------------------------------------------------------------------------
console.log('1. Every bank seed is what its key says');
{
  let total = 0;
  const bad = [];
  for (let n = 4; n <= 8; n++) {
    for (const [key, list] of Object.entries(BANK[n])) {
      const [c, id] = key.split(':');
      const seen = new Set();
      for (const s of list) {
        total++;
        const a = F.analyze(s);
        const ok = s.length === n && s.reduce(gcd) === 1 && s[0] >= BANK.window[0] && s[0] <= BANK.window[1]
          && !seen.has(s.join(','))
          && (c === 'u' ? a.cls === 'unique' && a.winners[0] === id
            : c === 't' ? a.cls === 'tied' && a.winners.includes(id)
            : a.cls === 'free' && a.attribution.strategies.includes(id));
        seen.add(s.join(','));
        if (!ok && bad.length < 5) bad.push(`n=${n} ${key} (${s})`);
      }
    }
  }
  check(`${total.toLocaleString()} seeds: primitive, in the window, no duplicates, correctly classed`, !bad.length, bad.join(' | '));
  const u8 = S.idsFor(8, 'u'), t8 = S.idsFor(8, 't'), f8 = S.idsFor(8, 'f'), u7 = S.idsFor(7, 'u');
  check('n=8 has unique seeds for all 23 strategies', u8.length === 23, `${u8.length}`);
  check('n=8 has tied seeds for all 23 strategies', t8.length === 23, `${t8.length}`);
  check('n=7 has unique and tied seeds for all 3', u7.length === 3 && S.idsFor(7, 't').length === 3);
  console.log(`   free-seed floor strategies: n=5 ${S.idsFor(5, 'f')}; n=6 ${S.idsFor(6, 'f')}; n=7 ${S.idsFor(7, 'f')}; n=8 ${f8}`);
  const minU = Math.min(...u8.map(id => BANK[8]['u:' + id].length));
  console.log(`   smallest unique pool at n=8: ${minU} seeds`);
}

// ----------------------------------------------------------------------------------------
console.log('\n2. Deck: each strategy once per pass');
for (const n of [8, 7]) {
  const label = `n=${n}`;
  const st = S.newState();
  const dealt = [];          // strategy-deck draws in order
  let freeDraws = 0, wrong = 0;
  while (dealt.length < 10 * F.STRATEGIES[n].length) {
    const r = S.next(st, n, rnd);
    const a = F.analyze(r.s);
    if (r.cls === 'free') {
      freeDraws++;
      if (a.cls !== 'free' || !a.attribution.strategies.includes(r.id)) wrong++;
      continue;
    }
    dealt.push(r.id);
    if (a.cls !== r.cls || !a.winners.includes(r.id)) wrong++;
  }
  const m = F.STRATEGIES[n].length;
  let perm = true, repeat = false;
  for (let p = 0; p < 10; p++) {
    const block = dealt.slice(p * m, (p + 1) * m);
    if (new Set(block).size !== m) perm = false;
  }
  for (let i = 1; i < dealt.length; i++) if (dealt[i] === dealt[i - 1]) repeat = true;
  check(`${label}: 10 passes, every pass deals each of the ${m} once`, perm && !wrong,
        `${wrong} misclassified, ${freeDraws} free draws alongside`);
  check(`${label}: never the same strategy twice in a row`, !repeat);
}

// ----------------------------------------------------------------------------------------
console.log('\n3. Seeds');
{
  const st = S.newState();
  const byKey = {};
  let early = 0;
  for (let k = 0; k < 3000; k++) {
    const r = S.next(st, 8, rnd);
    const list = (byKey[r.key] ||= []);
    const pool = BANK[8][r.key].length;
    // within each run of `pool` draws of a key, no repeats
    const cycle = list.slice(list.length - (list.length % pool));
    if (cycle.includes(r.s.join(','))) early++;
    list.push(r.s.join(','));
  }
  check('no seed repeats before its pool is used up (3,000 draws)', early === 0, `${early}`);
  const mix = { unique: 0, tied: 0, free: 0 };
  const st5 = S.newState();
  for (let k = 0; k < 3000; k++) mix[S.next(st5, 8, rnd).cls]++;
  check('the class mix is close to 80/10/10', Math.abs(mix.unique / 30 - 80) < 4 && Math.abs(mix.tied / 30 - 10) < 3 && Math.abs(mix.free / 30 - 10) < 3,
        JSON.stringify(mix));

  for (const n of [4, 5, 6]) {
    let bad = 0;
    const st4 = S.newState();
    for (let k = 0; k < 300; k++) {
      const r = S.next(st4, n, rnd);
      const a = F.analyze(r.s);
      if (a.cls !== r.cls) bad++;
    }
    check(`n=${n} draws are correctly classed`, bad === 0, `${bad}`);
  }

  // state survives a JSON round trip mid-pass
  const a = S.newState(), b = S.newState();
  let sa = 7, sb = 7;
  const ra = k => { sa = (sa * 69069 + 1) % 4294967296; return Math.floor(sa / 4294967296 * k); };
  const rb = k => { sb = (sb * 69069 + 1) % 4294967296; return Math.floor(sb / 4294967296 * k); };
  for (let k = 0; k < 11; k++) { S.next(a, 8, ra); S.next(b, 8, rb); }
  const b2 = JSON.parse(JSON.stringify(b));
  let same = true;
  for (let k = 0; k < 40; k++) if (S.next(a, 8, ra).s.join() !== S.next(b2, 8, rb).s.join()) same = false;
  check('state survives a JSON round trip', same);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
