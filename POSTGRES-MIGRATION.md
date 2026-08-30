# NationMart — PostgreSQL migration

## Status: money core built and VERIFIED against a real PostgreSQL 16.

### What was proven (not assumed)
| Guarantee | Verified |
|---|---|
| Schema executes (58 statements) | ✅ |
| Ledger row + balance move atomically | ✅ |
| Zero/negative amounts rejected | ✅ |
| Money rounds exactly (found + fixed a real bug) | ✅ |
| Duplicate Paystack webhook can't double-credit | ✅ |
| Crash mid-transaction leaves no trace | ✅ |
| 20 concurrent writes to one wallet stay exact | ✅ |
| Failed delivery can't be stored without a reason | ✅ |
| Mirror is idempotent (re-sync ≠ duplicate) | ✅ |

**26/26 tests pass with Postgres; 15 pass + 11 skip cleanly without it.**

### Architecture notes
* **`pg` driver, not an ORM.** Prisma downloads binary query engines at build
  time; that download failed in a sandboxed build and can fail on Railway. `pg`
  has no binaries, so the deploy cannot die on a CDN hiccup.
* **Money is `NUMERIC(14,2)`, never float.** `toFixed(2)` was rounding halfway
  values DOWN (`45.555` → `45.55`), quietly shortchanging people a pesewa. Fixed
  and locked behind a test.
* **MongoDB stays the source of truth** until you deliberately flip the flags.

### Cutover
```bash
# 1. Railway → New → Database → PostgreSQL. Copy DATABASE_URL to the backend service.
cd backend
npm install
npm run db:deploy          # create the tables
npm run migrate:pg:dry     # READ-ONLY. Prints counts. Touches nothing.
npm run migrate:pg         # migrate for real. Never writes to Mongo.

# 2. Start mirroring new writes:      SYNC_POSTGRES=true
# 3. Shadow the ledger (both DBs):    WALLET_BACKEND=dual
# 4. Watch logs a few days, then:     WALLET_BACKEND=postgres
# Anything looks wrong? Set it back to `mongo`. No redeploy needed.
```

### The invariant to alert on
```sql
SELECT * FROM wallet_drift;   -- must ALWAYS return zero rows
```
A nightly job (02:15) runs this and logs loudly if the books ever disagree.

### Still on MongoDB
Products, chat, HR, notifications, workflows. Those are later phases — the
money moved first, on purpose.
