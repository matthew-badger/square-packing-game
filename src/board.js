/*
 * board.js — the game board.
 *
 * Two layers.
 *   Core (pure, exact integers, runs under Node): square/frame geometry, snapping,
 *   gravity, tray layout, the win check.  Positions are lower-left corners in a y-up
 *   world whose target frame is [0,L]^2.
 *   UI (browser only): a canvas board with pointer dragging, gravity animation,
 *   overflow hatching, colour by size and side-length labels.
 *
 * Browser global: SPBoard.  Node: module.exports (core only).
 */
(function (root) {
  'use strict';

  // ================================================================= core
  function overlaps(ax, ay, as, bx, by, bs) {
    return ax < bx + bs && bx < ax + as && ay < by + bs && by < ay + as;
  }

  /** Does square i, placed at (x, y), overlap any other square? */
  function collides(sides, pos, i, x, y) {
    for (let j = 0; j < sides.length; j++) {
      if (j !== i && overlaps(x, y, sides[i], pos[j][0], pos[j][1], sides[j])) return true;
    }
    return false;
  }

  function insideFrame(x, y, s, L) { return x >= 0 && y >= 0 && x + s <= L && y + s <= L; }

  /** Square meets the open frame (0,L)^2. */
  function onBoard(x, y, s, L) { return x < L && x + s > 0 && y < L && y + s > 0; }

  /** True iff every square lies in [0,L]^2 and interiors are pairwise disjoint. */
  function checkWin(sides, pos, L) {
    const n = sides.length;
    for (let i = 0; i < n; i++) if (!insideFrame(pos[i][0], pos[i][1], sides[i], L)) return false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (overlaps(pos[i][0], pos[i][1], sides[i], pos[j][0], pos[j][1], sides[j])) return false;
    return true;
  }

  /** Counts for the status line. */
  function boardStatus(sides, pos, L) {
    let inside = 0;
    const overflow = [];
    for (let i = 0; i < sides.length; i++) {
      const [x, y] = pos[i];
      if (insideFrame(x, y, sides[i], L)) inside++;
      else if (onBoard(x, y, sides[i], L)) overflow.push(i);
    }
    return { inside, overflow, solved: checkWin(sides, pos, L) };
  }

  /*
   * Snapping.  On each axis, square i's coordinate snaps to the nearest candidate within
   * `tol` world units; otherwise it rounds to the nearest integer.  Candidates for x:
   * the frame walls 0 and L - s_i, and for every other square j on the board the flush
   * positions x_j + s_j (to its right) and x_j - s_i (to its left); likewise for y.
   */
  function snapCandidates(sides, pos, i, L, axis) {
    const c = [0, L - sides[i]];
    for (let j = 0; j < sides.length; j++) {
      if (j === i) continue;
      // only squares on the board count: lining up with the tray means nothing
      if (!onBoard(pos[j][0], pos[j][1], sides[j], L)) continue;
      c.push(pos[j][axis] + sides[j], pos[j][axis] - sides[i]);
    }
    return c;
  }

  function snapAxis(raw, cands, tol) {
    let best = null, bd = Infinity;
    for (const c of cands) {
      const d = Math.abs(raw - c);
      if (d <= tol && d < bd) { bd = d; best = c; }
    }
    return best === null ? Math.round(raw) : best;
  }

  function snapPosition(sides, pos, i, rawX, rawY, L, tol) {
    return [snapAxis(rawX, snapCandidates(sides, pos, i, L, 0), tol),
            snapAxis(rawY, snapCandidates(sides, pos, i, L, 1), tol)];
  }

  /*
   * Gravity toward one wall of the frame ('left' | 'right' | 'down' | 'up').  Only
   * squares meeting the frame move; every square is an obstacle.  Squares are swept from
   * the wall outward, each sliding until it meets the wall or a square in its path.  A
   * square whose slide would end in an overlap (possible only for a square sticking out
   * past the far side of the wall it is pushed toward) stays where it is, so a
   * non-overlapping board stays non-overlapping.
   */
  function gravity(sides, pos, L, dir) {
    const n = sides.length;
    const P = pos.map(p => p.slice());
    const k = (dir === 'left' || dir === 'right') ? 0 : 1;   // moving axis
    const o = 1 - k;                                         // the other axis
    const toLow = dir === 'left' || dir === 'down';
    const movers = [];
    for (let i = 0; i < n; i++) if (onBoard(P[i][0], P[i][1], sides[i], L)) movers.push(i);
    movers.sort((a, b) => toLow ? P[a][k] - P[b][k] : (P[b][k] + sides[b]) - (P[a][k] + sides[a]));
    for (const i of movers) {
      const lo = P[i][o], hi = lo + sides[i];
      let target;
      if (toLow) {
        let best = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const jl = P[j][o], jh = jl + sides[j];
          if (lo < jh && jl < hi && P[j][k] + sides[j] <= P[i][k]) best = Math.max(best, P[j][k] + sides[j]);
        }
        target = best;
      } else {
        let best = L;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const jl = P[j][o], jh = jl + sides[j];
          if (lo < jh && jl < hi && P[j][k] >= P[i][k] + sides[i]) best = Math.min(best, P[j][k]);
        }
        target = best - sides[i];
      }
      if (target === P[i][k]) continue;
      const q = P[i].slice(); q[k] = target;
      if (!collides(sides, P, i, q[0], q[1])) P[i] = q;
    }
    return P;
  }

  /*
   * Tray: shelf-pack the squares in descending order into rows of width `width`,
   * starting at (x0, top) and going down.  Returns positions and the tray's height.
   */
  function trayLayout(sides, x0, top, width, gap) {
    const pos = new Array(sides.length);
    const order = sides.map((s, i) => i).sort((a, b) => sides[b] - sides[a] || a - b);
    let x = x0, rowTop = top, rowH = 0;
    for (const i of order) {
      const s = sides[i];
      if (x > x0 && x + s > x0 + width) { rowTop -= rowH + gap; x = x0; rowH = 0; }
      pos[i] = [x, rowTop - s];
      x += s + gap;
      rowH = Math.max(rowH, s);
    }
    return { pos, height: top - (rowTop - rowH) };
  }

  /*
   * NE contact table of a packing.  Rows are in sweep order: by layer (the length of
   * the longest chain of up-contacts beneath the square), then by x, then by y.  For each
   * square, R lists the squares touching its right edge and U those touching its top
   * edge, by sweep number (1-based).
   */
  function contactTable(sides, pos) {
    const n = sides.length;
    const xOver = (i, j) => pos[i][0] < pos[j][0] + sides[j] && pos[j][0] < pos[i][0] + sides[i];
    const yOver = (i, j) => pos[i][1] < pos[j][1] + sides[j] && pos[j][1] < pos[i][1] + sides[i];
    const layer = new Array(n).fill(0);
    for (let pass = 0; pass < n; pass++) {
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          if (i !== j && pos[j][1] + sides[j] === pos[i][1] && xOver(i, j))
            layer[i] = Math.max(layer[i], layer[j] + 1);
    }
    const order = sides.map((_, i) => i).sort((a, b) =>
      layer[a] - layer[b] || pos[a][0] - pos[b][0] || pos[a][1] - pos[b][1]);
    const num = new Array(n);
    order.forEach((i, k) => { num[i] = k + 1; });
    return order.map(i => {
      const R = [], U = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (pos[j][0] === pos[i][0] + sides[i] && yOver(i, j)) R.push(num[j]);
        if (pos[j][1] === pos[i][1] + sides[i] && xOver(i, j)) U.push(num[j]);
      }
      return { number: num[i], square: i, side: sides[i],
               R: R.sort((a, b) => a - b), U: U.sort((a, b) => a - b) };
    });
  }

  /*
   * A symmetry of the frame applied to the squares that meet it: 'ccw' and 'cw' turn the
   * arrangement a quarter turn about the frame's centre, 'flipH' mirrors it left to right
   * and 'flipV' top to bottom.  An axis-parallel square maps to an axis-parallel square of
   * the same side, so only lower-left corners change.  Returns the new positions, or
   * null if a moved square would land on a square outside the frame.
   */
  function symmetry(sides, pos, L, op) {
    const P = pos.map(p => p.slice());
    const moved = [];
    for (let i = 0; i < sides.length; i++) {
      const [x, y] = pos[i], s = sides[i];
      if (!onBoard(x, y, s, L)) continue;
      moved.push(i);
      P[i] = op === 'ccw' ? [L - y - s, x]
           : op === 'cw' ? [y, L - x - s]
           : op === 'flipH' ? [L - x - s, y]
           : [x, L - y - s];
    }
    for (const i of moved) if (collides(sides, P, i, P[i][0], P[i][1])) return null;
    return P;
  }

  /*
   * Scatter the squares at random inside rect = { x0, y0, x1, y1 }, at least `gap`
   * apart, largest first.  `rnd` returns integers in [0, k).  Returns null if no
   * scatter was found in `tries` attempts.
   */
  function scatter(sides, rect, gap, rnd, tries = 40) {
    const order = sides.map((_, i) => i).sort((a, b) => sides[b] - sides[a]);
    for (let t = 0; t < tries; t++) {
      const P = new Array(sides.length);
      let ok = true;
      for (const i of order) {
        const s = sides[i], wx = rect.x1 - rect.x0 - s, wy = rect.y1 - rect.y0 - s;
        if (wx < 0 || wy < 0) return null;
        let spot = null;
        for (let k = 0; k < 200 && !spot; k++) {
          const c = [rect.x0 + rnd(wx + 1), rect.y0 + rnd(wy + 1)];
          let free = true;
          for (let j = 0; j < sides.length && free; j++)
            if (P[j] && overlaps(c[0] - gap, c[1] - gap, s + 2 * gap, P[j][0], P[j][1], sides[j])) free = false;
          if (free) spot = c;
        }
        if (!spot) { ok = false; break; }
        P[i] = spot;
      }
      if (ok) return P;
    }
    return null;
  }

  /*
   * The lowest, then leftmost, place in the frame where square i fits without overlapping
   * another square, or null if there is none.  Only flush positions are tried (x in
   * {0, L - s_i, x_j + s_j, x_j - s_i}, likewise y); that loses nothing, because a square
   * in a free place can slide down and then left without meeting anything until it stops
   * at such a position.
   */
  function freeSpot(sides, pos, i, L) {
    const s = sides[i], xs = new Set([0, L - s]), ys = new Set([0, L - s]);
    for (let j = 0; j < sides.length; j++) {
      if (j === i) continue;
      xs.add(pos[j][0] + sides[j]); xs.add(pos[j][0] - s);
      ys.add(pos[j][1] + sides[j]); ys.add(pos[j][1] - s);
    }
    const ok = v => v >= 0 && v + s <= L;
    const X = [...xs].filter(ok).sort((a, b) => a - b), Y = [...ys].filter(ok).sort((a, b) => a - b);
    for (const y of Y) for (const x of X) if (!collides(sides, pos, i, x, y)) return [x, y];
    return null;
  }

  /*
   * Keyboard move of square i one step toward dir ('left' | 'right' | 'up' | 'down'):
   * the nearest position strictly that way, inside bounds = { x0, y0, x1, y1 }, where the
   * square overlaps nothing.  mode 'edge' tries the snapping positions and the bounds;
   * mode 'unit' tries every whole number.  Returns the new [x, y] or null.
   */
  function stepPosition(sides, pos, i, dir, L, bounds, mode) {
    const k = dir === 'left' || dir === 'right' ? 0 : 1;
    const sgn = dir === 'right' || dir === 'up' ? 1 : -1;
    const s = sides[i], cur = pos[i][k];
    const lo = Math.ceil(k ? bounds.y0 : bounds.x0), hi = Math.floor(k ? bounds.y1 : bounds.x1) - s;
    let cands;
    if (mode === 'unit') {
      cands = [];
      for (let v = cur + sgn; v >= lo && v <= hi; v += sgn) cands.push(v);
    } else {
      cands = snapCandidates(sides, pos, i, L, k).concat([lo, hi])
        .filter(v => sgn * (v - cur) > 0 && v >= lo && v <= hi)
        .sort((a, b) => sgn * (a - b));
    }
    for (const v of cands) {
      const q = pos[i].slice(); q[k] = v;
      if (!collides(sides, pos, i, q[0], q[1])) return q;
    }
    return null;
  }

  /*
   * Forgiving drop.  Square i was let go at (x, y) where it overlaps another square or
   * hangs over the frame's edge.  Returns the nearest whole-number position
   * within `tol` world units on each axis where it overlaps nothing and, if it meets the
   * frame, lies inside it, staying within bounds = { x0, y0, x1, y1 }; null if there is
   * none.  The nearest such position is reached by the smallest slide, so it is usually
   * flush against the square or wall that was in the way.
   */
  function settle(sides, pos, i, x, y, L, tol, bounds) {
    const s = sides[i];
    const lo = (v, b0) => Math.max(Math.ceil(v - tol), b0 === undefined ? -Infinity : Math.ceil(b0));
    const hi = (v, b1) => Math.min(Math.floor(v + tol), b1 === undefined ? Infinity : Math.floor(b1) - s);
    const b = bounds || {};
    let best = null, bd = Infinity;
    for (let cx = lo(x, b.x0); cx <= hi(x, b.x1); cx++) {
      for (let cy = lo(y, b.y0); cy <= hi(y, b.y1); cy++) {
        const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
        if (d >= bd) continue;
        if (onBoard(cx, cy, s, L) && !insideFrame(cx, cy, s, L)) continue;
        if (collides(sides, pos, i, cx, cy)) continue;
        best = [cx, cy]; bd = d;
      }
    }
    return best;
  }

  const core = {
    overlaps, collides, insideFrame, onBoard, checkWin, boardStatus,
    snapCandidates, snapAxis, snapPosition, gravity, trayLayout, contactTable,
    symmetry, scatter, freeSpot, stepPosition, settle,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  // ================================================================= UI
  const SNAP_PX = 10;          // snapping tolerance on screen while dragging (mouse, pen)
  const SNAP_TOUCH_PX = 20;    //   and with a finger, which covers what it is moving
  const DROP_PX = 22;          // a drop this close to a free place slides into it
  const DROP_TOUCH_PX = 40;
  const SLIDE_MS = 200;        // gravity
  const REVEAL_MS = 650;       // to and from the canonical packing
  const DOUBLE_TAP_MS = 320;
  const BAR = 9, ROW = 32;     // shadow bars: thickness and pitch in px

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const T = (k, p) => (root.SPI18n ? root.SPI18n.t(k, p) : k);

  // Text with subscripts written as s_3 or C_0 (an underscore lowers the digits after it).
  function runs(text) {
    const out = [];
    const re = /_(\d+)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push([text.slice(last, m.index), false]);
      out.push([m[1], true]);
      last = re.lastIndex;
    }
    if (last < text.length) out.push([text.slice(last), false]);
    return out;
  }
  function richWidth(ctx, text, size, family) {
    let w = 0;
    for (const [t, sub] of runs(text)) {
      ctx.font = `600 ${sub ? Math.round(size * 0.7) : size}px ${family}`;
      w += ctx.measureText(t).width;
    }
    return w;
  }
  function richText(ctx, text, x, y, size, family, align) {
    let cx = align === 'center' ? x - richWidth(ctx, text, size, family) / 2 : x;
    ctx.textAlign = 'left';
    for (const [t, sub] of runs(text)) {
      ctx.font = `600 ${sub ? Math.round(size * 0.7) : size}px ${family}`;
      ctx.fillText(t, cx, sub ? y + size * 0.28 : y);
      cx += ctx.measureText(t).width;
    }
  }

  const ease = t => 1 - Math.pow(1 - t, 3);

  class Board {
    constructor(canvas, onChange) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.spBoard = this;        // for tests and debugging in the console
      this.onChange = onChange || (() => {});
      this.sides = [];
      this.pos = [];
      this.home = [];
      this.z = [];
      this.L = 0;
      this.labels = 'value';      // 'value' | 'index' | 'none'
      this.plain = false;         // bar labels as side lengths (19 + 8 + 9) instead of s_0+s_6+s_5
      this.drag = null;
      this.anim = null;           // { from, to, fromView, t0, ms, done }
      this.shown = null;          // reveal: { chains, saved } while a canonical packing is shown
      this.lastTap = null;
      this.colors = null;
      this.cssW = this.cssH = 1;

      canvas.addEventListener('pointerdown', e => this.down(e));
      canvas.addEventListener('pointermove', e => this.move(e));
      canvas.addEventListener('pointerup', e => this.up(e));
      canvas.addEventListener('pointercancel', e => this.up(e, true));
      canvas.addEventListener('focus', () => this.draw());
      canvas.addEventListener('blur', () => this.draw());
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      const redraw = () => { this.colors = null; this.draw(); };
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
      new MutationObserver(redraw).observe(document.documentElement,
        { attributes: true, attributeFilter: ['data-theme'] });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.draw());
    }

    // ---------------------------------------------------------------- state
    load(sides, L) {
      this.sides = sides.slice();
      this.L = L;
      this.drag = null;
      this.anim = null;
      this.shown = null;
      this.hint = null;
      this.sel = -1;
      this.layout();
      this.pos = this.home.map(p => p.slice());
      this.z = this.sides.map((_, i) => i).reverse();   // small squares drawn on top
      this.resize();
      this.changed();
    }

    reset() {
      if (!this.sides.length || this.shown || this.anim) return;
      this.home = this.tidy;
      this.animate(this.home.map(p => p.slice()), SLIDE_MS * 1.5);
    }

    /** Send every square back to the tray, scattered at random. */
    shuffle() {
      if (!this.sides.length || this.shown || this.anim) return;
      const gap = Math.max(1, Math.round(this.L / 40));
      const P = scatter(this.sides, this.trayRect, gap, k => Math.floor(Math.random() * k));
      if (P) this.home = P;
      this.z = this.sides.map((_, i) => i).sort(() => Math.random() - 0.5);
      this.animate(this.home.map(p => p.slice()), SLIDE_MS * 2);
    }

    /**
     * Turn ('ccw', 'cw') or mirror ('flipH', 'flipV') the squares in the frame about
     * the frame's centre.  Returns false if a square would land on one outside it.
     */
    turn(op) {
      if (!this.sides.length || this.drag || this.anim || this.shown) return true;
      const Q = symmetry(this.sides, this.pos, this.L, op);
      if (!Q) return false;
      const ids = new Set(this.sides.map((_, i) => i).filter(i => onBoard(this.pos[i][0], this.pos[i][1], this.sides[i], this.L)));
      if (!ids.size) return true;
      const finish = () => { this.rigid = null; this.anim = null; this.pos = Q; this.draw(); this.changed(); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return true; }
      const a = { t0: performance.now() };
      this.anim = a;
      const tick = now => {
        if (this.anim !== a) return;
        const t = Math.min(1, (now - a.t0) / 360);
        this.rigid = { op, e: ease(t), ids };
        this.draw();
        if (t < 1) requestAnimationFrame(tick); else finish();
      };
      requestAnimationFrame(tick);
      return true;
    }

    status() {
      const st = boardStatus(this.sides, this.pos, this.L);
      st.revealed = !!this.shown;
      return st;
    }

    changed() { this.onChange(this.status()); }

    set(key, value) {
      this[key] = value;
      this.draw();
      this.changed();
    }

    // The tray sits beside the frame or below it, whichever shows the frame larger on this
    // canvas (the current arrangement is kept unless the other is clearly better, so a small
    // resize does not flip it).  The view (the world rectangle shown while playing) is fixed
    // per layout so the scale does not jump while the player drags.
    layout(keepPositions) {
      const L = this.L, s = this.sides, gap = Math.max(1, Math.round(L / 30));
      const sep = Math.max(2, Math.round(L / 12));
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const W = rect.width > 0 ? rect.width : 1.6, H = rect.height > 0 ? rect.height : 1;
      const m0 = Math.max(1, Math.round(L / 16)), extra = Math.round(L / 14);
      const bestFor = wide => {
        let best = null;
        const minW = s[0], maxW = Math.max(s[0], 2 * L);
        for (let w = minW; w <= maxW; w += Math.max(1, Math.round(L / 40))) {
          let t, view;
          if (wide) {
            t = trayLayout(s, L + sep, L, w, gap);
            const h = Math.max(L, t.height);
            view = { x0: 0, y0: L - h, x1: L + sep + w, y1: L };
          } else {
            t = trayLayout(s, 0, -sep, w, gap);
            view = { x0: 0, y0: -sep - t.height, x1: Math.max(L, w), y1: L };
          }
          const vw = view.x1 - view.x0 + 2 * m0, vh = view.y1 - view.y0 + 2 * m0 + extra;
          const scale = Math.min(W / vw, H / vh) || 1;
          if (!best || scale > best.scale) best = { scale, t, view, wide };
        }
        return best;
      };
      const a = bestFor(true), b = bestFor(false);
      const keep = this.wide === undefined ? null : (this.wide ? a : b);
      let best = a.scale >= b.scale ? a : b;
      if (keep && keep !== best && keep.scale >= 0.97 * best.scale) best = keep;
      const wide = best.wide;
      this.wide = wide;
      const m = m0;
      const v = best.view;
      this.view = { x0: v.x0 - m, y0: v.y0 - m, x1: v.x1 + m, y1: v.y1 + m + extra };
      this.home = best.t.pos;
      this.tidy = best.t.pos;
      // where a shuffle may scatter the squares: the view outside the frame's band
      const V = this.view;
      this.trayRect = wide ? { x0: L + sep, y0: V.y0, x1: V.x1, y1: V.y1 }
                           : { x0: V.x0, y0: V.y0, x1: V.x1, y1: -sep };
      if (keepPositions && !this.shown) {
        // squares on the frame stay put, the rest go to their new tray slots; if that
        // leaves an overlap (an overflowing square reaching into the new tray), reset
        const P = this.pos.map((p, i) => onBoard(p[0], p[1], s[i], L) ? p : this.home[i].slice());
        const clash = P.some((p, i) => collides(s, P, i, p[0], p[1]));
        this.pos = clash ? this.home.map(p => p.slice()) : P;
      }
    }

    // The play view fits the frame and tray; the reveal view fits the frame plus the
    // shadow bars, which are sized in pixels.
    playView() {
      const v = this.view, vw = v.x1 - v.x0, vh = v.y1 - v.y0;
      const scale = Math.min(this.cssW / vw, this.cssH / vh);
      return { scale,
               ox: (this.cssW - vw * scale) / 2 - v.x0 * scale,
               oy: (this.cssH - vh * scale) / 2 + v.y1 * scale };
    }
    revealView() {
      // bars come in priority order; drop the last ones until the frame keeps at least
      // 62% of the canvas's shorter side
      let ch = this.shown.chains.slice();
      const fit = list => {
        const kh = list.filter(c => c.axis === 'h').length, kv = list.filter(c => c.axis === 'v').length;
        const top = 30, left = 16, bottom = 14 + kh * ROW, right = 14 + kv * ROW;
        return { top, left, bottom, right,
                 side: Math.min(this.cssW - left - right, this.cssH - top - bottom) };
      };
      while (ch.length > 1 && fit(ch).side < 0.62 * Math.min(this.cssW, this.cssH)) ch.pop();
      this.shown.visible = ch;
      const { top, left, bottom, right } = fit(ch);
      const side = Math.max(40, fit(ch).side);
      const scale = side / this.L;
      const x0 = left + (this.cssW - left - right - side) / 2;
      const y0 = top + (this.cssH - top - bottom - side) / 2;
      return { scale, ox: x0, oy: y0 + side };
    }
    targetView() { return this.shown ? this.revealView() : this.playView(); }

    resize() {
      const parent = this.canvas.parentElement;
      const r = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
      this.canvas.width = Math.round(this.cssW * dpr);
      this.canvas.height = Math.round(this.cssH * dpr);
      this.canvas.style.width = this.cssW + 'px';
      this.canvas.style.height = this.cssH + 'px';
      this.dpr = dpr;
      if (!this.sides.length) { this.draw(); return; }
      // re-lay the tray for the new canvas shape (squares in the frame stay put)
      if (!this.drag && !this.anim && !this.shown) this.layout(true);
      if (!this.anim) Object.assign(this, this.targetView());
      this.draw();
    }

    // world (y up) <-> screen (css px, y down)
    sx(x) { return this.ox + x * this.scale; }
    sy(y) { return this.oy - y * this.scale; }
    wx(px) { return (px - this.ox) / this.scale; }
    wy(py) { return (this.oy - py) / this.scale; }

    // ---------------------------------------------------------------- animation
    // Moves the squares to `to` and the view to the current target view together.
    animate(to, ms, done) {
      const from = (this.animPos || this.pos).map(p => p.slice());
      const fromView = { scale: this.scale, ox: this.ox, oy: this.oy };
      const finish = () => {
        this.anim = null; this.animPos = null; this.pos = to.map(p => p.slice());
        Object.assign(this, this.targetView());
        this.draw(); this.changed();
        if (done) done();
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      const a = { t0: performance.now() };
      this.anim = a;
      const tick = now => {
        if (this.anim !== a) return;
        const t = Math.min(1, (now - a.t0) / ms), e = ease(t);
        const tv = this.targetView();
        this.scale = fromView.scale + (tv.scale - fromView.scale) * e;
        this.ox = fromView.ox + (tv.ox - fromView.ox) * e;
        this.oy = fromView.oy + (tv.oy - fromView.oy) * e;
        this.animPos = from.map((p, i) => [p[0] + (to[i][0] - p[0]) * e, p[1] + (to[i][1] - p[1]) * e]);
        this.draw();
        if (t < 1) requestAnimationFrame(tick); else finish();
      };
      requestAnimationFrame(tick);
    }

    gravity(dir) {
      if (!this.sides.length || this.drag || this.anim || this.shown) return;
      const to = gravity(this.sides, this.pos, this.L, dir);
      if (to.every((p, i) => p[0] === this.pos[i][0] && p[1] === this.pos[i][1])) return;
      this.animate(to, SLIDE_MS);
    }

    /*
     * Show a canonical packing.  `chains` are { indices, axis: 'h'|'v', sum, label };
     * each is drawn as a shadow bar below (horizontal) or right of (vertical) the frame.
     * The player's own positions are kept and come back with hide().
     */
    reveal(positions, chains) {
      if (!this.sides.length) return;
      this.drag = null;
      const saved = this.shown ? this.shown.saved : this.pos.map(p => p.slice());
      this.shown = { chains, saved, ready: false };
      this.animate(positions, REVEAL_MS, () => { if (this.shown) this.shown.ready = true; this.draw(); });
    }

    hide() {
      if (!this.shown) return;
      const saved = this.shown.saved;
      this.shown = null;
      this.animate(saved, REVEAL_MS);
    }

    // ---------------------------------------------------------------- pointer
    local(e) {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    hit(px, py) {
      const x = this.wx(px), y = this.wy(py);
      for (let k = this.z.length - 1; k >= 0; k--) {
        const i = this.z[k], [qx, qy] = this.pos[i], s = this.sides[i];
        if (x >= qx && x <= qx + s && y >= qy && y <= qy + s) return i;
      }
      return -1;
    }

    down(e) {
      if (!this.sides.length || this.anim || this.shown) return;
      const [px, py] = this.local(e);
      const i = this.hit(px, py);
      if (i < 0) return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this.z = this.z.filter(k => k !== i).concat(i);
      this.sel = i;
      this.drag = {
        i, id: e.pointerId, start: this.pos[i].slice(), moved: false, touch: e.pointerType === 'touch',
        dx: this.wx(px) - this.pos[i][0], dy: this.wy(py) - this.pos[i][1], px, py,
      };
      this.canvas.classList.add('dragging');
      this.draw();
    }

    move(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) {
        if (!d && this.sides.length) {
          const [px, py] = this.local(e);
          this.canvas.style.cursor = !this.shown && this.hit(px, py) >= 0 ? 'grab' : 'default';
        }
        return;
      }
      const [px, py] = this.local(e);
      if (Math.hypot(px - d.px, py - d.py) > 3) d.moved = true;
      const i = d.i, s = this.sides[i], v = this.view;
      let rx = this.wx(px) - d.dx, ry = this.wy(py) - d.dy;
      rx = Math.min(Math.max(rx, v.x0), v.x1 - s);
      ry = Math.min(Math.max(ry, v.y0), v.y1 - s);
      let [x, y] = snapPosition(this.sides, this.pos, i, rx, ry, this.L, (d.touch ? SNAP_TOUCH_PX : SNAP_PX) / this.scale);
      x = Math.min(Math.max(x, Math.ceil(v.x0)), Math.floor(v.x1) - s);
      y = Math.min(Math.max(y, Math.ceil(v.y0)), Math.floor(v.y1) - s);
      this.pos[i] = [x, y];
      const f = this.forgive(d);
      d.bad = f.overlap && !f.slide;       // red: this drop would go back
      d.preview = f.slide;                 // dashed outline: where this drop will slide to
      this.draw();
    }

    /*
     * Forgiveness for the square being dragged, at its current position: a square on top of
     * another, or hanging a little over the frame's edge (at most half its side out), has a
     * nearby place it will slide into when dropped.  Returns { overlap, slide }.
     */
    forgive(d) {
      const i = d.i, s = this.sides[i], L = this.L;
      const [x, y] = this.pos[i];
      const overlap = collides(this.sides, this.pos, i, x, y);
      const out = (lo, len) => Math.max(0, -lo) + Math.max(0, lo + len - L);
      const hanging = onBoard(x, y, s, L) && !insideFrame(x, y, s, L) &&
        out(x, s) <= s / 2 && out(y, s) <= s / 2;
      if (!overlap && !hanging) return { overlap, slide: null };
      const tol = Math.max((d.touch ? DROP_TOUCH_PX : DROP_PX) / this.scale, 0.3 * s);
      return { overlap, slide: settle(this.sides, this.pos, i, x, y, L, tol, this.view) };
    }

    up(e, cancelled) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      this.canvas.classList.remove('dragging');
      const i = d.i;
      const { overlap, slide } = cancelled ? { overlap: true, slide: null } : this.forgive(d);
      if (cancelled || (overlap && !slide)) this.pos[i] = d.start;
      else if (slide) {
        const P = this.pos.map(p => p.slice());
        P[i] = slide;
        this.lastTap = null;
        this.animate(P, 110);
        return;
      }
      // double tap / double click: send the square back to its tray slot
      if (!d.moved) {
        const now = performance.now();
        if (this.lastTap && this.lastTap.i === i && now - this.lastTap.t < DOUBLE_TAP_MS) {
          const h = this.home[i];
          if (!collides(this.sides, this.pos, i, h[0], h[1])) this.pos[i] = h.slice();
          this.lastTap = null;
        } else this.lastTap = { i, t: now };
      } else this.lastTap = null;
      this.draw();
      this.changed();
    }

    // ---------------------------------------------------------------- drawing
    palette() {
      if (this.colors) return this.colors;
      const ranks = [];
      for (let k = 0; k < 7; k++) ranks.push(cssVar('--rank-' + k));
      this.colors = {
        ranks, last: cssVar('--rank-last'), ink: cssVar('--ink'), muted: cssVar('--muted'),
        paper: cssVar('--paper'), lattice: cssVar('--lattice'), frame: cssVar('--frame'),
        good: cssVar('--good'), bad: cssVar('--bad'), bg: cssVar('--bg'),
        chainH: cssVar('--chain-h'), chainV: cssVar('--chain-v'), slack: cssVar('--chain-slack'),
        surface: cssVar('--surface'),
        frameFill: cssVar('--frame-fill') || cssVar('--paper'), dot: cssVar('--dot') || cssVar('--lattice'),
        tileInk: cssVar('--tile-ink') || '#141a2a', tileOutline: cssVar('--tile-outline'),
        mono: cssVar('--font-mono') || 'monospace',
        display: cssVar('--font-display') || 'sans-serif',
      };
      return this.colors;
    }

    color(i) {
      const C = this.palette();
      return i === this.sides.length - 1 ? C.last : C.ranks[i % C.ranks.length];
    }

    draw() {
      const ctx = this.ctx, C = this.palette();
      ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      if (!this.sides.length || !this.scale) return;
      const P = this.animPos || this.pos;
      const st = boardStatus(this.sides, this.pos, this.L);

      if (this.shown) this.drawFrame('reveal');
      else this.drawFrame(st.solved && !this.drag && !this.anim ? 'solved' : 'play');

      // hints (levels 2 and 4): corner squares and one square drawn in place, dashed
      const H = !this.shown ? this.hint : null;
      if (H && H.level >= 2) for (const c of H.overlay.corners) if (c.i >= 0) this.drawOutline(c.i, c.pos, false);
      if (H && H.level >= 4 && H.overlay.ghost) this.drawOutline(H.overlay.ghost.i, H.overlay.ghost.pos, true);
      if (this.drag && this.drag.preview) this.drawOutline(this.drag.i, this.drag.preview, true);

      for (const i of this.z) {
        if (this.rigid && this.rigid.ids.has(i)) {
          // the arrangement in the frame turns or flips as one rigid body
          const { op, e } = this.rigid, cx = this.sx(this.L / 2), cy = this.sy(this.L / 2);
          ctx.save();
          ctx.translate(cx, cy);
          if (op === 'ccw') ctx.rotate(-e * Math.PI / 2);
          else if (op === 'cw') ctx.rotate(e * Math.PI / 2);
          else if (op === 'flipH') ctx.scale(1 - 2 * e, 1);
          else ctx.scale(1, 1 - 2 * e);
          ctx.translate(-cx, -cy);
          this.drawSquare(i, P[i], false);
          ctx.restore();
        } else this.drawSquare(i, P[i], this.drag && this.drag.i === i);
      }
      if (!this.shown && !this.rigid) for (const i of this.z) this.drawOverflow(i, P[i]);
      if (this.shown && this.shown.ready) this.drawBars();
      if (H && H.level >= 3 && !this.rigid) this.drawGroups(H.overlay.groups, P);
      if (!this.rigid) this.drawSelection(P);

      const d = this.drag;
      if (d) {
        const [x, y] = P[d.i];
        const label = `(${x}, ${y})`;
        ctx.font = `600 12px ${C.mono}`;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        const tx = this.sx(x), ty = this.sy(y + this.sides[d.i]) - 6;
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = C.ink;
        ctx.globalAlpha = 0.86;
        ctx.fillRect(tx, ty - 18, w, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.bg;
        ctx.fillText(label, tx + 5, ty - 3);
      }
    }

    drawFrame(state) {
      const ctx = this.ctx, C = this.palette(), L = this.L, sc = this.scale;
      const x0 = this.sx(0), y0 = this.sy(L), w = L * sc;
      const r = Math.min(6, w / 40);
      ctx.fillStyle = C.frameFill;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, w, r);
      ctx.fill();
      // a dot at every lattice point: the finest step of 1, 2, 5, 10, ... units at least 9 px
      let step = 1;
      for (const k of [1, 2, 5, 10, 20, 50, 100, 200, 500]) { step = k; if (k * sc >= 9) break; }
      ctx.fillStyle = C.dot;
      const d = Math.max(1, Math.min(1.8, step * sc / 14));
      for (let i = step; i < L; i += step)
        for (let j = step; j < L; j += step) ctx.fillRect(this.sx(i) - d / 2, this.sy(j) - d / 2, d, d);
      const solved = state === 'solved';
      const bw = Math.max(2, Math.min(4, w / 120));
      ctx.strokeStyle = solved ? C.good : C.frame;
      ctx.lineWidth = bw;
      ctx.beginPath();
      ctx.roundRect(x0 - bw / 2, y0 - bw / 2, w + bw, w + bw, r + bw / 2);
      ctx.stroke();
      // the side length, set like a dimension line above the frame
      ctx.fillStyle = solved ? C.good : C.muted;
      ctx.font = `600 15px ${C.display}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('0', x0, y0 - bw - 6);
      ctx.textAlign = 'right';
      ctx.fillText(String(L), x0 + w, y0 - bw - 6);
    }

    drawSquare(i, p, dragging) {
      const ctx = this.ctx, C = this.palette(), s = this.sides[i], sc = this.scale;
      const x = this.sx(p[0]), y = this.sy(p[1] + s), w = s * sc;
      const g = Math.min(1, w / 30);                   // a hairline gap between touching tiles
      const tx = x + g / 2, ty = y + g / 2, tw = w - g;
      const r = Math.min(3, tw / 6), edge = Math.max(2, Math.min(6, tw * 0.05));
      ctx.save();
      if (dragging) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; }
      ctx.fillStyle = this.color(i);
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, tw, r);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, tw, r);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(tx, ty + tw - edge, tw, edge);
      ctx.restore();
      const bad = dragging && this.drag.bad;
      if (bad || (C.tileOutline && C.tileOutline !== 'transparent')) {
        ctx.save();
        ctx.strokeStyle = bad ? C.bad : C.tileOutline;
        ctx.globalAlpha = bad ? 1 : 0.35;
        ctx.lineWidth = bad ? 3 : 1;
        if (bad) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.roundRect(tx + 0.5, ty + 0.5, tw - 1, tw - 1, r);
        ctx.stroke();
        ctx.restore();
      }
      if (this.labels !== 'none' && w >= 16) {
        const fs = Math.round(Math.max(11, Math.min(w * 0.36, 64)));
        ctx.fillStyle = C.tileInk;
        ctx.textBaseline = 'middle';
        if (this.labels === 'index') richText(ctx, 's_' + i, x + w / 2, y + w / 2 - edge / 2, fs, C.mono, 'center');
        else {
          ctx.font = `800 ${fs}px ${C.display}`;
          ctx.textAlign = 'center';
          ctx.fillText(String(s), x + w / 2, y + w / 2 - edge / 2 + 1);
        }
      }
    }

    // The part of a square outside the frame, on a square that meets the frame, is
    // hatched so that a one-unit overflow is visible.
    drawOverflow(i, p) {
      const s = this.sides[i], L = this.L;
      if (!onBoard(p[0], p[1], s, L) || insideFrame(p[0], p[1], s, L)) return;
      const ctx = this.ctx, C = this.palette();
      const x = this.sx(p[0]), y = this.sy(p[1] + s), w = s * this.scale;
      const fx = this.sx(0), fy = this.sy(L), fw = L * this.scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, w);
      ctx.rect(fx, fy, fw, fw);
      ctx.clip('evenodd');
      ctx.beginPath();
      ctx.rect(x, y, w, w);
      ctx.clip();
      ctx.fillStyle = C.bad;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x, y, w, w);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = C.bad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let t = -w; t < w; t += 7) { ctx.moveTo(x + t, y + w); ctx.lineTo(x + t + w, y); }
      ctx.stroke();
      ctx.restore();
    }

    /*
     * Shadow bars.  A horizontal chain's squares have disjoint x-shadows; its bar runs
     * under the frame with one segment per square at that square's shadow, so a chain
     * that reaches L tiles the side.  Vertical chains run up the right of the frame.
     * Teal: horizontal and tight; plum: vertical and tight; grey: the chain is shorter
     * than L, and the gaps show by how much.
     */
    drawBars() {
      const ctx = this.ctx, C = this.palette(), L = this.L, P = this.pos;
      const shown = this.shown.visible || this.shown.chains;
      const h = shown.filter(c => c.axis === 'h');
      const v = shown.filter(c => c.axis === 'v');
      const fx0 = this.sx(0), fx1 = this.sx(L), fy0 = this.sy(0), fy1 = this.sy(L);
      ctx.textBaseline = 'alphabetic';
      h.forEach((c, k) => {
        const top = fy0 + 12 + k * ROW;
        const col = c.sum === L ? C.chainH : C.slack;
        ctx.fillStyle = C.lattice;
        ctx.fillRect(fx0, top, fx1 - fx0, BAR);
        ctx.fillStyle = col;
        for (const i of c.indices) {
          const a = this.sx(P[i][0]), b = this.sx(P[i][0] + this.sides[i]);
          ctx.fillRect(a + 1, top, b - a - 2, BAR);
        }
        ctx.fillStyle = c.sum === L ? C.ink : C.muted;
        richText(ctx, this.barLabel(c), fx0, top + BAR + 15, 12, C.mono, 'left');
      });
      v.forEach((c, k) => {
        const left = fx1 + 12 + k * ROW;
        const col = c.sum === L ? C.chainV : C.slack;
        ctx.fillStyle = C.lattice;
        ctx.fillRect(left, fy1, BAR, fy0 - fy1);
        ctx.fillStyle = col;
        for (const i of c.indices) {
          const a = this.sy(P[i][1] + this.sides[i]), b = this.sy(P[i][1]);
          ctx.fillRect(left, a + 1, BAR, b - a - 2);
        }
        ctx.save();
        ctx.translate(left + BAR + 15, fy0);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = c.sum === L ? C.ink : C.muted;
        richText(ctx, this.barLabel(c), 0, 0, 12, C.mono, 'left');
        ctx.restore();
      });
    }

    // ---------------------------------------------------------------- keyboard
    // Each returns { ok, i, pos } for the page to announce, or null if nothing applies.
    canAct() { return this.sides.length && !this.anim && !this.shown && !this.drag; }

    select(i) {
      if (!this.sides.length || i < 0 || i >= this.sides.length) return null;
      this.sel = i;
      this.z = this.z.filter(k => k !== i).concat(i);
      this.draw();
      return { ok: true, i, pos: this.pos[i].slice() };
    }

    moveSelected(to, ms) {
      const P = this.pos.map(p => p.slice());
      P[this.sel] = to;
      this.animate(P, ms);
    }

    /** Put the selected square in the lowest, then leftmost, free place in the frame. */
    placeSelected() {
      if (!this.canAct() || this.sel < 0) return null;
      const i = this.sel, spot = freeSpot(this.sides, this.pos, i, this.L);
      if (!spot) return { ok: false, i };
      this.moveSelected(spot, SLIDE_MS);
      return { ok: true, i, pos: spot };
    }

    /** Step the selected square toward dir; unit = one whole number instead of to the next edge. */
    stepSelected(dir, unit) {
      if (!this.canAct() || this.sel < 0) return null;
      const i = this.sel, v = this.view;
      const q = stepPosition(this.sides, this.pos, i, dir, this.L, v, unit ? 'unit' : 'edge');
      if (!q) return { ok: false, i };
      this.moveSelected(q, 120);
      return { ok: true, i, pos: q };
    }

    /** Send the selected square back to its tray slot. */
    returnSelected() {
      if (!this.canAct() || this.sel < 0) return null;
      const i = this.sel, h = this.home[i];
      if (collides(this.sides, this.pos, i, h[0], h[1])) return { ok: false, i };
      this.moveSelected(h.slice(), SLIDE_MS);
      return { ok: true, i, pos: h.slice() };
    }

    // The selected square gets a dashed accent ring while the board has keyboard focus.
    drawSelection(P) {
      if (this.sel < 0 || document.activeElement !== this.canvas || this.shown) return;
      const ctx = this.ctx, i = this.sel, s = this.sides[i];
      const x = this.sx(P[i][0]) - 5, y = this.sy(P[i][1] + s) - 5, w = s * this.scale + 10;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = cssVar('--accent');
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, w);
      ctx.restore();
    }

    /** Hint overlay: level 0..4 and the overlay from SPReveal.hints. */
    setHint(level, overlay) {
      this.hint = level > 0 ? { level, overlay } : null;
      this.draw();
    }

    // A square's place drawn as a dashed outline in its colour; the ghost is also tinted.
    drawOutline(i, p, ghost) {
      const ctx = this.ctx, C = this.palette(), s = this.sides[i];
      const x = this.sx(p[0]), y = this.sy(p[1] + s), w = s * this.scale;
      ctx.save();
      if (ghost) { ctx.fillStyle = this.color(i); ctx.globalAlpha = 0.22; ctx.fillRect(x, y, w, w); ctx.globalAlpha = 1; }
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = this.color(i);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1.25, y + 1.25, w - 2.5, w - 2.5);
      ctx.setLineDash([]);
      if (w >= 18) {
        ctx.fillStyle = C.muted;
        ctx.font = `800 ${Math.round(Math.max(11, Math.min(w * 0.3, 30)))}px ${C.display}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s), x + w / 2, y + w / 2);
      }
      ctx.restore();
    }

    // Each group of squares that must line up gets a ring, teal for left-to-right and
    // plum for bottom-to-top, and a numbered badge matching the hint text.  A square in
    // several groups gets nested rings.
    drawGroups(groups, P) {
      const ctx = this.ctx, C = this.palette();
      const depth = new Array(this.sides.length).fill(0);
      groups.forEach((g, k) => {
        const col = g.axis === 'h' ? C.chainH : C.chainV;
        for (const i of g.indices) {
          const s = this.sides[i], d = 3 + 5 * depth[i]++;
          const x = this.sx(P[i][0]) - d, y = this.sy(P[i][1] + s) - d, w = s * this.scale + 2 * d;
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash(g.axis === 'h' ? [] : [8, 5]);     // vertical groups dashed
          ctx.strokeRect(x, y, w, w);
          ctx.setLineDash([]);
          const bx = x + 9 + 18 * k, by = y;
          ctx.beginPath();
          ctx.arc(bx, by, 8, 0, 2 * Math.PI);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.fillStyle = C.paper;
          ctx.font = `700 11px ${C.mono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), bx, by + 0.5);
        }
      });
    }

    barLabel(c) {
      if (this.plain) {
        // the side lengths in the order they sit along the bar: 19 + 8 + 9 = 36
        const k = c.axis === 'h' ? 0 : 1, P = this.pos;
        return c.indices.slice().sort((i, j) => P[i][k] - P[j][k]).map(i => this.sides[i]).join(' + ') + ` = ${c.sum}`;
      }
      const expanded = c.indices.map(i => 's_' + i).join('+');
      const name = c.label === expanded ? expanded : `${c.label} = ${expanded}`;
      return `${name} = ${c.sum}`;
    }
  }

  /* A small drawing of a solved packing, for the level list in the menu. */
  function thumbnail(canvas, sides, pos, L) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const W = Math.max(1, r.width), Hh = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    const pad = 4, side = Math.min(W, Hh) - 2 * pad, sc = side / L;
    const ox = (W - side) / 2, oy = (Hh - side) / 2;
    ctx.fillStyle = cssVar('--frame-fill') || cssVar('--paper');
    ctx.fillRect(ox, oy, side, side);
    for (let i = sides.length - 1; i >= 0; i--) {
      const s = sides[i], x = ox + pos[i][0] * sc, y = oy + (L - pos[i][1] - s) * sc, w = s * sc;
      ctx.fillStyle = i === sides.length - 1 ? cssVar('--rank-last') : cssVar('--rank-' + (i % 7));
      ctx.fillRect(x + 0.5, y + 0.5, w - 1, w - 1);
    }
    ctx.strokeStyle = cssVar('--ink');
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, side, side);
  }

  root.SPBoard = Object.assign({ Board, runs, thumbnail }, core);
})(typeof globalThis !== 'undefined' ? globalThis : this);
