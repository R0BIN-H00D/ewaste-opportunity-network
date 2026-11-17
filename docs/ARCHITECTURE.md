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
