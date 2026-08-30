# NationMart — Final Audit & Phase-2 Recommendations

## Audit summary (current build)

**Compiles & builds**
- Backend: `tsc --noEmit` clean; `npm run build` emits `dist/` with no errors.
- Frontend: `tsc --noEmit` clean; `next build` compiles all routes (the only
  build-time requirement is internet access for Google Fonts).

**Security** — Helmet, CORS allowlist, rate limiting (API/auth/admin), bcrypt(12),
JWT auth, self-signup role limits (no privilege escalation), jurisdiction-scoped
moderation, query-token auth for PDF links only.

**Working feature areas (real, persisted, role-aware)**
- 65 roles, 4 personas, per-role modules/permissions/AI-agent registry.
- Role-aware dashboards with consistent dark theme + gold accents + readable text.
- Profiles for every user (edit details, photo, password reset).
- Orders: buyer pays exact product price (no VAT/commission/shipping); seller
  confirms payment; only buyers/sellers/riders/drivers can buy; officers/admins
  are view-only; receipts (PDF) download correctly.
- Logistics: Delivery + Vehicle models, 8-state lifecycle, rider self-reg +
  officer approval, availability, AI nearest-available assignment, request-a-rider,
  earnings, delivery board.
- Subscriptions: 4-month trial; stores GHS 50/70; riders/drivers GHS 30; MoMo
  number shown; management discounts.
- Management: staff creation, moderation/suspension, store-on-behalf, store codes
  (REGION-TYPE-SEQ) and partner codes (REGION-RDR/DRV-SEQ).
- AI: regional intelligence; **AI Console** for execs/super-admin (assign tasks
  to the AI over live data); **assistant chatbot on every dashboard with an
  admin-editable knowledge base**.

**Known limitations (by design, documented)**
- Chatbot + AI tasks + regional intelligence are transparent heuristics, not an
  LLM. Architected so an LLM backend can drop into `aiController`/`AssistantChatbot`.
- Photos stored as data URLs (wire S3/Cloudinary for production).
- Payments are manual MoMo — no live capture/escrow yet.
- Delivery board is data/text, not a live map.
- No automated test suite or CI yet.

## Phase 2 — recommended next builds (priority order)

1. **Payments & escrow (highest value).** Integrate Paystack/MoMo API for real
   capture; hold funds in escrow until delivery is confirmed; auto-release to
   seller; automated monthly subscription billing cron with MoMo collections;
   dunning for past-due accounts.
2. **LLM-backed assistant & AI Console.** Connect a real model so the chatbot and
   AI tasks do free-text reasoning over the same live data; keep the knowledge
   base as retrieval context (RAG).
3. **Live logistics map.** Map tiles + rider GPS pings, route/ETA on a real map,
   live tracking link for buyers.
4. **Media pipeline.** Move profile/product/passport images to Cloudinary/S3 with
   signed uploads and CDN delivery; virus/type validation.
5. **Trust & safety.** KYC via real NIA Ghana Card verification; seller license
   workflow; fraud scoring; audit log of all moderation actions.
6. **Notifications.** SMS (Hubtel/Arkesel) + email + push for order/delivery
   status and subscription reminders.
7. **Analytics warehouse.** Move regional intelligence to scheduled jobs writing
   to a reporting collection; dashboards with trends over time; export to PDF/CSV.
8. **RFQ / tenders / contracts** and **warehouse stock** modules (B2B depth).
9. **Quality engineering.** Jest/Supertest API tests, Playwright E2E, GitHub
   Actions CI, error tracking (Sentry), structured logging, healthchecks.
10. **Mobile app** (React Native) reusing the same API — especially for riders.
