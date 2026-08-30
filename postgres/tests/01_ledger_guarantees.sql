-- Seed a rider
INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Kojo Rider', 'kojo@nationmart.gh', '$2b$hash', 'rider')
RETURNING id AS rider_id \gset

\echo '--- TEST 1: delivery earnings + commission ---'
SELECT post_wallet_txn(:'rider_id'::uuid, 'credit', 'delivery_earning', 45.50, 'Delivery NM-DLV-001') AS balance;
SELECT post_wallet_txn(:'rider_id'::uuid, 'debit',  'commission',        4.55, '10% commission', 'NM-DLV-001') AS balance;

\echo '--- TEST 2: reject negative/zero amounts ---'
DO $$ BEGIN
  PERFORM post_wallet_txn((SELECT id FROM users WHERE email='kojo@nationmart.gh'), 'credit', 'settlement', -10, 'evil');
  RAISE NOTICE 'FAIL: negative amount was accepted!';
EXCEPTION WHEN others THEN RAISE NOTICE 'PASS: negative rejected -> %', SQLERRM;
END $$;

\echo '--- TEST 3: money precision (no float drift) ---'
SELECT post_wallet_txn(:'rider_id'::uuid, 'credit', 'delivery_earning', 0.10, 'ten pesewas') AS b;
SELECT post_wallet_txn(:'rider_id'::uuid, 'credit', 'delivery_earning', 0.20, 'twenty pesewas') AS b;

\echo '--- LEDGER ---'
SELECT type, category, amount, balance_after FROM wallet_transactions ORDER BY id;

\echo '--- WALLET vs LEDGER (drift must be EMPTY) ---'
SELECT count(*) AS drift_rows FROM wallet_drift;

\echo '--- TEST 4: failed delivery MUST have a reason ---'
DO $$
DECLARE u uuid; o uuid;
BEGIN
  SELECT id INTO u FROM users LIMIT 1;
  INSERT INTO orders (order_number, buyer_id, seller_id, total_amount) VALUES ('NM-T1', u, u, 100) RETURNING id INTO o;
  BEGIN
    INSERT INTO deliveries (tracking_number, order_id, buyer_id, seller_id, status)
    VALUES ('T-1', o, u, u, 'failed');
    RAISE NOTICE 'FAIL: failed delivery accepted with no reason!';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: DB blocked failed-without-reason';
  END;
END $$;
