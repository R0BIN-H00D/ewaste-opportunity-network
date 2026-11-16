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

## Decision: use `material_ui` instead of `package:flutter/material.dart` (2026-11-14)
Flutter 3.50 deprecates the in-SDK Material library. The mobile app imports `package:material_ui/material_ui.dart` (migrated with `dart fix --apply --code=migrate_design_widgets`). Third-party widget packages that still import the old library may need `MaterialUiCompatibilityBridge` in `MaterialApp.builder`; add it when the first such widget (e.g. flutter_map, fl_chart) is used.
