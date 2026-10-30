# ShopWatch v6: shop monitoring for many businesses

One hosted app, many businesses. Each owner signs up, gets a private shop and adds their own
shopkeepers. Shops never see each other's data.

## Folder structure
```
shopwatch/
  server.js                 entry point (starts the server)
  package.json
  src/                      SERVER CODE
    config.js               environment settings
    utils.js                small shared helpers
    store.js                database layer (Postgres / embedded Postgres)
    permissions.js          roles (owner, manager, shopkeeper, storekeeper, accountant) and what each may do
    middleware/auth.js      login token check, role checks, rate limit
    services/               business logic (no web code)
      sales.js              paid / balance / profit maths, MoMo ID check
      purchases.js          money spent on new products and restocking
      capital.js            cash capital left
      cash.js               expected cash in the till
      stats.js              daily gross / net profit
      audit.js              audit trail
      mailer.js             sends email (Brevo HTTPS API, SMTP, or console for testing)
      alerts.js             alert rules, email layout, evening summary scheduler
      checks.js             daily random stock checks
      inventory.js          applying a stock count
    routes/                 one file per feature (auth, products, stock, sales, payments,
                            expenses, closing, capital, purchases, dashboard, reports, backup, admin)
  public/                   WEB PAGES (plain JavaScript modules, no build step)
    index.html, admin.html
    css/                    theme.css (colours) base.css components.css pages.css
    images/                 dashboard-bg.webp (dashboard banner), login-bg.jpg (login background)
    js/main.js              starts the app
    js/core/                state, api, format, dom, router, events, shell
    js/components/ui.js     stat cards, charts, pills, filters
    js/pages/               one file per screen
```

## Run it locally (VS Code)
1. Install Node.js 18 or newer (https://nodejs.org)
2. Open this folder in VS Code, open a terminal
3. `npm install`
4. `npm start`
5. Open http://localhost:3000 and create a shop account

Local data lives in `data/pgdata`. In PowerShell, if npm is blocked use Command Prompt or `npm.cmd start`.

## Environment variables
| Name | Purpose |
|---|---|
| PORT | Port (default 3000) |
| DATABASE_URL | Postgres connection string (Neon/Supabase). Needed when hosting |
| JWT_SECRET | Long random text that signs logins |
| SIGNUP_CODE | If set, new shops must enter this code |
| ADMIN_KEY | Enables /admin.html (list, suspend, reactivate shops) |
| TZ_OFFSET_HOURS | Default time zone offset (3 = East Africa) |
| BREVO_API_KEY | Brevo API key: sends alert emails over HTTPS (works on free hosts) |
| MAIL_FROM | The sender address (must be verified in Brevo), e.g. alerts@yourdomain.com |
| MAIL_FROM_NAME | Sender name shown in the inbox (default ShopWatch) |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS | Alternative to Brevo: any SMTP server (e.g. Gmail app password). Not usable on free Render |
| MAIL_CONSOLE | Set to 1 to print emails in the terminal instead of sending (testing) |
| APP_URL | Your public web address, used for the "Open ShopWatch" button in emails |
| MAIL_DAILY_CAP | Platform-wide emails per day (default 280, Brevo free allows 300) |

## What each money figure means
- **Spent on new products**: opening stock quantity x buying price, recorded when a product is created.
- **Spent on restocking**: every "Receive stock" x the price paid (owner may enter the price paid; shopkeepers use the current cost price).
- **Net profit of the day**: sale prices actually charged minus cost of the goods sold, minus that day's expenses.
- **Cash capital left**: capital added + cash and MTN MoMo collected from customers - stock bought with shop money - expenses - money withdrawn. Record your starting money on the Capital page first.
- **Exact price / bargaining**: the shopkeeper types the exact price for each item; the sale is saved at that price and counted as the full price. Discounts and extras are recorded and shown to the owner.
- **Part payment**: the shopkeeper enters what the customer pays now; the remaining balance is listed under "Balances owed" until paid.
- **MTN MoMo**: a payment method with a required transaction ID (each ID can be used only once). The till close compares MoMo expected vs received.

## Updating a hosted app
Upload the changed files to GitHub (keep the same folder layout). Render redeploys automatically.
Your data is in the database and is not touched. Old data stays valid: older sales and purchases
without cost details use the product's cost price.

## Email alerts: setup (administrator, once)
1. Create a free account at https://www.brevo.com and verify one sender email address (Senders & IP).
2. Create an API key (SMTP & API > API Keys).
3. In Render > Environment add `BREVO_API_KEY`, `MAIL_FROM` (the verified address) and `APP_URL`.
4. Each owner opens **Alerts & email**, enters his email address, saves and presses **Send test email**.

To test locally without any account, start with `MAIL_CONSOLE=1`; the emails are printed in the terminal.
Free Render blocks SMTP ports, which is why Brevo's HTTPS API is the recommended route when hosting.

## Loss-prevention features
- **Email alerts**: item sold below cost, big discount, void request, till or MoMo short, stock shortage, sale outside opening hours, cash handover mismatch, and an evening summary. Each shop is limited to 25 emails a day.
- **Daily spot checks**: every day the app picks a few random products; the shopkeeper counts them without seeing the system number and is never told if the count matched. The owner sees every difference.
- **Blind manual counts**: shopkeepers are not asked for a reason and are not told the result; the owner reviews them.
- **Cash handover confirmation**: the shopkeeper records cash handed over; the owner confirms what he received. A difference is flagged and emailed.
- **Numbered receipts** (R-000001, R-000002 ...): print or send by WhatsApp; each sale keeps its number.

## Employees and roles
The owner adds employees under **Menu > Staff & settings > Add employee** and picks a role. The role can be changed later.

| Role | Can do | Cannot do |
|---|---|---|
| Owner | Everything | |
| Manager | Sell, add products and prices, receive and count stock, expenses, close the till, see reports, costs, profit and capital | Manage staff, add or withdraw capital, approve voids, confirm cash handover, alerts, backups |
| Shopkeeper / Cashier | Sell, receive and count stock (blind), expenses, customer payments, close the till, daily check | See cost prices, profit, reports, capital |
| Storekeeper | Receive stock, blind counts, daily check | Sell, see money or cost prices |
| Accountant (view only) | View sales, costs, purchases, expenses, capital, reports, audit trail | Change anything |

The rules are enforced on the server for every request (see `src/permissions.js`); the pages only hide buttons to match.

## Menu
All pages are behind the **Menu** button in the top right. It opens a panel from the right side with every page the signed-in employee is allowed to use, so nothing is hidden on a small phone.

## Changing the photos
The dashboard banner uses `public/images/dashboard-bg.webp` and the login screen uses `public/images/login-bg.jpg`.
To use other photos, replace those two files with your own (keep the same names; about 1500 px wide gives a sharp result).
