// Draws every circuit on one sheet (SVG), like a season poster: node tools/circuit-sheet.mjs (OUT=file, ONLY=1 for the redrawn ones, V=1 for the old layouts)
import { generateTrack } from '../js/track.js';
import { VENUES } from '../js/data.js';
import { hashString } from '../js/rng.js';
import fs from 'fs';
import { layoutSeedKey, REDRAWN } from '../js/layout.js';
const ONLY = process.env.ONLY ? Object.keys(REDRAWN) : null;
const ver = +(process.env.V || 2), tag = process.env.TAG || '-layout-2';
const NV = process.env.ONLY ? 16 : VENUES.length, cols = 6, cw = 300, ch = 300, rows = Math.ceil(NV / cols);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*cw}" height="${rows*ch+90}" viewBox="0 0 ${cols*cw} ${rows*ch+90}"><rect width="100%" height="100%" fill="#fff"/><text x="${cols*cw/2}" y="50" font-family="Arial" font-weight="700" font-size="34" text-anchor="middle">Agent Grand Prix: ${process.env.ONLY ? "16 redrawn circuits" : NV + " circuits (new)"}</text>`;
const stats=[];
(ONLY ? VENUES.filter(v => ONLY.includes(v.id)) : VENUES).forEach((v, i) => {
  const t0=Date.now(); const T = generateTrack(hashString(ver === 1 ? v.id + tag : layoutSeedKey(v.id)), v, ver); const ms=Date.now()-t0;
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for (let j=0;j<T.N;j++){x0=Math.min(x0,T.x[j]);x1=Math.max(x1,T.x[j]);z0=Math.min(z0,T.z[j]);z1=Math.max(z1,T.z[j]);}
  const rot = x1-x0 > z1-z0, bw = rot? z1-z0 : x1-x0, bh = rot ? x1-x0 : z1-z0, k = Math.min((cw-60)/bw,(ch-90)/bh);
  const ox = (i%cols)*cw + cw/2, oy = 90 + Math.floor(i/cols)*ch + (ch-50)/2;
  const P = (x,z) => rot ? [ox+(z-(z0+z1)/2)*k, oy-(x-(x0+x1)/2)*k] : [ox+(x-(x0+x1)/2)*k, oy+(z-(z0+z1)/2)*k];
  let d=''; for (let j=0;j<T.N;j+=3){const [a,b]=P(T.x[j],T.z[j]); d+=(j?'L':'M')+a.toFixed(1)+','+b.toFixed(1);} d+='Z';
  const [sx,sy]=P(T.x[0],T.z[0]);
  svg += `<path d="${d}" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><circle cx="${sx}" cy="${sy}" r="5" fill="#e10600"/>`;
  svg += `<text x="${ox}" y="${oy+(ch-50)/2+10}" font-family="Arial" font-weight="700" font-size="15" text-anchor="middle">${v.city}</text><text x="${ox}" y="${oy+(ch-50)/2+28}" font-family="Arial" font-size="12" fill="#777" text-anchor="middle">${(T.N/1000).toFixed(2)} km · ${T.apex.length} turns${T.style?' · '+T.style:''}</text>`;
  stats.push(`${v.id} ${T.N} ${T.apex.length} ${T.style} lap ${T.lapTime.toFixed(1)}s tries ${T.tries} ${ms}ms`);
});
svg += '</svg>';
fs.writeFileSync(process.env.OUT || '/tmp/sheet.svg', svg);
console.log(stats.join('\n'));
