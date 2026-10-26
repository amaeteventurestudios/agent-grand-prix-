// Palasora's own database on the shared SpacetimeDB server. Residents only ever reach this one.
// Private: who is in town and where. Public: the town's pulse (how many are about).
import { schema, table, t } from 'spacetimedb/server';

const resident = table({ name: 'resident' }, {
  identity: t.identity().primaryKey(),
  name: t.string(),
  district: t.string(),      // where they are looking: downtown, residential, commercial, industrial, farmland
  online: t.bool(),
  lastSeen: t.timestamp(),
});

const pulse = table({ name: 'pulse', public: true }, {
  id: t.u32().primaryKey(),  // always 0
  online: t.u32(),
});

const spacetimedb = schema({ resident, pulse });
export default spacetimedb;

function recount(ctx: any) {
  let online = 0;
  for (const r of ctx.db.resident.iter()) if (r.online) online++;
  const row = { id: 0, online };
  if (ctx.db.pulse.id.find(0)) ctx.db.pulse.id.update(row); else ctx.db.pulse.insert(row);
}

export const init = spacetimedb.init((ctx) => { ctx.db.pulse.insert({ id: 0, online: 0 }); });

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const r = ctx.db.resident.identity.find(ctx.sender);
  if (r) ctx.db.resident.identity.update({ ...r, online: true, lastSeen: ctx.timestamp });
  else ctx.db.resident.insert({ identity: ctx.sender, name: '', district: 'downtown', online: true, lastSeen: ctx.timestamp });
  recount(ctx);
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const r = ctx.db.resident.identity.find(ctx.sender);
  if (r) ctx.db.resident.identity.update({ ...r, online: false, lastSeen: ctx.timestamp });
  recount(ctx);
});

export const hello = spacetimedb.reducer({ name: t.string(), district: t.string() }, (ctx, { name, district }) => {
  const r = ctx.db.resident.identity.find(ctx.sender);
  if (!r) return;
  ctx.db.resident.identity.update({ ...r, name: name.trim().slice(0, 32), district: district.slice(0, 24), lastSeen: ctx.timestamp });
  recount(ctx);
});
