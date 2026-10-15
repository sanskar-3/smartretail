# SmartRetail

SmartRetail is a single-store retail operations app for grocery and neighbourhood shops. It combines a React point-of-sale interface with an Express API, a local SQLite database, JWT-based roles, and Socket.IO live updates.

## Features

- **Point of sale:** searchable catalogue, customer selection, cash/UPI/card payment, tax calculation, stock checks, and printable invoices.
- **Products:** SKU, category, price, tax rate, opening stock, and reorder level.
- **Customers:** customer records and purchase history with lifetime spend.
- **Orders:** bill history; cashiers see their own bills and administrators can review all bills.
- **Inventory:** purchase entries, signed adjustments, stock movement history, and low-stock alerts.
- **Reports:** daily/monthly sales, payment breakdown, top products, customer sales, and CSV export.
- **Live operations:** connected counters receive stock, low-stock, order, and product events.
- **Roles:** administrators manage products, inventory, reports, and team accounts; cashiers can create sales and customer records.

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite` module)
- No separate database server is required

## Run locally

1. Install the project dependencies:

   ```sh
   npm install
   ```

2. Create `.env` from `.env.example` if it does not already exist. Set `JWT_SECRET` to a long, unique random value. The default database file is `./data/smartretail.sqlite`; set `SQLITE_PATH` to change its location. Keep `.env` private.

3. In the project folder, start the API and frontend in separate terminals:

   ```sh
   npm run dev:server
   npm run dev
   ```

   Open the Vite address (normally `http://localhost:5173`). The Vite server proxies API and Socket.IO requests to the Express port configured by `PORT` (3000 by default).

SQLite creates the database and tables automatically. It uses WAL mode and foreign-key enforcement. Keep the database on a local disk, back it up regularly, and run one application server instance against the database file.

## Create the first administrator

For a real store, use a unique password of at least 12 characters. Temporarily add these values to `.env`:

```env
INITIAL_ADMIN_NAME=Store Owner
INITIAL_ADMIN_USERNAME=storeadmin
INITIAL_ADMIN_PASSWORD=replace-with-a-unique-long-password
```

Then run:

```sh
npm run create-admin
```

The command only creates the initial administrator when the users table is empty. Remove the bootstrap credentials from `.env` after setup. Administrators can create cashier accounts from the Team screen.

## Optional development demo data

On a fresh development database only, load sample products/customers and the demo accounts:

```powershell
$env:ALLOW_DEMO_SEED = 'true'
npm run seed
Remove-Item Env:ALLOW_DEMO_SEED
```

Demo credentials are `admin / admin123` and `cashier / cashier123`. The seed refuses production and non-empty databases. Never use demo accounts for a live store.

## Production

Build the frontend and start the combined Express app:

```sh
npm run build
npm start
```

Use a persistent local database file, a unique JWT secret, restricted filesystem access to the SQLite file and its `-wal`/`-shm` companions, and HTTPS via the hosting platform or a trusted reverse proxy. SQLite works well for one store and a modest number of counters connected to one application server. Do not put the database file on a shared network drive or run multiple app instances against it. Online payment processing and delivery tracking are outside scope.

## API routes

All routes except `POST /api/auth/login` require `Authorization: Bearer <token>`.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login` | Authenticate an administrator or cashier |
| `GET /api/auth/users`, `POST /api/auth/register` | List/create team accounts (administrator only) |
| `/api/products` | Search, create, update, or deactivate catalogue products |
| `/api/customers` | Manage customer records and purchase history |
| `/api/orders` | Create bills and browse order history |
| `/api/inventory` | Record stock-in, adjustments, and movement history |
| `/api/reports` | Sales, inventory, and customer reports |

## Data and operations

- Stock deductions, order headers/items, and stock logs for a bill are committed in one SQLite transaction. A failed checkout does not leave partial stock changes.
- Invoice lines retain the product name, price, and tax rate used at purchase time.
- Product removal deactivates the catalogue entry; past invoices and stock history remain available.
- Back up the database when the application is stopped, or use SQLite's online backup facilities. Do not copy only the main file while WAL writes are active.
