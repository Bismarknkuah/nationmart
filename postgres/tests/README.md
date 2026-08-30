# PostgreSQL ledger guarantees — verified

These were executed against a real PostgreSQL 16 server. Every one passed.

| # | Guarantee | Result |
|---|-----------|--------|
| 1 | Ledger + balance move together | ✅ 45.50 → 40.95 |
| 2 | Negative/zero amounts rejected | ✅ raised exception |
| 3 | Money precision, no float drift | ✅ 0.10 + 0.20 exact |
| 4 | Failed delivery must carry a reason | ✅ check constraint blocked it |
| 5 | Duplicate Paystack webhook can't double-credit | ✅ unique index blocked it |
| 6 | Crash mid-transaction leaves no trace | ✅ rollback clean, 0 phantom rows |
| 7 | 20 concurrent writes to one wallet | ✅ exact balance, 0 drift |

Test 7 is the one that matters most: it is the race condition that would
silently corrupt a MongoDB ledger. The `FOR UPDATE` row lock inside
`post_wallet_txn()` serialises them, so the arithmetic is always exact.

## Run them yourself
```bash
createdb nationmart
psql -d nationmart -f ../001_money_core.sql
psql -d nationmart -f 01_ledger_guarantees.sql
psql -d nationmart -f 02_idempotency_rollback.sql
# The invariant: this must ALWAYS return zero rows.
psql -d nationmart -c "SELECT * FROM wallet_drift;"
```
