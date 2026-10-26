// Agent Grand Prix's own database on the shared SpacetimeDB server. Players only ever reach this one.
// Private: who is here and what they are doing. Public: the counts the game shows ("12 racing now").
import { schema, table, t } from 'spacetimedb/server';

const player = table({ name: 'player' }, {
  identity: t.identity().primaryKey(),
  name: t.string(),
  screen: t.string(),        // home, race, live, garage, academy
  online: t.bool(),
  lastSeen: t.timestamp(),
});

const lobby = table({ name: 'lobby', public: true }, {
  id: t.u32().primaryKey(),  // always 0: one row of totals
  online: t.u32(),
  racing: t.u32(),
});

const spacetimedb = schema({ player, lobby });
export default spacetimedb;

const SCREENS = new Set(['home', 'race', 'live', 'garage', 'academy']);

function recount(ctx: any) {
  let online = 0, racing = 0;
  for (const p of ctx.db.player.iter()) if (p.online) { online++; if (p.screen === 'race' || p.screen === 'live') racing++; }
  const row = { id: 0, online, racing };
  if (ctx.db.lobby.id.find(0)) ctx.db.lobby.id.update(row); else ctx.db.lobby.insert(row);
}

export const init = spacetimedb.init((ctx) => { ctx.db.lobby.insert({ id: 0, online: 0, racing: 0 }); });

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: true, lastSeen: ctx.timestamp });
  else ctx.db.player.insert({ identity: ctx.sender, name: '', screen: 'home', online: true, lastSeen: ctx.timestamp });
  recount(ctx);
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: false, lastSeen: ctx.timestamp });
  recount(ctx);
});

// the game says who you are (your team name) and where you are
export const hello = spacetimedb.reducer({ name: t.string(), screen: t.string() }, (ctx, { name, screen }) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) return;
  ctx.db.player.identity.update({ ...p, name: name.trim().slice(0, 32), screen: SCREENS.has(screen) ? screen : 'home', lastSeen: ctx.timestamp });
  recount(ctx);
});
