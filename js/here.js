// "I'm here": every 45 seconds while the game is open and showing, and whenever the screen changes,
// the game tells its own server which screen it is on, so the owner sees who is online and racing.
// It sends a random id kept on this device, the team name and the screen; nothing else. Off on
// file:// and in tests (?nohere); a failed send is simply dropped.
const KEY = 'agp.here';

function deviceId() {
  try {
    let k = localStorage.getItem(KEY);
    if (!k) { k = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(KEY, k); }
    return k;
  } catch { return null; }
}

export function startHere(where) {
  if (location.protocol === 'file:' || /[?&]nohere\b/.test(location.search)) return;
  const k = deviceId(); if (!k) return;
  let last = '', at = 0;
  const tick = () => {
    if (document.hidden) return;
    const w = where(), sig = w.screen + '|' + w.name;
    if (sig === last && Date.now() - at < 45000) return;
    last = sig; at = Date.now();
    fetch('/api/me/here', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, ...w }), keepalive: true }).catch(() => {});
  };
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { at = 0; tick(); } });
  setTimeout(tick, 1500);
}
