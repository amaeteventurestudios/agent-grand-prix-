// Writes wiki.html (the public racing wiki) from js/wiki.js. Run after changing the wiki: node tools/wiki-build.mjs
import { writeFileSync } from 'node:fs';
import { WIKI, CATS } from '../js/wiki.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sections = CATS.map(([c, title]) => {
  const items = WIKI.filter((e) => e.cat === c).map((e) => `    <li id="${e.id}" data-k="${esc([e.term, ...e.also].join(' ').toLowerCase())}"><b>${esc(e.term)}</b><span>${esc(e.short)}</span>${e.say ? `<em>Say: ${esc(e.say)}</em>` : ''}</li>`).join('\n');
  return `  <section data-cat="${c}"><h2>${esc(title)}</h2><ul>\n${items}\n  </ul></section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Racing wiki · Agent Grand Prix</title>
<meta name="description" content="Every racing word and team radio command in Agent Grand Prix, explained in a sentence: undercut, slipstream, safety car, tyres, boost and more.">
<link rel="canonical" href="https://agentgrandprix.com/wiki">
<link rel="icon" href="favicon.ico">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Barlow:wght@400;600&display=swap">
<style>
  :root { --bg: #f4f5f7; --ink: #16181d; --mute: #5d6470; --line: #dde0e6; --accent: #1463ff; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1115; --ink: #eef0f4; --mute: #9aa1ad; --line: #262a33; --accent: #5b93ff; --card: #171a20; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 Barlow, system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 56px; }
  h1 { font: 800 italic 40px/1 'Barlow Condensed', sans-serif; margin: 0 0 8px; }
  h2 { font: 800 italic 24px/1.1 'Barlow Condensed', sans-serif; margin: 28px 0 10px; }
  p.lede { color: var(--mute); margin: 0 0 18px; }
  input { width: 100%; font: inherit; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--ink); }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  li { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; scroll-margin-top: 16px; }
  li:target { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  li b { display: block; font-weight: 600; }
  li span { color: var(--mute); font-size: 14px; display: block; }
  li em { display: block; font-style: normal; font-size: 13px; color: var(--accent); margin-top: 6px; }
  a { color: var(--accent); }
  .tip { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 0 0 18px; font-size: 15px; }
  .back { display: inline-block; margin-top: 28px; font-weight: 600; }
  .meta { color: var(--mute); font-size: 14px; margin-top: 24px; }
  .none { color: var(--mute); display: none; }
</style>
</head>
<body>
<main>
  <h1>Racing wiki</h1>
  <p class="lede">Every racing word and command in Agent Grand Prix, in a sentence. New to racing? Start with the commands.</p>
  <p class="tip">💬 Your agent knows every word here. Ask it on WhatsApp (<b>what is an undercut?</b>) or on the team radio in a race (<b>what does dirty air mean?</b>) and it answers straight away. Reply <b>wiki</b> for the list.</p>
  <input id="q" type="search" placeholder="Search: undercut, safety car, boost…" aria-label="Search the wiki">
  <p class="none" id="none">No word matches that yet. Write to <a href="mailto:hello@agentgrandprix.com">hello@agentgrandprix.com</a> and we'll add it.</p>
${sections}
  <p class="meta">${WIKI.length} words. Written in our own words for Agent Grand Prix, an independent game not connected to any racing series. <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="credits.html">Credits</a></p>
  <a class="back" href="./">← Back to the game</a>
</main>
<script>
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase(); let any = false;
    for (const s of document.querySelectorAll('section')) {
      let n = 0;
      for (const li of s.querySelectorAll('li')) { const on = !v || li.dataset.k.includes(v) || li.textContent.toLowerCase().includes(v); li.hidden = !on; n += on; }
      s.hidden = !n; any ||= n > 0;
    }
    document.getElementById('none').style.display = any ? 'none' : 'block';
  });
</script>
</body>
</html>
`;
writeFileSync(new URL('../wiki.html', import.meta.url), html);
console.log(`wiki.html: ${WIKI.length} words`);
