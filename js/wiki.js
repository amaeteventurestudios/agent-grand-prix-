// The racing wiki: every racing term and game command, in our own words. One list feeds the /wiki
// page (tools/wiki-build.mjs), the WhatsApp agent and the team radio, so "what is an undercut?" gets
// an instant answer with no AI. Plain data and plain functions: no browser APIs, so Node reads it too.
//
// Each entry: id (the page anchor), term, also (other ways people say it), cat, short (one or two
// sentences, sent as the answer), say (optional: the command to use in the game).

export const CATS = [
  ['commands', '📻 Commands you can give'],
  ['tyres', '🛞 Tyres'],
  ['strategy', '🧠 Strategy'],
  ['racing', '🏎️ Racecraft'],
  ['energy', '⚡ Battery and speed'],
  ['control', '🚩 Race control and flags'],
  ['weekend', '🏁 The race weekend'],
  ['game', '🎮 Agent Grand Prix'],
];

export const WIKI = [
  // ---------- commands ----------
  { id: 'box', term: 'Box', also: ['box box', 'pit', 'pit stop', 'pitstop', 'boxing', 'come in'], cat: 'commands',
    short: 'Come into the pit lane this lap for fresh tyres. A normal stop costs about a quarter of a lap.', say: 'box, box softs, box mediums, box hards, box inters, box wets' },
  { id: 'stay-out', term: 'Stay out', also: ['no box', 'cancel box', 'stay out'], cat: 'commands',
    short: 'Cancel a pit stop you asked for and keep running on the tyres you have.', say: 'stay out' },
  { id: 'push', term: 'Push', also: ['push push', 'pushing', 'flat out', 'quali mode'], cat: 'commands',
    short: 'Drive at full pace. Faster laps, but the tyres wear quicker and get hot.', say: 'push' },
  { id: 'save', term: 'Save', also: ['save tyres', 'tyre saving', 'manage', 'lift and coast', 'conserve'], cat: 'commands',
    short: 'Drive a little slower to make the tyres last longer. Good on a long stint.', say: 'save' },
  { id: 'normal', term: 'Normal', also: ['normal pace'], cat: 'commands',
    short: 'Back to the usual race pace: not pushing, not saving.', say: 'normal' },
  { id: 'attack', term: 'Attack', also: ['attacking', 'go for it', 'send it'], cat: 'commands',
    short: 'Go for the pass on the car ahead. Passes come more often, but so does contact.', say: 'attack' },
  { id: 'defend', term: 'Defend', also: ['defending', 'cover', 'shut the door', 'close the door'], cat: 'commands',
    short: 'Protect your place from the car behind. Harder to pass, a little slower.', say: 'defend' },
  { id: 'neutral', term: 'Neutral', also: [], cat: 'commands',
    short: 'Neither attack nor defend: race clean and keep out of trouble.', say: 'neutral' },
  { id: 'boost', term: 'Boost', also: ['overtake mode', 'deploy', 'full power'], cat: 'commands',
    short: 'Use the battery for 12 seconds of extra speed. Best within a second of the car ahead, or to defend.', say: 'boost' },
  { id: 'harvest', term: 'Harvest', also: ['charge', 'recharge', 'charging'], cat: 'commands',
    short: 'Recharge the battery as you drive, so you have power ready for a fight.', say: 'harvest' },
  { id: 'swap-places', term: 'Swap places', also: ['swap', 'let him through', 'let her through', 'let them through'], cat: 'commands',
    short: 'A team order: your two cars running nose to tail trade places, so the faster one can chase.', say: 'swap (on the radio or the team buttons)' },
  { id: 'hold-position', term: 'Hold position', also: ['hold positions', 'no fighting'], cat: 'commands',
    short: 'A team order: your two cars stop racing each other and keep the order they are in.', say: 'hold position' },
  { id: 'status', term: 'Status', also: ['gap', 'gaps'], cat: 'commands',
    short: 'Ask for a quick report: places, gaps, tyres and battery.', say: 'status' },
  { id: 'hand-over', term: 'Hand the team to your agents', also: ['auto', 'autonomous', 'handover', 'hand over', 'take over', 'take it back', 'quiet'], cat: 'commands',
    short: 'Your AI agents race and make the calls while you are away. They ask you before big calls, unless you say quiet. Say take over to make every call yourself again.', say: 'auto, quiet, take over' },

  // ---------- tyres ----------
  { id: 'compound', term: 'Compound', also: ['compounds', 'tyre compound', 'tire compound'], cat: 'tyres',
    short: 'The type of rubber a tyre is made of. Softer is faster but wears out sooner; harder lasts but is slower.' },
  { id: 'softs', term: 'Soft tyres', also: ['soft', 'softs', 'reds', 'red tyres'], cat: 'tyres',
    short: 'The fastest dry tyre (red). Great grip, short life. Good for gaining places early or for a final sprint.' },
  { id: 'mediums', term: 'Medium tyres', also: ['medium', 'mediums', 'yellows', 'yellow tyres'], cat: 'tyres',
    short: 'The middle dry tyre (yellow). A balance of speed and life, and the safe choice to start.' },
  { id: 'hards', term: 'Hard tyres', also: ['hard', 'hards', 'whites', 'white tyres'], cat: 'tyres',
    short: 'The slowest dry tyre (white) but the longest lasting. Good for a long stint to the flag.' },
  { id: 'inters', term: 'Intermediate tyres', also: ['inter', 'inters', 'intermediate', 'intermediates', 'greens'], cat: 'tyres',
    short: 'Tyres for a damp track (green). Grooves clear light water; too slow when it is dry, not enough when it pours.' },
  { id: 'wets', term: 'Wet tyres', also: ['wet', 'wets', 'full wets', 'blues'], cat: 'tyres',
    short: 'Tyres for heavy rain (blue). Deep grooves push the water away. Very slow on a drying track.' },
  { id: 'slicks', term: 'Slicks', also: ['slick', 'slick tyres', 'dry tyres'], cat: 'tyres',
    short: 'The smooth dry tyres: soft, medium and hard. No grooves, so the most rubber on the road.' },
  { id: 'tyre-wear', term: 'Tyre wear', also: ['wear', 'tyre life', 'tire wear', 'tyre deg', 'degradation', 'deg'], cat: 'tyres',
    short: 'Tyres lose grip as they wear. The game shows how much life is left. Under about 25% the grip falls away fast.' },
  { id: 'cliff', term: 'The cliff', also: ['cliff', 'tyre cliff', 'falling off a cliff'], cat: 'tyres',
    short: 'The point where a worn tyre suddenly loses grip and lap times drop sharply. Box before you reach it.' },
  { id: 'tyre-temperature', term: 'Tyre temperature', also: ['tyre temp', 'tyre temps', 'warm tyres', 'cold tyres', 'overheating', 'warm up'], cat: 'tyres',
    short: 'Tyres grip best in a warm window. Cold tyres after a stop slide; pushing or following closely makes them too hot.' },
  { id: 'puncture', term: 'Puncture', also: ['punctures', 'flat tyre', 'flat tire'], cat: 'tyres',
    short: 'A tyre losing its air. It can happen when a tyre is almost worn out, and it can end your race.' },
  { id: 'two-compounds', term: 'Two-compound rule', also: ['two compound rule', 'two compounds', 'mandatory stop', 'compound rule'], cat: 'tyres',
    short: 'In a dry race each car must use two different dry tyres, which means at least one stop. Skip it and you get a 20-second penalty.' },

  // ---------- strategy ----------
  { id: 'strategy', term: 'Strategy', also: ['race strategy', 'plan', 'race plan'], cat: 'strategy',
    short: 'Your plan for the race: which tyres, how many stops and when, and when to push or save.' },
  { id: 'stint', term: 'Stint', also: ['stints'], cat: 'strategy',
    short: 'The laps a car runs on one set of tyres, between the start, its stops and the flag.' },
  { id: 'one-stop', term: 'One-stop', also: ['one stop', 'one stopper', 'two stop', 'two-stop', 'two stopper'], cat: 'strategy',
    short: 'How many pit stops a plan uses. One stop saves time in the pits; two stops means fresher, faster tyres.' },
  { id: 'undercut', term: 'Undercut', also: ['the undercut'], cat: 'strategy',
    short: 'Pit a lap before the car ahead. Fresh tyres are about a second a lap faster, so you can come out in front when they stop.' },
  { id: 'overcut', term: 'Overcut', also: ['the overcut'], cat: 'strategy',
    short: 'Stay out longer than the car ahead and pit later, using clear track to set fast laps while they warm up new tyres.' },
  { id: 'pit-window', term: 'Pit window', also: ['window', 'pit stop window'], cat: 'strategy',
    short: 'The range of laps when stopping makes the most sense for your tyres and the cars around you.' },
  { id: 'cheap-stop', term: 'Cheap stop', also: ['free stop', 'cheap pit stop'], cat: 'strategy',
    short: 'A stop under the safety car costs about half the usual time, because everyone else is driving slowly.' },
  { id: 'split-strategy', term: 'Split strategy', also: ['split the cars', 'splitting strategy'], cat: 'strategy',
    short: 'Put your two cars on different tyres or stop on different laps, so if luck goes against one, the other gains.' },
  { id: 'pace', term: 'Pace', also: ['race pace', 'lap time', 'lap times'], cat: 'strategy',
    short: 'How fast a car is lapping. The game shows each car\'s last lap and the time to the chequered flag.' },
  { id: 'gap', term: 'Gap', also: ['interval', 'gap to leader', 'gaps'], cat: 'strategy',
    short: 'Time between two cars. Interval is to the car just ahead; gap to the leader is to first place.' },
  { id: 'track-position', term: 'Track position', also: [], cat: 'strategy',
    short: 'Being physically ahead on the road. On narrow circuits it is worth more than fresher tyres, because passing is hard.' },

  // ---------- racecraft ----------
  { id: 'overtake', term: 'Overtake', also: ['overtaking', 'pass', 'passing', 'a pass'], cat: 'racing',
    short: 'Passing the car ahead on track. Easiest on a straight, with the slipstream, fresher tyres or a boost.' },
  { id: 'slipstream', term: 'Slipstream', also: ['tow', 'draft', 'drafting'], cat: 'racing',
    short: 'Right behind another car on a straight there is less air to push through, so you go faster and can line up a pass.' },
  { id: 'dirty-air', term: 'Dirty air', also: ['turbulent air', 'following'], cat: 'racing',
    short: 'The messy air behind a car. In corners it takes grip away from the car following and heats its tyres.' },
  { id: 'overtaking-aid', term: 'Overtaking aid', also: ['drs', 'wing', 'open wing'], cat: 'racing',
    short: 'Within about 30 metres of the car ahead on a straight, the car following gets a small extra push of speed (like DRS in real racing).' },
  { id: 'racing-line', term: 'Racing line', also: ['line', 'the line'], cat: 'racing',
    short: 'The fastest path around a corner: wide on the way in, close to the inside at the apex, wide on the way out.' },
  { id: 'apex', term: 'Apex', also: ['apexes', 'apices'], cat: 'racing',
    short: 'The point where a car is closest to the inside of a corner.' },
  { id: 'contact', term: 'Contact', also: ['crash', 'collision', 'crashes', 'accident'], cat: 'racing',
    short: 'Two cars touching. It can damage a car or end its race. Attack makes it more likely.' },
  { id: 'lapped', term: 'Lapped car', also: ['lapped', 'backmarker', 'backmarkers', 'lapping'], cat: 'racing',
    short: 'A car a whole lap behind the leader. It lets faster cars through.' },
  { id: 'team-orders', term: 'Team orders', also: ['team order'], cat: 'racing',
    short: 'Instructions to your two drivers about each other: swap places, hold position, or race freely.' },
  { id: 'pit-exit', term: 'Pit exit', also: ['pit-exit', 'pit exit fight', 'rejoin'], cat: 'racing',
    short: 'Where cars rejoin after a stop. Cold tyres make you easy to pass there, so defend and boost for the first lap.' },

  // ---------- battery and speed ----------
  { id: 'ers', term: 'ERS (battery)', also: ['ers', 'battery', 'energy', 'hybrid', 'energy recovery'], cat: 'energy',
    short: 'The car\'s battery. It charges from braking (harvest) and gives extra power when you deploy it or boost.' },
  { id: 'deploy', term: 'Deploy', also: ['deployment', 'battery mode'], cat: 'energy',
    short: 'A battery mode that uses charge for extra speed all lap. Balanced keeps it level; harvest fills it.' },
  { id: 'balanced', term: 'Balanced', also: ['balanced mode', 'standard battery'], cat: 'energy',
    short: 'The everyday battery mode: it charges and spends about the same.' },
  { id: 'top-speed', term: 'Top speed', also: ['speed trap', 'straight line speed'], cat: 'energy',
    short: 'How fast a car goes at the end of a long straight. Boost, the slipstream and the overtaking aid all add to it.' },

  // ---------- race control ----------
  { id: 'safety-car', term: 'Safety car', also: ['sc', 'safety car period'], cat: 'control',
    short: 'After a crash, a road car leads the field at low speed while the track is cleared. No passing, and pit stops are cheap.' },
  { id: 'vsc', term: 'Virtual safety car', also: ['vsc', 'virtual safety'], cat: 'control',
    short: 'Every car must slow to a set speed without a real safety car on track. Gaps stay roughly the same and stops are cheaper.' },
  { id: 'yellow-flag', term: 'Yellow flag', also: ['yellow', 'yellows flag', 'double yellow'], cat: 'control',
    short: 'Danger ahead: slow down and no passing in that part of the track.' },
  { id: 'red-flag', term: 'Red flag', also: ['red flag'], cat: 'control',
    short: 'The race is stopped and every car returns slowly to the pit lane.' },
  { id: 'blue-flag', term: 'Blue flag', also: ['blue flags'], cat: 'control',
    short: 'Shown to a lapped car: a faster car is about to lap you, let it through.' },
  { id: 'chequered-flag', term: 'Chequered flag', also: ['checkered flag', 'chequered', 'checkered', 'the flag', 'finish'], cat: 'control',
    short: 'The black and white flag at the finish. The race timer shows how long until the leader and your car take it.' },
  { id: 'penalty', term: 'Penalty', also: ['penalties', 'time penalty'], cat: 'control',
    short: 'Seconds added to a car\'s race time for breaking a rule, such as skipping the two-compound rule.' },
  { id: 'dnf', term: 'DNF', also: ['did not finish', 'retire', 'retired', 'retirement'], cat: 'control',
    short: 'Did not finish: the car is out of the race, after a crash, a failure or a puncture.' },
  { id: 'race-control', term: 'Race control', also: [], cat: 'control',
    short: 'The officials who run the race: they call the flags, the safety car and the penalties.' },

  // ---------- weekend ----------
  { id: 'grand-prix', term: 'Grand Prix', also: ['gp', 'grand prix'], cat: 'weekend',
    short: 'A race weekend at one circuit, named after its city or country.' },
  { id: 'qualifying', term: 'Qualifying', also: ['quali', 'qualy'], cat: 'weekend',
    short: 'The timed session before the race. The fastest lap starts at the front of the grid.' },
  { id: 'pole', term: 'Pole position', also: ['pole', 'p1 on the grid'], cat: 'weekend',
    short: 'First place on the starting grid, earned with the fastest qualifying lap.' },
  { id: 'grid', term: 'Grid', also: ['starting grid', 'the grid'], cat: 'weekend',
    short: 'The starting order, two by two, set by qualifying.' },
  { id: 'fastest-lap', term: 'Fastest lap', also: ['fl'], cat: 'weekend',
    short: 'The quickest single lap anyone sets in the race.' },
  { id: 'p1', term: 'P1, P2, P3…', also: ['p1', 'p2', 'p3', 'position', 'podium'], cat: 'weekend',
    short: 'P is for position: P1 is first. The top three stand on the podium.' },
  { id: 'points', term: 'Points', also: ['championship points', 'standings', 'championship'], cat: 'weekend',
    short: 'Scored for finishing near the front. The Season adds them up over 25 rounds.' },
  { id: 'full-distance', term: 'Full distance', also: ['race length', 'full race', 'short race', 'long race'], cat: 'weekend',
    short: 'Races come in short, medium, long and full distance. Full distance runs a real Grand Prix length.' },

  // ---------- the game ----------
  { id: 'ai-agent', term: 'AI agent', also: ['agent', 'agents', 'ai agents', 'my agent', 'your agent'], cat: 'game',
    short: 'Your AI agents race your cars and run the team when you hand it to them. You can also make your own agent in WhatsApp and race by message.' },
  { id: 'team-principal', term: 'Team principal', also: ['principal', 'team boss', 'boss'], cat: 'game',
    short: 'That\'s you: the boss of the team, making the strategy calls for both cars.' },
  { id: 'engineer', term: 'Race engineer', also: ['engineer', 'strategist'], cat: 'game',
    short: 'Your voice on the radio: race updates, a plan before the start, and advice when you ask for it.' },
  { id: 'team-radio', term: 'Team radio', also: ['radio', 'voice radio', 'mic'], cat: 'game',
    short: 'Hold the mic button (or say “Radio” in hands-free mode) and talk to your drivers by name: “Nova, box for mediums”.' },
  { id: 'driver-dna', term: 'Driver DNA', also: ['dna'], cat: 'game',
    short: 'Each driver\'s style and personality: how hard they push, how they look after tyres, how they fight.' },
  { id: 'daily', term: 'Daily Grand Prix', also: ['daily', 'daily gp'], cat: 'game',
    short: 'One race a day, the same circuit, grid and weather for everyone, with a share card for your result.' },
  { id: 'season', term: 'Season', also: ['season mode'], cat: 'game',
    short: 'A 25-round championship from Abu Dhabi to Abuja.' },
  { id: 'academy', term: 'Racing Academy', also: ['academy', 'lessons'], cat: 'game',
    short: 'Five short guided lessons on a real race, taught by your engineer.' },
  { id: 'sora', term: 'Sora', also: ['coins', 'currency'], cat: 'game',
    short: 'The game\'s own currency, for prizes. It has no cash value.' },
  { id: 'anti-bot-pass', term: 'Anti-Bot Pass', also: ['the pass', 'pass card'], cat: 'game',
    short: 'The pass that shows you are a real person. It unlocks full-distance races and more.' },
];

// ---------- lookup ----------
const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const sing = (w) => w.replace(/ (\w{4,}?)s $/, ' $1 ');
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = [];
  for (const e of WIKI) for (const w of [e.term, e.id.replace(/-/g, ' '), ...e.also]) {
    const n = norm(w.replace(/\(.*?\)/g, ''));
    if (n.trim()) INDEX.push([n, e]);
    const b = norm(w); if (b !== n && b.trim()) INDEX.push([b, e]);
  }
  INDEX.sort((a, b) => b[0].length - a[0].length);
  return INDEX;
}
const exact = (n) => { const s = sing(n); const hit = index().find(([w]) => w === n || w === s || sing(w) === s); return hit ? hit[1] : null; };

// What someone asked about, or null. Questions ("what is an undercut?", "what does DRS mean",
// "define dirty air", "wiki slipstream", "undercut?") find the term inside them; plain text only
// matches a term said on its own ("undercut").
export function lookup(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 120) return null;
  let t = norm(raw);
  const asked = /\?\s*$/.test(raw) || /^ (what|whats|wats|wat|define|explain|meaning|wiki|glossary|tell me about|how does|how do|whats the|what are|what does|what do|what is|whats a|what is a) /.test(t);
  const lead = /^ (?:can you |could you |please |pls )?(?:tell me |explain )?(?:about )?(?:what (?:is|are|does|do|s)|whats|wats|wat is|wat|define|explain|meaning of|the meaning of|wiki|glossary|tell me about|how (?:does|do))(?= )/;
  const tail = / (?:mean|means|meaning|stand for|stands for|do|does|work|works|in racing|in f1|in formula 1|in the game|please|pls|again|exactly)(?= $)/;
  for (let i = 0; i < 4; i++) t = t.replace(lead, '').replace(tail, '').replace(/^ (?:a|an|the|to|it|by|you|we|i)(?= )/, '');
  t = ' ' + t.trim() + ' ';
  const e = exact(t);
  if (e) return e;
  if (!asked) return null;
  // the term has to be most of what was asked: "what are we doing today?" is not a question about a word
  const hit = index().find(([w]) => w.trim().length > 2 && t.includes(w) && w.trim().length >= t.trim().length * 0.5);
  return hit ? hit[1] : null;
}

// The answer as one short message. fmt 'wa' uses WhatsApp bold (*term*).
export function answer(e, { fmt = 'text', site = '' } = {}) {
  const b = fmt === 'wa' ? (s) => `*${s}*` : (s) => s;
  const lines = [`📖 ${b(e.term)}: ${e.short}`];
  if (e.say) lines.push(`👉 Say ${e.say.split(', ').map((x) => (fmt === 'wa' ? `*${x}*` : `“${x}”`)).join(', ')}.`);
  if (site) lines.push(`More: ${site.replace(/\/$/, '')}/wiki#${e.id}`);
  return lines.join('\n');
}
