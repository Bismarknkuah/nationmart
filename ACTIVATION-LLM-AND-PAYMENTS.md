# Activating the LLM assistant & Payments/Escrow

## A. LLM-backed assistant + AI Console — turn it ON
The code calls a real model whenever a key is present; without one it falls back
to the built-in rules + knowledge base (so the assistant always works).

1. Get an API key — Anthropic (recommended) or OpenAI.
2. In `backend/.env`:
   ```
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   # optional: LLM_MODEL=claude-sonnet-4-20250514
   ```
   (or `LLM_PROVIDER=openai` + `OPENAI_API_KEY=sk-...`)
3. Restart the backend.
4. Confirm it's live: open **AI Console** (executive/super-admin). The header
   badge shows **🟢 LLM connected · anthropic/<model>**. Click **Test assistant** —
   a reply prefixed `🤖 LLM:` means the model answered; `⚙️ Fallback` means no key
   is active yet. The chatbot on every dashboard automatically uses the LLM too,
   with the knowledge base supplied as RAG context.

Network note: the backend must be able to reach `api.anthropic.com` (or
`api.openai.com`) outbound. `GET /api/ai/status` returns the live state.

## B. Payments & Escrow — how it now works (code complete)
- **Hold on charge:** when an order payment settles (`settlePayment` in
  `paymentController`, used by MoMo verify and the Paystack webhook), the Payment
  is marked `escrowState: 'held'`, the order is `paid`, and both parties are
  notified that funds are **held in escrow**.
- **Auto-release:** when the delivery is marked **delivered**, the delivery
  controller flips held order-payments to `escrowState: 'released'` and notifies
  the seller of the released amount.
- **Subscription billing/dunning:** daily cron transitions trials→past_due and
  sends in-app + email + SMS reminders and weekly dunning (sellers + riders/drivers).

### Turn on real capture (Paystack)
1. In `backend/.env`: `PAYSTACK_SECRET_KEY=sk_live_...` (and public key for the
   client if used).
2. Point your Paystack dashboard webhook at `POST /api/payments/webhook`
   (handler already verifies and calls `settlePayment`, which sets escrow).
3. Without a key the flow runs in `simulated` mode end-to-end (MoMo OTP sim), so
   you can demo escrow hold→release before going live.

Escrow today is a **ledger state** (held/released) on each payment — the source
of truth for what the platform owes each seller. Moving actual cash to a separate
settlement account is a Paystack-transfers/settlement step you wire to the
`released` transition when you're ready to automate payouts.
