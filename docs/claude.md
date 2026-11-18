# CLAUDE.md — Agent Instructions for E-Waste-to-Opportunity Network

> Read this file first in every session. It tells you what the project is, the rules you must never break, how to work, and where the details live.
> **Note:** Claude Code auto-loads `CLAUDE.md` from the repo root. This copy lives in `docs/claude.md`; copy or symlink it to `./CLAUDE.md` in the project root (`ln -s docs/claude.md CLAUDE.md`) so it loads automatically.

## 1. Project in one paragraph
A professional web + Android platform that turns e-waste into opportunities. People list unused or broken electronics; the platform matches them with verified **repair technicians**, **refurbishers**, **donation recipients** and **authorised recycling centres**. **Two frontends** — React (MERN) web and Flutter Android — share **one** Node/Express backend and **one** MongoDB database. **Only free APIs and open-source tech.** Premium glassmorphism UI.

## 2. Source-of-truth documents
| File | Use it for |
|---|---|
| `docs/requirements.md` | *What* to build: FR/NFR/BR IDs, acceptance criteria, resolved ambiguities (A-xx) |
| `docs/design.md` | *How*: architecture, data model, state machines, matching, security, UI design system |
| `docs/tasklist.md` | *Order & progress*: phases P1–P10, checkboxes, exit gates |
| `docs/SRS (original attachments)` | Original wording; if it conflicts with these docs, flag it and ask |
| `docs/API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, `SETUP_GUIDE.md`, `TESTING.md`, `ASSETS.md` | Living docs you maintain |

If a task is not covered, check these docs first; if still unclear, choose the safest option consistent with the SRS, **note the decision** in `ARCHITECTURE.md`, and mention it to the user.

## 3. Non-negotiable rules
1. **One backend, one database.** Never create a separate backend or DB for mobile. Business rules live in backend services only.
2. **Free only.** No Google Maps/Places/Routes, Razorpay or any paid gateway, paid AI/SMS/storage/geocoding/notification service. Never enable billing or silently switch to a paid API. Use OpenStreetMap + Leaflet/Flutter Map + Nominatim; Cloudinary free; FCM; optional Gemini free tier; Nodemailer + free SMTP.
3. **Every integration has a fallback** (see `requirements.md` §2.2) and must be *tested* before you say it works. Missing credentials → dev mode with a clear log warning, never a crash and never a fake "success".
4. **Secrets only in env vars.** Never commit `.env`, keys, service-account files or `google-services.json`. Never put secrets in frontend code (`VITE_*` is public).
5. **Real functionality only.** No non-functional buttons, no permanent hard-coded/mock responses, no unfinished important pages, no leftover `501` stubs at release. Use real MongoDB CRUD.
6. **Server-side security always.** Authenticate, authorise by role, check ownership and state, validate input — on every route. UI hiding is not security. Admin routes are admin-only on the server.
7. **Privacy by default.** Public payloads never include email, phone, exact address or private location. Verification documents are private (signed, expiring access).
8. **Verified-only discovery.** Unverified/suspended providers never appear in matching, maps or marketplace.
9. **Honest impact data.** Impact counters change only on completed, verified events. Keep **actual** and **estimated** values in separate fields and label them separately in the UI.
10. **Payments are offline** (COD / offline record / manual confirmation). The platform never moves money.
12. **Do not overwrite working code unnecessarily.** Make focused changes; don't rewrite files you weren't asked to touch.
13. **Data stays in sync.** Anything created on web must appear on mobile and vice versa — verify, don't assume.

## 4. Tech stack (fixed unless the user approves a change)
- **Backend:** Node.js (LTS), Express, Mongoose, JWT, bcrypt, Socket.IO, Zod, multer, helmet, express-rate-limit, express-mongo-sanitize, pino, Nodemailer, Jest + Supertest + mongodb-memory-server.
- **Web:** React + Vite, Tailwind CSS, React Router, Axios, **Redux Toolkit** (RTK Query optional), Recharts, Lucide React, React Hook Form (+ Zod), **Framer Motion**, Leaflet/react-leaflet, Vitest + RTL.
- **Mobile:** Flutter/Dart (Android), **Riverpod**, go_router, Dio, flutter_map + latlong2, image_picker, geolocator, firebase_messaging, flutter_secure_storage, socket_io_client, fl_chart, Lucide icons for Flutter.
- **DB/Services:** MongoDB (Atlas free / local), Cloudinary free, FCM, Gemini free (optional), OSM/Nominatim.
- Decisions marked in the docs as **Decision** can be revisited only in P1 and must be logged.

## 5. Repository layout
```
ewaste-opportunity-network/
  web/       src/{components,pages,layouts,hooks,services,store,routes,utils,assets}
  mobile/    lib/{core,models,providers,services,screens,widgets,routes}
  backend/   src/{config,controllers,models,routes,middleware,services,sockets,validators,utils}
  docs/      requirements.md design.md tasklist.md claude.md + API/DB/ARCH/SETUP/TESTING/ASSETS
  README.md  .gitignore
```

## 6. Commands (create these scripts in P1; keep them working)
```bash
# Backend (from backend/)
npm run dev        # nodemon server
npm start          # production
npm run seed       # admin, categories, demo data (dev only)
npm test           # jest + supertest
npm run lint

# Web (from web/)
npm run dev        # Vite, http://localhost:5173
npm run build && npm run preview
npm test           # vitest
npm run lint

# Mobile (from mobile/)
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api   # Android emulator → host machine
flutter analyze && flutter test
flutter build apk --release --dart-define=API_BASE_URL=<url>
```
Check `package.json` / `pubspec.yaml` before assuming a script exists. If a command fails, read the error, fix the cause; don't loop on retries.

## 7. Working protocol (phase by phase)
Follow `tasklist.md`. **Do not generate the whole project in one pass.**

**Before each phase** tell the user: (1) what functionality you're building, (2) which files you'll create/change, (3) any database changes, (4) which free integrations are needed and their fallbacks.

**While building:** keep tasks small; run code as you go; commit logically.

**After each phase:** run the apps, run tests, exercise the new features manually (loading/empty/error/success), fix errors, update docs, tick `tasklist.md`, update the tracker/change log, then continue.

Use a task list for multi-step work. Report blockers early. Don't claim a feature, integration or test result you haven't actually run.

## 8. Backend conventions
- Layering: `route → middleware chain → controller → service → model`. Controllers contain no business rules; services contain no `req/res`.
- Route chain: `authenticate → authorize(...) → validate(schema) → guards → controller`.
- **Response envelope:** `{ success, message, data, meta? }`; errors `{ success:false, message, code, errors?[] }`. Use `ApiError` + central error handler; never leak stack traces in production.
- Status codes: 200/201/204; 400 bad request; 401 unauthenticated; 403 forbidden/not verified; 404; 409 conflict/invalid transition; 422 validation; 429 rate limit.
- **Validation:** Zod `.strict()` on body/query/params; whitelist sort/filter fields; never spread `req.body` into a model or filter.
- **State machines:** implement in `services/workflow`; reject illegal transitions with `409 INVALID_TRANSITION`; append to `statusHistory`; trigger notifications after commit.
- **Mongo:** `lean()` for reads, projections, pagination everywhere, indexes for every filter/sort, `2dsphere` for locations, soft delete via `deletedAt`, transactions only where truly needed (atomic rating/stock updates can use `$inc`).
- **Uploads:** validate MIME + magic bytes + size; random filenames; private docs `authenticated`; storage via adapter (`cloudinary` | `local` dev).
- **Notifications:** only via `notificationService.notify()`; failures never break the main request.
- **Logging:** structured; no passwords/tokens/PII in logs.
- Naming: collections PascalCase models → plural lowercase in Mongo; files `camelCase.js`/`kebab-case` per folder norm (be consistent); constants/enums in `config/constants`.

## 9. Web conventions
- Function components + hooks; one component per file; reusable UI in `components/ui` and `components/glass`; pages thin, logic in hooks/services/store.
- Data fetching through `services/` (Axios) or RTK Query; never call `fetch` ad hoc in components. Axios interceptor handles silent refresh once, then logs out.
- Forms: React Hook Form + Zod; show field errors inline; disable submit while pending; success feedback via toast.
- Every data view has **skeleton, empty, error (with retry), success** states.
- Routing guards: `RequireAuth`, `RequireRole`, `RequireVerified`; lazy-load heavy routes (maps, charts).
- Accessibility: semantic elements, labelled inputs, focus rings, alt text, keyboard support; respect `prefers-reduced-motion`.
- Styling: Tailwind with design tokens from `design.md` Part B; use `.glass*` utilities sparingly (nav, stat cards, filters, modals); no inline hex colours — use tokens.

## 10. Mobile conventions
- Riverpod providers per feature; repositories wrap Dio; models are immutable; `const` widgets; avoid rebuilding blur layers (`RepaintBoundary` around `BackdropFilter`).
- Tokens in `core/theme` mirror the web tokens; `GlassContainer` is the only glass primitive.
- Tokens in `flutter_secure_storage`; single-flight refresh interceptor; handle offline with cached read-only data and an "Offline" banner.
- Request camera/location permissions only when needed, explain why, and provide manual alternatives.
- Android-first: edge-to-edge, safe areas, text scale up to 1.3×, large-screen layouts via `LayoutBuilder`.
- Don't copy the website layout; use mobile patterns (bottom nav, sheets, camera-first flows).

## 11. UI/UX rules (premium glassmorphism)
- Palette: Primary `#14532D`, Secondary `#10B981`, Accent `#A3E635`, Background `#F5F8F5`, Glass `rgba(255,255,255,.65)` / border `rgba(255,255,255,.45)`, Text `#1F2937`, Muted `#6B7280`, Dark `#0B1712`, Dark glass `rgba(20,35,28,.70)`.
- Fonts: Plus Jakarta Sans (headings), Inter (body), Manrope (numbers). Icons: Lucide.
- Contrast (measured, `ASSETS.md`): white text on **deep green** only; `#10B981` fails on light backgrounds (2.37:1) → use `#047857` for meaningful icons/borders on light; lime only as decorative/dark-bg accent, charcoal text on lime.
- Glass hierarchy per `design.md` B.3.2; ≤ 3 blurred layers in view; fallbacks for no `backdrop-filter` and reduced transparency.
- Motion: Framer Motion (web) / native animations (Flutter); transform + opacity only; respect reduced motion; no motion that delays tasks.
- **Never:** Bootstrap-looking UI, plain white pages with ordinary cards, excessive gradients/effects, low-quality stock imagery, unlicensed or branded assets.
- Hero copy: *"Give Your Electronics a Second Life."* with supporting text *"Transform electronic waste into opportunities through repair, reuse, donation and responsible recycling."*

## 12. Domain cheat-sheet
- **Roles:** user, technician, refurbisher, recycler, admin (admin never self-registers). Donation recipients = user with verified organisation profile.
- **Categories (15):** Laptop, Desktop computer, Smartphone, Tablet, Monitor, Television, Keyboard, Mouse, Printer, Charger, Battery, Electronic accessories, Circuit boards, Computer components, Other.
- **Conditions:** Fully working · Minor damage · Major damage · Not working · For spare parts.
- **Preferred services:** Repair · Reuse · Donation · Refurbishment · Recycling.
- **Repair statuses (12):** Request Submitted → Technician Assigned → Device Collection Pending → Device Collected → Diagnosis in Progress → Quotation Submitted → Customer Approval Pending → Repair in Progress → Repair Completed → Device Delivery Pending → Device Delivered → Service Completed (+ `rejected`, `cancelled`).
- **Key rules:** customer must approve a paid quotation before repair; reviews need a completed transaction; exact address released only to the accepted counterparty; data-protection checklist before handover; recycling materials: copper, aluminium, iron, plastics, glass, other (actual vs estimated separate).
- **Matching:** hard filters (verified, category, radius, availability) then weighted score; return reasons. Weights in config.

## 13. Testing expectations
- Write tests with the feature, not after. Backend: auth, authz (403s), validation, state transitions, ownership, key workflows, NoSQL-injection payloads.
- Must automate/verify the **11-step repair E2E** and also donation, refurbishment, recycling, verification, moderation, suspension flows.
- Always include negative tests: other user's resource, wrong role, unverified provider, suspended account, illegal transition, oversized/wrong-type upload.
- Cross-client check: create on web → read on mobile and reverse; log it in `TESTING.md`.
- Before saying "done": run lint + tests + the app; paste the real result summary.

## 14. Documentation duties
After any change to an endpoint, schema, env var, or setup step, update the matching doc in the same commit. Keep `.env.example` files current. Record free-tier limits with the date you checked them. Maintain `ASSETS.md` licences.

## 15. Git conventions
- Branches: `main`, `phase/p<N>-<name>`, `feature/<short-name>`.
- Commits: imperative, scoped (`feat(backend): add quotation approval`, `fix(web): …`, `docs: …`, `test: …`). One logical change per commit. Never commit secrets or build output.
- Only commit/push when the user asks (or the active task explicitly includes it).

## 16. Environment variables (names only)
Backend: `NODE_ENV, PORT, MONGODB_URI, CLIENT_WEB_URL, CORS_ORIGINS, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, REFRESH_TTL_DAYS, BCRYPT_COST, CLOUDINARY_*, STORAGE_DRIVER, FIREBASE_SERVICE_ACCOUNT_PATH, GEMINI_ENABLED, GEMINI_API_KEY, GEMINI_DAILY_LIMIT, SMTP_*, MAIL_FROM, NOMINATIM_BASE_URL, NOMINATIM_USER_AGENT, NOMINATIM_CONTACT_EMAIL, RATE_LIMIT_*, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD`.
Web: `VITE_API_BASE_URL, VITE_SOCKET_URL`. Mobile: `--dart-define=API_BASE_URL / SOCKET_URL`.

## 17. Handling missing credentials / services
| Missing | Behaviour |
|---|---|
| MongoDB Atlas | Use local MongoDB / in-memory for tests |
| Cloudinary | `STORAGE_DRIVER=local` (dev only), warn loudly |
| Firebase | Skip push; in-app + socket notifications continue |
| Gemini | Rule-based classifier; UI says "suggestion unavailable" if needed |
| SMTP | Log emails to console in dev; mark verification optional in dev |
| Nominatim blocked/limited | Cached results, manual coordinates, map tap |
Never print "working" for a service you haven't called successfully.

## 18. Things to avoid
- Building everything in one giant step, or rewriting stable files.
- Trusting client-sent role, owner IDs, prices or statuses.
- Returning full user documents; exposing `passwordHash`, tokens, exact addresses.
- Per-keystroke Nominatim calls; hammering free APIs; ignoring rate limits.
- Auto-playing heavy 3D/blur/animation effects; shipping large unoptimised images.
- Adding dependencies casually — prefer what's in §4; justify any addition and check it is free/open source.
- Medical/legal/regulatory claims presented as fact — mark regulatory text for human review.

## 19. Definition of Done (every feature)
Real DB-backed implementation · input validated · authn/authz/ownership/state enforced · loading/empty/error/success states · responsive & accessible · tests written and passing · docs updated · `tasklist.md` ticked · verified on both clients where applicable · no new paid dependency · no secrets committed.

## 20. When in doubt
Pick the option that is **more secure, more private, free, and consistent with the docs**; write the decision down; tell the user in one sentence. Ask the user only for choices that are genuinely theirs (branding, legal wording, hosting accounts, credentials).
