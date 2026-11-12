---
name: petmatch
description: Recipes for changing the PetMatch price-comparison app (FastAPI backend + Next.js RTL frontend) without re-scanning the repo — adding an endpoint, a page, a shop feed, a seller/admin panel feature, running and verifying. Use for any code change in this repository.
---

# PetMatch task recipes

Start from `AGENT.md` (file map, run commands, conventions). Open only the files a recipe names.

## Run & verify
1. Start servers: `petmatch` (backend :8000) and `petmatch-web` (frontend :3000) from `.claude/launch.json`.
2. The backend has **no auto-reload**: restart it after editing Python. Sessions live in memory, so a restart logs everyone out (panels auto re-enter in demo mode).
3. `cd backend && python -m pytest -q tests` and `cd web && npx tsc --noEmit` must both pass.
4. Panels need no login in demo mode: open `http://localhost:3000/seller` or `/admin` directly.
5. Undo demo data you created: `POST /api/v1/admin/reset` as admin (or delete `backend/data/decisions.json`, then restart).

## Add a backend endpoint
- Put it in `backend/app/main.py` next to its section (public / auth / seller / admin). Pydantic model with `Field` limits for input.
- Protect it: `user: dict = Depends(auth.require_role("seller"))` or `dependencies=[Depends(require_admin)]`.
- If it changes data the catalog is built from, write the JSON file under `pipeline.DATA`, then call `rebuild()` (outside `_lock`).
- Add a test in `backend/tests/test_core.py`; log in with `c.post("/api/v1/auth/demo-login", json={"phone": ...})`.

## Add a page
- Shop page (with search header + footer) → `web/app/(site)/<route>/page.tsx`.
- Seller/admin page (panel header, no shop chrome) → `web/app/(panel)/<route>/page.tsx`, wrap content in `<Guard role="seller|admin">`, and add a link to `NAV` in `web/components/PanelHeader.tsx`.
- Client data: `api("/api/v1/...")` from `@/lib/api`. Server-rendered data: `serverApi()`.
- Reuse CSS classes: `dash-head`, `kcards/kcard`, `card-p`, `grid2`, `sec`/`sec-h`, `table-wrap`, `field`, `btn btn-primary|ghost|sm`, `pill good|warn|bad`, `alert info|warn|bad`, `notice`, `skeleton`. New styles go at the end of `web/app/extra.css`.
- Icons: `<Ui n="name" />`; new glyphs go into `UI` in `web/lib/art.ts`.
- Text is Persian; numbers via `fa()`, digits inside strings via `fd()`.

## Add a shop feed
- Raw file in `backend/data/raw/`, seller entry in `sellers.json`, one adapter block in `pipeline._ingest()` that emits
  `id, seller, title, extra, price (toman int), available, url (https), checked (ISO time), raw`.
- Re-run tests: `test_catalog_matching_quality` guards precision/recall against `ground_truth.json`.

## Seller products come only from feeds
There is no add/edit/delete in the seller panel (a product decision). A store's products, prices and stock
change only through its feed (`backend/data/raw/*` + `pipeline._ingest()`). The seller dashboard is read-only.

## Stores (admin)
`components/AdminStores.tsx` ↔ `GET/POST /api/v1/admin/stores`, `POST /admin/stores/{id}/block|unblock`. State lives in
`backend/data/stores.json` via `pipeline.load_stores()/save_stores()`; `pipeline.all_sellers()` tags each store with `status`
and `source` (feed/admin). Tests must restore `stores.json` (see `_restore_stores` in the tests).

## Product comparison (buyer)
`useCompare()` in `lib/client.tsx` (localStorage `pm_compare`, max 4) → `CompareButton` on cards and the product page →
`CompareBar` in the site layout → `app/(site)/compare/page.tsx` → `GET /api/v1/compare` (reuses `rank()` and `card()`).

## Docs to touch when behaviour changes
`README.md` (features table, test count),
`AGENT.md` (file map / endpoints / conventions).
