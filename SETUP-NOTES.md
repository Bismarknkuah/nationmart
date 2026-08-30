# NationMart — complete project (role-aware gold dashboard build)

This is the full project source with every change from our session already
applied. Only the regeneratable folders were removed to keep the download
small: `node_modules/`, `.next/`, and `backend/dist/`. You reinstall those with
`npm install`.

## What's already baked in

1. **Role-aware, gold-accented dashboard** — `frontend/src/app/dashboard/page.tsx`
   renders three experiences from the user's role:
   - Buyer and Seller (commerce) views — enhanced with gold accents, order-status
     breakdowns, a revenue sparkline, fulfilment rate, and subscription progress.
   - Officer / Executive console — for all 30+ governance roles: department-themed
     (gold premium for executives & national directors), live task inbox with
     priority mix, quick filters, "why this priority?" breakdowns, inline
     Approve/Reject/Escalate, a department-channels preview, a platform-pulse
     metric grid for admins, and a role-specific tools panel.

2. **Role configuration** — `frontend/src/lib/roleConfig.ts` maps all 43 roles to
   persona, RBAC level, department, theme, mission, and allowed tools.

3. **Super-admin script** — `backend/src/scripts/createSuperAdmin.ts`, wired to
   `npm run create-admin`. Creates or promotes a super admin WITHOUT wiping data.

4. **Signup security fix** — `backend/src/controllers/authController.ts` now limits
   self-signup to end-user roles; officer/admin roles are granted only by a super
   admin (`PATCH /api/admin/users/:id/role`).

## Run it

Prerequisites: Node.js 18+ and a reachable MongoDB (local `mongod` or an Atlas
`MONGODB_URI`). Backend config lives in `backend/.env`; frontend in
`frontend/.env.local`.

```bash
# 1. Backend
cd backend
npm install
npm run seed          # OPTIONAL: demo data — WIPES the database
npm run create-admin  # create/promote a super admin without wiping
npm run dev           # starts the API (default http://localhost:5000)

# 2. Frontend (new terminal)
cd frontend
npm install
rm -rf .next          # clear any stale build cache (PowerShell: Remove-Item -Recurse -Force .next)
npm run dev           # http://localhost:3000
```

Then hard-refresh the browser (Ctrl/Cmd + Shift + R). Log in as an officer or
the CEO to see the new console; as a buyer/seller for the commerce dashboard.

Super-admin login after `npm run create-admin` (defaults):
`admin@nationmart.gh` / `Admin@1234` — change the password after first login.

See `README.md` for the original project documentation, and
`INSTALL-AND-SUPERADMIN.md` (in the patch bundle) for the detailed change log.
