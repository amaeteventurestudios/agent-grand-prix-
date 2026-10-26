# SpacetimeDB: one install, one database per game

One SpacetimeDB server runs on the Oracle box (127.0.0.1:3010, data in /stdb). Each game gets its own database:

| Database   | Folder                | What it holds                          |
|------------|-----------------------|----------------------------------------|
| `agp`      | `spacetime/agp`       | Agent Grand Prix: who is online, where |
| `palasora` | `spacetime/palasora`  | Palasora: residents online, town pulse |
| next game  | `spacetime/<name>`    | add a folder, add it to `GAMES` below  |

- Players reach only their own game's database. Tables are private unless marked `public`, and the public ones hold
  counts, never names.
- The server's own SpacetimeDB login publishes every database, so it owns all of them. Only the owner can read the
  private tables (`spacetime sql`), which is what the owner overview uses.
- Outside the server only two things are reachable through Caddy: a game's live connection
  (`/v1/database/<name>/subscribe`) and getting a player identity (`/v1/identity`). Publishing, deleting and SQL are
  local only.

Deploy: `.github/workflows/spacetime.yml` (it builds and tests every module on GitHub first, then installs or updates
the server; `server/spacetime-install.sh`). Add a game: copy `spacetime/agp`, rename, add its name to `GAMES` in the
workflow.
