# ShopWatch v2: shop monitoring for many businesses

One hosted app, many businesses. Each owner signs up, gets a private shop and adds their own
shopkeepers. Shops never see each other's data. Works for any business: boutique, pharmacy,
hardware, printing shop, supermarket.

## Run it locally (VS Code)
1. Install Node.js 18+ (https://nodejs.org)
2. Open this folder in VS Code, open a terminal
3. `npm install`
4. `npm start`
5. Open http://localhost:3000, click "New business? Create a shop account"

Local data is kept in `data/pgdata` (an embedded Postgres). Do not delete that folder.
In PowerShell, if npm is blocked: use Command Prompt, or `npm.cmd install` / `npm.cmd start`.

## Settings (environment variables, all optional locally)
| Name | Purpose |
|---|---|
| PORT | Port (default 3000) |
| DATABASE_URL | Postgres connection string. Set this when hosting so data survives restarts |
| JWT_SECRET | Fixed login secret (otherwise one is generated and stored in the database) |
| SIGNUP_CODE | If set, new shops must type this code to sign up (use it to control who joins or to sell access) |
| ADMIN_KEY | Enables /admin.html where you can see all shops and suspend/reactivate them |
| TZ_OFFSET_HOURS | Default time zone offset (default 3 = East Africa) |

## Hosting for free
1. Database: create a free Postgres at https://neon.tech or https://supabase.com and copy its
   connection string (looks like postgresql://user:pass@host/db).
2. Push this folder to a GitHub repository.
3. On https://render.com: New > Web Service > pick the repo.
   Build command `npm install`, Start command `npm start`.
4. In Environment add: DATABASE_URL (from step 1), JWT_SECRET (any long random text),
   ADMIN_KEY (your private key), optional SIGNUP_CODE.
5. Open the URL Render gives you. The app creates its table automatically.

Notes: Render's free web service sleeps when idle, so the first visit after a pause takes ~30 seconds.
All shop data lives in your Postgres database, so restarts do not lose anything.
Owners can also download a backup from Staff & settings.

## Anti-theft controls (per shop)
- Shopkeeper sells at prices the owner sets; cannot edit/delete sales or see cost prices.
- Voids need a reason and the owner's approval; stock returns only then.
- Stock changes only through "Receive stock" or "Count stock" (reason required). All logged.
- Blind till close: shopkeeper counts cash without seeing the expected figure.
- Mobile money and credit sales are reconciled; expenses need a description.
- Audit trail of every action, including failed logins.
- Dashboard warnings: cash short, stock shortages, many voids, unusually low sales, restock needed.
- Items can be set to "service" (no stock counting), e.g. tailoring or printing.

## Scale note
Each shop's records are held in memory and saved to Postgres on every change. This is fine for
dozens to a few hundred small shops on one small server. Beyond that, move the reports to SQL queries.

## Files
server.js (API + database), public/index.html, app.js, style.css, admin.html
