/*
 * i18n.js — every word the player sees, by language.
 *
 * t(key, params) looks the key up in the current language, falling back to English, and
 * fills {name} placeholders from params.  An entry may also be a function of params, for
 * plurals and word order.  Values passed in are inserted as given: callers pass text that
 * is already escaped, or small HTML (subscripts) on purpose.
 *
 * English lives here and is the reference.  Every other language is a file in src/lang/
 * that calls add(code, table, { name, reviewed }); a language not yet checked by a native
 * speaker is marked reviewed: false and the menu labels it as a draft.  Plurals use the
 * browser's plural rules for the language (French and Hindi treat 0 as singular).
 * test/i18n.test.js checks that every language has exactly the English keys and that
 * every answer and hint renders in it.  Context for translators: the notes in tools/review_sheets.js.
 *
 * Browser global: SPI18n.  Node: module.exports.
 */
(function (root) {
  'use strict';

  /** (n, one, other) chooser using the plural rules of language `code`. */
  function plural(code) {
    let rules = null;
    try { rules = new Intl.PluralRules(code); } catch (e) { /* very old browser */ }
    return (n, one, other) => ((rules ? rules.select(n) === 'one' : n === 1) ? one : other);
  }
  const pl = plural('en');

  const en = {
    // ---- strategy names (Greek letters are the same in every language) and list joining
    'strat.pair': 'pair',
    'strat.windowpane': 'windowpane',
    'strat.shelf': 'shelf',
    'strat.column': 'column',
    'strat.top': 'top',
    'strat.center': 'center',
    'strat.right': 'right',
    'list.sep': ', ',
    'list.and': ' and ',
    'lang.draft': 'draft',

    // ---- header and menu
    'app.name': 'Square Packing',
    'aria.lang': 'Language',
    'aria.menu': 'Menu',
    'menu.title': 'Menu',
    'menu.close': 'Close menu',
    'aria.mode': 'Mode',
    'levels.title': 'Levels',
    'mode.free': 'Free play',

    // ---- level screen: goal and buttons
    'level.label': 'Level {k} of {n}',
    'level.stars': 'Difficulty {k} of {n}',
    'goal.fit': 'Fit all {n} squares in the frame.',
    'goal.frame': 'The frame is {L} by {L}.',
    'level.buildsOn': 'Builds on level {k}',
    'btn.hint': 'Hint',
    'btn.noHints': 'No more hints',
    'btn.clearHints': 'Clear hints',
    'btn.showAnswer': 'Show me how',
    'btn.backToYours': 'Back to your packing',
    'btn.compare': 'Standard packing',
    'btn.reset': 'Start over',
    'btn.skip': 'Skip',
    'btn.nextLevel': 'Next level',
    'btn.new': 'New puzzle',

    // ---- board
    'aria.board': 'Packing board. Drag the squares from the tray into the frame, or use the keyboard: keys 1 to 8 pick a square, Enter places it, arrow keys move it.',

    // ---- progress and status
    'prog.inside': '{k} of {n} inside the frame',
    'prog.showing': 'Showing the standard packing',
    'status.showing': "Press Back to your packing to bring your squares back.",
    'status.packed': 'Packed. All {n} squares fit in the {L} × {L} frame.',
    'status.sawAnswer': "You saw the answer first.",
    'status.usedHints': p => `You used ${p.h} ${pl(p.h, 'hint', 'hints')}.`,
    'status.noHints': 'No hints.',
    'status.overflow1': 'The {s} square sticks out of the frame.',
    'status.overflowK': '{k} squares stick out of the frame.',
    'status.start': 'Every square fits in a {L} × {L} frame, and no smaller one.',
    'status.toGo': '{k} to go.',
    'status.turnRefused': 'That would land a square on one sticking out of the frame. Move it first.',

    // ---- solved card
    'solved.title': 'Packed!',
    'solved.time': 'Time {t}.',
    'solved.faster': 'Your fastest yet.',
    'solved.fewer': 'Fewer hints than before.',
    'why.h': '({k}) {sum} = {L} across',
    'why.v': '({k}) {sum} = {L} from bottom to top',
    'why.one': 'One line of squares fills the frame exactly: {a}.',
    'why.two': 'Two lines of squares fill the frame exactly: {a}; {b}.',
    'why.stdOne': 'In the standard packing, one line of squares fills the frame exactly: {a}.',
    'why.stdTwo': 'In the standard packing, two lines of squares fill the frame exactly: {a}; {b}.',

    // ---- Free play
    'free.howMany': 'How many squares?',
    'opt.nsq': p => `${p.n} squares`,
    'free.newRandom': 'New random puzzle',
    'label.orSides': 'Or type your own side lengths',
    'btn.load': 'Play',
    'err.count': 'Enter between 4 and 8 side lengths.',
    'err.range': 'Side lengths must be whole numbers from 1 to 999.',
    'adv.title': 'Advanced',
    'adv.note': "Show me how also names the strategy and shows the formula for the frame.",

    // ---- answer panel (Free play with Advanced on)
    'aria.tabs': 'Optimal strategies',
    'ans.ledger': 'Every strategy, cheapest first',
    'ans.contacts': 'Contact table of this packing',
    'ans.pick': 'Show this packing',
    'ans.floorRow': 'floor {Lm}',
    'verdict.n4': 'Four squares always fit in a frame of side s<sub>0</sub>+s<sub>1</sub>: the two largest side by side, the next two above them.',
    'verdict.unique1': 'The new term reaches {L}, above the floor {fl}, so the last square costs {d}.',
    'verdict.unique': 'Only {name} reaches {L}; every other strategy needs more. The floor is {fl}, so the last square costs {d}.',
    'verdict.tied': '{k} strategies tie at {L}: {list}. Each gives an optimal packing; the tabs show them all. The floor is {fl}.',
    'verdict.free': 'The last square is free: {Ln} = {Lm} = {L}.',
    'verdict.setByPair': 'The frame is set by the two largest squares: s<sub>0</sub>+s<sub>1</sub> = {L}.',
    'verdict.setBy': 'The frame is set at n = {m} by {list} ({terms} = {L}).',
    'verdict.newOnly': 'The new term is only {v}.',
    'verdict.onlyFits': p => `Only ${p.name} fits${p.v < p.L ? `, needing just ${p.v}` : ''}.`,
    'verdict.kFit': '{k} strategies fit at {L}: {list}. The tabs, and the highlighted rows of the ledger, show each one.',

    // ---- hints
    'hint.floor4': 'The two largest squares side by side need {a} + {b} = {L}, and the other two fit in the same frame.',
    'hint.floorFree': 'The smallest square is free: the other {m} already need a frame of side {L}, and it fits in a gap they leave.',
    'hint.floor': 'Without the smallest square the other {m} fit in a frame of side {f}. Adding the {s} costs {d} more.',
    'hint.tiedExtra': ' More than one arrangement works.',
    'hint.corners': 'In one optimal packing the corners hold: {list}.',
    'hint.cornerItem': '{c} {s}',
    'hint.cornerSep': ', ',
    'hint.nothing': 'nothing',
    'hint.groupH': '({j}) {list} sit left to right without overlapping, and {sum} = {L} spans the width',
    'hint.groupV': '({j}) {list} sit bottom to top without overlapping, and {sum} = {L} spans the height',
    'hint.ghost': 'The {s} goes where the dashed outline shows.',
    'hint.ghostNone': 'Every square holds a corner, so the corners above already place them all.',
    'corner.ll': 'lower left',
    'corner.lr': 'lower right',
    'corner.ul': 'upper left',
    'corner.ur': 'upper right',

    // ---- menu: level list
    'levels.solved': '{k} of {n} solved',
    'levels.range': '{a} to {b} squares',
    'levels.item': 'Level {k}',
    'levels.itemSolved': 'Level {k}, solved',
    'levels.itemCurrent': 'Level {k}, current',
    'levels.itemCurrentSolved': "Level {k}, current, solved",

    // ---- menu: move the packing
    'move.eyebrow': 'Move the packing',
    'aria.pushUp': 'Push up',
    'aria.pushLeft': 'Push left',
    'aria.pushDown': 'Push down',
    'aria.pushRight': 'Push right',
    'title.ccw': 'Turn a quarter turn left (Q)',
    'aria.ccw': 'Turn left',
    'title.cw': 'Turn a quarter turn right (E)',
    'aria.cw': 'Turn right',
    'title.flipH': 'Mirror left to right (H)',
    'aria.flipH': 'Mirror left to right',
    'title.flipV': 'Mirror top to bottom (V)',
    'aria.flipV': 'Mirror top to bottom',
    'btn.shuffle': 'Shuffle',

    // ---- menu: display
    'opt.display': 'Display',
    'opt.theme': 'Colors',
    'theme.auto': 'Automatic',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'opt.labels': 'Labels',
    'labels.value': 'Side',
    'labels.index': 'Index',
    'labels.none': 'None',

    // ---- menu: how to play (in the order shown)
    'help.eyebrow': 'How to play',
    'help.drag': 'Drag squares into the frame. They slide but never rotate.',
    'help.snap': "Edges snap flush to walls and to other squares. Drop a square near a free spot and it slides in.",
    'help.double': "Double-click or double-tap a square to send it back to the tray.",
    'help.buttons': "<b>Hint</b> gives up to four clues, one at a time. <b>Show me how</b> shows a packing that fits. <b>Start over</b> sends every square back to the tray, and <b>Skip</b> moves on.",
    'help.levels': "Stars show how hard a level is. Every level is open: skip ahead whenever you like, or pick one from the list above, where a solved level shows its packing.",
    'help.free': "In <b>Free play</b>, choose how many squares for a random puzzle, or type your own side lengths. Turn on <b>Advanced</b> to see the formula behind each answer.",
    'help.amber': 'The amber square is the smallest.',
    'help.rank': "Rings around squares, in hints and once the frame is full, are solid for a line running left to right and dashed for one running bottom to top.",
    'help.push': '<kbd>←</kbd> <kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd> push every square in the frame toward a wall.',
    'help.turn': '<kbd>Q</kbd> <kbd>E</kbd> turn the squares in the frame a quarter turn; <kbd>H</kbd> <kbd>V</kbd> mirror them.',
    'help.keys': 'On the board: <kbd>1</kbd>–<kbd>8</kbd> pick a square (1 is the largest), <kbd>Enter</kbd> places it in the frame, arrows move it to the next edge, <kbd>Shift</kbd> + arrows push them all, <kbd>Delete</kbd> sends it back.',

    // ---- menu: about
    'about.eyebrow': 'About',
    'about.what': 'L*<sub>n</sub> is the side of the smallest square frame that holds n given squares without overlap, their sides parallel to the frame. For up to eight squares there are exact formulas for L*<sub>n</sub>; the game computes every frame, hint and answer from them, with no search.',
    'about.papers': 'The formulas are proved in two papers: {a} and {b}.',
    'about.source': 'Source code, bug reports and corrections: {repo}.',
    'about.draft': 'This translation is a draft awaiting review by a native speaker. Corrections are welcome on the project page.',
    'about.drafts': 'Drafts awaiting review by native speakers: {list}. Corrections are welcome on the project page.',
    'about.privacy': 'Your progress and settings stay in this browser. The game sends nothing and loads nothing from other sites.',
    'about.license': 'Code © {year} {who}, released under the MIT License.',
    'about.fonts': 'Fonts: {fonts}, under the SIL Open Font License.',

    // ---- keyboard announcements (screen readers)
    'kb.selected': 'Selected the {s}, square {k} of {n}.',
    'kb.at': 'The {s} is at {x}, {y}.',
    'kb.placed': 'Placed the {s} in the frame at {x}, {y}.',
    'kb.noRoom': 'There is no free place for the {s} in the frame.',
    'kb.blocked': 'The {s} cannot move further that way.',
    'kb.returned': 'The {s} is back in the tray.',
    'kb.none': 'Pick a square first with the keys 1 to {n}.',
  };

  const STR = { en };
  const META = { en: { name: 'English', reviewed: true } };
  let lang = 'en';

  function t(key, p) {
    const table = STR[lang];
    let v = table && key in table ? table[key] : en[key];
    if (v === undefined) return key;
    if (typeof v === 'function') return v(p || {});
    return p ? v.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : v;
  }

  /** A list of names joined with commas and the language's "and". */
  function list(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(t('list.sep')) + t('list.and') + items[items.length - 1];
  }

  const api = {
    t, list, STR, META, plural,
    /** Register a language. */
    add(code, table, meta) { STR[code] = table; META[code] = Object.assign({ name: code, reviewed: false }, meta); },
    /** Languages in menu order: English first, then by name. */
    codes() { return Object.keys(STR).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : META[a].name.localeCompare(META[b].name))); },
    /** The menu label: the language's own name, and its own word for "draft" if unreviewed. */
    label(code) { const m = META[code]; return m.reviewed ? m.name : `${m.name} (${STR[code]['lang.draft']})`; },
    get lang() { return lang; },
    setLang(l) { lang = STR[l] ? l : 'en'; return lang; },
    /** The language to start in: a saved choice, else the browser's, else English. */
    pick(saved, browser) {
      if (saved && STR[saved]) return saved;
      const b = String(browser || '').toLowerCase().slice(0, 2);
      return STR[b] ? b : 'en';
    },
    has(key) { return key in en; },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    // in Node, load every language file (each one registers itself through add)
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, 'lang');
    for (const f of fs.readdirSync(dir).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.js$/.test(f)).sort()) require(path.join(dir, f));
  } else root.SPI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
