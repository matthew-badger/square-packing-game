// node tools/review_sheets.js  ->  release/review/strings.json
// One row per string and language: key, context, English, draft.  Code-built entries are
// shown as rendered examples.  tools/review_sheets.py turns the JSON into workbooks.
'use strict';
const fs = require('fs');
const path = require('path');
const I = require('../src/i18n.js');

// ---- context for translators: where each string appears and what to watch for.
// A key without its own note falls back to the note for its prefix.
const PREFIX = {
  'strat.': 'Name of a packing strategy, shown in the answer panel and its table (Free play with Advanced on). Short noun; the English names say where the last square goes.',
  'aria.': 'Read aloud by screen readers only; not shown on screen.',
  'title.': 'Tooltip on a button (shown on mouse hover). The letter in brackets is the keyboard key; keep it.',
  'status.': 'Status line under the progress bar, in the column beside the board. Updates as the player moves squares.',
  'verdict.': 'Answer panel (Free play with Advanced on): one paragraph explaining why the frame has its size. {fl}, {Ln}, {Lm} are formulas such as L*₆ = 35.',
  'hint.': 'Hint list: the hints appear one at a time when the player presses Hint. Written for a general audience.',
  'corner.': 'Name of a corner of the frame, used inside the corners hint.',
  'kb.': 'Read aloud by screen readers after a keyboard move. {s} is a side length (a number), {x}, {y} are coordinates.',
  'opt.': 'Menu, Display section: heading of one setting.',
  'theme.': 'Menu, Display section: one choice of the colour setting.',
  'labels.': 'Menu, Display section: what is written on each square.',
  'help.': 'Menu, How to play: one item of the help list. Keep the <kbd>…</kbd> and <b>…</b> tags; text in <b>…</b> must match the button or switch it names.',
  'btn.': 'Button label. Keep short: on phones up to four buttons share one row.',
  'prog.': 'Progress line above the progress bar.',
  'ans.': 'Answer panel (Free play with Advanced on).',
  'err.': 'Error message under the side-lengths box in Free play.',
  'move.': 'Menu: heading over the push, turn and mirror buttons.',
  'list.': 'Joins a list of strategy names, as in "α, β and γ".',
  'lang.': 'Language menu.',
  'about.': 'Menu, About section at the bottom.',
  'level.': 'Level screen, above or under the goal on the left (at the top on phones).',
  'levels.': 'Menu: the list of the 29 levels, grouped by stars.',
  'solved.': 'The card that appears when the puzzle is solved.',
  'why.': 'Solved card and answer: the plain reason the frame cannot be smaller, read by a general audience.',
  'free.': 'Free play panel.',
  'adv.': 'Free play panel: the Advanced switch.',
  'menu.': 'The menu panel that slides in from the right.',
};

const NOTE = {
  'strat.pair': 'The two largest squares side by side (they set the frame by themselves).',
  'strat.windowpane': 'Four squares in a 2 × 2 arrangement, like a window with four panes.',
  'strat.shelf': 'Five squares: the 3rd, 4th and 5th largest in a row along the top, like books on a shelf.',
  'strat.column': 'Six squares: three squares stacked up the right side.',
  'strat.top': 'Seven squares: the smallest goes along the top edge.',
  'strat.center': 'Seven squares: the smallest floats in the middle.',
  'strat.right': 'Seven squares: the smallest goes against the right edge.',
  'list.sep': 'Separator between list items except the last two. Include any spaces your language needs.',
  'list.and': 'Goes between the last two items. Include the spaces your language needs (English " and ").',
  'lang.draft': 'Shown after the language name in the menu until a native speaker has reviewed the translation, e.g. "Français (brouillon)".',
  'app.name': 'Name of the game, at the top left of the page and in the browser tab.',
  'levels.title': 'Also the left half of the Levels | Free play switch at the top of the page.',
  'mode.free': 'Right half of the Levels | Free play switch, and the label above the goal in Free play.',
  'level.label': 'Above the goal: which level this is, e.g. "Level 4 of 29".',
  'level.stars': 'Screen-reader text for the difficulty stars beside the level number, e.g. "Difficulty 2 of 4".',
  'goal.fit': 'The goal, in very large type. {n} is 4 to 8.',
  'goal.frame': 'Under the goal: the size of the frame, e.g. "The frame is 36 by 36."',
  'level.buildsOn': 'Link under the goal to an easier level whose answer this one extends.',
  'btn.hint': 'Main button under the board: shows the next hint.',
  'btn.noHints': 'The Hint button once all four hints are shown.',
  'btn.clearHints': 'Small link under the hints: hides them from the list and the board.',
  'btn.showAnswer': 'Button under the board: shows a packing that fits. Friendly wording for "show the answer".',
  'btn.backToYours': 'Same button while the answer is shown: brings back the player\'s own squares.',
  'btn.compare': 'Same button after the player has solved the puzzle: shows the standard packing to compare.',
  'btn.reset': 'Button under the board: sends every square back to the tray (the area beside or below the frame).',
  'btn.skip': 'Button under the board: go to the next level without solving this one.',
  'btn.nextLevel': 'Replaces Skip once the level is solved.',
  'btn.new': 'Replaces Skip in Free play: serves another random puzzle.',
  'prog.showing': 'Shown while the answer (the standard packing) is on the board.',
  'status.showing': 'Shown while the answer is on the board. Quote the label of the button btn.backToYours.',
  'status.packed': 'The puzzle is solved.',
  'status.sawAnswer': 'On the solved card, after the time: the player looked at the answer before solving.',
  'status.usedHints': 'On the solved card, after the time.',
  'status.noHints': 'On the solved card, after the time.',
  'status.overflow1': '{s} is a side length; the square of that size hangs over the edge of the frame.',
  'status.start': 'Shown before any square is placed.',
  'status.toGo': 'How many squares are still outside the frame.',
  'status.turnRefused': 'Shown when a turn or mirror of the packing is not possible.',
  'solved.title': 'Heading of the solved card. Short and cheerful.',
  'solved.time': '{t} is minutes and seconds, e.g. 1:05.',
  'solved.faster': 'Added when the player beats their best time on this level.',
  'solved.fewer': 'Added when the player used fewer hints than on an earlier solve.',
  'why.h': 'One numbered line of squares across the frame; the number in brackets matches a ring on the board. {sum} is side lengths with plus signs.',
  'why.v': 'As above, for a line of squares from bottom to top.',
  'why.one': '{a} is one why.h or why.v item.',
  'why.two': '{a} and {b} are why.h or why.v items.',
  'why.stdOne': 'As why.one, when the player\'s own packing has no full line and the standard packing is described instead.',
  'why.stdTwo': 'As why.two, for the standard packing.',
  'free.howMany': 'Above five buttons 4 to 8; pressing one starts a new random puzzle of that size.',
  'opt.nsq': 'Screen-reader label of those buttons, and the group title in the level list. {n} is 4 to 8.',
  'free.newRandom': 'Free play: serves a new random puzzle.',
  'label.orSides': 'Label above a text box where the player can type their own side lengths.',
  'btn.load': 'Button after that text box: plays the typed side lengths.',
  'adv.title': 'Name of the switch that adds the mathematics (strategy names, formula, strategy table) to the answer.',
  'adv.note': 'Small text under the switch. Quote the label of the button btn.showAnswer.',
  'ans.ledger': 'Heading of a table of all strategies sorted by the frame size each needs.',
  'ans.contacts': 'Collapsible section: which squares touch which.',
  'ans.pick': 'Tooltip on a row of the strategy table.',
  'ans.floorRow': 'Row in the strategy table: the floor, the frame size needed without the smallest square. {Lm} is L* with a subscript.',
  'verdict.unique': '{name} is a strategy name (Greek letter or a word such as "center"). {d} is how much the smallest square adds to the frame.',
  'verdict.tied': '{list} is a list of strategy names.',
  'verdict.free': 'The smallest square adds nothing. {Ln} and {Lm} are L* with subscripts.',
  'verdict.setBy': '{m} is a number of squares; {list} strategy names; {terms} sums such as s₁+s₄+s₅.',
  'verdict.kFit': 'Tabs above the answer switch between the strategies listed.',
  'hint.floor': '{m} is a number of squares, {f} a frame side, {s} the smallest side, {d} the difference.',
  'hint.tiedExtra': 'Appended to the previous hint, so it starts with a space in languages that use spaces.',
  'hint.corners': '{list} is the four corners joined with the separator below.',
  'hint.cornerItem': 'One corner: {c} is a corner name, {s} the side of the square there.',
  'hint.cornerSep': 'Separator between the four corners.',
  'hint.nothing': 'Used when a corner is empty.',
  'hint.groupH': 'Starts with a number in brackets that matches a numbered ring on the board. {list} is side lengths such as "19, 8, 9" and {sum} the same with plus signs.',
  'hint.groupV': 'As above, for squares stacked bottom to top.',
  'hint.ghost': 'The board shows a dashed outline where the square goes.',
  'levels.solved': 'Beside the Levels heading in the menu, e.g. "7 of 29 solved".',
  'levels.range': 'Group title in the level list, e.g. "7 to 8 squares".',
  'levels.item': 'Screen-reader label and tooltip of one level button in the list.',
  'opt.theme': 'Colour setting: automatic (follows the device), dark or light.',
  'labels.value': 'Write each square\'s side length on it (the default).',
  'labels.index': 'Write s₀, s₁, … on the squares instead of their sizes.',
  'help.amber': 'The smallest square is always drawn in amber (dark yellow).',
  'help.rank': 'Rings are drawn around a line of squares that spans the frame. Solid rings: a line from left to right; dashed rings: a line from bottom to top.',
  'help.buttons': 'Names the four buttons under the board; each name in <b>…</b> must match btn.hint, btn.showAnswer, btn.reset and btn.skip.',
  'help.free': 'The names in <b>…</b> must match mode.free and adv.title.',
  'about.eyebrow': 'Heading of the About section.',
  'about.what': 'What the number L*ₙ means. Keep <sub>n</sub> as written; "n" is the number of squares.',
  'about.papers': '{a} and {b} become links to the two arXiv papers (shown as arXiv:2610.22622 and arXiv:2610.28504).',
  'about.source': '{repo} becomes a link to the project page on GitHub, where readers can report errors.',
  'about.draft': 'Shown in a language that has not been reviewed yet. Once you approve the translation this line is replaced by the next one.',
  'about.drafts': 'Shown in reviewed languages. {list} is the names of the unreviewed languages, each in its own script.',
  'about.privacy': 'Privacy note. The game stores progress in the browser (local storage) and makes no network requests.',
  'about.license': '{year} is 2026 and {who} the author\'s name. "MIT License" is the name of a software license; keep it recognisable.',
  'about.fonts': '{fonts} is a list of font names. "SIL Open Font License" is the name of the fonts\' license.',
  'aria.board': 'Screen-reader description of the board. Mentions the keyboard controls.',
};

/** Parameters used to show what a code-built entry produces. */
const SAMPLES = {
  'opt.nsq': [{ n: 7 }],
  'status.usedHints': [{ h: 1 }, { h: 3 }],
  'status.toGo': [{ k: 1 }, { k: 4 }],
  'verdict.setBy': [{ m: 6, k: 1, list: 'column', terms: 's₁+s₄+s₅', L: 41 }, { m: 7, k: 2, list: 'top and center', terms: 'C₀, W', L: 38 }],
  'verdict.onlyFits': [{ name: 'β', v: 40, L: 41 }, { name: 'β', v: 41, L: 41 }],
};

const note = key => NOTE[key] || PREFIX[Object.keys(PREFIX).find(x => key.startsWith(x))] || '';


const strip = s => String(s).replace(/<sub>(\d+)<\/sub>/g, (_, d) => d.split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
function show(code, key) {
  const v = I.STR[code][key];
  if (typeof v !== 'function') return strip(v);
  I.setLang(code);
  const out = (SAMPLES[key] || [{}]).map(p => {
    const args = Object.entries(p).map(([k, x]) => `${k}=${x}`).join(', ');
    return `[${args}]  ${strip(I.t(key, p))}`;
  }).join('\n');
  I.setLang('en');
  return out;
}

const keys = Object.keys(I.STR.en);
// every entry built by code, in any language, needs sample parameters
const missing = keys.filter(k => I.codes().some(c => typeof I.STR[c][k] === 'function') && !SAMPLES[k]);
if (missing.length) throw new Error('no samples for ' + missing.join(', '));
const out = {};
for (const code of I.codes().filter(c => c !== 'en')) {
  out[code] = {
    name: I.META[code].name,
    rows: keys.map((key, i) => ({
      n: i + 1, key, context: note(key),
      built: typeof I.STR.en[key] === 'function' || typeof I.STR[code][key] === 'function',
      en: show('en', key), draft: show(code, key),
    })),
  };
}
const dir = path.join(__dirname, '..', 'release', 'review');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'strings.json'), JSON.stringify(out, null, 1));
console.log(`${keys.length} strings for ${Object.keys(out).join(', ')}; ` +
            `${keys.filter(k => !note(k)).length} without a note`);
