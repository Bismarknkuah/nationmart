\echo '=== TEST 5: DUPLICATE PAYSTACK WEBHOOK (double-credit attack) ==='
SELECT id AS uid FROM users WHERE email='kojo@nationmart.gh' \gset
\echo 'Paystack sends the SAME topup webhook twice (retry/duplicate):'
SELECT post_wallet_txn(:'uid'::uuid, 'credit', 'settlement', 100, 'MoMo topup', 'PAY-REF-999') AS after_1st;
DO $$ BEGIN
  PERFORM post_wallet_txn((SELECT id FROM users WHERE email='kojo@nationmart.gh'), 'credit', 'settlement', 100, 'MoMo topup DUPLICATE', 'PAY-REF-999');
  RAISE NOTICE 'FAIL: duplicate webhook DOUBLE-CREDITED the rider!';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate webhook blocked by unique index';
END $$;
SELECT balance AS final_balance FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.email='kojo@nationmart.gh';

\echo ''
\echo '=== TEST 6: ROLLBACK — a crash mid-transaction must leave NO trace ==='
SELECT balance AS before_crash FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.email='kojo@nationmart.gh';
BEGIN;
  SELECT post_wallet_txn(:'uid'::uuid, 'credit', 'delivery_earning', 500, 'big job') AS inside_txn;
ROLLBACK;
SELECT balance AS after_rollback FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.email='kojo@nationmart.gh';
SELECT count(*) AS phantom_ledger_rows FROM wallet_transactions WHERE description='big job';

\echo ''
\echo '=== FINAL: books must balance ==='
SELECT count(*) AS drift_rows FROM wallet_drift;
