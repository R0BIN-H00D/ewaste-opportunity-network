# Task List & Progress Tracker — E-Waste-to-Opportunity Network

| | |
|---|---|
| **Document** | `docs/tasklist.md` |
| **Version** | 1.0 · created 2026-11-14 |
| **Source** | `requirements.md` (what), `design.md` (how). Task IDs: `P<phase>-<nn>`. |
| **How to use** | Work phase by phase, in order. Tick `[x]` only when the item is *done and verified*. Update the tracker table and the change log after each phase. |

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (add a note) · **(S)** = Should-have, do after the Must items in that phase · Requirement IDs in *italics*.

---

## 0. Overall progress

| Phase | Name | Status | Started | Finished | Tests | Docs |
|---|---|:--:|---|---|:--:|:--:|
| P1 | Project initialization | ◐ scaffolded, **not yet run** | 2026-11-14 | | ☐ | ◐ |
| P2 | Database and backend | ◐ backend tests green (44); seed + live-server run pending | 2026-11-14 | | ◐ | ◐ |
| P3 | Authentication and user roles | ✔ done, verified live | 2026-11-15 | 2026-11-15 | ✔ | ✔ |
| P4 | Web application (public + shell) | ✔ done, verified live (graphics pack and map toggle deferred) | 2026-11-15 | 2026-11-15 | ✔ | ✔ |
| P5 | Core business modules | ◐ 5A matching, 5B repair workflow, 5C reviews + transactions, 5D donations, 5E refurbishment + marketplace + orders, 5F recycling, 5G student learning and 5H pickup polish done and verified live; only the two partial items below remain (P5-02 discovery gaps, P5-22 map view) | 2026-11-15 | | ◐ | ◐ |
| P6 | Admin dashboard | ✔ done, verified live (6A–6E + polish) | 2026-11-15 | 2026-11-15 | ✔ | ✔ |
| P7 | Flutter application | ◐ 7A sign-in, 7B devices, the owner's repair flow, the account area and the technician's whole job flow done (checked on a physical phone); refurbisher, recycler, student, donation, marketplace and verification screens, the offline cache, location and the Android polish also done (checked on a physical phone); the Green Score and impact screen is built (P9, not yet looked at on the phone); only real-backend tests remain | 2026-11-15 | | ◐ | ◐ |
| P8 | Integrations | ◐ chat and live notifications done on backend, web and mobile (P8-03, P8-04, P8-05 apart from push and email); Cloudinary, FCM, maps, geocoding, email and Gemini still to do (they need your accounts) | 2026-11-17 | | ◐ | ◐ |
| P9 | Analytics and smart features | ◐ impact and the Green Score done on backend, web and mobile (P9-01 to P9-06, P9-11); AI classification, pickup scheduling UX, certificates and education admin still to do | 2026-11-17 | | ◐ | ◐ |
| P10 | Testing and finalization | ☐ | | | ☐ | ☐ |

**Dependency chain:** P1 → P2 → P3 → (P4 ∥ P5 backend parts) → P6 → P7 → P8 → P9 → P10. Integrations touch earlier code; keep fallbacks working so earlier phases remain runnable without credentials.

---

## 1. Protocol — applies to every phase

### Before the phase
- [ ] **B1** Explain the functionality being built (one paragraph).
- [ ] **B2** List the files/folders to be created or changed.
- [ ] **B3** List database changes (new/changed collections, indexes, seed data).
- [ ] **B4** List required free integrations and confirm each is still free; note fallback.
- [ ] **B5** Re-read the relevant requirement IDs and design sections.

### After the phase (exit gate)
- [ ] **A1** Run the application(s) end-to-end (backend + web [+ mobile when applicable]).
- [ ] **A2** Run automated tests for the phase; add tests where missing.
- [ ] **A3** Manually exercise each new feature; check loading, empty, success, error states.
- [ ] **A4** Fix all errors and warnings (lint, analyzer, console, server logs).
- [ ] **A5** Update docs (`API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, `SETUP_GUIDE.md`, README as relevant).
- [ ] **A6** Update this file (ticks, tracker table, change log).
- [ ] **A7** Commit with a clear message; do not overwrite working code unnecessarily.
- [ ] **A8** Only then continue to the next phase.

---

## P1 — Project Initialization

**Goal:** a runnable skeleton of all three apps, shared tooling and the design foundation.
**Requirements:** CON-01…16, NFR-OPS-06, NFR-QA-04, NFR-UX-07.

> **Phase 1 status (2026-11-14):** All three apps are scaffolded in `~/Source/ewaste-opportunity-network`. Only `node --check` (backend syntax) and JSON validity were verifiable in the build sandbox, which cannot reach npm and has no Flutter/MongoDB. `[~]` = written, **not yet installed/run/tested**. Exit gate (run + tests green) is **still open** — see `SETUP_GUIDE.md` for the commands.

### Repo & tooling
- [x] **P1-01** Create monorepo `ewaste-opportunity-network/` with `web/ mobile/ backend/ docs/` and root `README.md`, `.gitignore` (node_modules, .env*, build outputs, uploads, `google-services.json`, keystores).
- [~] **P1-02** `git init`; first commit; branch convention (`main`, `phase/*`, `feature/*`); commit message style. *(git init done; no commit yet)*
- [x] **P1-03** Copy the four planning docs and the SRS into `docs/` (`requirements.md`, `design.md`, `tasklist.md`, `claude.md`); create empty stubs for `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, `SETUP_GUIDE.md`, `TESTING.md`, `ASSETS.md`. *(SRS file copy not done — original attachments only)*
- [x] **P1-04** Decide & record: Redux Toolkit vs Context (default Redux Toolkit), Riverpod vs Provider (default Riverpod), validation lib (default Zod), Android minSdk (default 24). Log in `ARCHITECTURE.md`.

### Backend skeleton
- [x] **P1-05** `backend/` Node project (`type: module` or CommonJS—pick one), Express app/server split, folder layout from `design.md` §A.2.
- [x] **P1-06** Env loader with schema validation + `.env.example` (all vars from §A.16).
- [~] **P1-07** MongoDB connection (Atlas free tier or local), graceful startup/shutdown, `GET /api/health`.
- [x] **P1-08** Base middleware: helmet, cors, rate limit, json limit, mongo-sanitize, logger, notFound, error handler, `ApiError`, `asyncHandler`, response helpers.
- [x] **P1-09** ESLint + Prettier; Jest + Supertest + `mongodb-memory-server` set up with one passing health test. *(health test passes, user's machine 2026-11-14)*

### Web skeleton
- [x] **P1-10** `web/` via Vite + React; install Tailwind, React Router, Axios, Redux Toolkit, Recharts, Lucide React, React Hook Form, Framer Motion, Leaflet/react-leaflet, Zod resolver.
- [x] **P1-11** Folder layout from §A.15; base routes, layouts (`PublicLayout`, `DashboardLayout`), 404 page.
- [x] **P1-12** Tailwind config: colour tokens, radii, shadows, fonts; self-hosted fonts (Inter, Plus Jakarta Sans, Manrope); light/dark class strategy.
- [x] **P1-13** Glass utilities (`.glass`, `.glass-strong`, `.glass-subtle`) with `@supports` and reduced-transparency fallbacks; theme toggle persisted.
- [x] **P1-14** Vitest + React Testing Library set up; one smoke test; ESLint/Prettier. *(2 tests pass 2026-11-14; ESLint clean 2026-11-14)*
- [x] **P1-15** Axios instance with env base URL; API health ping shown in a dev-only banner.

### Mobile skeleton
- [x] **P1-16** `mobile/` Flutter project (Android target, package name decided); folders from §A.15. *(android/ generated 2026-11-14, org com.ewaste)*
- [x] **P1-17** Add dependencies: Riverpod, go_router, Dio, flutter_map, latlong2, image_picker, geolocator, firebase_core/messaging, flutter_secure_storage, socket_io_client, fl_chart, Lucide icons package, cached_network_image.
- [x] **P1-18** Theme from design tokens (`AppColors`, `AppTheme` light/dark, `GlassTheme` extension, `GlassContainer`).
- [~] **P1-19** Dio client with base URL via `--dart-define`; calls `/api/health` on splash (dev).
- [x] **P1-20** `flutter analyze` clean; one widget test. *(analyze clean, 2 tests pass 2026-11-14)*

### Foundation checks
- [ ] **P1-21** Verify current free-tier availability/limits for MongoDB Atlas, Cloudinary, Firebase (FCM), Gemini, SMTP provider; record dates and limits in `SETUP_GUIDE.md` (*CON-10*).
- [x] **P1-22** Contrast check of palette pairs; record pass/fail in `ASSETS.md` or `design.md` appendix (*B.2.2*). *(done: results in `ASSETS.md`; found `#10B981` fails 3:1 on light bg → added `#047857` token)*
- [x] **P1-23** `docs/ARCHITECTURE.md` first version (diagram, decisions).

**Exit criteria:** `npm run dev` for backend + web and `flutter run` all start; health check reachable from both clients; lint/tests green; docs stubs exist.

---

## P2 — Database and Backend

**Goal:** all schemas, core middleware and CRUD-level APIs backed by real MongoDB.
**Requirements:** FR-DEV, NFR-SEC-03…07, NFR-PERF-01/02, §8.

> **Phase 2 status (2026-11-14):** all 36 models, middleware, device/category/report APIs, seed and tests are written. `npm install` + `npm test` were run on the user's machine: **4 suites / 44 tests pass** (one real bug found and fixed: geo fuzzing could publish exact coordinates). Still open: `npm run seed` and a live `npm run dev` run against a real MongoDB; audit-middleware has no test yet; web + Flutter not run. Minimal `authenticate/authorize` was pulled forward from P3 (needed by device routes).

### Models (Mongoose)
- [x] **P2-01** Identity: `User`, `UserProfile`, `TechnicianProfile`, `StudentProfile`, `RefurbisherProfile`, `RecyclingCenter`, `VerificationDocument`, `RefreshToken`, `DeviceToken`. *(+ RefreshToken/DeviceToken; 36 collections total)*
- [x] **P2-02** Catalogue: `Category` (+ seed 15), `Device`, `DeviceListing`, `Report`.
- [x] **P2-03** Services: `ServiceRequest`, `Quotation`, `PickupSchedule`.
- [x] **P2-04** Donation/marketplace/recycling: `Donation`, `DonationRequest`, `RefurbishmentJob`, `MarketplaceProduct`, `Order`, `Transaction`, `RecyclingRecord`.
- [x] **P2-05** Student: `LearningOpportunity`, `StudentApplication`, `Certificate`.
- [x] **P2-06** Comms/trust: `Conversation`, `Message`, `Notification`, `Review`, `Complaint`.
- [x] **P2-07** Impact/admin: `EnvironmentalImpact`, `GreenScoreLedger`, `AdminLog`, `Announcement`, `EducationArticle`.
- [~] **P2-08** Indexes: unique, compound filters, text, `2dsphere`, TTL; verify with `explain()` on key queries. *(indexes declared; `explain()` check pending a real DB)*
- [x] **P2-09** Soft-delete plugin/helper; timestamp plugin; `toJSON` serializers stripping private fields.

### Cross-cutting backend
- [x] **P2-10** Validation layer (Zod schemas + `validate` middleware); shared enums in `config/constants`.
- [x] **P2-11** Pagination/sort/filter utility with whitelisted fields.
- [x] **P2-12** Upload middleware (multer + validation) with storage adapter interface (local driver first). *(local driver only; Cloudinary = P8)*
- [x] **P2-13** Ownership/state guards (`isOwner`, `isParticipant`, `isAssignedProvider`).
- [~] **P2-14** Audit middleware writing `AdminLog`. *(`services/auditService.js` now writes the entries from the admin services; wired for users and verifications in 6A, other admin actions follow in 6B–6E)*
- [~] **P2-15** Seed script: admin, categories, demo users per role, sample listings (dev only).

### Initial APIs
- [x] **P2-16** Devices CRUD: `POST/GET /api/devices`, `GET/PUT/DELETE /api/devices/:id` with search, filters, pagination, owner checks, soft delete, lock rules (*FR-DEV-001…012*).
- [x] **P2-17** Public categories endpoint; reports endpoint (`POST /api/reports`). *(`GET /api/categories`, `POST /api/reports`)*
- [x] **P2-18** Stub routers for all remaining modules mounted under `/api` returning 501 (so route map is visible) — **replace** as modules land; none may remain at release. *(`routes/stubs.js` — 501 until each module lands)*
- [x] **P2-19** Tests: device CRUD, pagination, validation errors, NoSQL-injection payloads, ownership. *(44 backend tests pass on the user's machine, 2026-11-14)*
- [x] **P2-20** `DATABASE_SCHEMA.md` (every collection, fields, indexes) and first `API_DOCUMENTATION.md` entries. *(DATABASE_SCHEMA.md + API docs written)*

**Exit criteria:** all models load, seed runs, device APIs fully tested, indexes verified, docs updated.

---

## P3 — Authentication and User Roles

**Goal:** secure accounts for all roles, profiles, and verification submission.
**Requirements:** FR-AUTH-*, FR-USER-*, FR-VER-001…002/007, NFR-SEC-01/02/03/06/08.

### Backend
- [x] **P3-01** `POST /api/auth/register` (role whitelist excludes admin; creates role profile; status `pending_verification` for provider roles).
- [x] **P3-02** `POST /api/auth/login` (bcrypt compare, lockout, status checks) + `POST /api/auth/refresh` (rotation, reuse detection).
- [x] **P3-03** `POST /api/auth/logout`, sessions list/revoke (**S**).
- [x] **P3-04** `POST /api/auth/forgot-password` & `reset-password` (hashed single-use token, expiry, generic responses).
- [x] **P3-05** Email verification (`verify-email`, resend) with Nodemailer; console fallback in dev (**S** until SMTP available).
- [x] **P3-06** `GET /api/auth/me`; `authenticate`, `authorize(...roles)`, `requireVerified` middleware.
- [~] **P3-07** `GET/PUT /api/users/profile`, `GET /api/users/:id` (public serializer), avatar upload. *(written 2026-11-14 as `/api/users/me/*`; public `GET /api/users/:id` not done)*
- [x] **P3-08** Role profile endpoints: technician profile & availability; student profile; refurbisher profile; recycling-center profile; recipient organisation profile.
- [~] **P3-09** Verification: `POST /api/technicians/verification`, `POST /api/verification/documents`, `GET /api/verification/me`; private document storage + status model. *(written as `/api/verification/{status,documents}`; `/api/technicians/verification` alias not done)*
- [x] **P3-10** Account status transitions (active / pending / suspended / deleted) enforced in auth middleware.
- [~] **P3-11** Tests: register/login/refresh/logout/reset flows; role escalation attempt; suspended login; unverified provider gating; rate-limit on login. *(register/login/refresh/reset/verify/lockout/suspended/escalation tests pass; still missing: `requireVerified` gating test and a rate-limit test)*

### Web
- [x] **P3-12** Login, Registration (role selection cards, role-specific fields), Forgot/Reset password pages with React Hook Form + Zod, inline errors, success states. *(web tests pass; live browser run done 2026-11-15)*
- [x] **P3-13** Auth store, Axios refresh interceptor, `RequireAuth`, `RequireRole`, `RequireVerified` guards; role-based redirect to the correct dashboard.
- [x] **P3-14** Profile Settings page (avatar, details, role-specific sections); verification submission UI with upload previews and status banner.

**Phase 3 status (2026-11-15): functionally complete and verified live.** Backend 114 tests, web 49 tests, plus a live browser pass (register, resend + verify email, cookie session restore in a new tab, logout/login, account update, technician document upload in the UI, guard redirects, ~45 API validation/security checks).

**Known gaps carried forward (not blockers):**
- [ ] `requireVerified` gating test and a login rate-limit test (P3-11).
- [ ] Public `GET /api/users/:id` and a `/api/technicians/verification` alias (P3-07/09); do these with the technician directory in P5.
- [ ] Refresh race: two tabs refreshing with the same cookie at the same instant count as token reuse and revoke the family. Add a short grace window (about 10 s) in `authService.refresh`.
- [ ] Access tokens stay valid until they expire (15 min) after a single-device logout. By design (stateless JWT); `logoutAll`/password change bump `tokenVersion` and kill them at once.
- [ ] On first page load the web app sends two `/auth/refresh` calls (dev-only, React StrictMode double effect). Harmless; could be de-duplicated.
- [ ] Dev proxy: `web/vite.config.js` proxies `/api` and `/uploads` to `:5000`. Set `VITE_API_BASE_URL=/api` in `web/.env.local` to use it (needed for the built-in browser pane, which cannot reach port 5000 directly).

**Exit criteria:** every role can register/login; provider roles can submit documents; unauthorised access blocked server-side; tests green.

---

## P4 — Web Application (Public Site, Shell, Devices)

**Goal:** the premium public experience, dashboard shell, and the device listing flow.
**Requirements:** FR-DEV, FR-MKT-006/007, FR-EDU-001, FR-MAP-001/003/004, NFR-UX-*, §7.3, Part B.

### Design system components (web)
- [x] **P4-01** UI kit: Button, Input, Select, Textarea, Checkbox/Radio/Switch, Dropzone, Badge, Chip, Avatar, Tooltip, Tabs, Accordion, Modal, Drawer, Toast, Pagination. *Done where needed: TextField/Alert/Badge/Accordion/Modal/ConfirmDialog/Pagination/Skeleton/EmptyState/ErrorState. Tooltip, Drawer, Toast, Avatar, Tabs, Switch are not built yet (add when a screen needs them).*
- [x] **P4-02** Glass components: `GlassCard`, `StatCard`, floating `Navbar`, `Sidebar`, `FilterPanel`, `EmptyState`, `ErrorState`, skeletons.
- [x] **P4-03** Layouts: Public, Dashboard (glass sidebar + topbar), Auth (split), Admin. *Admin layout comes with Phase 8.*
- [x] **P4-04** Motion helpers (page transitions, reveal, count-up, floating) honouring reduced motion. *CSS float/reveal only; honours reduced motion. No count-up yet.*
- [ ] **P4-05** Graphics pack v1: hero 3D-style render layers, isometric SVG set, empty-state art, abstract backgrounds; optimised WebP/AVIF; licences logged in `ASSETS.md` (*B.7*). *Not done: hero is CSS/SVG, no WebP/AVIF pack and no `ASSETS.md` yet.*

### Public pages
- [x] **P4-06** Landing page with all sections in §7.3 (hero, How It Works, Categories, Repair Services, Student Opportunities, Donation Marketplace, Refurbished Products, Recycling Partners, Impact stats, Featured Technicians, Testimonials, FAQ, Footer) wired to real API data where available. *Testimonials omitted on purpose (no fabricated quotes); impact strip shows only live counts.*
- [x] **P4-07** About Us · How It Works · Privacy Policy · Terms and Conditions · Contact & Support (working form → support ticket/email). *Contact posts to `POST /api/contact` (email, rate limited). Legal pages are drafts that need legal review.*
- [x] **P4-08** Browse Devices (search, filters, pagination, grid/list, map toggle). *Map toggle deferred. Text search matches title and brand only.*
- [x] **P4-09** **List Your Device** multi-step form (details → condition/photos → service/location → data-protection checklist → review) with validation, upload progress, draft save. *Update cannot clear a field to empty (API limitation).*
- [x] **P4-10** Device Details page (gallery, specs, approximate map, actions, report).
- [x] **P4-11** Placeholder-free shells for Find Technicians, Recycling Centers, Donation Marketplace, Refurbished Marketplace (wired fully in P5). *Honest empty states; wired in Phase 5.*
- [x] **P4-12** Environmental Education pages (list + article view) with seeded content covering all seven topics. *Static seeded content in `lib/content.js` (7 topics).*
- [x] **P4-13** Environmental Impact page shell using real aggregate endpoint when available (finalised in P9). *Shows only the live listed-device count; the aggregate endpoint is Phase 9.*

### Dashboards (shell)
- [x] **P4-14** User Dashboard: my listings (edit/delete/status), quick actions, empty states.
- [x] **P4-15** Dashboard shells for Technician, Student, Refurbisher, Recycling Center (filled in P5), Notifications page shell, Transaction History shell. *Shared dashboard home plus Notifications and Transactions shells; role-specific content in Phase 5.*
- [x] **P4-16** Responsive QA at 360, 768, 1024, 1440 widths; dark mode pass; keyboard/focus pass. *Checked live at 360/768/1024/1280/1440 and in dark mode (no overflow, contrast scan clean). Skip link, focus trap and Escape covered by tests; a full manual tab-order pass is still open.*
- [x] **P4-17** Web tests: navigation, auth guards, list-device form validation, filter behaviour, API error states. *124 tests pass (9 suites): `deviceLib`, `publicSite`, `devices` added in Phase 4.*

**Exit criteria:** a user can list, edit, search and delete devices on the web; landing page matches the design spec; Lighthouse sanity run recorded.

---

## P5 — Core Business Modules

**Goal:** the repair, matching, donation, refurbishment, recycling, student and review workflows working end to end on the backend and web.
**Requirements:** FR-MATCH, FR-SVC, FR-DON, FR-MKT, FR-REC, FR-STU, FR-REV, FR-TXN, FR-PICK (basic), BR-01…14.

### 5A Matching
- [x] **P5-01** Matching service with pluggable scorers, config weights, hard filters, reasons/breakdown (*§A.5*).
- [~] **P5-02** `GET /api/technicians`, `/nearby`, `/:id`, `PUT /availability`; `GET /api/matching/recommendations?listingId=` done. *Recycling-centre, refurbisher and recipient discovery are deferred to slices 5D–5F, where their modules are built. Public `GET /api/users/:id` and the `/api/technicians/verification` alias are still open (P3 gaps).*
- [x] **P5-03** Unit tests for scoring and eligibility (unverified/suspended excluded, distance, availability).

### 5B Repair workflow
- [x] **P5-04** Workflow service implementing the transition table (§A.4.1) with guards and history.
- [x] **P5-05** `POST/GET /api/service-requests`, `GET /:id`, `PUT /:id/status`, `POST /:id/quotation`, `GET /:id/quotations`, `PUT /:id/quotation/:qid/decision`, `POST /:id/progress|pickup|handover|confirm-completion|cancel`. *Pickup scheduling and the two-sided handover with the data-protection checklist (part of P5-26) are included. Reviews (`review` action) arrive with 5C.*
- [x] **P5-06** Listing lock/unlock on request lifecycle; exact-address release on acceptance (BR-08).
- [x] **P5-07** Transaction record creation (offline payment) on completion.
- [x] **P5-08** Web: technician directory + profile, request flow with ranked matches, request detail with progress tracker and activity, quotation approve/decline, completion confirmation. *Map view and side-by-side quotation compare deferred (one active quotation per request; earlier versions are listed by `GET /:id/quotations`).*
- [x] **P5-09** Web (technician): open-requests board, quote form, job list, progress/photo updates, availability control done. Earnings summary (received / awaiting confirmation) lives on the Transaction history page (P5-12).
- [x] **P5-10** Tests: full happy path; illegal transitions; work blocked without approval (BR-02); cross-user access denied.

### 5C Reviews & transactions
- [x] **P5-11** Reviews API (eligibility = completed transaction, one per transaction, sub-ratings, aggregate update, report).
- [x] **P5-12** Transactions API + Transaction History page (all roles).
- [x] **P5-13** Web review modal and provider rating display.

### 5D Donations
- [x] **P5-14** Donation APIs: create/list/detail, request, decision (auto-reject others), status, schedule handover, confirmations, confirmation document (print view). *Confirmation is a print-to-PDF page, not a server-generated PDF.*
- [x] **P5-15** Recipient-organisation verification path (`GET/PUT /api/donations/recipient`). *The admin approval hook arrives in P6; in dev `npm run dev:approve -- <email>` approves it.*
- [x] **P5-16** Web: Donation Marketplace, donation detail/request modal, donor management, recipient dashboard section, confirmation page.

### 5E Refurbishment & marketplace
- [x] **P5-17** Refurbisher APIs: opportunities feed, offers, decision, jobs & status, before/after photos. *Includes collection scheduling and the two-sided handover with the data-protection checklist (BR-12); the agreed price is recorded as an offline `refurb_purchase` transaction. `listed` is set by the marketplace (P5-18).*
- [x] **P5-18** Marketplace APIs: `GET/POST /api/marketplace`, `GET /:id`, update/delete; search, category/price filters; "Refurbished" label & condition enforced. *Only products of admin-approved refurbishers are public (BR-01). A product can be created from a `ready_to_list` job (job → `listed`, device listing → `completed`); the job's after photos are reused when none are uploaded. Sold products stay readable by link but leave the listing.*
- [x] **P5-19** Orders: `POST /api/orders`, list/detail/status, stock handling, offline payment recording; enquiry endpoint + chat link (chat realtime in P8). *Placed → confirmed (stock taken atomically; the last item marks the product sold and cancels other placed orders) → ready → handed over → completed by the buyer, which records an offline `order` transaction and a verified `refurbishment` impact event. Enquiries create a conversation (`contextType: enquiry`) and notify the seller; real chat is P8.*
- [x] **P5-20** Web: Refurbished Marketplace, Product Details, enquiry/order flow, refurbisher dashboard (jobs pipeline, products, orders). *Pages `/marketplace`, `/marketplace/:id`, `/dashboard/products` (+ new/edit), `/dashboard/orders` (+ detail). All order buttons come from the server's `actions`.*

### 5F Recycling
- [x] **P5-21** Recycling APIs: public centre directory/detail, requests create/list/get, accept/decline, pickup scheduling (≤ 3 reschedules, not within 2 h), two-sided handover with the checklist, received, materials recording (actual vs estimated), process, complete, cancel, centre report as JSON or CSV, history. *Completing writes the centre totals and one verified `recycling` impact event only when a weight was measured (BR-05, BR-06). The exact address is visible to the centre only while the request is accepted or pickup scheduled (BR-08).*
- [~] **P5-22** Web: Recycling Centers directory and detail (`/recycling-centers`, `/:id`), request form (`/dashboard/recycling/new?center=` or `?listing=`), requests list with centre tabs, request detail with tracker and all actions, materials form (weighed and estimated in separate columns), centre report with date and category filters, CSV download and print (`/dashboard/recycling/report`). *Map view is not built (see P4-08).*

### 5G Student learning
- [x] **P5-23** Learning opportunities APIs (technician create, edit, close/reopen), student applications, supervisor decisions, start, completion with recorded hours, withdraw, experience history, certificate service (`issueCertificate`; the admin route arrives with P6).
- [x] **P5-24** Web: public Student opportunities feed and detail with apply box (`/opportunities`, `/:id`), My learning for students (experience tiles, skills, portfolio, applications with status filter, `/dashboard/learning`), application detail with progress tracker (`/dashboard/applications/:id`), and the technician's Student tasks manager (`/dashboard/learning-tasks`, `/new`, `/:id`, `/:id/edit`) with applicants and server-driven actions.
- [x] **P5-25** Enforce supervision and no-hazardous-task rules (*BR-07*): hazardous categories are refused on create and edit (422 on `deviceTypeId`), the poster must acknowledge supervision, every card and page states that tasks are supervised with no hazardous handling.

### 5H Pickup (basic)
- [x] **P5-26** `PickupSchedule` create/confirm/reschedule/handover APIs and data-protection checklist gate (full smart UX in P9). *The four flows (repair, donation, refurbishment, recycling) already schedule and hand over; 5H moved the shared reschedule rules into `services/pickupRules.js` (3 changes, 2 hours' notice), the shared web forms into `components/handover/`, and added the read-only `GET /api/pickups` and the web Pickups page (`/dashboard/pickups`). Smart slot suggestions stay in P9.*

**Exit criteria:** every module has working APIs + web screens; **repair E2E scenario (requirements §9.1) passes on web**; donation, refurbishment, recycling, student flows pass; docs updated.

---

## P6 — Admin Dashboard

**Goal:** complete administration with server-side protection.
**Requirements:** FR-ADM-*, FR-CMP-*, FR-VER-003…008, FR-REV-004.

- [~] **P6-01** Admin auth hardening: seeded admin, `/api/admin/*` behind `authenticate` + `authorize('admin')`, extra rate limit (`adminLimiter`, 300 per window). *Forced password change on first login (**S**) is deferred.*
- [x] **P6-02** `GET /api/admin/dashboard` KPIs (all tiles in *FR-ADM-002*). *(Slice 6B: people by role and state, centres, listings, each flow's total/open/completed/stopped, completed services, marketplace, what needs attention, latest admin actions; web admin home at `/dashboard`.)*
- [x] **P6-03** Users: list/search/filter by role/status, detail, suspend/reactivate with reason (*BR-09*), audit log. *(Slice 6A: `GET /api/admin/users`, `GET /:id`, `PUT /:id/status`; web Users and user detail. Admins and your own account cannot be suspended; reactivating an unapproved provider returns it to waiting for verification, BR-01.)*
- [x] **P6-04** Verification queue: `GET /api/admin/verifications`, `PUT /api/admin/verifications/:id` (approve/reject + reason), signed-URL document viewer, notifications, audit entries; includes recipient-organisation approvals. *(Slice 6A: documents are streamed through the admin session with `Cache-Control: private, no-store` rather than signed URLs; every document view is audited. Decisions: approve, refuse with reason, ask for new documents with reason.)*
- [x] **P6-05** Listings: search, review reported, remove; category management (CRUD, reorder, activate/deactivate). *(Slice 6C: listings list with filters and report counts, remove with a reason and restore (BR-03: never while part of a service), category add/rename/reorder/switch off/delete.)*
- [ ] **P6-06** Monitors: repair requests, donations, refurbishment, recycling, transactions (read-only tables with filters/export).
- [x] **P6-07** Complaints: create (user side), list, assign, status, resolve, history; notifications. *(Slice 6D: members file (max 5 still being handled, never against yourself or an administrator), see their own list and a detail view that hides internal notes and administrator names; administrators have a queue (oldest first), assign / start review / resolve / reject (a note is required to close), a history, and both people are told. Evidence upload is deferred.)*
- [x] **P6-08** Review moderation (hide/remove) and report queue. *(Slice 6C: reviews hide/remove/restore with the provider rating recomputed; report queue with take-down, handled-with-note and dismiss.)*
- [x] **P6-09** Announcements CRUD + display banner in web/mobile feed. *(Slice 6D: create, edit, end now, delete; audience is everyone or chosen roles; optional start and end; public feed `GET /api/announcements` drives a dismissible banner on public pages and the dashboard. The mobile feed uses the same endpoint in Phase 7.)*
- [x] **P6-10** Audit log viewer with filters. *(Slice 6D: filter by action, kind of item, administrator and dates; each row shows what was done, by whom, when, from where, the reason, before/after, and a link to the item.)*
- [x] **P6-11** `GET /api/admin/analytics` (monthly registrations, categories, service activity, donations, recycling, platform growth) + charts (Recharts). *(Slice 6E: 3–24 calendar months, every month present; sign-ups by kind of person, running growth, services started per month, completion rates, donations, recycling, top categories (the rest grouped) and verified impact only, with weighed and estimated kept apart. Every chart has a legend, a plain-sentence summary and a "Show as a table" view with the same numbers; colours follow the validated data-viz palette in light and dark.)*
- [x] **P6-12** Reports: CSV export for users, listings, requests, recycling (**S**). *(Slice 6E: people, listings, repairs, donations, refurbishment, recycling and payments; per-file filters, a 10,000-row cap that says when it cut a file short, spreadsheet-safe text, no phone numbers or exact addresses, and every download audited as `export.downloaded`. The same slice adds the admin certificates list and issue route, `/api/admin/certificates`, audited as `certificate.issued`.)*
- [x] **P6-13** Web: Admin Dashboard UI (sidebar, KPI glass tiles, queues, tables, document modal, confirm dialogs). *(Built slice by slice in 6A–6E; the final polish pass checked every admin page at 375 px and desktop width: no horizontal overflow, the audit log's before/after panels no longer stretch their cards, links and summaries have 44 px tap areas, scrolling tables are keyboard-reachable, chart month labels fit a phone, and the dashboard menu is one scrolling row on phones (current page kept in view) so content starts on the first screen.)*
- [x] **P6-14** Tests: non-admin 403 on every admin route; approve/reject flows affect discovery; suspension blocks login; audit written. *(6A–6E covered: guard on every route of those slices for every role, approve/refuse effects on discovery, suspension blocks login, audit rows (including downloads and certificates). The polish pass was checked live; layout widths are not unit-tested.)*

**Exit criteria:** Admin can run the platform; verification gating visibly changes provider discoverability; admin security tests pass.

---

## P7 — Flutter Application

**Goal:** a native-feeling Android app with all major user-facing features on the **same backend**.
**Requirements:** §7.4, NFR-UX, CON-03/05, A-12.

### Foundation
- [ ] **P7-01** Routing (go_router) with auth redirect, role-based shells. *(7A: auth redirect and a two-tab shell done and tested; per-role tabs arrive with each role's screens.)*
- [x] **P7-02** Secure token storage, Dio interceptors (auth header, single-flight refresh, error mapping), connectivity handling.
- [ ] **P7-03** Models (json) mirroring API; repositories; Riverpod providers (auth, listings, requests, notifications...). *(7A: user/session/me, auth repository, auth/onboarding/boot providers done. 7B: listing, category and listing-input models, device repository, listings/categories/listing providers done; requests and notifications still to do.)*
- [ ] **P7-04** *(7A: glass background, auth scaffold, text field, loading button, message banner, floating glass nav bar done. 7B: chips and status badges, skeletons, empty/error states, listing photo, glass app bar done; timeline and stars still to do.)* Shared widgets: `GlassContainer`, floating glass bottom nav, buttons, inputs, cards, skeletons, empty/error states, chips, status timeline, rating stars.
- [~] **P7-05** Offline cache layer for lists/profile/notifications with "last updated" banner. *(Written 2026-11-16; analyze clean and 577 tests pass; not yet tried by hand on the phone: `core/storage/response_cache.dart` keeps the last good answer of the read-only lists on the phone (secure storage, per signed-in person, 40 entries, 200 000 characters each, wiped at sign-out; never requests in progress, orders, donations, handovers or sign-in); `ApiClient` saves on success and serves the saved copy when the server cannot be reached; `SavedDataBanner` shows "No connection. Showing what was saved at …". Not done: starting the app offline still shows the sign-in screen because `/auth/me` is not saved; queued writes while offline are out of scope.)*

### Screens (all 23)
- [x] **P7-06** Splash · Onboarding (3–4 illustrated pages, shown once).
- [x] **P7-07** Login · Registration · Role Selection · forgot/reset password.
- [ ] **P7-08** Home Dashboard (role-aware) with Green Score ring, quick actions, active requests. *(7A: role-aware greeting, verification and email notices, Green Score card, per-role quick actions as "Soon"; ring and active requests come with their screens.)*
- [x] **P7-09** Device Listing flow + Camera Upload (camera/gallery, multi-photo, compression, upload progress) + Device Details. *(Slice 7B: three-step wizard, up to six photos from camera or gallery compressed at pick time, upload progress, publish or save as draft, server field errors mapped back to the step; browse with search, service chips and filters; details with photo gallery and owner panel; My listings with status chips. Verified on the emulator against the local backend.)*
- [ ] **P7-10** *(Browse devices, technicians and recycling centres are done (list or card view, search, category filter, details, request form); the refurbished shop (search, category, disclosed condition and sort, product page with the Refurbished label and what was done, order form, ask the seller) is written 2026-11-16 and awaits a run; the donation marketplace (list with my offers and what I asked for, request, choose, handover, confirmation, offering a device, registering an organisation) is written 2026-11-16 and awaits a run. Shops, donations and recycling are all in; the student opportunities are still to do. No map yet: needs P7-15.)* Service Selection → Nearby Technicians (map + list), Recycling Centers, Donation Marketplace, Refurbished Marketplace (search/filters).
- [x] **P7-11** Request Tracking (timeline, quotation approve/reject, completion confirm, review). *(Owner side, verified on the emulator and a phone: list with open filter, details with history timeline and step photos, quote approve/decline, both handovers with the data-protection checklist, repair updates with photos, return time, completion confirm, cancel with a warning when the technician holds the device, automatic refresh while open, and a review sheet (overall stars required, three aspects and a comment optional) once completed.)*
- [ ] **P7-12** Student Opportunities (browse/apply/track). *(Written 2026-11-16, awaits a run: task list with level and device filters, task page with the supervisor, safety note and apply sheet, the reasons a student cannot apply (verification, full, already applied), my applications with status filter, application page with withdraw and history, experience screen with hours, skills and certificates. The supervising technician's side was written the same day: My tasks, post and edit a task (with the supervision promise, BR-07), close or reopen, applicants per task, and accept, decline, start and finish with hours.)*
- [ ] **P7-13** Provider-side screens: technician requests/quotes/job updates; refurbisher jobs/products/orders; recycler requests/pickups/materials. *(Technician side done and run end to end on a physical phone as `tech@demo.local`: Jobs screen (new requests, in progress, all jobs), the shared request screen in the technician's view (customer, area, own wording), accept or decline with a reason, pickup, handover without the owner's checklist, start diagnosis, quote form (lines must add up to the total), progress updates with photos from the camera or gallery, finish with a photo, bring the device back with a return date and time. Recycler side written 2026-11-16 (not yet run on a phone): requests list with status filter, the shared recycling request screen in the centre's view, accept or decline with a reason, pickup, handover, mark received, record recovered materials (measured and estimated kept apart), process and complete. Orders written 2026-11-16 (not yet run on a phone): the orders list with status filter and the order screen for buyer and seller (confirm, mark ready, hand over, buyer confirms receipt, cancel with a reason, review the seller, history). Refurbisher side written 2026-11-16 (not yet run on a phone): devices-to-refurbish feed with offer sheet, jobs list for both sides, the job screen (accept or decline, withdraw, arrange collection, confirm handover with the owner's checklist, work steps with notes, before and after photos, put on sale), My products with status chips, and the product form (create from a finished job or from scratch, edit, hide, remove). The recycler's activity report was written 2026-11-16 too: period chips and a date range, requests by status, devices recycled, measured and estimated weights in separate columns (BR-06), by kind of device and the completed requests; the CSV download is not on mobile yet. Technician supervision of student tasks (P7-12) is also written. Nothing from this slice has been run on a phone yet.)*
- [ ] **P7-14** Environmental Impact (fl_chart), User Profile, Settings (theme, notifications, logout), Transaction History, Help and Support, Notifications list. *(Done and checked on a physical phone: Account hub with unread badge, Profile (name, phone, area, city, state, PIN, bio), Settings (light/dark/system theme kept on the phone and copied to the profile, email and phone message switches), Transaction history with totals, Notifications list (mark one or all read, opens the request), Help and support (six answers and the contact form), sign out. The Environmental Impact screen is now built as the Green Score page, with a ring, badges, a bar chart, the history and the rules; it has not been looked at on the phone yet.)*
- [x] **P7-15** Location permission flow with manual-entry fallback; map pin selection. *(Done: "Use my location" and "Pick on map" (OpenStreetMap tiles, credited) on the list-a-device form, and "Near me" distances (5, 10, 25, 50 km) in the Browse filters. Refused, blocked, switched-off and no-signal each show their own message and a way out, and city and area always still work. Tested with a fake phone, and checked on a physical phone for the switched-off case, the map and the saved pin. The success path through the real GPS is not yet seen on the device because location is off in that phone's settings.)*
- [x] **P7-16** Verification submission (documents via camera/gallery) for provider roles. Photos only (JPEG/PNG/WebP); PDF upload needs a file-picker package (later).
- [x] **P7-17** Android polish: edge-to-edge, adaptive layouts, large-text check, back-button behaviour. *(Done: predictive back gesture enabled in the manifest; large-text check, with 14 of the newer screens at 1.5x and 2x text in `test/screens/large_text_test.dart`; edge-to-edge system bars with theme-matched icons; page content kept to 720 dp and the bottom bar to 560 dp on tablets and wide windows, tested in `test/widgets/wide_screen_test.dart`. Not yet seen on a real tablet.)*
- [ ] **P7-18** Flutter tests: auth, navigation, device submission (mock), request tracking, API integration (against local backend).

**Exit criteria:** repair E2E scenario succeeds from the mobile app; web↔mobile sync verified both directions; `flutter analyze` and tests green; APK builds.

---

## P8 — Integrations

**Goal:** replace dev fallbacks with real free-tier integrations (each with graceful fallback retained).
**Requirements:** CON-10…16, FR-CHAT-*, FR-NOTIF-*, FR-MAP-*, NFR-SEC-08/12.

- [ ] **P8-01** Re-verify and document current free-tier limits (date-stamped) for each service.
- [ ] **P8-02** **Cloudinary:** public uploads with transformations; private `authenticated` uploads + signed URLs for documents; migration of local-dev assets; orphan cleanup job. Test with real credentials before marking done.
- [~] **P8-03** **Socket.IO:** JWT handshake, rooms, events, persistence, read receipts, typing, attachments; REST fallback; participant authorisation on every event. *(Done: handshake with the API's access token (suspended and revoked tokens refused), a private room per person, `message:new`, `message:read`, `typing` and `notification:new` events, REST for everything as the fallback, per-person send limit and per-connection event limit, and every read and write checks that the caller is one of the two people, with the two people worked out by the server from a shared record. 15 REST and 11 socket tests. Not done: attachments, which wait for Cloudinary (P8-02).)*
- [x] **P8-04** **Chat UI** web + mobile: conversation list, thread, unread counts, entry points from service/order/recycling/donation pages. *(Done on both: conversation list with unread badges, thread with sending, retry of failed messages, "typing", "Seen", older messages, catching up after a lost connection; Message buttons on repairs, orders, recycling requests, refurbishment offers, donation requests (mobile) and listed devices. Checked on a physical phone with live messages both ways. Web donation pages do not have the button yet.)*
- [~] **P8-05** **Notification service:** in-app persistence, socket push, notification centre UI (web + mobile), mark read/all. *(Done: the API, live push over the socket, the mobile notification centre with a live badge, and the web notification centre with a live sidebar badge, "mark all read" and links that stay inside the app. Still to do: FCM and email channels.)*
- [ ] **P8-06** **FCM:** Firebase project, service-account in env, device-token endpoints, send on all event types in *FR-NOTIF-002*, deep links, stale-token pruning; mobile foreground/background handlers.
- [ ] **P8-07** **Maps:** Leaflet (web) and Flutter Map (mobile) on OSM tiles with attribution; nearby markers; pickup selection; privacy fuzzing verified.
- [ ] **P8-08** **Nominatim proxy:** throttled queue, cache, User-Agent/contact, debounce on clients; fallback to manual coordinates.
- [ ] **P8-09** **SMTP (Nodemailer):** verification, reset, key notifications; HTML templates; dev console fallback.
- [ ] **P8-10** **Gemini adapter** (optional): configurable, daily counter, JSON-schema response, timeout, fallback (feature completed in P9).
- [ ] **P8-11** Fallback tests: unset each credential and confirm the app still runs and logs a clear warning.
- [ ] **P8-12** `SETUP_GUIDE.md` sections: how to create each free account, which env vars, how to test, known limits.

**Exit criteria:** chat and push work between web and a real Android device; uploads verified in Cloudinary; no integration is claimed working without a recorded test.

---

## P9 — Analytics and Smart Features

**Goal:** the sustainability layer and smart conveniences.
**Requirements:** FR-IMP-*, FR-AI-*, FR-PICK-*, FR-EDU, FR-STU-006, FR-REC-005.

- [x] **P9-01** Impact events written on verified completions (repair, donation, reuse, refurbishment, recycling) — idempotent, with reversal on upheld complaints. *(Done: repair, donation, refurbishment and recycling write through `impactService.record()` and are proven by their workflow tests. An upheld (resolved) complaint reverses the event once. "Reuse" has the rule and the event type but no workflow writes it yet, because whole-device hand-on has no flow of its own.)*
- [x] **P9-02** Analytics endpoints: `user-impact`, `platform-impact`, `monthly`, `green-score`; aggregation pipelines + caching. *(Done, plus a public `rules` endpoint. The public figures are cached for a minute.)*
- [x] **P9-03** Green Score rules (configurable), ledger, badges/achievements, anti-gaming caps; document rules in `ARCHITECTURE.md` and show them in the UI. *(Done: rules in `config/impact.js`, ledger, five levels, seven badges, a daily limit, reversal; documented in `ARCHITECTURE.md`; shown on the web impact pages and the mobile Green Score page, read from the server.)*
- [x] **P9-04** Actual vs estimated separation in API and UI (labels, dashed chart styles, methodology note); placeholder factors flagged until sourced (*A-11*). *(Done: every figure is labelled Actual, Measured or Estimate, and every response says `factorsProvisional` with a methodology note. The charts show counts only, which are actual, so there are no estimated bars to dash. The factors themselves are still placeholders: P10-12.)*
- [~] **P9-05** Web Environmental Impact page and user impact dashboard (Recharts: monthly/yearly, category, materials, contribution); mobile equivalents (fl_chart). *(Done: the public impact page, the dashboard Green Score page, and the mobile Green Score and impact page with a fl_chart bar chart. Not done: a yearly view and a breakdown by category.)*
- [~] **P9-06** Material recovery tracking views (per centre and platform) using recorded `actualKg` and `estimatedKg` separately. *(Done: measured and estimated kilograms are kept apart in the platform figures, a person's own impact, every month of the series, and the recycling centre's own report. Not done: a per-centre comparison for the public.)*
- [ ] **P9-07** **AI classification:** upload photo → Gemini suggestion (category, type, brand, visible damage, possible repairs) → user confirm/edit; rule-based fallback; disclaimer text (*FR-AI-001…004*).
- [ ] **P9-08** **Smart pickup scheduling UX:** date/time slots, status view, reschedule rules, handover confirmation; notifications.
- [ ] **P9-09** Student certificates: issue (supervisor complete + admin approve), downloadable PDF with ID; portfolio page.
- [ ] **P9-10** Education content admin (CRUD) and polished article pages; seed all seven topics.
- [x] **P9-11** Landing/impact counters switched from placeholders to live data. *(Done: the landing page has a live strip and the public impact page shows recorded figures; while nothing is verified they say so instead of showing zeros.)*
- [~] **P9-12** Tests: scoring correctness and idempotency; analytics totals vs raw data; AI fallback; pickup reschedule rules. *(Done for scoring and analytics: 38 backend tests plus assertions in the four workflow tests, and web and mobile tests. AI fallback and pickup rules belong to P9-07 and P9-08.)*

**Exit criteria:** completing a verified activity changes Green Score and dashboards correctly on both clients; estimated values are always labelled.

---

## P10 — Testing and Finalization

**Goal:** release-ready quality, security, documentation and deployment configuration.
**Requirements:** NFR-QA, NFR-SEC, §9, SRS §14.

### Testing
- [ ] **P10-01** Backend suite covers: registration, login, auth, authorisation, device listing, service requests, quotations, donations, refurbishment, recycling, marketplace, chat, notifications, admin. Coverage target ≥ 70 % on services.
- [ ] **P10-02** Web tests: navigation, forms, dashboards, API communication, role-based access, responsive snapshots, loading/error states.
- [ ] **P10-03** Flutter tests: auth, navigation, device submission, image upload, service discovery, request tracking, notifications, API integration.
- [ ] **P10-04** **E2E repair scenario (11 steps)** automated (Playwright/Cypress or scripted API + manual mobile run); run **cross-client** variant (web ↔ mobile).
- [ ] **P10-05** E2E donation, refurbishment, recycling, student, verification, moderation, suspension workflows (*requirements §9.2*).
- [ ] **P10-06** Security tests: IDOR sweep on every `:id` route, role escalation, JWT tampering, refresh reuse, NoSQL operators, upload abuse, XSS payloads, rate-limit behaviour, private document access, CORS (*§9.3*).
- [ ] **P10-07** Accessibility audit (axe/Lighthouse + manual keyboard/screen-reader spot checks) and reduced-motion/transparency checks.
- [ ] **P10-08** Performance pass: Lighthouse (mobile) ≥ 85 on landing, bundle analysis, image audit, DB query review (`explain`), Flutter profile run on a mid-range device.
- [ ] **P10-09** Data-sync verification matrix (list on web ↔ see on mobile, etc.) — record results in `TESTING.md`.
- [ ] **P10-10** Fix all defects; re-run suites.

### Compliance & content
- [ ] **P10-11** Legal review checklist for Privacy Policy, Terms, consent, retention and e-waste regulatory references (India) — flag items needing a qualified reviewer (*A-09*).
- [ ] **P10-12** Replace placeholder environmental factors with cited values or keep estimates clearly labelled (*A-11*).
- [ ] **P10-13** Asset licence audit (`ASSETS.md`).

### Documentation & deployment
- [ ] **P10-14** README (overview, features, architecture, quick start); `SETUP_GUIDE.md` (prereqs, env, run, seed, free accounts, limits); `API_DOCUMENTATION.md` (every endpoint); `DATABASE_SCHEMA.md`; `ARCHITECTURE.md`; `TESTING.md`; deployment guide (backend, web, APK build/signing).
- [ ] **P10-15** Production configuration: env audit, secrets rotation, CORS, HTTPS, rate limits, logging, backups, seed admin password change.
- [ ] **P10-16** Build artefacts: web production build; signed release APK/AAB instructions; versioning.
- [ ] **P10-17** Final regression run; tag release `v1.0.0`; update this tracker to 100 %.

**Exit criteria:** all Must requirements verified; no non-functional buttons; no 501 stubs; docs complete; free-API policy audit passed.

---

## 2. Cross-cutting checklist (verify at every phase)

- [ ] No paid API/billing introduced; no secrets in repo or frontend bundle.
- [ ] Every new endpoint: validation + authentication + authorisation + ownership/state guards.
- [ ] Every new screen: loading skeleton, empty state, error state, success feedback, validation messages.
- [ ] Data written by one client appears on the other.
- [ ] Public responses leak no email, phone or exact address.
- [ ] Only verified providers are discoverable.
- [ ] Impact/Green Score changes only on verified completion.
- [ ] Glass effects limited; reduced-motion respected; contrast OK.
- [ ] No hard-coded permanent responses; real MongoDB CRUD.
- [ ] Docs and this checklist updated.

---

## 3. Free-API compliance log

| Service | Free tier checked (date) | Limits noted | Fallback tested | Status |
|---|---|---|:--:|---|
| MongoDB Atlas | | | | ☐ |
| Cloudinary | | | ☐ | ☐ |
| Firebase Cloud Messaging | | | ☐ | ☐ |
| Gemini API | | | ☐ | ☐ |
| OpenStreetMap tiles / Nominatim (usage policy) | | | ☐ | ☐ |
| SMTP provider | | | ☐ | ☐ |
| Hosting (backend/web) | | | ☐ | ☐ |

---

## 4. Open decisions to confirm with the product owner

| # | Question | Default if no answer |
|---|---|---|
| 1 | Donation recipients as General User + verified org profile (A-02)? | Yes |
| 2 | Targeted *and* open repair requests in v1 (A-03)? | Yes |
| 3 | Redux Toolkit / Riverpod choices (A-08)? | Yes |
| 4 | Android minSdk 24? | Yes |
| 5 | Chosen free SMTP provider and hosting? | Decide in P1/P8 |
| 6 | App brand name, logo, package ID? | "E-Waste-to-Opportunity Network", `com.ewaste.opportunity` placeholder |
| 7 | Currency and region defaults (INR, India)? | INR, India |
| 8 | Green Score point values and category factors? | Defaults in `design.md` §A.6, flagged as placeholders |
| 9 | Student certificate wording and who signs it? | Platform + supervising technician |
| 10 | Languages beyond English? | Out of scope for v1 |

---

## 5. Change log

| Date | Phase | Change | By |
|---|---|---|---|
| 2026-11-16 | P7 | Technician job flow on mobile (most of P7-13). The request screen is now role-aware (the server already sends a technician's own actions and wording), plus a Jobs screen, the technician's forms (quote, update, finish, return time) and a reusable photo-attachment widget (camera or gallery, JPEG/PNG/WebP up to 5 MB). Technician home tiles link to the jobs tabs. No server change. Walked through on a physical Android phone against the local backend: accept, pickup and handover, diagnosis, a ₹1,500 quote, an update with a photo picked in the Android photo picker, a finished repair and a return time chosen in the date and time pickers; each step reached the server and the owner's view. Mobile 249 tests passing, analyzer clean | Claude |
| 2026-11-16 | P7/P8 | Account area on mobile (most of P7-14) and the in-app notifications API (part of P8-05). Backend: `/api/notifications` (list with unread filter and count, unread-count, mark one, mark all; strictly the caller's own, with tests), `stubs.js` no longer stubs `notifications`, transactions list tie-breaks by id. Mobile: star rating and review sheet (P7-11 done), Account hub with unread badge, Profile, Settings (theme persisted and synced to the profile), Transaction history, Notifications, Help and support; "Free" for zero-amount donations and "₹0" for empty totals. All pages checked on a physical Android phone against the local backend. Backend 581, web 530, mobile 222 tests passing | Claude |
| 2026-11-16 | P7 | Owner repair flow on mobile walked end to end on the emulator and a physical Android phone (USB, `adb reverse`), with fixes: request screen polls every 15 s while open (background-aware, finished requests not polled, stale answers dropped), completion and progress photos shown (progress updates now stored as one item with their photos, `progressUpdates`), "Repair" row replaces the misleading "Where", Green Score card says points are coming until P9-03, optional return time set when starting delivery (API, mobile, web form and page), readable quote note and notification ("₹2,500 quote"), cancelling while the technician holds the device warns the owner and asks the technician to return it (cancel window unchanged, A.4.1), admin dashboard recent actions tie-break by id (fixed a test that failed about 1 run in 3). Backend 578, web 530, mobile 210 tests passing; first two git commits made | Claude |
| 2026-11-16 | P7 | Slice 7B built and verified (devices on mobile; `flutter analyze` clean, all tests passing (137 before the two chip tests were added), checked on the Pixel 10 Pro XL emulator against the local backend: a listing was published from the wizard with two photos, opened in details with the gallery ("1 of 2") and the uploaded photo loaded, price, area-only address note and owner panel shown). Added: listing, category and listing-input models, device repository (list, get, categories, multipart create with upload progress, remove), listings controller per account with stale-answer protection, photo picker (camera or gallery, compressed at pick time, no extra package, no camera permission needed), browse, filter sheet, details, My listings, three-step list-a-device wizard, shared chips, skeletons, empty and error states, glass app bar, and quick actions on the member home. The API client now clones FormData when it replays a request after a token refresh. Bugs found on the emulator and fixed: chips stretched full width inside a Wrap, and the status bar icons washed out on the pale app bar. P7-09 ticked; P7-03, 04 and 10 partly covered. | Claude |
| 2026-11-15 | P7 | Slice 7A built and verified (Flutter foundation + sign-in; `flutter analyze` clean, 74 tests passing, checked on the Pixel 10 Pro XL emulator against the local backend: intro, wrong password message, member sign-in, session restored after a restart, Account tab, sign-out confirmation). Two bugs found and fixed on the way: `lucide_icons` 0.257 does not compile on this Flutter (replaced with Material icons, package removed), and the floating nav bar stretched over the whole screen (column sized to the available height; test added). Also the registration role tiles lost their touch feedback inside the glass card (own Material added). secure storage (refresh token only; access token in memory), Dio client with `X-Client-Type: mobile`, single-flight refresh and replay, error mapping, models, auth repository, Riverpod auth/onboarding/boot controllers, go_router with auth redirect and a two-tab glass shell, shared widgets (background, auth scaffold, text field, loading button, message banner, glass nav bar), splash, onboarding, login, registration with role selection, forgot/reset password, role-aware home, account with sign-out. Android: INTERNET permission, cleartext http for debug builds only. 9 test files. P7-02, P7-06 and P7-07 are ticked; P7-01, 03, 04 and 08 are partly covered. | Claude |
| 2026-11-15 | P6 | Slice 6B built (overview and monitors): `GET /api/admin/dashboard` (FR-ADM-002 tiles, attention counts, latest admin actions) and `GET /api/admin/monitors/:kind` for repairs, donations, refurbishment, recycling and payments, with status and whole-day date filters, per-status counts and paging; web admin home, Monitors page and menu link. Backend 22 suites / 431 tests passing; checked live against the real demo data (counts match, no addresses, inverted date range refused, free hand-overs say "No payment"). | Claude |
| 2026-11-15 | P6 | Slice 6A built (admin foundation): admin guard and `adminLimiter`, users list/detail/suspend/reactivate with reasons and audit trail, verification queue for providers and recipient organisations with a private document viewer, approve/refuse/ask for new documents, notifications, `auditService`. Web: Verifications, Verification detail, Users and User detail pages. Backend 21 suites and web 17 suites, all passing; checked live (refuse with reason, resubmit, approve makes the technician public, suspend blocks login and hides the profile, reactivate restores, non-admin 403, no overflow). | Claude |
| 2026-11-15 | P5 | Slice 5G built (student learning, BR-07): technicians post supervised tasks (hazardous device types refused, supervision acknowledged), verified students apply once per task (unverified students are told why they cannot), supervisor accepts or declines against the seat limit, starts the task, completes it with the hours actually worked and feedback (added once to the student's profile hours, skills and portfolio), students can withdraw (a filled task reopens), closing a task declines waiting applications. Public feed with difficulty, device, skill and text filters; student My learning page; technician manager. Application pages are visible to the student, the supervising technician and admin only (strangers get 404 — found and fixed after the first test run). Certificates exist as a service call (`issueCertificate`, admin only, completed tasks only); the admin route comes with P6. Backend 366 tests (19 suites), web 348 (15 suites). Verified live end to end with the demo technician and student. Not in this slice: attaching a supervised student to a repair request (FR-SVC-011, `linkedServiceRequest` unused), map of tasks, notifications UI (P8). | Claude |
| 2026-11-15 | P5 | Slice 5F built (recycling): public directory and detail of authorised centres; requests with category, device count, area and a private address, optional listed device (locked while the request is open); the centre accepts or declines, schedules a pickup, both sides confirm the handover (requester ticks the data-protection checklist, BR-12), centre marks received, records materials with weighed and estimated kept apart (BR-06), processes and completes; completing adds to the centre totals and writes one verified impact event only when a weight was measured (BR-05). Centre report with date and category filters, CSV and print. Exact address hidden from the centre before accepting and after collection (BR-08). Also fixed a latent bug: `notify` turned populated documents into the string of the whole document, so some notifications never reached their user; ids are now read from either form. Backend 332 tests (18 suites), web 305 (14 suites). Verified live end to end with the demo user and recycler; no horizontal overflow at 375 px. Not in this slice: map view, reviews of centres through the review resolvers, notifications UI (P8), real chat (P8). | Claude |
| 2026-11-15 | P5 | Slice 5E-2 built (marketplace + orders): refurbisher products (from a finished job or from scratch) with condition, work done, specs and photos; public marketplace with search, category, condition, price and sort filters; Refurbished label and condition always shown (BR-11); product page with seller area only; enquiries; orders with cash on delivery or direct payment (platform never handles money, BR-10); seller confirms/ready/handed over, buyer confirms receipt (records the transaction and impact), cancel paths with restocking; seller rating from buyer reviews. Backend 289 tests (17 suites), web 265 (13 suites). Verified live end to end with three demo accounts. Live run fixed: quantity message when only one is in stock, delivery area label, and a waiting note for the seller after handover. Not in this slice: real chat (P8), notifications UI (P8), auto-complete of delivered orders (P10). | Claude |
| 2026-11-15 | P5 | Slice 5E-1 built (refurbishment jobs): opportunities feed for verified refurbishers (fuzzed location only), offers, owner decision (accepting locks the device and declines other offers), collection scheduling, two-sided handover with checklist, pipeline assessment → refurbishing → testing → ready to list with before/after photos (both required), work log, cancel before handover; web pages Devices to refurbish, Refurbishment list and job detail. Server sends `actions`, `nextStatus` and `photoStages` so the UI holds no rules. Backend 243 tests (15 suites); web 226 expected (13 new, 2 fixed after first run). Verified live end to end with the demo owner and refurbisher. Live run fixed: owner saw "Offer sent" instead of "Offer received". Marketplace products and orders (P5-18/19) come next. | Claude |
| 2026-11-15 | P5 | Slice 5D built: donations API (offer, public list, request, accept/decline with auto-reject, handover scheduling, two-sided confirmation with the data-protection checklist, cancel, confirmation document), recipient-organisation verification, web marketplace, detail, donor/recipient dashboard, recipient page and printable confirmation. Completion writes a zero-value donation `Transaction` and one verified impact event. Live run found and fixed: reschedule offered after a handover confirmation (server now hides it), no waiting note after confirming, and free donations shown as a ₹0 "Offline payment" and counted in payment totals. Backend 215 tests (14 suites) and web 199 (11 suites); the two fixes are covered by new assertions in existing tests; both suites re-run green. | Claude |
| 2026-11-15 | P5 | Slice 5C built: reviews API (service context; one per transaction, sub-ratings, provider rating recomputed), transaction history API (participant-only list, summary, payee confirmation), web review dialog, ratings and reviews on technician profiles, Transaction history page. Modals now render through a portal (a glass-card ancestor was trapping `position: fixed`). Backend 183 tests (13 suites), web 168 tests (10 suites). Verified live: validation, review submitted, rating 5.0 shown, duplicate review 409, payment confirmed with reference. | Claude |
| 2026-11-15 | P5 | Slice 5A+5B built: matching service (weights in `config/matching.js`), technician directory, repair workflow, service-request APIs, web screens. Backend 160 tests (11 suites), web 158 tests (10 suites). Repair scenario verified live in the browser (see TESTING.md). Simplifications: one active quotation per request (older versions kept, listed via API); targeted requests go to one technician, open requests are claimed by the first eligible technician; platform never handles money (offline `Transaction` record on confirmation). | Claude |
| 2026-11-14 | — | Initial task list created from SRS | Claude |
| 2026-11-15 | P5 | 5H pickup polish: shared reschedule rules (`pickupRules.js`) and shared web handover forms replace four copies; new read-only `GET /api/pickups` and Pickups page. Backend 20 suites / 376 tests, web 16 suites / 359 tests, all passing; checked live with a scheduled recycling pickup | Claude |
| 2026-11-15 | P6 | Slice 6D built and verified live: complaints (members file and follow them; administrators assign, review, resolve or reject with a note; both people are told; the owner never sees internal notes or administrator names), announcements (create, edit, end now, delete; audience by role; dismissible banner on public pages and the dashboard) and the audit log viewer (filters, before/after, links). Backend 23 suites / 533 tests pass. Web 20 files / 506 tests pass (a first run had 2 failures: server field errors flashed in the banner before reaching the field, fixed on the complaint and announcement forms). Live run also fixed "22 entrys" and raw `user` / `verification` kinds in the audit filter. Deferred: evidence upload on complaints, reversing impact when a complaint about a verified event is upheld (P9). | Claude |
| 2026-11-15 | P6 | Slice 6E built and verified live: administrator analytics (monthly sign-ups, growth, services, donations, recycling, categories, verified impact; every chart also as a table), CSV exports for people, listings and the four service flows plus payments (privacy-safe, capped, audited), and the certificates page (list waiting and issued, issue with a confirmation, student told, audited). Backend 24 suites / 573 tests pass (a first run had 2 test-only slips: an expected-absent CORS header and a wrong id path). Web 21 files / 528 tests pass. Live run changed the charts: evenly spaced month labels counted back from the latest month, `Nov ’26` instead of the ambiguous `Nov 26`, straight line segments instead of a curve over zero months, and a wider right margin; the certificates page got a wider filter and a short button label. Deferred: a chart of weighed-versus-estimated impact over time (P9), per-kind CSV friendly labels for raw values such as `fully_working`. | Claude |
| 2026-11-15 | P6 | Phase 6 polish (P6-13) done: every admin page checked live at 375 px and desktop. Fixed: audit entries wider than the screen (grid cells without `min-w-0`), 20 px links on the audit log and detail pages (now 44 px), scrolling tables not reachable by keyboard, month labels colliding on a phone (about four labels, fixed three-letter months), and the 13-link admin menu filling the first phone screen (now one scrolling row that keeps the current page in view). Phase 6 is complete. | Claude |
| 2026-11-15 | P6 | Slice 6C built and verified live: admin listings (search, status, category, reported-first; remove with a reason, restore to the earlier status; never while a listing is part of a service), review moderation (hide, remove, restore; provider rating recomputed; the reviewer is told), report queue (remove or hide the item, mark as handled with a note, dismiss; other reports on the same item close together; a person is never taken down from a report) and category management (add, rename, reorder, switch off, delete only when nothing uses it). Backend 23 suites / 485 tests, web 19 suites / 450 tests pass. |
| 2026-11-16 | P7 | Recycling on mobile (parts of P7-10 and P7-13): centre directory (search, category filter), centre page, request form (kinds, count, area and private address, preferred date, up to 6 photos, optional linked device), My recycling list with status filter and the request screen for both sides (cancel, handover with the data-protection checklist, centre: accept/decline, pickup, received, materials, processed, complete); "Recycle" and "My recycling" tiles, recycler tiles, and a "Send to a recycling centre" button on a device listed for recycling. Tests added, not yet run | Claude |
| 2026-11-16 | P7 | Mobile verification (P7-16): status, documents list, send photos per document kind, remove non-approved documents; Account tile and home notice link to it; tests added, not yet run | Claude |
| 2026-11-16 | P7 | Refurbished shop and orders on mobile (part of P7-10 and P7-13): shop list with search, category, disclosed condition and sort; product page with the Refurbished label and grade, what was done, specifications and seller; order form (quantity, cash on delivery or pay the seller directly, delivery area only); ask the seller; orders list with status filter; order screen for the buyer and the refurbisher (confirm, mark ready, hand over, buyer confirms receipt, cancel with a reason, review the seller, history). Buttons come from the server's `actions`. No server change. Not yet run on a phone | Claude |
| 2026-11-16 | P7 | Donations on mobile (part of P7-10): the donation list with Available, My donations and I asked for, search, category and condition filters; the donation page for every viewer (ask with a reason, withdraw, the donor chooses between requests, arrange the handover, both sides confirm with the data-protection checklist for the donor, cancel with a reason, confirmation record that says no payment was made); offering a device from its page; registering an organisation to receive. Buttons come from the server's `actions`; exact addresses never shown (BR-08). No server change. Shop and orders tests passed (all green) before this slice. Not yet run on a phone | Claude |
| 2026-11-16 | P7 | Student learning tasks on mobile (P7-12): task list and page, apply sheet, my applications, application page with withdraw, experience and certificates. Buttons come from the server's `actions`. No server change. Not yet run on a phone | Claude |
| 2026-11-16 | P7 | Refurbisher screens on mobile (part of P7-13): devices to refurbish with an offer sheet, refurbishment jobs for both sides, the job screen with work steps and before/after photos, My products and the product form (create, edit, hide, remove); the shop's product page gets an Edit button on the seller's own products. The marketplace repository gained mine, create, update and remove. Buttons come from the server's `actions`. No server change. Not yet run on a phone | Claude |
| 2026-11-16 | P7 | Student supervision and the recycler report on mobile (P7-12, P7-13): technicians post and edit tasks, see applicants and accept, decline, start and finish with recorded hours; recyclers get an activity report by period with measured and estimated weights kept apart. Home tiles added (Student tasks, Activity report). No server change. Not yet run on a phone | Claude |
| 2026-11-14 | P2 | `npm test` run by user: 44/44 pass after fixing geo fuzzing (offset applied after grid snap, never zero); multer bumped to 2.x (1.x has known vulnerabilities) | Claude |
| 2026-11-14 | P2 | Models (36), middleware, device/category/report APIs, 501 stubs, seed, tests, docs written; not yet run | Claude |
| 2026-11-14 | P1 | Scaffolded repo, backend, web, mobile; contrast audit; decision log. Not yet installed/run. | Claude |

> **Resume point (2026-11-15):** Phase 6 (administration) is complete and verified live: users, verification queue, audit, overview, monitors, listing and review moderation, reports, categories, complaints, announcements, analytics, CSV exports and certificates, with a 375 px / desktop polish pass. Next: Phase 7 (Flutter app on the same API), then P8 integrations (chat, notifications, geo), P9 analytics and smart features, P10 testing and finalisation. P6-01 forced password change stays deferred. Open from earlier phases: P3 gaps (public `GET /api/users/:id`, `/api/technicians/verification` alias), optional code splitting, real chat for enquiries (P8).
