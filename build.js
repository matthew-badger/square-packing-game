// node build.js  ->  docs/index.html
// src/page.html with the modules and the fonts inlined, and the version from package.json.
// GitHub Pages serves docs/ as it is.
'use strict';
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src');
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
let html = fs.readFileSync(path.join(src, 'page.html'), 'utf8');
html = html.replace(/\/\*INLINE:([\w./-]+)\*\//g, (_, file) => {
  let code = fs.readFileSync(path.join(src, file), 'utf8');
  if (code.includes('</script') || code.includes('</style')) throw new Error(`${file} contains a closing tag`);
  if (file.endsWith('.css')) {
    // url(name.woff2) next to the stylesheet becomes a data URI
    code = code.replace(/url\(([\w.-]+\.woff2)\)/g, (_, f) =>
      `url(data:font/woff2;base64,${fs.readFileSync(path.join(src, path.dirname(file), f)).toString('base64')})`);
  }
  return '\n' + code + '\n';
});
html = html.replace(/__VERSION__/g, version);
if (/https?:\/\/fonts\.g/.test(html)) throw new Error('the page still loads Google Fonts');

fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'docs', 'index.html'), html);
console.log(`version ${version}: wrote docs/index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
