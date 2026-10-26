// Agent Grand Prix's own database on the shared SpacetimeDB server. Players only ever reach this one.
// Private: who is here and what they are doing. Public: the counts the game shows ("12 racing now").
//
// Browsers never talk to SpacetimeDB themselves: the game's own accounts service (server/accounts.mjs)
// passes on "this player is here, on this screen" with the server's login, so only that login may
// write visits. The first login to call claim() after the database is made is that writer; the
// install script calls it straight after publishing, before anything else can reach the database.
import { schema, table, t, SenderError } from 'spacetimedb/server';

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

// a visit, by an anonymous key the accounts service makes from the device (never a name or address)
const visitor = table({ name: 'visitor' }, {
  key: t.string().primaryKey(),
  name: t.string(),          // the team name the player chose
  screen: t.string(),
  lastSeen: t.timestamp(),
});

// who may write visits (one row)
const admin = table({ name: 'admin' }, {
  id: t.u32().primaryKey(),
  who: t.identity(),
});

const spacetimedb = schema({ player, lobby, visitor, admin });
export default spacetimedb;

const SCREENS = new Set(['home', 'race', 'quali', 'live', 'garage', 'academy']);
const FRESH = 90_000_000n;   // a visit counts as online for 90 seconds; the game says hello every 45

function recount(ctx: any) {
  let online = 0, racing = 0;
  // only the visits the game reports count: a tool or the owner's screen connecting is not a player
  const since = ctx.timestamp.microsSinceUnixEpoch - FRESH;
  for (const v of ctx.db.visitor.iter()) if (v.lastSeen.microsSinceUnixEpoch > since) { online++; if (v.screen === 'race' || v.screen === 'quali' || v.screen === 'live') racing++; }
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

// the server's login becomes the writer, once
export const claim = spacetimedb.reducer({}, (ctx) => {
  const a = ctx.db.admin.id.find(0);
  if (!a) ctx.db.admin.insert({ id: 0, who: ctx.sender });
  else if (!a.who.isEqual(ctx.sender)) throw new SenderError('taken');
});

// the accounts service: this player is here, on this screen
export const seen = spacetimedb.reducer({ key: t.string(), name: t.string(), screen: t.string() }, (ctx, { key, name, screen }) => {
  const a = ctx.db.admin.id.find(0);
  if (!a || !a.who.isEqual(ctx.sender)) throw new SenderError('not allowed');
  const k = key.slice(0, 64);
  if (!k) return;
  const row = { key: k, name: name.trim().slice(0, 32), screen: SCREENS.has(screen) ? screen : 'home', lastSeen: ctx.timestamp };
  if (ctx.db.visitor.key.find(k)) ctx.db.visitor.key.update(row); else ctx.db.visitor.insert(row);
  recount(ctx);
});

// visits older than a day are let go, so the table stays small (the accounts service calls this now and then)
export const tidy = spacetimedb.reducer({}, (ctx) => {
  const a = ctx.db.admin.id.find(0);
  if (!a || !a.who.isEqual(ctx.sender)) throw new SenderError('not allowed');
  const since = ctx.timestamp.microsSinceUnixEpoch - 86_400_000_000n;
  for (const v of [...ctx.db.visitor.iter()]) if (v.lastSeen.microsSinceUnixEpoch < since) ctx.db.visitor.key.delete(v.key);
  recount(ctx);
});
