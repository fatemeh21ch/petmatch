# AGENT.md — PetMatch project map for coding agents

Read this first instead of scanning the repo. It tells you where everything is, how to run and
test it, and the rules the code follows. Keep it up to date when you add a file, an endpoint or a
convention (one line each is enough).

## What this is
PetMatch (پت‌مچ): a price-comparison site for cat & dog food, litter and treats (Torob "AI Product
Engineer" challenge). 7 fictional shops publish messy feeds in 7 formats → one pipeline normalises,
matches identical products and ranks "best buy" (not just cheapest). UI is **Persian, RTL**.

## Run
| What | Command | Port |
|---|---|---|
| Backend (FastAPI) | `python -m uvicorn app.main:app --app-dir backend --port 8000` (no auto-reload: restart after Python edits) | 8000 |
| Frontend (Next.js 16) | `npm --prefix web run dev` | 3000 |
| Seed data (first time only) | `python backend/seed/generate.py` | — |
| Backend tests | `cd backend && python -m pytest -q tests` (40 tests) | — |
| Frontend typecheck | `cd web && npx tsc --noEmit` (if it complains about `.next/types`, delete `web/.next/types` and `web/.next/dev/types`) | — |

`.claude/launch.json` has both servers as `petmatch` and `petmatch-web`. The browser only talks to
:3000; `web/next.config.mjs` proxies `/api/*` to :8000, so the httpOnly session cookie needs no CORS.

## Backend — `backend/app/`
| File | Responsibility |
|---|---|
| `main.py` | **All HTTP endpoints** (public, auth, seller, admin). `catalog()` = in-memory catalog; `rebuild()` re-runs the pipeline |
| `pipeline.py` | Feeds → validate → `text.extract` → `match()` → catalog (products with offers, unit price, anomalies, stale flags). One adapter per shop in `_ingest()`. **Feeds are the only source of products**: sellers cannot add, edit or delete products in the panel |
| `text.py` | Persian/English normalisation (ي/ك, digits, ZWNJ), quantity parsing, attribute extraction |
| `kb.py` | Vocabulary: brands, species, types, stages, flavours, `FA_LABEL`, `BRAND_FA`; `BREEDS` (breed → adult age, dog size, preferred formula/litter/treat) |
| `search.py` | Query → `Intent` (rules; sort words like «ارزان/ارزون/کم‌قیمت» → cheapest, «ارزان‌تر از X» → budget), pet-profile constraints incl. breed (`apply_profile`, `_fit`), filter, `rank()` (ValueScore; a breed-specific formula is listed first under «best»), explanation facts |
| `feeding.py` | Monthly feeding cost from pet weight/age |
| `auth.py` | Phone + OTP login, sessions (in memory), roles `buyer/seller/admin`, `require_role()`, `demo_login()` |
| `analytics.py` | Views/clicks/search log (seeded 30 days + live events) |
| `ai.py` | Optional Claude calls (`ANTHROPIC_API_KEY`); everything works without it |

Key endpoints (`/api/v1/...`): `search`, `explain`, `home`, `nav`, `products/{id}`, `reports`, `go/{listing}`
(counted outbound click), `store/{seller}/{listing}`, `auth/{otp/request,otp/verify,signup,me,logout,demo-accounts,demo-login}`,
`compare?ids=a,b&pet=` (up to 4 products side by side), `breeds`, `seller/dashboard` (read-only; `status` active/pending/rejected/blocked),
`admin/{analytics,pipeline,decisions,reset}`, `admin/stores` (GET stores + pending/rejected seller signups) · `admin/sellers/{phone}/approve|reject`
(the **only** way a store is added: from the seller's signup, store name + link) · `admin/stores/{id}/block` · `/unblock`.

Data: `backend/data/raw/*` feeds (committed), `ground_truth.json` (matching labels), runtime files
**gitignored**: `users.json`, `events.json`, `search_log.json`, `decisions.json`, `reports.json`, `stores.json` (admin-added and blocked stores; `pipeline.all_sellers()` merges it with `raw/sellers.json`).
`POST admin/reset` deletes `decisions.json`.

## Frontend — `web/`
| Path | What |
|---|---|
| `app/layout.tsx` | Root: font, `AuthProvider`, `Toaster` |
| `app/(site)/` | Shop pages **with** the shop header (search bar, category menus, my pet, favorites) + footer: home, `search`, `p/[id]`, `pet`, `favorites`, `compare`, `guide/[id]`, `login`, `signup` (login with an unknown number redirects to signup with the phone filled) |
| `app/(panel)/` | Work panels with their **own** slim header (`components/PanelHeader.tsx`), no shop search/menus: `seller` (read-only dashboard), `admin` (tabs: dashboard · matching · stores) |
| `app/store/[seller]/[listing]` | Fake shop page after a "buy" click (deliberately outside both layouts) |
| `components/` | `Header` (shop), `PanelHeader` (panels, demo account switch), `AdminStores` (admin stores tab), `CompareBar` + `CompareButton` (in `ui`), `Guard` (role gate + auto demo login), `ProductView`, `Charts` (SVG), `Otp`, `ui` (`Svg`, `Ui` icons, `Stars`, `Empty`, …) |
| `lib/api.ts` | `api()` (browser, same-origin) and `serverApi()` (server components → :8000) |
| `lib/client.tsx` | `useAuth` (+ `pm_logged_out` flag), pets (with `breed`), favorites and the compare list (`useCompare`, max 4) in localStorage, `toast` |
| `lib/art.ts` | All SVG art; `petArt(pet)` draws the profile picture from the breed (`CAT_BREED_ART` / `DOG_BREED_ART`); UI icon set is `UI` (`ui(name)`) — add new icons there |
| `lib/format.ts` | `fa()` Persian numbers, `fd()` Persian digits in text, `q2h()` search URLs |
| `app/globals.css`, `app/extra.css` | All styles (plain CSS, tokens in `:root`). Panel/seller-form styles at the end of `extra.css` |

## Conventions
- **Security is server-side.** Every protected endpoint uses `Depends(auth.require_role(...))`; `Guard` is UX only.
  A seller only ever sees its own store (`seller_id` comes from the session, never from the request).
- A **blocked** store's feed is not read at all (`build_catalog` skips it): no offers, no clicks, its seller sees a blocked notice.
  A store an admin adds has no products until its feed is connected.
- Products come **only from feeds**; the seller panel has no add/edit/delete (product decision, keep it that way).
- **Demo mode** (`PETMATCH_DEMO_OTP=1`, default): OTP is returned in the response and `auth/demo-login`
  opens a session for the fixed demo accounts with no code. `Guard` uses it so `/seller` and `/admin`
  work without logging in. With `PETMATCH_DEMO_OTP=0` both are off.
- An explicit **logout** sets `pm_logged_out`: `Guard` then shows the login screen (with one-click demo buttons)
  instead of auto-signing in again; any real login clears it.
- Sellers must give a store link at signup (`store_link()` adds https://, rejects http). A store exists only after an
  admin approves that signup; a rejected seller sees the reason in the panel.
- Demo accounts: buyer `09120000001`, seller پت‌کده `09120000002`, seller پنجه طلا `09120000005`, admin `09120000003`.
- In matching, a false merge is worse than a missed merge: uncertain → review queue, never auto-merge.
- Prices are integers in **toman**; "total" = price + shipping. Show numbers with `fa()`.
- All user-facing text is Persian; code, comments and identifiers are English.
- Pet profile stays on the device; only species/age-in-months/weight/allergies/breed go to the API.
- Add a pytest for every new endpoint/rule in `backend/tests/test_core.py`; tests that write runtime files must restore them.

## Docs
`README.md` (overview, run, features) · 
`.claude/skills/petmatch/SKILL.md` (task recipes).
