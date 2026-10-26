# SpacetimeDB: one install, one database per game

One SpacetimeDB server runs on the Oracle box (127.0.0.1:3010, data in /stdb). Each game gets its own database:

| Database   | Folder                | What it holds                          |
|------------|-----------------------|----------------------------------------|
| `agp`      | `spacetime/agp`       | Agent Grand Prix: who is online, where |
| `palasora` | `spacetime/palasora`  | Palasora: residents online, town pulse |
| next game  | `spacetime/<name>`    | add a folder, add it to `GAMES` below  |

- No browser talks to SpacetimeDB. Each game's own service on the server passes on what players do (AGP:
  `POST /api/me/here` in `server/accounts.mjs`, every 45 s and on each screen change, with an anonymous device key,
  the team name and the screen). Tables are private unless marked `public`, and the public ones hold counts.
- The server's own SpacetimeDB login publishes every database, so it owns all of them. Only the owner can read the
  private tables (`spacetime sql`), which is what the owner overview uses. In AGP it is also the only login allowed
  to write visits (`claim` after publishing, then `seen`).
- Outside the server only `/v1/ping` is reachable through Caddy. Publishing, calls, deletes and SQL are local only.

Deploy: `.github/workflows/spacetime.yml` (it builds and tests every module on GitHub first, then installs or updates
the server; `server/spacetime-install.sh`). Add a game: copy `spacetime/agp`, rename, add its name to `GAMES` in the
workflow.
