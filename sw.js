// Agent Grand Prix's service worker: it makes the game installable as an app. Everything still comes
// straight from the network, so updates show at once; with no connection, a page opened from the home
// screen says so instead of showing the browser's error page.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Grand Prix</title><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0b1220;color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
h1{font:800 italic 40px/1 'Arial Narrow',system-ui,sans-serif;margin:0 0 10px}em{color:#8fb6ff;font-style:inherit}button{margin-top:16px;border:0;border-radius:9px;padding:12px 20px;font:700 16px system-ui;background:#1267f4;color:#fff}</style></head>
<body><div><h1>AGENT <em>GRAND PRIX</em></h1><p>You're offline. The race needs a connection.</p><button onclick="location.reload()">Try again</button></div></body></html>`;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
