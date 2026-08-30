# Deploying NationMart online

Architecture for hosting:

- **GitHub** — holds the code (one repo with `backend/` and `frontend/`).
- **MongoDB Atlas** — the cloud database.
- **Railway** — runs the backend API (Express).
- **Vercel** — runs the frontend (Next.js).

You do these once, in this order. Total time ~30-45 min.

---

## 0. Prerequisites
- A GitHub account, plus Git installed locally.
- Free accounts on MongoDB Atlas, Railway, and Vercel (sign in to all three with GitHub to make linking easier).

---

## 1. Push the code to GitHub
From the project root (the folder containing `backend/` and `frontend/`):

```bash
git init
git add .
git commit -m "NationMart initial deploy"
git branch -M main
git remote add origin https://github.com/<you>/nationmart.git
git push -u origin main
```

Make sure **`.env` and `.env.local` are NOT committed** (only the `.env.example` files belong in the repo).

---

## 2. MongoDB Atlas (database)
1. Atlas -> **Create** a free **M0** cluster (any cloud/region near your users).
2. **Database Access** -> add a database user (username + password). Save them.
3. **Network Access** -> add IP `0.0.0.0/0` (allow from anywhere). Railway's outbound IPs aren't fixed, so this is the simplest reliable option.
4. **Connect -> Drivers** -> copy the connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/nationmart?retryWrites=true&w=majority
   ```
   Put your real user/password in, and add the DB name `nationmart` before the `?`. This is your `MONGO_URI`.

---

## 3. Railway (backend API)
1. Railway -> **New Project -> Deploy from GitHub repo** -> pick your repo.
2. Service **Settings**:
   - **Root Directory**: `backend`
   - **Build Command**: leave blank (`postinstall` runs `npm run build`) or set `npm run build`.
   - **Start Command**: `npm start`  (runs `node dist/server.js`).
3. **Variables** (names must match exactly):

   | Variable | Value |
   |---|---|
   | `MONGO_URI` | your Atlas string from step 2 |
   | `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | leave empty for now (set in step 5) |
   | `SUBSCRIPTION_MOMO` | `+233 24 071 5156` |
   | `DISABLE_CRON` | `false` |

   **Do not set `PORT`** — Railway provides it and the code reads `process.env.PORT`.
4. Deploy, then **Settings -> Networking -> Generate Domain**. You get e.g. `https://nationmart-backend-production.up.railway.app`. Copy it — this is your API URL.
5. Check the deploy logs show `NationMart API running on port ...`.

---

## 4. Vercel (frontend)
1. Vercel -> **Add New -> Project** -> import the same repo.
2. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
3. **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | your Railway API URL (no trailing slash) |

4. **Deploy.** You get e.g. `https://nationmart.vercel.app`. Copy it.

---

## 5. Connect the two (CORS) - important
The backend only accepts requests from origins in `FRONTEND_URL`.

1. Railway -> **Variables** -> set `FRONTEND_URL = https://nationmart.vercel.app` (comma-separate multiple origins).
2. Railway redeploys automatically. The Vercel frontend can now call the API.
3. Add any custom domain to `FRONTEND_URL` too.

---

## 6. Seed demo data (one time)
Easiest is to seed from your machine against Atlas:

```bash
cd backend
echo "MONGO_URI=mongodb+srv://..." > .env
echo "JWT_SECRET=anything-for-local" >> .env
npm install
npm run seed        # WARNING: wipes the DB, then loads demo data
```

Creates the demo logins (admin, finance, HR, sellers, buyers, rider/driver). Or run `npm run seed` from Railway's one-off shell.

> Do NOT run `seed` again on a live DB with real users - it deletes everything first.

---

## 7. Go-live checklist
- [ ] Atlas Network Access allows `0.0.0.0/0`; DB user works.
- [ ] Railway: `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production` set; domain generated.
- [ ] Vercel: `NEXT_PUBLIC_API_URL` = Railway URL.
- [ ] Railway: `FRONTEND_URL` = Vercel URL (redeploy).
- [ ] Open the Vercel URL, log in with a demo account, confirm dashboards load.

---

## 8. Optional integrations (add key, redeploy)
All off by default; the app runs fully without them. Add to **Railway Variables**:

- **LLM assistant** -> `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (or `openai` + `OPENAI_API_KEY`).
- **Card/live payments (Paystack)** -> `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`; set Paystack webhook to `https://<railway-url>/api/payments/webhook`.
- **Image CDN (Cloudinary)** -> `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Email** -> `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`.
- **SMS** -> `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`.
- **NIA Ghana Card** -> `NIA_API_KEY`, `GHANA_CARD_VERIFY_URL`.

---

## 9. Common gotchas
- **CORS error in console** -> `FRONTEND_URL` doesn't exactly match the Vercel origin (https://, no trailing slash, right subdomain).
- **Frontend network error** -> `NEXT_PUBLIC_API_URL` wrong or has trailing slash; after changing it, **redeploy** on Vercel (env changes need a rebuild).
- **Backend build fails** -> Root Directory must be `backend`; `postinstall` needs dev deps, which Railway installs during build.
- **DB timeout** -> Atlas Network Access not open, or password in `MONGO_URI` has special characters (URL-encode them).
- **Auto-deploys** -> every push to `main` redeploys both. Use a branch for work in progress.

---

*NationMart - designed by Desward Technology.*
