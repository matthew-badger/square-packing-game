// node tools/fonts.js <dir>  ->  src/fonts/*.woff2, src/fonts/fonts.css, src/fonts/OFL-*.txt
//
// <dir> holds the unpacked Fontsource packages, made by
//   npm pack @fontsource/archivo@5.3.0 @fontsource/atkinson-hyperlegible@5.3.0 \
//            @fontsource/jetbrains-mono@5.3.0 @fontsource/noto-sans-devanagari@5.3.0
//   for f in *.tgz; do mkdir -p "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}"; done
//
// Only the weights and character subsets the page uses are copied: the same set the Google
// Fonts link used to serve.  Chinese uses the reader's system fonts (a CJK font is megabytes).
// build.js inlines fonts.css and turns each url(...) into a data URI, so the game makes no
// requests to other sites.
'use strict';
const fs = require('fs');
const path = require('path');

const FONTS = [
  { pkg: 'archivo', family: 'Archivo', weights: [600, 800], subsets: ['latin', 'latin-ext'] },
  { pkg: 'atkinson-hyperlegible', family: 'Atkinson Hyperlegible', weights: [400, 700], subsets: ['latin', 'latin-ext'] },
  { pkg: 'jetbrains-mono', family: 'JetBrains Mono', weights: [500, 600], subsets: ['latin', 'latin-ext', 'greek'] },
  { pkg: 'noto-sans-devanagari', family: 'Noto Sans Devanagari', weights: [400, 700], subsets: ['devanagari'] },
];

const dir = process.argv[2];
if (!dir) throw new Error('usage: node tools/fonts.js <dir with unpacked fontsource packages>');
const out = path.join(__dirname, '..', 'src', 'fonts');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const css = ['/* Self-hosted fonts (SIL Open Font License 1.1; see OFL-*.txt). Made by tools/fonts.js. */'];
let bytes = 0;
for (const f of FONTS) {
  const pkgDir = fs.readdirSync(dir).map(d => path.join(dir, d, 'package'))
    .find(p => fs.existsSync(path.join(p, 'package.json')) &&
               JSON.parse(fs.readFileSync(path.join(p, 'package.json'))).name === `@fontsource/${f.pkg}`);
  if (!pkgDir) throw new Error(`@fontsource/${f.pkg} not found in ${dir}`);
  const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'))).version;
  // unicode-range of each subset, from the package's index.css
  const index = fs.readFileSync(path.join(pkgDir, 'index.css'), 'utf8');
  const ranges = {};
  const re = new RegExp(`/\\* ${f.pkg}-([a-z-]+)-400-normal \\*/[^}]*?unicode-range: ([^;]+);`, 'g');
  for (const m of index.matchAll(re)) ranges[m[1]] = m[2];
  for (const w of f.weights) {
    for (const s of f.subsets) {
      if (!ranges[s]) throw new Error(`no unicode-range for ${f.pkg} ${s}`);
      const file = `${f.pkg}-${s}-${w}-normal.woff2`;
      fs.copyFileSync(path.join(pkgDir, 'files', file), path.join(out, file));
      bytes += fs.statSync(path.join(out, file)).size;
      css.push(`@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${w}; font-display: swap;\n` +
               `  src: url(${file}) format('woff2');\n  unicode-range: ${ranges[s]}; }`);
    }
  }
  fs.copyFileSync(path.join(pkgDir, 'LICENSE'), path.join(out, `OFL-${f.pkg}.txt`));
  console.log(`${f.family}: @fontsource/${f.pkg}@${version}`);
}
fs.writeFileSync(path.join(out, 'fonts.css'), css.join('\n') + '\n');
console.log(`${(bytes / 1024).toFixed(0)} KB of woff2 in ${out}`);
