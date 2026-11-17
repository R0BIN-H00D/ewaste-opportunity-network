# Architecture

See `design.md` Part A for the full design. This file records **decisions** and deviations.

## Decision log
| Date | Decision | Reason |
|---|---|---|
| 2026-11-14 | Backend uses **CommonJS** | Simplest Jest/Supertest setup; no ESM interop issues |
| 2026-11-14 | Validation: **Zod** (backend + web forms) | One schema language on both sides |
| 2026-11-14 | Web state: **Redux Toolkit** | Predictable store for auth/ui/notifications (A-08) |
| 2026-11-14 | Mobile state: **Riverpod** + **go_router** | (A-08) |
| 2026-11-14 | Logging: **pino** | Structured, fast |
| 2026-11-14 | Tailwind **v3** | Stable config-file workflow; revisit v4 later |
| 2026-11-14 | Android minSdk **24** (default) | Confirm after first `flutter create` |
| 2026-11-14 | Fonts self-hosted (`@fontsource/*`; Flutter asset fonts) | No third-party CDN calls |
| 2026-11-14 | Added secondary-strong colour `#047857` | `#10B981` is only 2.37:1 on the light background; see `ASSETS.md` contrast table |
| 2026-11-14 | `authenticate` / `authorize` / `requireVerified` pulled forward into Phase 2 | Device APIs need auth; register/login still Phase 3 |
| 2026-11-14 | Listing denormalises title/brand/model/category | Browse + `$text` search without joins |
| 2026-11-14 | Uploads: multer memory + own magic-byte sniffing + storage adapter (local driver now, Cloudinary in Phase 8) | No extra dependency; real file-type check |
| 2026-11-14 | Geo filter via `$geoWithin/$centerSphere` | Combines with sort/filters and works in `countDocuments` (unlike `$near`) |
| 2026-11-14 | Public location = deterministic jitter + 2-decimal rounding | BR-08: never publish exact coordinates |
| 2026-11-14 | `lockedBy` = `{kind, refId}` | Avoid `id`/`type` naming clashes in Mongoose |
| 2026-11-14 | 501 stub routers for unbuilt modules | Visible route map; nothing silently "works"; must be gone by P10 |
| 2026-11-14 | helmet `Cross-Origin-Resource-Policy: cross-origin` | Web app on another origin must load uploaded images |

## Diagram
React Web  ─┐
            ├─► Node/Express API ─► MongoDB
Flutter App ─┘        │
                      └─► Cloudinary · FCM · Gemini(opt) · Nominatim · SMTP (all with fallbacks)

## Decision: how the Green Score and impact figures are made (2026-11-17)
The rules live in one file, `backend/src/config/impact.js`, and are served as they run by `GET /api/analytics/rules`, so the apps show exactly what the server does (P9-03). Nothing is computed on a phone or in a browser.

- **When something counts.** Only when the other side has confirmed the activity (BR-05): a repair when the customer confirms completion, a donation when the recipient confirms, a refurbished sale when the buyer confirms receipt, recycling when the centre has received it and recorded a measured weight. Each of those workflow steps calls `impactService.record()`, which writes one `EnvironmentalImpact` event and the points, once (unique indexes on the event and on the ledger line make a repeated call do nothing).
- **Points.** Repair 50 for the customer and 30 for the technician, donation 40 (donor), refurbishment 40 (seller), recycling 30 (sender), reuse 30, a review of a completed service 2 (once per transaction). Listing, browsing and unverified activity earn nothing. At most 10 scored activities per person per UTC day: later ones are recorded at 0, so they are never scored afterwards.
- **The ledger is the truth.** The score is the sum of `GreenScoreLedger` lines, one line per thing that earned or removed points, each with its rule name, so every point can be explained to the person who has it. Points are stored as they were when earned, so changing a number in the config never rewrites history.
- **Reversal.** When an administrator resolves (upholds) a complaint about a repair, order, donation or recycling request, `impactService.reverse()` marks the event reversed and adds an opposite ledger line for each person who earned from it, once. The score never goes below zero and the event drops out of every total.
- **Levels and badges** (Seed, Sprout, Sapling, Tree, Forest; seven badges) are derived from recorded events, never stored as facts, so a reversal can take a badge away.
- **Actual and estimated stay apart (BR-06).** Device counts are actual. Kilograms weighed on a scale at a recycling centre are measured. Everything else is an estimate: unweighed material and CO2e avoided come from per-category factors. Those factors are **placeholders, not sourced values** (A-11); every response says `factorsProvisional: true` and carries a plain-words `method` note, and the apps label each figure Actual, Measured or Estimate. They must be replaced with cited values (P10-12) before any public environmental claim.
- **Old data.** `node src/rebuildScore.js` gives events recorded before scoring existed the points they should have earned, and fills in missing CO2e estimates. It is safe to run again.
- **Public figures** (`/api/analytics/platform-impact`, `/rules`, platform `/monthly`) are the same for everyone, cached for a minute, and reveal nothing about individuals.

## Decision: use `material_ui` instead of `package:flutter/material.dart` (2026-11-14)
Flutter 3.50 deprecates the in-SDK Material library. The mobile app imports `package:material_ui/material_ui.dart` (migrated with `dart fix --apply --code=migrate_design_widgets`). Third-party widget packages that still import the old library may need `MaterialUiCompatibilityBridge` in `MaterialApp.builder`; add it when the first such widget (e.g. flutter_map, fl_chart) is used.

## Decision: web and app stay in step through one database and a change feed (2026-11-17)

**One store.** The website and the app are two clients of the same API and the same MongoDB database. Nothing is kept per client, so a change made on either is stored once and is what the other reads next.

**Live.** Loading a screen again used to be the only way the other client saw a change (chat and notifications aside). Now the server tells every client when something it can see has changed:

- `sockets/changeFeed.js` is a Mongoose plugin applied to every schema in `baseSchema`, so no service has to announce its own changes. After a save, an update (`updateOne`, `findOneAndUpdate`) or a delete succeeds, it sends `data:changed` with `{ resource, id, action }` and nothing else. The record is never in the event; a client fetches it again through the normal API, which applies the usual permission checks.
- Who hears it: the people the record names (every field that refers to a User, found from the schema), administrators (room `role:admin`), and everyone for records that are public in a public state (a listed device, an active product, an open donation or task, a published article, announcements, categories). A record that has just left its public state is announced too, so open lists drop it; a draft is never announced to strangers.
- Models that are not in the plugin's resource table (tokens, logs, counters, chat, which has its own events) are not announced. When the live server is not attached (tests, scripts) the plugin does nothing.
- Web: `useFetch` fetches again quietly (the old data stays on screen, a failed quiet fetch is ignored) after a short delay that gathers a burst into one fetch, when the tab is visible, and after a reconnection. `useFetch(..., { live: false })` turns it off for a page that holds typed input.
- Mobile: `liveTickProvider` goes up on the same triggers (and when the app comes back to the front); `PagedNotifier` lists and the listings list fetch again on it, and `LiveRefreshObserver` invalidates every provider that holds fetched data, so detail screens refresh without each provider asking.
- If the socket is down, nothing breaks: screens refresh when opened or pulled, as before, and catch up on reconnection.

**Checked live (2026-11-17):** a draft listing created and then edited on the website appeared and changed on a phone that was only sitting on My listings; removing it on the phone made it disappear from the open web page.

**Trade-offs.** An event can cause a refetch on screens it does not concern (the event names a resource but screens do not filter by it); the delay and the visible-tab rule keep this cheap. A list refreshed this way returns to its first page.

## Decision: a small in-process scheduler, and a grace for simultaneous refreshes (2026-11-17)
- **Scheduler.** `backend/src/jobs/scheduler.js` runs the jobs every five minutes inside the API process: no second service, no queue. A run never overlaps the one before it, and a job that fails is logged and does not stop the others. Today it has one job, pickup reminders (`reminderService`). Each reminder is claimed with one atomic update, so even two API processes would send it once. Turn it off with `SCHEDULER_ENABLED=false` (for example on all but one instance when the API is scaled out).
- **Refresh grace.** Rotating refresh tokens treat a reused token as theft. Two tabs refreshing together look the same, so for `REFRESH_GRACE_SECONDS` (10) a just-rotated token is answered with a sibling session on the same chain, at most twice. The cost is that a thief replaying a stolen token inside that window is also answered; the next replay, or any later one, ends the whole chain. Logging out never gets the grace.
- **Emails for notifications** follow a fixed list of types and the person's email preference, and link only to our own pages.
