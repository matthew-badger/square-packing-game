/*
 * formula.js — exact formulas, strategy ledger and canonical placements for L*_n, n <= 8.
 *
 * Input is a side vector s = [s_0, ..., s_{n-1}] of positive integers, sorted
 * non-increasingly.  Every value and every coordinate is a signed sum of sides, so all
 * arithmetic is exact in IEEE doubles (far below 2^53); there is no tolerance anywhere.
 *
 * Structure used throughout.  For n >= 5,
 *     L*_n = max( L*_{n-1}(s_0..s_{n-2}),  min_k  strategy_k(s) ),
 *     strategy_k(s) = max over the terms of strategy k of the term's side-sum,
 * with L*_1 = s_0 and L*_2 = L*_3 = L*_4 = s_0 + s_1.  The strategy lists are:
 *     n = 5   shelf    s_2+s_3+s_4
 *     n = 6   column   s_1+s_4+s_5
 *     n = 7   top / center / right                      (three strategies)
 *     n = 8   alpha .. psi                              (twenty-three strategies)
 * Strategy k is realised by an explicit packing valid at L = max(L*_{n-1}, strategy_k).
 *
 * Runs in the browser (global SPFormula) and under Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- term sets
  const C0 = [0, 5, 6], C3 = [1, 3, 6], R = [1, 4, 5, 6], W = [3, 4, 5, 6], H = [1, 2, 5];

  // Terms that recur from the L*_7 picture keep their names in labels.
  const TERM_NAMES = new Map([
    ['0,5,6', 'C_0'], ['1,3,6', 'C_3'], ['1,4,5,6', 'R'], ['3,4,5,6', 'W'], ['1,2,5', 'H'],
  ]);

  // Strategies per n, in display order.  n = 8 uses the canonical alpha..psi order
  // (descending essentiality on the s_0 = 44 slice); n = 7 uses the panel order
  // top / center / right.
  const STRATEGIES = {
    4: [],
    5: [{ id: 'shelf', terms: [[2, 3, 4]] }],
    6: [{ id: 'column', terms: [[1, 4, 5]] }],
    7: [
      { id: 'top', terms: [W, H] },
      { id: 'center', terms: [C0, C3] },
      { id: 'right', terms: [R] },
    ],
    8: [
      { id: 'alpha', terms: [[0, 4, 7], [1, 2, 7], [1, 3, 5], C0] },
      { id: 'beta', terms: [[0, 3, 7], [2, 5, 6, 7], C0, C3] },
      { id: 'gamma', terms: [[0, 3, 7], [1, 2, 6], C0] },
      { id: 'delta', terms: [[0, 4, 5], [1, 2, 7], C3] },
      { id: 'epsilon', terms: [[2, 4, 6, 7], C0, [1, 3, 4]] },
      { id: 'zeta', terms: [[1, 2, 4], W, [0, 6, 7]] },
      { id: 'eta', terms: [[0, 3, 6], [1, 2, 7]] },
      { id: 'theta', terms: [[0, 2, 7], C0, C3] },
      { id: 'iota', terms: [[2, 5, 6, 7], [1, 3, 5], [0, 4, 7], C0] },
      { id: 'kappa', terms: [[1, 2, 4], [3, 4, 6, 7], C0] },
      { id: 'lambda', terms: [[2, 5, 6, 7], C3, [0, 4, 5]] },
      { id: 'mu', terms: [C0, [1, 4, 6, 7], [1, 3, 5]] },
      { id: 'nu', terms: [[1, 3, 7], [0, 6, 7], R] },
      { id: 'xi', terms: [[2, 4, 5, 6], [1, 3, 6, 7], [1, 3, 5]] },
      { id: 'omicron', terms: [[0, 4, 7], W, H] },
      { id: 'pi', terms: [C0, [1, 3, 6, 7]] },
      { id: 'rho', terms: [[1, 4, 5, 7], C0, C3] },
      { id: 'sigma', terms: [[2, 3, 5, 6], [1, 4, 6, 7]] },
      { id: 'tau', terms: [[2, 3, 6, 7], [1, 4, 5, 6]] },
      { id: 'upsilon', terms: [[2, 3, 4, 6], [1, 5, 6, 7]] },
      { id: 'phi', terms: [[1, 2, 6, 7], W, H] },
      { id: 'chi', terms: [[0, 5, 6, 7], C3] },
      { id: 'psi', terms: [[1, 4, 5, 6, 7]] },
    ],
  };

  // Display names.  The n <= 6 names are provisional.
  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
    omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
    chi: 'χ', psi: 'ψ',
  };
  const DISPLAY = Object.assign({
    pair: 'pair', windowpane: 'windowpane', shelf: 'shelf', column: 'column',
    top: 'top', center: 'center', right: 'right',
  }, GREEK);

  // ---------------------------------------------------------------- arithmetic
  function termSum(s, t) {
    let v = 0;
    for (const i of t) v += s[i];
    return v;
  }

  function termLabel(t) {
    return TERM_NAMES.get(t.join(',')) || t.map(i => 's_' + i).join('+');
  }

  function strategyValue(s, terms) {
    let v = -Infinity;
    for (const t of terms) { const x = termSum(s, t); if (x > v) v = x; }
    return v;
  }

  function checkInput(s) {
    if (!Array.isArray(s) || s.length < 1 || s.length > 8)
      throw new RangeError('expected 1 to 8 sides');
    for (let i = 0; i < s.length; i++) {
      if (!Number.isSafeInteger(s[i]) || s[i] <= 0)
        throw new RangeError('sides must be positive integers');
      if (i > 0 && s[i] > s[i - 1])
        throw new RangeError('sides must be sorted non-increasingly');
    }
  }

  // L*_n for the first n entries of s; no input check (internal, hot path).
  function lstar(s, n) {
    if (n === 1) return s[0];
    if (n <= 4) return s[0] + s[1];
    const floor = lstar(s, n - 1);
    let mn = Infinity;
    for (const st of STRATEGIES[n]) {
      const v = strategyValue(s, st.terms);
      if (v < mn) mn = v;
    }
    return mn > floor ? mn : floor;
  }

  /** L*_n of the side vector s (n = s.length). */
  function Lstar(s) {
    checkInput(s);
    return lstar(s, s.length);
  }

  // ---------------------------------------------------------------- placements
  // Each placer returns the lower-left corners, indexed by square: P[i] = [x_i, y_i].
  // Valid (inside [0,L]^2, interiors disjoint) whenever L >= max(L*_{n-1}, the strategy).

  function fromMap(m, n) {
    const P = new Array(n);
    for (const k in m) P[+k] = m[k];
    return P;
  }

  // n <= 6 share one skeleton: s_0 lower left, s_1 lower right, the top shelf
  // s_2, s_3, s_4 with s_2 and s_4 cornered, s_5 on the right wall above s_1.
  function placeBase(s, L) {
    const n = s.length, P = [];
    P[0] = [0, 0];
    if (n >= 2) P[1] = [L - s[1], 0];
    if (n === 3) P[2] = [0, L - s[2]];
    if (n === 4) { P[2] = [0, L - s[2]]; P[3] = [L - s[3], L - s[3]]; }
    if (n >= 5) {
      P[2] = [0, L - s[2]]; P[3] = [s[2], L - s[3]]; P[4] = [L - s[4], L - s[4]];
    }
    if (n >= 6) P[5] = [L - s[5], s[1]];
    return P;
  }

  const PLACE7 = {
    // s_6 on the top edge between s_4 and the cornered s_5; s_2 on the right wall.
    top: (s, L) => fromMap({
      0: [0, 0], 1: [L - s[1], 0], 2: [L - s[2], s[1]], 3: [0, L - s[3]],
      4: [s[3], L - s[4]], 6: [s[3] + s[4], L - s[6]], 5: [L - s[5], L - s[5]],
    }, 7),
    // the n = 6 skeleton, s_6 interior with its lower-right corner at s_5's lower-left
    center: (s, L) => { const P = placeBase(s.slice(0, 6), L); P[6] = [L - s[5] - s[6], s[1]]; return P; },
    // the n = 6 skeleton, s_6 on the right wall just above s_5
    right: (s, L) => { const P = placeBase(s.slice(0, 6), L); P[6] = [L - s[6], s[1] + s[5]]; return P; },
  };

  // n = 8: ported from verify_L8_general.py (place_alpha .. place_psi).
  function omegaBase(s, L) {
    return {
      0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 5: [L - s[5], s[1]], 6: [L - s[5] - s[6], s[1]],
    };
  }
  function stair(s, L, top3, right3) {
    const m = {
      0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      6: [L - s[6], L - s[6]], 4: [L - s[4], s[1]],
    };
    m[top3] = [s[2] + s[3], L - s[top3]];
    m[right3] = [L - s[right3], s[1] + s[4]];
    return fromMap(m, 8);
  }

  const PLACE8 = {
    alpha: (s, L) => fromMap({ 0: [0, 0], 6: [s[0], 0], 5: [L - s[5], 0], 2: [0, L - s[2]],
      7: [s[2], s[0]], 1: [L - s[1], L - s[3] - s[1]], 3: [L - s[3], L - s[3]],
      4: [L - s[3] - s[4], L - s[4]] }, 8),
    beta: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 5: [L - s[5], s[1]], 6: [L - s[5] - s[6], s[1]],
      7: [L - s[5] - s[6] - s[7], s[0]] }, 8),
    gamma: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 7: [0, s[0]], 3: [0, L - s[3]],
      6: [s[0], s[1]], 5: [L - s[5], s[1]], 2: [s[3], L - s[2]], 4: [L - s[4], L - s[4]] }, 8),
    delta: (s, L) => fromMap({ 0: [0, 0], 5: [0, s[0]], 4: [0, L - s[4]], 1: [L - s[1], 0],
      7: [s[0], s[1]], 6: [L - s[6], s[1]], 2: [s[4], L - s[2]], 3: [L - s[3], L - s[3]] }, 8),
    epsilon: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]],
      4: [L - s[4], L - s[4]], 7: [s[2], L - s[7]], 6: [s[2] + s[7], L - s[6]],
      5: [s[2], s[0]], 3: [L - s[3], s[1]] }, 8),
    zeta: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [L - s[2], s[1]], 7: [0, s[0]],
      6: [0, L - s[6]], 3: [s[6], L - s[3]], 5: [s[6] + s[3], L - s[5]],
      4: [L - s[4], L - s[4]] }, 8),
    eta: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 6: [0, s[0]], 3: [0, L - s[3]],
      5: [L - s[5], s[1]], 7: [L - s[5] - s[7], s[1]], 4: [L - s[4], L - s[4]],
      2: [s[3], L - s[2]] }, 8),
    theta: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 5: [L - s[5], s[1]], 6: [L - s[5] - s[6], s[1]], 7: [0, s[0]] }, 8),
    iota: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [L - s[3], L - s[3]],
      4: [s[2], L - s[4]], 5: [L - s[5], s[1]], 6: [L - s[5] - s[6], s[1]], 7: [s[2], s[0]] }, 8),
    kappa: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [L - s[2], s[1]],
      4: [L - s[4], L - s[4]], 3: [0, L - s[3]], 6: [s[3], L - s[6]],
      7: [s[3] + s[6], L - s[7]], 5: [s[3], s[0]] }, 8),
    lambda: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [L - s[3], L - s[3]],
      4: [s[2], L - s[4]], 6: [L - s[6], s[1]], 7: [L - s[6] - s[7], s[1]], 5: [s[2], s[0]] }, 8),
    mu: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 6: [L - s[6], s[1]], 7: [L - s[7], s[1] + s[6]],
      5: [L - s[6] - s[5], s[1]] }, 8),
    nu: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 6: [L - s[6], s[1]], 5: [L - s[5], s[1] + s[6]],
      7: [L - s[6] - s[7], s[1]] }, 8),
    xi: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 6: [L - s[6], L - s[6]],
      3: [L - s[3], s[1]], 7: [L - s[7], s[1] + s[3]], 4: [s[2], L - s[4]],
      5: [s[2] + s[4], L - s[5]] }, 8),
    omicron: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [L - s[2], s[1]],
      5: [L - s[5], L - s[5]], 3: [0, L - s[3]], 4: [s[3], L - s[4]],
      6: [s[3] + s[4], L - s[6]], 7: [s[3], L - s[4] - s[7]] }, 8),
    pi: (s, L) => { const m = omegaBase(s, L); m[7] = [L - s[5] - s[7], s[1] + s[6]]; return fromMap(m, 8); },
    rho: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], L - s[4]], 5: [L - s[5], s[1]], 7: [L - s[7], s[1] + s[5]],
      6: [L - s[5] - s[6], s[1]] }, 8),
    sigma: (s, L) => stair(s, L, 5, 7),
    tau: (s, L) => stair(s, L, 7, 5),
    upsilon: (s, L) => fromMap({ 0: [0, 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [s[2] + s[3], L - s[4]], 6: [L - s[6], L - s[6]], 1: [L - s[1], 0],
      5: [L - s[5], s[1]], 7: [L - s[7], s[1] + s[5]] }, 8),
    phi: (s, L) => fromMap({ 0: [0, 0], 1: [0, L - s[1]], 2: [s[1], L - s[2]],
      7: [s[1] + s[2], L - s[7]], 6: [L - s[6], L - s[6]], 3: [L - s[3], 0],
      4: [L - s[4], s[3]], 5: [L - s[5], s[3] + s[4]] }, 8),
    chi: (s, L) => { const m = omegaBase(s, L); m[7] = [L - s[5] - s[6] - s[7], s[1]]; return fromMap(m, 8); },
    psi: (s, L) => fromMap({ 0: [0, 0], 1: [L - s[1], 0], 2: [0, L - s[2]], 3: [s[2], L - s[3]],
      4: [L - s[4], s[1]], 5: [L - s[5], s[1] + s[4]], 6: [L - s[6], s[1] + s[4] + s[5]],
      7: [L - s[7], L - s[7]] }, 8),
  };

  /** Canonical placement of strategy `id` for s at side L (n <= 6: id is ignored). */
  function place(id, s, L) {
    const n = s.length;
    if (n <= 6) return placeBase(s, L);
    const table = n === 7 ? PLACE7 : PLACE8;
    const f = table[id];
    if (!f) throw new RangeError(`no strategy ${id} for n = ${n}`);
    return f(s, L);
  }

  /** True iff P packs the squares of s inside [0,L]^2 with disjoint interiors. */
  function isPacking(s, P, L) {
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      if (x < 0 || y < 0 || x + s[i] > L || y + s[i] > L) return false;
    }
    for (let i = 0; i < n; i++) {
      const [ax, ay] = P[i];
      for (let j = i + 1; j < n; j++) {
        const [bx, by] = P[j];
        if (ax < bx + s[j] && bx < ax + s[i] && ay < by + s[j] && by < ay + s[i]) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- chains
  // A horizontal chain has pairwise disjoint x-shadows; a vertical chain disjoint
  // y-shadows.  When both hold, the axis whose shadows leave the smaller total gap is
  // chosen, so the drawn bar is the one the squares actually line up along.
  function shadowGap(s, P, t, k) {
    const iv = t.map(i => [P[i][k], P[i][k] + s[i]]).sort((a, b) => a[0] - b[0]);
    let gap = 0;
    for (let j = 1; j < iv.length; j++) {
      if (iv[j][0] < iv[j - 1][1]) return Infinity;
      gap += iv[j][0] - iv[j - 1][1];
    }
    return gap;
  }

  /** 'h', 'v', or null if the squares of t are not a chain in P. */
  function chainAxis(s, P, t) {
    const gh = shadowGap(s, P, t, 0), gv = shadowGap(s, P, t, 1);
    if (gh === Infinity && gv === Infinity) return null;
    return gh <= gv ? 'h' : 'v';
  }

  // Every term in the formula tree up to level n (the pair, then each level's terms).
  const TREE_TERMS = {};
  for (let n = 1; n <= 8; n++) {
    const seen = new Map();
    const add = t => { if (Math.max(...t) < n) seen.set(t.join(','), t); };
    if (n >= 2) add([0, 1]);
    for (let m = 5; m <= n; m++) for (const st of STRATEGIES[m]) st.terms.forEach(add);
    TREE_TERMS[n] = [...seen.values()];
  }

  /** Terms of the formula tree whose sum is L and which are chains in P. */
  function tightChains(s, P, L) {
    const out = [];
    for (const t of TREE_TERMS[s.length]) {
      const sum = termSum(s, t);
      if (sum !== L) continue;
      const axis = chainAxis(s, P, t);
      if (axis) out.push({ label: termLabel(t), indices: t.slice(), sum, axis });
    }
    return out;
  }

  // ---------------------------------------------------------------- analysis
  function ledgerAt(s, n) {
    return STRATEGIES[n].map(st => {
      const value = strategyValue(s, st.terms);
      return {
        id: st.id, name: DISPLAY[st.id], value,
        terms: st.terms.map(t => ({ indices: t.slice(), label: termLabel(t), sum: termSum(s, t) })),
        attaining: st.terms.filter(t => termSum(s, t) === value).map(termLabel),
      };
    });
  }

  /*
   * Floor attribution: the smallest m with L*_m(s_0..s_{m-1}) = L*_n(s), and the
   * strategies binding at that level.  Since L*_2 = L*_3 = L*_4, m lies in {2,5,6,7,8};
   * m = 2 means the pair s_0+s_1 decides.  At level m >= 5 the min is strictly above
   * L*_{m-1}, so the binding strategies are exactly that level's winners.
   */
  function attribution(s, L) {
    let m = 2;
    while (m < s.length && lstar(s, m) !== L) m++;
    if (m <= 4) return { level: 2, strategies: ['pair'], terms: ['s_0+s_1'] };
    const led = ledgerAt(s, m);
    const winners = led.filter(e => e.value === L);
    return {
      level: m,
      strategies: winners.map(e => e.id),
      terms: [...new Set(winners.flatMap(e => e.attaining))],
    };
  }

  /*
   * Everything the game needs about s:
   *   n, L (= L*_n), floor (= L*_{n-1}), ledger (one entry per strategy at level n),
   *   winners (ids attaining the min), cls ('unique' | 'tied' | 'free'),
   *   reveal: [{ id, L, positions, chains }] — one canonical packing at side L for each
   *           winner (unique / tied), or for every strategy that fits under the floor,
   *           cheapest first (free),
   *   attribution (free seeds only): which level and strategy bind the floor.
   *
   * n = 4 has no strategies and is always 'free' (L*_4 = L*_3 = s_0+s_1); its reveal is
   * the windowpane.  n <= 3 is accepted but not used by the game.
   */
  function analyze(s) {
    checkInput(s);
    s = s.slice();
    const n = s.length;
    const L = lstar(s, n);
    if (n <= 4) {
      const P = placeBase(s, L);
      return {
        n, s, L, floor: n === 1 ? 0 : (n <= 2 ? s[0] : L), ledger: [], winners: [],
        cls: n <= 2 ? 'unique' : 'free',
        reveal: [{ id: n === 4 ? 'windowpane' : 'pair', L, positions: P,
                   chains: [{ label: 's_0+s_1', indices: [0, 1], sum: s[0] + s[1],
                              axis: chainAxis(s, P, [0, 1]), tight: true }],
                   tightChains: tightChains(s, P, L) }],
        attribution: n <= 2 ? null : { level: 2, strategies: ['pair'], terms: ['s_0+s_1'] },
      };
    }
    const floor = lstar(s, n - 1);
    const ledger = ledgerAt(s, n);
    const mn = Math.min(...ledger.map(e => e.value));
    const winners = ledger.filter(e => e.value === mn).map(e => e.id);
    const cls = mn <= floor ? 'free' : winners.length === 1 ? 'unique' : 'tied';

    // strategies shown in the reveal: the winners, or for a free seed every strategy
    // that fits under the floor, cheapest first (ties in display order)
    const shown = cls !== 'free' ? winners
      : ledger.map((e, i) => [e, i]).filter(([e]) => e.value <= L)
          .sort((p, q) => p[0].value - q[0].value || p[1] - q[1]).map(([e]) => e.id);
    const reveal = shown.map(id => {
      const P = place(id, s, L);
      const entry = ledger.find(e => e.id === id);
      return {
        id, name: DISPLAY[id], L, positions: P,
        chains: entry.terms.map(t => ({
          label: t.label, indices: t.indices, sum: t.sum,
          axis: chainAxis(s, P, t.indices), tight: t.sum === L,
        })),
        tightChains: tightChains(s, P, L),
      };
    });

    return {
      n, s, L, floor, ledger, winners, cls, reveal,
      attribution: cls === 'free' ? attribution(s, L) : null,
    };
  }

  const api = {
    STRATEGIES, DISPLAY, TERM_NAMES,
    Lstar, analyze, place, isPacking, chainAxis, tightChains, strategyValue, termSum, termLabel,
    attribution: s => { checkInput(s); return attribution(s, lstar(s, s.length)); },
    _lstar: lstar, _ledgerAt: ledgerAt,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPFormula = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
