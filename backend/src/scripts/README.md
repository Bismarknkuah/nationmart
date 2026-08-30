# backend/src/scripts/

One-off operational scripts. These are **not** part of the running server.
They are executed manually via `npm run …` from the `backend/` folder.

## Available scripts

| Script    | Command          | Purpose |
|-----------|------------------|---------|
| `seed.ts` | `npm run seed`   | Wipe demo collections and recreate fixture data (users, stores, products, orders, officers, etc.). Safe to run any number of times. |

## Adding a new script

1. Create a `.ts` file here (e.g. `migrate-currency.ts`).
2. Have it call `dotenv.config({ path: path.join(__dirname, '../../.env') })` before importing models.
3. Add a new entry in `backend/package.json` under `scripts`:
   ```json
   "migrate-currency": "ts-node src/scripts/migrate-currency.ts"
   ```
4. Document the script in this README.
