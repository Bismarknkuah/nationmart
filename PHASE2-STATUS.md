# NationMart — Phase-2 implementation status

Both apps type-check clean. Backend builds to `dist/`. Backend test suite passes
(`npm test` → 12 tests, 3 suites). Frontend `next build` compiles (needs internet
for Google Fonts at build time).

Legend: ✅ live now · 🔌 real integration, activates when you add the key/account.

## 1. AI assistant for everyone, scoped for non-officers ✅
Chatbot is on every dashboard. Riders/drivers/buyers/sellers get operational help
only (their orders, listings, deliveries, profile, payments); officers get more.
Enforced both in the LLM system prompt and the built-in rules.

## 2. AI runs the logistics loop ✅
- Requesting a rider **auto-assigns the nearest available rider immediately**
  (no waiting on an officer); falls back to the queue if none are free.
- **AI auto-approve low-risk** button clears pending rider/driver applications;
  medium/high-risk are held for a human.
- Availability, earnings, delivery board, request-a-rider all in place.

## 3. Automated tests + CI ✅
- Jest unit tests (`backend/src/__tests__`): code generators, fraud scoring,
  KYC format check, delivery transitions, LLM gating. `npm test`.
- GitHub Actions (`.github/workflows/ci.yml`): backend typecheck+test, frontend
  typecheck+build on every push/PR.

## 4. Notifications: in-app + email + SMS ✅/🔌
Unified `notifyAll` writes in-app always, plus email (nodemailer) and SMS
(Arkesel/Hubtel-style) when configured. Subscription job now covers sellers AND
riders/drivers with trial reminders (7/1 days) and weekly dunning.
🔌 Email needs `EMAIL_*`; SMS needs `SMS_API_URL`/`SMS_API_KEY`. Web-push is the
one remaining channel (needs VAPID keys) — hook point is in `notifyAll`.

## 5. KYC, fraud, audit ✅/🔌
- 🔌 NIA Ghana Card verification calls `GHANA_CARD_VERIFY_URL` + `NIA_API_KEY`
  when set; otherwise format-validates (existing flow, untouched).
- ✅ Transparent fraud/risk scoring (`/api/management/users/:id/risk`).
- ✅ Audit log written on every moderation/approval/AI action.

## 6. Media to CDN + validation ✅/🔌
`uploadService` validates mime/size, runs an optional virus-scan hook
(`VIRUS_SCAN_URL`), and uploads to Cloudinary when `CLOUDINARY_*` are set
(else returns the data URL). Wired into profile photos.
Next: route product/passport images through the same service.

## 7. Live logistics map ✅
Leaflet + OpenStreetMap tracking page at `/track-map/<trackingNumber>` (no key).
Riders **share GPS** from their dashboard (`watchPosition` → ping endpoint);
buyers get a public shareable live link. Route is drawn pickup→dropoff with the
heuristic ETA. 🔌 Turn-by-turn routing would add OSRM/Mapbox later.

## 8. LLM-backed assistant + AI Console 🔌
`/api/ai/chat` does RAG over the knowledge base and answers via a real model when
`ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is set; custom AI-Console tasks use the
LLM too. Without a key, everything gracefully falls back to the heuristics.
Set `LLM_PROVIDER`, the key, and optionally `LLM_MODEL`.

## 9. Payments & escrow 🔌
Escrow state added to payments; funds auto-**release to the seller when the
delivery is marked delivered**. Subscription billing/dunning cron is live.
🔌 Real capture uses the existing Paystack/MoMo flow + `PAYSTACK_SECRET_KEY`
(webhook already present). Full hold-on-charge wiring belongs in the payment
success handler.

## Activate the integrations
Copy `backend/.env.example` → `.env` and fill any of: `ANTHROPIC_API_KEY`/
`OPENAI_API_KEY` (LLM), `CLOUDINARY_*` (media), `EMAIL_*` (email), `SMS_API_*`
(SMS), `GHANA_CARD_VERIFY_URL`+`NIA_API_KEY` (KYC), `PAYSTACK_SECRET_KEY`
(payments). The app runs fully without any of them, using safe fallbacks.
