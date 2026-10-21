// Run from the game folder:  node test/i18n.test.js
'use strict';
// --full sweeps the larger populations (npm run test:full); the default is a quick sample
const FULL = process.argv.includes('--full');
const TABS = FULL ? Infinity : 2;      // tabs checked per tied seed
const POPS = FULL ? [[4, 12], [5, 12], [6, 11], [7, 10], [8, 9]]
  : [[4, 8], [5, 8], [6, 8], [7, 8], [8, 7]];
const fs = require('fs');
const path = require('path');
const I = require('../src/i18n.js');
const F = require('../src/formula.js');
const R = require('../src/reveal.js');

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

console.log('1. Tables');
const en = Object.keys(I.STR.en), langs = Object.keys(I.STR);
for (const l of langs) {
  const keys = Object.keys(I.STR[l]);
  const missing = en.filter(k => !keys.includes(k)), extra = keys.filter(k => !en.includes(k));
  check(`${l}: same keys as English (${keys.length})`, !missing.length && !extra.length,
        `missing ${missing.join(' ')} extra ${extra.join(' ')}`);
  // an entry may be a plain string in one language and a function in another (plurals and
  // agreement differ); what matters is that both render, which section 2 exercises
}

// every key the sources use exists
const used = new Set();
const src = ['page.html', 'reveal.js', 'board.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
for (const m of src.matchAll(/\bT\(\s*'([\w.]+[\w])'/g)) used.add(m[1]);
for (const m of src.matchAll(/data-i18n(?:-html|-aria|-title)?="([\w.]+)"/g)) used.add(m[1]);
const unknown = [...used].filter(k => !I.has(k));
check(`all ${used.size} keys passed to T() or data-i18n exist`, !unknown.length, unknown.join(' '));
// keys chosen inside an expression, e.g. T(cond ? 'a' : 'b'), appear as quoted literals
for (const m of src.matchAll(/'([a-zA-Z]+\.[\w.]+)'/g)) if (I.has(m[1])) used.add(m[1]);
// keys built at run time
const dynamic = ['corner.ll', 'corner.lr', 'corner.ul', 'corner.ur', 'strat.pair', 'strat.windowpane', 'strat.shelf',
                 'strat.column', 'strat.top', 'strat.center', 'strat.right', 'kb.noRoom', 'kb.blocked'];
check('keys built at run time exist', dynamic.every(k => I.has(k)));
const unused = en.filter(k => !used.has(k) && !dynamic.includes(k) && !['list.sep', 'list.and', 'lang.draft'].includes(k));
check('no unused keys', !unused.length, unused.join(' '));

console.log('\n2. Every answer and hint renders in every language');
const leftover = /\b(?:verdict|hint|corner|strat|atlas|ladder|status|btn|kb|ans|why)\.[a-zA-Z0-9]+\b|\{[a-zA-Z]+\}|undefined|NaN/;
for (const l of langs) {
  I.setLang(l);
  let count = 0, bad = 0, first = null;
  for (const [n, M] of POPS) {
    for (const s of tuples(n, M)) {
      const a = F.analyze(s);
      for (let k = 0; k < Math.min(a.reveal.length, TABS); k++) {
        count++;
        const ans = R.answer(a, k), h = R.hints(a, k);
        const text = [ans.title.name, ans.formulaHTML, ans.verdictHTML, ans.defsHTML,
                      ...ans.ledger.map(r => (r.html || '') + (r.name || '')), ...h.steps.map(x => x.html),
                      R.why(a, ans.positions).html].join(' | ');
        if (leftover.test(text)) { bad++; first = first || `(${s})#${k}: ${text.match(leftover)[0]}`; }
      }
    }
  }
  check(`${l}: ${count.toLocaleString()} answers and hint ladders, no missing keys or placeholders`, !bad, first || '');
}

console.log('\n3. Samples in Spanish');
I.setLang('es');
for (const s of [[19, 16, 13, 12, 10, 9, 8], [9, 9, 9, 8, 8, 8, 8, 8], [20, 19, 13, 13, 12, 10, 9, 8]]) {
  const a = F.analyze(s), ans = R.answer(a, 0), h = R.hints(a, 0);
  console.log(`   (${s.join(',')}) ${ans.title.name}`);
  console.log(`     ${ans.verdictHTML}`);
  h.steps.forEach((x, k) => console.log(`     ${k + 1}. ${x.html}`));
}
console.log(`   ${I.t('status.usedHints', { h: 1 })} | ${I.t('status.usedHints', { h: 3 })} | ` +
            `${I.t('levels.solved', { k: 1, n: 29 })} | ${I.t('status.toGo', { k: 1 })}`);
I.setLang('en');
check('pick: saved choice, else browser, else English',
      I.pick('es', 'en-US') === 'es' && I.pick(null, 'es-MX') === 'es' && I.pick(null, 'de-DE') === 'en' && I.pick(null, 'zh-CN') === 'zh' && I.pick(null, 'pt-BR') === 'pt' && I.pick('xx', undefined) === 'en');

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
