/*
 * reveal.js — what the answer panel and the shadow bars say about a seed.
 *
 * answer(a, k) takes F.analyze(s) and the index k of the revealed packing (a tab, for
 * tied seeds) and returns plain data plus small HTML strings: the strategy's name and
 * formula with values, definitions of named terms, a one-paragraph verdict, the ledger
 * rows with the floor line, and the chains to draw as shadow bars.  why(a, P) is the
 * plain-language version: the lines of squares that fill the frame exactly.
 *
 * Browser global: SPReveal (needs SPFormula).  Node: module.exports.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const F = node ? require('./formula.js') : root.SPFormula;
  const I = node ? require('./i18n.js') : root.SPI18n;
  const T = I.t;

  const BARS_PER_AXIS = 4;

  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** 's_1+s_3' -> 's<sub>1</sub>+s<sub>3</sub>' (also C_0, L*_7). */
  const sub = label => esc(label).replace(/_(\d+)/g, '<sub>$1</sub>');
  const expanded = indices => indices.map(i => 's_' + i).join('+');
  const Lstar = n => `L*_${n}`;

  /** A strategy's name in the current language (Greek letters stay as they are). */
  function name(id) {
    return I.has('strat.' + id) ? T('strat.' + id) : (F.DISPLAY[id] || id);
  }

  /** Title of a strategy: its name, and for Greek letters the spelled-out id. */
  function title(id) {
    const nm = name(id), greek = (F.DISPLAY[id] || id) !== id;
    return { name: nm, id, greek, html: greek ? `${esc(nm)}<small>${esc(id)}</small>` : esc(nm) };
  }

  const nameList = ids => I.list(ids.map(id => esc(name(id))));

  /*
   * Chains drawn as shadow bars, at most BARS_PER_AXIS per axis, in priority order:
   *   1. terms of the shown strategy that reach L,
   *   2. other terms of the formula tree that reach L and are chains of this packing,
   *   3. terms of the shown strategy that fall short (drawn grey, with their gaps),
   *   4. chains attaining the floor L*_{n-1} (grey), which show what the last square adds.
   */
  function barChains(a, r) {
    const L = a.L, key = c => c.indices.join(',');
    const own = r.chains.filter(c => c.axis);
    const floorChains = a.floor < L ? F.tightChains(a.s, r.positions, a.floor) : [];
    const ranked = [
      ...own.filter(c => c.sum === L),
      ...r.tightChains,
      ...own.filter(c => c.sum < L),
      ...floorChains,
    ];
    const seen = new Set(), per = { h: 0, v: 0 }, out = [];
    for (const c of ranked) {
      if (seen.has(key(c)) || per[c.axis] >= BARS_PER_AXIS) continue;
      seen.add(key(c)); per[c.axis]++;
      out.push({ indices: c.indices.slice(), label: c.label, sum: c.sum, axis: c.axis });
    }
    return out;
  }

  function answer(a, k) {
    k = Math.max(0, Math.min(k || 0, a.reveal.length - 1));
    const r = a.reveal[k], L = a.L, n = a.n, f = a.floor;
    const out = {
      n, L, floor: f, cls: a.cls, index: k,
      tabs: a.reveal.length > 1 ? a.reveal.map(x => title(x.id)) : [],
      positions: r.positions.map(p => p.slice()),
      chains: barChains(a, r),
      ledger: [],
    };

    // n = 4: no strategies; the windowpane always works
    if (!a.ledger.length) {
      out.title = title(r.id);
      out.formulaHTML = `${sub(Lstar(n))} = s<sub>0</sub>+s<sub>1</sub> = ${L}`;
      out.defsHTML = '';
      out.verdictHTML = T('verdict.n4');
      return out;
    }

    const e = a.ledger.find(x => x.id === r.id);
    out.title = title(r.id);
    const bold = t => e.attaining.includes(t.label) && e.value === L ? `<b>${sub(t.label)}</b>` : sub(t.label);
    if (e.terms.length === 1) {
      const t = e.terms[0];
      out.formulaHTML = `${esc(out.title.name)} = ${bold(t)} = ${t.sum}`;
    } else {
      out.formulaHTML = `${esc(out.title.name)} = max(${e.terms.map(bold).join(', ')})` +
        `<br>= max(${e.terms.map(t => t.sum).join(', ')}) = ${e.value}`;
    }
    const named = e.terms.filter(t => t.label !== expanded(t.indices));
    out.defsHTML = named.map(t => `${sub(t.label)} = ${sub(expanded(t.indices))}`).join(', ');

    const fl = `${sub(Lstar(n - 1))} = ${f}`;
    const nm = esc(out.title.name);
    if (a.cls === 'unique') {
      out.verdictHTML = a.ledger.length === 1
        ? T('verdict.unique1', { L, fl, d: L - f })
        : T('verdict.unique', { name: nm, L, fl, d: L - f });
    } else if (a.cls === 'tied') {
      out.verdictHTML = T('verdict.tied', { k: a.winners.length, L, list: nameList(a.winners), fl });
    } else {
      const at = a.attribution;
      const setBy = at.level === 2
        ? T('verdict.setByPair', { L })
        : T('verdict.setBy', { m: at.level, k: at.strategies.length, list: nameList(at.strategies), terms: at.terms.map(sub).join(', '), L });
      const fits = a.ledger.length === 1
        ? T('verdict.newOnly', { v: e.value })
        : a.reveal.length === 1
          ? T('verdict.onlyFits', { name: nm, v: e.value, L })
          : T('verdict.kFit', { k: a.reveal.length, L, list: nameList(a.reveal.map(x => x.id)) });
      out.verdictHTML = `${T('verdict.free', { Ln: sub(Lstar(n)), Lm: sub(Lstar(n - 1)), L })} ${setBy} ${fits}`;
    }

    // ledger: cheapest first, ties in display order; the floor line sits above the
    // first strategy that costs more than the floor
    const order = a.ledger.map((x, i) => [x, i]).sort((p, q) => p[0].value - q[0].value || p[1] - q[1]);
    let floorPlaced = false;
    for (const [x] of order) {
      if (!floorPlaced && x.value > f) {
        out.ledger.push({ floor: true, value: f, html: T('ans.floorRow', { Lm: sub(Lstar(n - 1)) }) });
        floorPlaced = true;
      }
      out.ledger.push({
        id: x.id, name: esc(name(x.id)), value: x.value, over: x.value - L,
        win: x.value <= L, shown: x.id === r.id,     // every strategy at or below L* fits
        tab: a.reveal.findIndex(y => y.id === x.id),   // its tab, or -1
        termsHTML: x.attaining.map(sub).join(', '),
      });
    }
    if (!floorPlaced) out.ledger.push({ floor: true, value: f, html: T('ans.floorRow', { Lm: sub(Lstar(n - 1)) }) });
    return out;
  }

  /*
   * The hint ladder for a seed, from the canonical packing of tab k:
   *   1  the floor: what the last square costs (or that it is free)
   *   2  which square holds each corner of the frame
   *   3  up to three chains that reach L*, as groups that must line up
   *   4  one square shown in place: the smallest that holds no corner
   * (the full answer is the fifth step).  Returns { steps: [{ kind, html }],
   * overlay: { corners: [{ name, i, pos }], groups: [{ indices, axis }], ghost: { i, pos } } }.
   */
  const CORNERS = [
    ['ll', (x, y, s, L) => x === 0 && y === 0],
    ['lr', (x, y, s, L) => x + s === L && y === 0],
    ['ul', (x, y, s, L) => x === 0 && y + s === L],
    ['ur', (x, y, s, L) => x + s === L && y + s === L],
  ];

  function hints(a, k) {
    const ans = answer(a, k);
    const s = a.s, n = a.n, L = a.L, P = ans.positions;
    const steps = [];

    if (n === 4) steps.push({ kind: 'floor', html: T('hint.floor4', { a: s[0], b: s[1], L }) });
    else if (a.cls === 'free') steps.push({ kind: 'floor', html: T('hint.floorFree', { m: n - 1, L }) });
    else steps.push({ kind: 'floor', html:
      T('hint.floor', { m: n - 1, f: a.floor, s: s[n - 1], d: L - a.floor }) + (a.cls === 'tied' ? T('hint.tiedExtra') : '') });

    const corners = CORNERS.map(([name, test]) => {
      const i = s.findIndex((_, j) => test(P[j][0], P[j][1], s[j], L));
      return { name, i, pos: i >= 0 ? P[i].slice() : null };
    });
    steps.push({ kind: 'corners', html: T('hint.corners', { list: corners.map(c =>
      T('hint.cornerItem', { c: T('corner.' + c.name), s: c.i >= 0 ? s[c.i] : T('hint.nothing') })).join(T('hint.cornerSep')) }) });

    const groups = ans.chains.filter(c => c.sum === L).slice(0, 3).map(c => {
      const k = c.axis === 'h' ? 0 : 1;
      const order = c.indices.slice().sort((p, q) => P[p][k] - P[q][k]);
      return { indices: order, axis: c.axis };
    });
    const groupText = groups.map((g, j) => {
      const list = g.indices.map(i => s[i]);
      return T(g.axis === 'h' ? 'hint.groupH' : 'hint.groupV', { j: j + 1, list: list.join(', '), sum: list.join(' + '), L });
    });
    steps.push({ kind: 'groups', html: groupText.join('; ') + '.' });

    const inCorner = new Set(corners.map(c => c.i));
    let gi = n - 1;
    while (gi >= 0 && inCorner.has(gi)) gi--;
    const ghost = gi >= 0 ? { i: gi, pos: P[gi].slice() } : null;
    steps.push({ kind: 'ghost', html: ghost ? T('hint.ghost', { s: s[gi] }) : T('hint.ghostNone') });

    return { steps, overlay: { corners, groups, ghost } };
  }

  /*
   * The plain-language reason a packing is tight, for players who do not want formulas:
   * up to two lines of squares that fill the frame exactly from wall to wall (tight chains of
   * the formula), one across and one from bottom to top when both exist, longest first.
   * Uses the packing P when it has such a line, else the canonical packing (and says so).
   * Returns { html, groups: [{ indices, axis }] in the order numbered in the text, standard }.
   */
  function why(a, P) {
    const L = a.L, s = a.s;
    let chains = P ? F.tightChains(s, P, L) : [], standard = false;
    if (!chains.length) {
      P = a.reveal[0].positions;
      chains = F.tightChains(s, P, L);
      standard = true;
    }
    if (!chains.length) return { html: '', groups: [], standard };
    const longest = (axis) => chains.filter(c => c.axis === axis).sort((x, y) => y.indices.length - x.indices.length)[0];
    const h = longest('h'), v = longest('v');
    let picked = [h, v].filter(Boolean);
    if (picked.length === 1) {
      const more = chains.filter(c => c !== picked[0] && c.axis === picked[0].axis)
        .filter(c => c.indices.join() !== picked[0].indices.join());
      if (more.length) picked.push(more.sort((x, y) => y.indices.length - x.indices.length)[0]);
    }
    const groups = picked.map(c => {
      const k = c.axis === 'h' ? 0 : 1;
      return { indices: c.indices.slice().sort((i, j) => P[i][k] - P[j][k]), axis: c.axis };
    });
    const items = groups.map((g, k) => T(g.axis === 'h' ? 'why.h' : 'why.v',
      { k: k + 1, sum: g.indices.map(i => s[i]).join(' + '), L }));
    const key = items.length === 1 ? (standard ? 'why.stdOne' : 'why.one') : (standard ? 'why.stdTwo' : 'why.two');
    return { html: T(key, { a: items[0], b: items[1] }), groups, standard };
  }

  const api = { answer, barChains, hints, sub, title, name, why };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPReveal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
