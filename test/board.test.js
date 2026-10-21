// Run from the game folder:  node test/board.test.js
'use strict';
// --full sweeps the larger populations (npm run test:full); the default is a quick sample
const FULL = process.argv.includes('--full');
const POPS = FULL ? [[4, 12], [5, 12], [6, 11], [7, 10], [8, 9]]
  : [[4, 10], [5, 10], [6, 9], [7, 8], [8, 7]];
const F = require('../src/formula.js');
const B = require('../src/board.js');

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
let seed = 12345;
const rnd = k => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };

// ----------------------------------------------------------------------------------------
console.log('1. Win check on canonical packings and their one-unit perturbations');
{
  let n0 = 0, accept = 0, overlapCaught = 0, overlapMade = 0, overflowCaught = 0, overflowMade = 0;
  const pops = POPS;
  for (const [n, M] of pops) {
    for (const s of tuples(n, M)) {
      const a = F.analyze(s);
      for (const r of a.reveal) {
        n0++;
        const P = r.positions, L = a.L;
        if (B.checkWin(s, P, L)) accept++;
        // every one-unit shift of every square: if it now meets another square or the
        // outside, the win check must say no
        for (let i = 0; i < n; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const Q = P.map(p => p.slice()); Q[i] = [P[i][0] + dx, P[i][1] + dy];
          const out = !B.insideFrame(Q[i][0], Q[i][1], s[i], L);
          const hit = B.collides(s, Q, i, Q[i][0], Q[i][1]);
          if (hit) { overlapMade++; if (!B.checkWin(s, Q, L)) overlapCaught++; }
          else if (out) { overflowMade++; if (!B.checkWin(s, Q, L)) overflowCaught++; }
          else if (!B.checkWin(s, Q, L)) accept = -Infinity;   // a valid shift was rejected
        }
      }
    }
  }
  check(`accepts all ${n0.toLocaleString()} canonical packings`, accept === n0);
  check(`rejects all ${overlapMade.toLocaleString()} one-unit overlaps`, overlapCaught === overlapMade);
  check(`rejects all ${overflowMade.toLocaleString()} one-unit overflows`, overflowCaught === overflowMade);
}
{
  const s = [2, 1], L = 3;
  check('touching edges are not an overlap', B.checkWin(s, [[0, 0], [2, 0]], L));
  check('touching corners are not an overlap', B.checkWin(s, [[0, 0], [2, 2]], L));
  check('flush against every wall is inside', B.checkWin([3], [[0, 0]], 3));
  check('status counts inside and overflowing squares',
        JSON.stringify(B.boardStatus([2, 2, 1], [[0, 0], [2, 0], [10, 10]], 3))
        === JSON.stringify({ inside: 1, overflow: [1], solved: false }));
}

// ----------------------------------------------------------------------------------------
console.log('\n2. Gravity');
{
  // random non-overlapping boards: squares dropped at random integer spots in and around
  // the frame, keeping only non-overlapping drops
  let boards = 0, overlapAfter = 0, offBoardMoved = 0, notGrounded = 0, solvedKept = 0,
      solvedLost = 0, stuck = 0;
  for (let trial = 0; trial < 20000; trial++) {
    const n = 4 + rnd(5);
    const s = Array.from({ length: n }, () => 1 + rnd(12)).sort((a, b) => b - a);
    const L = F.Lstar(s);
    const pos = [];
    const free = (i, p) => pos.every((q, j) => !B.overlaps(p[0], p[1], s[i], q[0], q[1], s[j]));
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let k = 0; k < 50 && !p; k++) {
        const c = [rnd(L + 2 * s[i]) - s[i], rnd(L + 2 * s[i]) - s[i]];
        if (free(i, c)) p = c;
      }
      // fall back to a far slot if no free spot was found
      pos.push(p || [3 * L + 20 * i, 3 * L]);
    }
    boards++;
    let P = pos;
    for (const dir of ['left', 'down', 'right', 'up', 'left', 'down']) {
      const Q = B.gravity(s, P, L, dir);
      for (let i = 0; i < n; i++) {
        if (B.collides(s, Q, i, Q[i][0], Q[i][1])) { overlapAfter++; break; }
      }
      for (let i = 0; i < n; i++)
        if (!B.onBoard(P[i][0], P[i][1], s[i], L) && (Q[i][0] !== P[i][0] || Q[i][1] !== P[i][1])) offBoardMoved++;
      P = Q;
    }
    // after alternating left/down to a fixed point, every inside square is grounded
    for (let k = 0; k < 60; k++) {
      const Q = B.gravity(s, B.gravity(s, P, L, 'left'), L, 'down');
      if (JSON.stringify(Q) === JSON.stringify(P)) break;
      P = Q;
      if (k === 59) stuck++;
    }
    const left = B.gravity(s, P, L, 'left'), down = B.gravity(s, P, L, 'down');
    if (JSON.stringify(left) !== JSON.stringify(P) || JSON.stringify(down) !== JSON.stringify(P)) notGrounded++;
  }
  check(`never creates an overlap (${boards.toLocaleString()} random boards, 6 pushes each)`, overlapAfter === 0, `${overlapAfter}`);
  check('never moves a square that misses the frame', offBoardMoved === 0, `${offBoardMoved}`);
  check('alternating left/down reaches a fixed point', stuck === 0 && notGrounded === 0,
        `${stuck} stuck, ${notGrounded} not grounded`);

  // canonical packings stay packed under any sequence of pushes
  for (const n of [5, 6, 7, 8]) {
    for (const s of tuples(n, FULL ? (n === 8 ? 9 : 10) : (n === 8 ? 7 : 8))) {
      const a = F.analyze(s);
      let P = a.reveal[0].positions;
      for (const dir of ['left', 'down', 'right', 'up']) {
        P = B.gravity(s, P, a.L, dir);
        if (B.checkWin(s, P, a.L)) solvedKept++; else solvedLost++;
      }
    }
  }
  check(`a packed board stays packed under gravity (${(solvedKept + solvedLost).toLocaleString()} pushes)`, solvedLost === 0, `${solvedLost}`);
  // a square sticking out past the wall it is pushed toward comes back inside
  const P = B.gravity([3, 2], [[-1, 0], [10, 10]], 5, 'left');
  check('a square overflowing the wall is pushed back in', P[0][0] === 0 && P[1][0] === 10);
}

// ----------------------------------------------------------------------------------------
console.log('\n3. Snapping and tray');
{
  const s = [5, 3], pos = [[0, 0], [20, 20]], L = 8;
  // square 1 dragged near the right side of square 0 and near the floor
  check('snaps flush to a neighbour and to the floor',
        JSON.stringify(B.snapPosition(s, pos, 1, 5.4, 0.3, L, 0.5)) === '[5,0]');
  check('snaps to the far wall L - s_i',
        JSON.stringify(B.snapPosition(s, pos, 1, 4.8, 4.6, L, 0.5)) === '[5,5]');
  check('rounds when nothing is near',
        JSON.stringify(B.snapPosition(s, [[0, 0], [20, 20]], 1, 12.4, 13.6, 30, 0.2)) === '[12,14]');
  const far = [[20, 20], [0, 0]];
  check('snaps to the walls from 0.6 away',
        JSON.stringify(B.snapPosition(s, far, 1, 4.4, 4.4, L, 0.7)) === '[5,5]');

  let trayBad = 0;
  for (let trial = 0; trial < 5000; trial++) {
    const n = 4 + rnd(5);
    const sides = Array.from({ length: n }, () => 1 + rnd(60)).sort((a, b) => b - a);
    const w = sides[0] + rnd(100), t = B.trayLayout(sides, 70, 50, w, 2);
    for (let i = 0; i < n; i++) {
      const [x, y] = t.pos[i];
      if (x < 70 || x + sides[i] > 70 + Math.max(w, sides[0]) || y + sides[i] > 50 || y < 50 - t.height
          || B.collides(sides, t.pos, i, x, y)) { trayBad++; break; }
    }
  }
  check('tray slots stay in their rectangle and never overlap (5,000 trays)', trayBad === 0, `${trayBad}`);
}

// ----------------------------------------------------------------------------------------
console.log('\n4. Symmetries of the frame and the tray scatter');
{
  let packs = 0, broken = 0, cycle = 0, flips = 0, mixedRefused = 0, mixedBad = 0;
  for (const n of [5, 6, 7, 8]) {
    for (const s of tuples(n, FULL ? (n === 8 ? 9 : 10) : (n === 8 ? 7 : 8))) {
      const a = F.analyze(s);
      const P = a.reveal[0].positions;
      for (const op of ['ccw', 'cw', 'flipH', 'flipV']) {
        packs++;
        const Q = B.symmetry(s, P, a.L, op);
        if (!Q || !B.checkWin(s, Q, a.L)) broken++;
      }
      let Q = P;
      for (let k = 0; k < 4; k++) Q = B.symmetry(s, Q, a.L, 'ccw');
      if (JSON.stringify(Q) !== JSON.stringify(P)) cycle++;
      const C = B.symmetry(s, B.symmetry(s, P, a.L, 'cw'), a.L, 'ccw');
      if (JSON.stringify(C) !== JSON.stringify(P)) cycle++;
      for (const op of ['flipH', 'flipV'])
        if (JSON.stringify(B.symmetry(s, B.symmetry(s, P, a.L, op), a.L, op)) !== JSON.stringify(P)) flips++;
    }
  }
  check(`every symmetry of ${packs.toLocaleString()} canonical packings is a packing`, broken === 0, `${broken}`);
  check('four quarter turns, and cw after ccw, are the identity', cycle === 0, `${cycle}`);
  check('each mirror is an involution', flips === 0, `${flips}`);

  // boards with squares partly outside: either refused, or still non-overlapping
  for (let trial = 0; trial < 20000; trial++) {
    const n = 4 + rnd(5);
    const s = Array.from({ length: n }, () => 1 + rnd(12)).sort((a, b) => b - a);
    const L = F.Lstar(s), pos = [];
    const free = (i, p) => pos.every((q, j) => !B.overlaps(p[0], p[1], s[i], q[0], q[1], s[j]));
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let k = 0; k < 50 && !p; k++) {
        const c = [rnd(L + 2 * s[i]) - s[i], rnd(L + 2 * s[i]) - s[i]];
        if (free(i, c)) p = c;
      }
      pos.push(p || [3 * L + 20 * i, 3 * L]);
    }
    const Q = B.symmetry(s, pos, L, ['ccw', 'cw', 'flipH', 'flipV'][rnd(4)]);
    if (!Q) { mixedRefused++; continue; }
    for (let i = 0; i < n; i++) if (B.collides(s, Q, i, Q[i][0], Q[i][1])) { mixedBad++; break; }
  }
  check(`random boards: no symmetry creates an overlap (${mixedRefused} refused)`, mixedBad === 0, `${mixedBad}`);

  let scBad = 0, scNull = 0;
  for (let trial = 0; trial < 5000; trial++) {
    const n = 4 + rnd(5);
    const s = Array.from({ length: n }, () => 1 + rnd(40)).sort((a, b) => b - a);
    const rect = { x0: 10, y0: -50, x1: 10 + s[0] + 60 + rnd(60), y1: 60 + rnd(60) };
    const P = B.scatter(s, rect, 1, k => rnd(k));
    if (!P) { scNull++; continue; }
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      if (x < rect.x0 || y < rect.y0 || x + s[i] > rect.x1 || y + s[i] > rect.y1 ||
          B.collides(s, P, i, x, y)) { scBad++; break; }
    }
  }
  check(`scatter stays in its rectangle without overlaps (${scNull} of 5,000 gave up)`, scBad === 0, `${scBad}`);
}

// ----------------------------------------------------------------------------------------
console.log('\n5. Keyboard play: free spot and steps');
{
  let boards = 0, wrongExist = 0, notLowest = 0, bad = 0, stepBad = 0, stepMissed = 0, steps = 0;
  for (let trial = 0; trial < 6000; trial++) {
    const n = 4 + rnd(5);
    const s = Array.from({ length: n }, () => 1 + rnd(9)).sort((a, b) => b - a);
    const L = F.Lstar(s), pos = [];
    const free = (i, p) => pos.every((q, j) => !B.overlaps(p[0], p[1], s[i], q[0], q[1], s[j]));
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let k = 0; k < 40 && !p; k++) {
        const c = [rnd(L + 2 * s[i]) - s[i], rnd(L + 2 * s[i]) - s[i]];
        if (free(i, c)) p = c;
      }
      pos.push(p || [3 * L + 20 * i, 3 * L]);
    }
    boards++;
    const i = rnd(n);
    // brute force: every whole-number position in the frame, lowest then leftmost
    let brute = null;
    for (let y = 0; y + s[i] <= L && !brute; y++)
      for (let x = 0; x + s[i] <= L; x++)
        if (!B.collides(s, pos, i, x, y)) { brute = [x, y]; break; }
    const spot = B.freeSpot(s, pos, i, L);
    if (!!spot !== !!brute) wrongExist++;
    else if (spot) {
      if (B.collides(s, pos, i, spot[0], spot[1]) || !B.insideFrame(spot[0], spot[1], s[i], L)) bad++;
      if (spot[1] !== brute[1]) notLowest++;
    }
    // steps: the result is free, inside the bounds, strictly in the direction; unit mode
    // finds the nearest free whole-number position
    const bounds = { x0: -L, y0: -L, x1: 3 * L, y1: 3 * L };
    for (const dir of ['left', 'right', 'up', 'down']) {
      for (const mode of ['edge', 'unit']) {
        steps++;
        const q = B.stepPosition(s, pos, i, dir, L, bounds, mode);
        const k = dir === 'left' || dir === 'right' ? 0 : 1, sg = dir === 'right' || dir === 'up' ? 1 : -1;
        if (q) {
          if (B.collides(s, pos, i, q[0], q[1]) || sg * (q[k] - pos[i][k]) <= 0 || q[1 - k] !== pos[i][1 - k] ||
              q[0] < bounds.x0 || q[1] < bounds.y0 || q[0] + s[i] > bounds.x1 || q[1] + s[i] > bounds.y1) stepBad++;
        }
        if (mode === 'unit') {
          let near = null;
          for (let v = pos[i][k] + sg; v >= bounds[k ? 'y0' : 'x0'] && v + s[i] <= bounds[k ? 'y1' : 'x1']; v += sg) {
            const c = pos[i].slice(); c[k] = v;
            if (!B.collides(s, pos, i, c[0], c[1])) { near = c; break; }
          }
          if (JSON.stringify(near) !== JSON.stringify(q)) stepMissed++;
        }
      }
    }
  }
  check(`free spot exists exactly when brute force finds one (${boards.toLocaleString()} boards)`, wrongExist === 0, `${wrongExist}`);
  check('the free spot is inside the frame, free, and as low as possible', bad === 0 && notLowest === 0, `${bad} bad, ${notLowest} not lowest`);
  check(`steps stay free, in bounds and on their axis (${steps.toLocaleString()})`, stepBad === 0, `${stepBad}`);
  check('unit steps reach the nearest free whole-number position', stepMissed === 0, `${stepMissed}`);
}

console.log('\n6. Forgiving drops');
{
  const s = [6, 4], L = 10;
  check('a drop onto a square slides off it to the nearest free place',
    JSON.stringify(B.settle(s, [[0, 0], [4, 0]], 1, 4, 0, L, 3)) === '[6,0]');
  check('a drop hanging over the frame slides inside',
    JSON.stringify(B.settle(s, [[0, 0], [7, 5]], 1, 7, 5, L, 2)) === '[6,5]');
  check('no free place within reach gives null',
    B.settle(s, [[0, 0], [1, 1]], 1, 1, 1, L, 1) === null);
  check('outside the frame (the tray) only overlaps matter',
    JSON.stringify(B.settle(s, [[20, 0], [21, 2]], 1, 21, 2, L, 5)) === '[21,6]');
  check('bounds are respected (the place at x = 6 is past x1 = 9 for a side of 4)',
    B.settle(s, [[0, 0], [4, 0]], 1, 4, 0, L, 3, { x0: -5, y0: -5, x1: 9, y1: 15 }) === null);

  // against brute force on random boards: the result is free, inside the frame when it meets
  // it, within reach, and no closer position qualifies
  let seedR = 99;
  const rnd = k => { seedR = (seedR * 1103515245 + 12345) % 2147483648; return seedR % k; };
  let runs = 0, bad = 0, notNearest = 0, missed = 0;
  for (let t = 0; t < 4000; t++) {
    const n = 3 + rnd(4), Lr = 10 + rnd(10);
    const sides = Array.from({ length: n }, () => 1 + rnd(6)).sort((a, b) => b - a);
    const pos = sides.map(() => [rnd(Lr + 6) - 3, rnd(Lr + 6) - 3]);
    const i = rnd(n), tol = 1 + rnd(4);
    const [x, y] = pos[i];
    runs++;
    const q = B.settle(sides, pos, i, x, y, Lr, tol);
    const ok = (cx, cy) => !B.collides(sides, pos, i, cx, cy) &&
      !(B.onBoard(cx, cy, sides[i], Lr) && !B.insideFrame(cx, cy, sides[i], Lr));
    let bestD = Infinity;
    for (let cx = Math.ceil(x - tol); cx <= x + tol; cx++)
      for (let cy = Math.ceil(y - tol); cy <= y + tol; cy++)
        if (ok(cx, cy)) bestD = Math.min(bestD, (cx - x) ** 2 + (cy - y) ** 2);
    if (q) {
      if (!ok(q[0], q[1]) || Math.abs(q[0] - x) > tol || Math.abs(q[1] - y) > tol) bad++;
      else if ((q[0] - x) ** 2 + (q[1] - y) ** 2 !== bestD) notNearest++;
    } else if (bestD < Infinity) missed++;
  }
  check(`random drops: valid, within reach, nearest (${runs.toLocaleString()} boards)`,
    !bad && !notNearest && !missed, `${bad} invalid, ${notNearest} not nearest, ${missed} missed`);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
