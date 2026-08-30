# 🛒 NationMart

**Ghana's Intelligent Commerce, Logistics & Governance Marketplace — built for Ghana first, ready for the world.**

NationMart is a full-stack marketplace where verified Ghanaian sellers build customizable digital stores, trade locally and internationally, accept Mobile Money, and operate under a tiered governance system (district & regional admins). Buyers and sellers rate each other publicly, report bad actors, and track every order.

Built on **Next.js 16 (React 19) + Express + TypeScript + MongoDB (Mongoose)**.

---

## ✨ Features

### Identity, trust & safety
- **Ghana Card verification** — every account links a National ID (`GHA-XXXXXXXXX-X`), verified via the NIA / a KYC aggregator (auto-verifies in dev).
- **Public 1–5 ratings** — buyers and sellers rate each other after a delivered order; scores are visible on public profiles *before* you do business.
- **Two-way reporting** — buyers and sellers can report scams/fraud/non-delivery. At a configurable threshold (default **3 open reports**) an account is automatically moved to `pending_review`.
- **District-admin governance** — flagged accounts are routed to the admin of that user's **district**, who reviews the reports and reinstates or suspends. Regional & super admins sit above.

### Commerce & stores
- **Customizable multi-stores** — each seller runs up to **2 stores** with category templates (pharmacy, electronics, vehicle, building materials, farm, restaurant, boutique, carpentry, timber, general), custom colours/logo/banner/layout, and an "About" section.
- **Bulk CSV product upload**, per-store **analytics**, **staff accounts** (inventory / support / finance roles), and **loyalty/promo codes**.
- **Local ↔ International** — stores can list to the international marketplace; a multi-currency service converts GHS ⇄ USD/EUR/GBP/CNY/NGN/ZAR.
- **In-app messaging** between buyers and sellers.
- **Branded PDF receipts** per order.

### Payments & subscriptions
- **Mobile Money (MoMo) prompt payments** via **Paystack** (free to integrate; MTN, Telecel, AirtelTigo). Runs in a full **simulation mode** out-of-the-box (no keys needed) — add `PAYSTACK_SECRET_KEY` to go live.
- **Seller subscriptions** — **2 months free**, then **GHS 50/month** by MoMo. A daily job flips expired trials to `past_due` and blocks new listings until paid (account stays usable otherwise).

### Trade & compliance (timber/export heritage)
- Order tracking, FLEGT/FSC/Lacey-Act compliance docs, product traceability "passports", licenses & admin review.

---

## 🗂️ Structure

```
NationMart/
├── backend/        Express + TypeScript API (MongoDB)
│   └── src/
│       ├── models/         User, Product, Order, Store, Rating, Report,
│       │                   Payment, Notification, Message, PromoCode
│       ├── controllers/    auth, product, order, store, payment, report,
│       │                   rating, user, notification, message, promo, receipt, export
│       ├── routes/         one router per domain (mounted in server.ts)
│       ├── services/       paystack (MoMo), ghanaCard, currency,
│       │                   notification, subscriptionJob, cloudinary, email
│       └── middleware/      auth, RBAC, subscription & report gating
├── frontend/       Next.js 16 app (App Router, Tailwind)
│   └── src/app/    catalog, stores, store/[slug], stores/manage, messages,
│                   payment, dashboard, admin, auth, track, ...
├── scripts/seed.ts Seed script (demo data)
└── shared/types    Shared TypeScript types
```

---

## 🚀 Running locally

**Prerequisites:** Node 18+, a MongoDB instance (local `mongod` or a free MongoDB Atlas cluster).

### Fastest path — Docker (all 3 services at once)
```bash
cp .env.docker.example .env        # set JWT_SECRET; leave Paystack/NIA blank for dev
docker compose up -d --build       # MongoDB + API + Web
docker compose exec backend npm run seed   # demo data (optional)
```
Web → http://localhost:3000 · API → http://localhost:5000/api/health

See **`DEPLOYMENT.md`** for hosting online (Docker on a VPS, or Vercel + Render + MongoDB Atlas), TLS, and the full env-var reference.

### 1. Backend
```bash
cd backend
cp .env.example .env          # set MONGO_URI; leave PAYSTACK/NIA blank for dev
npm install
npm run seed                  # loads demo users, stores, products, orders
npm run dev                   # http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev                        # http://localhost:3000
```

### Demo logins (after `npm run seed`)
| Role | Email | Password |
|------|-------|----------|
| Super admin | `admin@nationmart.gh` | `Admin@1234` |
| District admin | `district@nationmart.gh` | `District@1234` |
| Seller (trial) | `kofi@ashantiforest.gh` | `Seller@1234` |
| Carpenter | `ama@kumasaw.gh` | `Seller@1234` |
| Manufacturer (past-due) | `yaw@accrabuild.gh` | `Seller@1234` |
| Buyer | `buyer@timberusa.com` | `Buyer@1234` |
| Buyer | `efua@buyer.gh` | `Buyer@1234` |

---

## 🔌 Going to production
- **MoMo:** create a free Paystack account, put `PAYSTACK_SECRET_KEY=sk_test_…` (or live) in `backend/.env`. Real on-phone prompts replace the simulation automatically.
- **Ghana Card:** set `GHANA_CARD_VERIFY_URL` + `NIA_API_KEY` to verify against the NIA / a licensed KYC provider.
- **Uploads:** set the `CLOUDINARY_*` vars to enable image/document uploads.
- Tunables: `SUBSCRIPTION_TRIAL_DAYS` (60), `SUBSCRIPTION_FEE_GHS` (50), `REPORTS_PENDING_THRESHOLD` (3).

See `NATIONMART_NOTES.md` for the full breakdown of what was built and what remains for a full "world-class" rollout.
