// node tools/cvd_check.js  -- how distinguishable are the square colours?
// Reads the colour tokens from src/page.html (the squares are drawn opaque, so ALPHA = 1),
// simulates full protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes
// 2009, severity 1), and reports the closest pairs in CIEDE2000.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'page.html'), 'utf8');

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = tokens(html.slice(html.indexOf(':root {'), html.indexOf('@media (prefers-color-scheme: dark)')));
const darkBlock = html.slice(html.indexOf(':root[data-theme="dark"]'));
const dark = Object.assign({}, light, tokens(darkBlock.slice(0, darkBlock.indexOf('}'))));

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = x => Math.min(1, Math.max(0, x));
const MAT = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
function simulate(rgb, kind) {
  const lin = rgb.map(toLin), M = MAT[kind];
  return M.map(r => fromLin(clamp(r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2])));
}
function lab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
      Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  [X, Y, Z] = [f(X), f(Y), f(Z)];
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function de2000(a, b) {
  const [L1, a1, b1] = a, [L2, a2, b2] = b, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (x, y) => { const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0; else if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2) : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2)), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

const NAMES = ['rank-0', 'rank-1', 'rank-2', 'rank-3', 'rank-4', 'rank-5', 'rank-6', 'rank-last'];
const ALPHA = 1;
let worst = Infinity;
for (const [theme, tk] of [['light', light], ['dark', dark]]) {
  const paper = hex(tk.paper);
  const shown = NAMES.map(n => hex(tk[n]).map((c, i) => ALPHA * c + (1 - ALPHA) * paper[i]));
  console.log(`\n${theme} theme (opaque squares)`);
  for (const kind of Object.keys(MAT)) {
    const L = shown.map(c => lab(simulate(c, kind)));
    const pairs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push([de2000(L[i], L[j]), NAMES[i], NAMES[j]]);
    pairs.sort((a, b) => a[0] - b[0]);
    worst = Math.min(worst, pairs[0][0]);
    console.log(`  ${kind.padEnd(7)} closest pairs: ` + pairs.slice(0, 3).map(([d, a, b]) => `${a}/${b} ${d.toFixed(1)}`).join(', '));
  }
  const ch = ['chain-h', 'chain-v'].map(n => lab(hex(tk[n])));
  console.log(`  hint ring colours (left-right / bottom-top): ` + Object.keys(MAT).map(k =>
    `${k} ${de2000(lab(simulate(hex(tk['chain-h']), k)), lab(simulate(hex(tk['chain-v']), k))).toFixed(1)}`).join(', '));
}
console.log(`\nworst pair overall: ${worst.toFixed(1)}  (rule of thumb: below about 10 is hard to tell apart at a glance)`);
