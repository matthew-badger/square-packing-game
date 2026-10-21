/*
 * levels.js — the 29 levels of the default game, in play order.
 *
 * One level per strategy: the windowpane, shelf and column (4, 5, 6 squares), the three
 * 7-square strategies and the 23 8-square strategies.  Each level has one puzzle, fixed for
 * good, in which that strategy is the only winner.
 *
 * Difficulty (1 to 4 stars).  A strategy "reduces" when deleting the smallest square turns
 * its cost into the cost of a strategy with one square fewer (for n = 8 this is the
 * comparison of (3.2) with the seven-square costs (1.2) in the eight-square paper):
 *   *     4, 5, 6 squares                 windowpane, shelf, column (each reduces)
 *   **    7 squares that reduce            center, right (to column)
 *   ***   7 squares that do not reduce     top
 *   ***   8 squares that reduce            to center: beta theta pi rho chi
 *                                          to top: omicron phi;  to right: nu tau psi
 *   ****  8 squares that do not reduce     the other thirteen
 * Within the 3-star 8-square group and the 4-star group the order was shuffled once and
 * then fixed: tools/level_order.py reproduces it (Python random seeds 20261021, 20261022).
 *
 * Puzzles: for 7 and 8 squares, a seed in which the strategy wins outright by a clear
 * margin (the showcase seeds of v0.1.0's strategy tour), except level 12 (psi), which uses
 * the smallest puzzle whose four smallest sides are equal (frame 46 instead of 82); for 5
 * and 6 squares the smallest puzzle with all sides different in which the strategy wins
 * outright.  test/levels.test.js checks every claim made here.
 *
 * Browser global: SPLevels.  Node: module.exports.
 */
(function (root) {
  'use strict';

  // [strategy id, squares, stars, reduces to (id or null), sides, frame L*]
  const ROWS = [
    ['windowpane', 4, 1, null, [5, 4, 3, 2], 9],
    ['shelf', 5, 1, 'windowpane', [9, 8, 7, 6, 5], 18],
    ['column', 6, 1, 'shelf', [14, 13, 10, 9, 8, 7], 28],
    ['center', 7, 2, 'column', [25, 21, 17, 16, 13, 12, 11], 48],
    ['right', 7, 2, 'column', [26, 25, 21, 20, 10, 9, 8], 52],
    ['top', 7, 3, null, [22, 15, 14, 11, 10, 9, 8], 38],
    ['nu', 8, 3, 'right', [27, 26, 22, 21, 10, 9, 8, 7], 54],
    ['chi', 8, 3, 'center', [35, 28, 24, 23, 16, 14, 8, 7], 64],
    ['omicron', 8, 3, 'top', [29, 19, 18, 14, 13, 11, 10, 7], 49],
    ['theta', 8, 3, 'center', [23, 21, 18, 16, 14, 13, 11, 8], 49],
    ['pi', 8, 3, 'center', [29, 21, 18, 17, 15, 14, 7, 6], 51],
    ['psi', 8, 3, 'right', [23, 22, 20, 19, 6, 6, 6, 6], 46],
    ['rho', 8, 3, 'center', [32, 25, 22, 21, 14, 13, 11, 6], 58],
    ['beta', 8, 3, 'center', [20, 18, 15, 13, 11, 10, 8, 7], 40],
    ['phi', 8, 3, 'top', [36, 18, 17, 15, 14, 13, 12, 8], 55],
    ['tau', 8, 3, 'right', [32, 17, 16, 15, 12, 11, 10, 9], 50],
    ['epsilon', 8, 4, null, [31, 21, 19, 17, 16, 11, 10, 9], 54],
    ['lambda', 8, 4, null, [26, 23, 20, 17, 13, 12, 10, 9], 51],
    ['kappa', 8, 4, null, [24, 16, 15, 14, 13, 10, 9, 8], 44],
    ['upsilon', 8, 4, null, [35, 21, 16, 15, 14, 13, 12, 11], 57],
    ['sigma', 8, 4, null, [30, 17, 14, 13, 12, 11, 10, 9], 48],
    ['gamma', 8, 4, null, [20, 18, 15, 14, 12, 11, 9, 8], 42],
    ['iota', 8, 4, null, [25, 22, 18, 15, 14, 11, 10, 9], 48],
    ['alpha', 8, 4, null, [21, 18, 15, 13, 12, 10, 9, 8], 41],
    ['delta', 8, 4, null, [23, 21, 18, 16, 13, 12, 10, 9], 48],
    ['zeta', 8, 4, null, [28, 18, 17, 13, 12, 11, 10, 9], 47],
    ['mu', 8, 4, null, [25, 17, 15, 14, 13, 10, 7, 6], 43],
    ['eta', 8, 4, null, [24, 22, 19, 16, 14, 13, 10, 9], 50],
    ['xi', 8, 4, null, [25, 13, 12, 11, 10, 9, 8, 7], 39],
  ];

  const LEVELS = ROWS.map(([id, n, stars, reducesTo, s, L], i) =>
    Object.freeze({ level: i + 1, id, n, stars, reducesTo, s: Object.freeze(s.slice()), L }));
  // the level a reducing strategy builds on
  const byId = new Map(LEVELS.map(l => [l.id, l]));
  const LIST = Object.freeze(LEVELS.map(l => Object.freeze(Object.assign({}, l,
    { buildsOn: l.reducesTo ? byId.get(l.reducesTo).level : null }))));

  const api = {
    LEVELS: LIST,
    COUNT: LIST.length,
    MAX_STARS: 4,
    /** Level by number (1-based), or undefined. */
    get(level) { return LIST[level - 1]; },
    /** Level whose strategy is `id` at n squares, or undefined. */
    byStrategy(n, id) { return LIST.find(l => l.n === n && l.id === id); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
