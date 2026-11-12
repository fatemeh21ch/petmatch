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
| Backend tests | `cd backend && python -m pytest -q tests` (35 tests) | — |
| Frontend typecheck | `cd web && npx tsc --noEmit` (if it complains about `.next/types`, delete `web/.next/types` and `web/.next/dev/types`) | — |

`.claude/launch.json` has both servers as `petmatch` and `petmatch-web`. The browser only talks to
:3000; `web/next.config.mjs` proxies `/api/*` to :8000, so the httpOnly session cookie needs no CORS.

## Backend — `backend/app/`
| File | Responsibility |
|---|---|
| `main.py` | **All HTTP endpoints** (public, auth, seller, admin). `catalog()` = in-memory catalog; `rebuild()` re-runs the pipeline |
| `pipeline.py` | Feeds → validate → `text.extract` → `match()` → catalog (products with offers, unit price, anomalies, stale flags). One adapter per shop in `_ingest()`. **Feeds are the only source of products**: sellers cannot add, edit or delete products in the panel |
| `text.py` | Persian/English normalisation (ي/ك, digits, ZWNJ), quantity parsing, attribute extraction |
| `kb.py` | Vocabulary: brands, species, types, stages, flavours, `FA_LABEL`, `BRAND_FA` |
| `search.py` | Query → `Intent` (rules), pet-profile constraints, filter, `rank()` (ValueScore), explanation facts |
| `feeding.py` | Monthly feeding cost from pet weight/age |
| `auth.py` | Phone + OTP login, sessions (in memory), roles `buyer/seller/admin`, `require_role()`, `demo_login()` |
| `analytics.py` | Views/clicks/search log (seeded 30 days + live events) |
| `ai.py` | Optional Claude calls (`ANTHROPIC_API_KEY`); everything works without it |

Key endpoints (`/api/v1/...`): `search`, `explain`, `home`, `nav`, `products/{id}`, `reports`, `go/{listing}`
(counted outbound click), `store/{seller}/{listing}`, `auth/{otp/request,otp/verify,signup,me,logout,demo-accounts,demo-login}`,
`seller/dashboard` (read-only), `admin/{analytics,pipeline,decisions,reset}`.

Data: `backend/data/raw/*` feeds (committed), `ground_truth.json` (matching labels), runtime files
**gitignored**: `users.json`, `events.json`, `search_log.json`, `decisions.json`, `reports.json`.
`POST admin/reset` deletes `decisions.json`.

## Frontend — `web/`
| Path | What |
|---|---|
| `app/layout.tsx` | Root: font, `AuthProvider`, `Toaster` |
| `app/(site)/` | Shop pages **with** the shop header (search bar, category menus, my pet, favorites) + footer: home, `search`, `p/[id]`, `pet`, `favorites`, `guide/[id]`, `login`, `signup` |
| `app/(panel)/` | Work panels with their **own** slim header (`components/PanelHeader.tsx`), no shop search/menus: `seller` (read-only dashboard), `admin` |
| `app/store/[seller]/[listing]` | Fake shop page after a "buy" click (deliberately outside both layouts) |
| `components/` | `Header` (shop), `PanelHeader` (panels, demo account switch), `Guard` (role gate + auto demo login), `ProductView`, `Charts` (SVG), `Otp`, `ui` (`Svg`, `Ui` icons, `Stars`, `Empty`, …) |
| `lib/api.ts` | `api()` (browser, same-origin) and `serverApi()` (server components → :8000) |
| `lib/client.tsx` | `useAuth`, pets & favorites in localStorage, `toast` |
| `lib/art.ts` | All SVG art; UI icon set is `UI` (`ui(name)`) — add new icons there |
| `lib/format.ts` | `fa()` Persian numbers, `fd()` Persian digits in text, `q2h()` search URLs |
| `app/globals.css`, `app/extra.css` | All styles (plain CSS, tokens in `:root`). Panel/seller-form styles at the end of `extra.css` |

## Conventions
- **Security is server-side.** Every protected endpoint uses `Depends(auth.require_role(...))`; `Guard` is UX only.
  A seller only ever sees its own store (`seller_id` comes from the session, never from the request).
- Products come **only from feeds**; the seller panel has no add/edit/delete (product decision, keep it that way).
- **Demo mode** (`PETMATCH_DEMO_OTP=1`, default): OTP is returned in the response and `auth/demo-login`
  opens a session for the fixed demo accounts with no code. `Guard` uses it so `/seller` and `/admin`
  work without logging in. With `PETMATCH_DEMO_OTP=0` both are off.
- Demo accounts: buyer `09120000001`, seller پت‌کده `09120000002`, seller پنجه طلا `09120000005`, admin `09120000003`.
- In matching, a false merge is worse than a missed merge: uncertain → review queue, never auto-merge.
- Prices are integers in **toman**; "total" = price + shipping. Show numbers with `fa()`.
- All user-facing text is Persian; code, comments and identifiers are English.
- Pet profile stays on the device; only species/age-in-months/weight/allergies go to the API.
- Add a pytest for every new endpoint/rule in `backend/tests/test_core.py`; tests that write runtime files must restore them.

## Docs
`README.md` (overview, run, features) · 
`.claude/skills/petmatch/SKILL.md` (task recipes).
