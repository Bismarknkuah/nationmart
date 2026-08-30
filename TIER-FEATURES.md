# NationMart — feature status

## ✅ Working now (type-checked, end-to-end)

**Roles & dashboards** — all 65 roles, four personas (officer, partner, seller,
buyer), per-role modules, can/cannot permissions, AI agents, gold theming.

**Profile management (all users)** — `/profile`: edit details, **upload a photo**
(data URL, <1.5 MB), set duty status (riders), **reset password**. A "Profile"
link sits in every dashboard header.

**Logistics & delivery (advanced):**
- `Delivery` + `Vehicle` models, 8-state lifecycle, tracking, rider earnings.
- **Rider/driver self-registration -> pending approval.** Logistics officers get a
  **Rider & driver approvals** queue and approve/decline.
- **Availability:** riders toggle Available / Busy / Offline.
- **AI assigns the nearest AVAILABLE rider** (district -> region, least-busy),
  one-click Auto-assign on the manager **Delivery board** + ETA/fee.
- **Request a rider:** sellers (and buyers) create a delivery from an order.
- Rider portal: accept -> picked-up -> in-transit -> delivered/failed + earnings.

**Management powers:**
- **Add staff** (executives/HR) for any region/district.
- **Moderation** — compliance/field/security/admin can **suspend or flag**
  suspicious buyers/sellers within their jurisdiction.
- **Create a store on behalf of a seller.**
- **Subscription discounts** — apply a % discount to a user.

**Subscription** — first **3 months free**, then **GHS 50/mo (1 store)** or
**GHS 70/mo (2 stores)**, by Mobile Money to **+233 24 071 5156**; banner shows
live price + any discount.

**AI Regional Intelligence** — national/regional dashboards aggregate orders,
deliveries, failure rates, overdue tasks and suspensions per region, score each
region's health, rank the weakest, and recommend actions.

**Chatbot assistant** — floating, context-aware, on **every** dashboard.

**Login** — market-themed backdrop. Drop a photo at `frontend/public/market.jpg`
and it appears automatically; otherwise a warm market gradient is the fallback.

## Create test accounts
```
cd backend
npm run create-admin -- --role ceo    --email ceo@nationmart.gh
npm run create-admin -- --role seller --email seller@nationmart.gh --district "Accra Metropolitan"
npm run create-admin -- --role rider  --email rider@nationmart.gh  --district "Accra Metropolitan"
npm run create-admin -- --role district_logistics_officer --email dlo@nationmart.gh --district "Accra Metropolitan"
# password defaults to Admin@1234
```

## Roadmap (still dedicated builds)
Payment capture/escrow ledger; live map tiles (board is textual today);
LLM-backed chatbot (currently transparent rules); RFQ/tender modules; warehouse
stock feeds; voice/video comms; monthly billing cron. Photo uploads are data URLs
for now -> wire S3/Cloudinary for production.

## Latest changes (this round)
- **Order price fixed:** buyers pay exactly the listed product price — no VAT,
  no commission, no shipping added. Delivery is paid to the rider on receipt.
- **Only buyers & store owners can order;** all other roles get marketplace
  *view* access (enforced server-side).
- **Seller confirms payment received** (button on each order) -> marks order paid.
- **Receipts fixed:** the PDF link now carries an auth token, so "Download
  receipt" opens correctly in a new tab; receipt no longer shows VAT/shipping.
- **Buyers & sellers can request a rider** from an order (fee collected on
  delivery).
- **Profile + password reset** for every user type at `/profile` (link in every
  dashboard header).
- **Store codes** auto-assigned on creation: `REGION-TYPE-SEQ` (e.g. GA-PHA-0007).
- **Rider/driver codes** auto-assigned: `REGION-RDR/DRV-SEQ` (e.g. GA-RDR-0001).
- **Quick-demo** now includes CEO, District Logistics Officer, Rider and Driver
  (seed creates rider@/driver@/dlo@nationmart.gh; passwords Rider@1234 /
  Driver@1234 / Officer@1234). Run `npm run seed` to load them.
- **Backgrounds:** login uses the Dubai market photo (`public/market.jpg`),
  homepage hero uses the Kejetia market photo (`public/market-home.webp`).
  Note: replace these with licensed images before production — the provided
  files are stock photos (one carries a visible watermark).
