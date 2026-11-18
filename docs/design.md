# Design Document — E-Waste-to-Opportunity Network

| | |
|---|---|
| **Document** | `docs/design.md` |
| **Version** | 1.0 |
| **Date** | 2026-11-14 |
| **Implements** | `requirements.md` (IDs referenced inline, e.g. FR-SVC-005) |
| **Parts** | **Part A** Technical design · **Part B** UI/UX design system (glassmorphism, premium graphics) |

Where this document makes a choice the SRS left open, it is marked **Decision** and can be revisited in Phase 1.

---

# PART A — TECHNICAL DESIGN

## A.1 Architecture overview

```
 ┌────────────────────────┐        ┌────────────────────────────┐
 │  React Web (Vite)      │        │  Flutter Android App       │
 │  Tailwind, Redux TK    │        │  Riverpod, Dio, FlutterMap │
 │  Leaflet, Recharts     │        │  FCM, Geolocator, Picker   │
 └───────────┬────────────┘        └─────────────┬──────────────┘
             │ HTTPS REST + Socket.IO             │ HTTPS REST + Socket.IO
             └──────────────────┬─────────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ Node.js + Express (ONE API)  │
                 │  routes → controllers →      │
                 │  services → models           │
                 │  Socket.IO server            │
                 └───┬───────────┬──────────┬───┘
                     │           │          │
                     ▼           ▼          ▼
               MongoDB       Cloudinary   External (free tiers)
              (ONE DB)       (images/     FCM · Gemini · Nominatim
                              docs)       SMTP
```

**Principles**
1. The backend is the single source of truth; both clients are thin and stateless apart from caches.
2. Business rules (status transitions, ownership, verification gating) live **only** in backend services so web and mobile cannot diverge.
3. Every external dependency sits behind an adapter with a fallback (`services/integrations/*`), so a missing key degrades gracefully (CON-12).
4. API and DB are versioned by convention (`/api`, additive changes; breaking changes need `/api/v2`).

## A.2 Backend structure and conventions

```
backend/src/
  config/        env loader (validated), db, cloudinary, firebase, cors, constants
  models/        Mongoose schemas (+ indexes, virtuals, hooks)
  routes/        thin route files: path → middleware chain → controller
  controllers/   HTTP only: parse req, call service, shape response
  services/      business logic (matching, workflow, scoring, notifications)
    integrations/  cloudinary, fcm, gemini, nominatim, mailer  (each with fallback)
  middleware/    auth, authorize(roles), ownership, validate, rateLimit, upload, error, notFound, audit
  sockets/       io bootstrap, auth handshake, chat + notification handlers
  validators/    Zod (or Joi) schemas per route
  utils/         ApiError, asyncHandler, pagination, geo, logger, dates, ids
  app.js         express app (testable without listening)
  server.js      http + socket bootstrap
```

**Response envelope (all endpoints)**
```json
{ "success": true,  "message": "OK", "data": { }, "meta": { "page": 1, "limit": 20, "total": 134, "pages": 7 } }
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "Invalid email" } ], "code": "VALIDATION_ERROR" }
```

**Middleware chain order:** `helmet → cors → rateLimit → json(limit) → mongoSanitize → requestId/logger → routes → notFound → errorHandler`.
Route chain: `authenticate → authorize(...roles) → validate(schema) → loadResource + ownership/state guard → controller`.

**Decision:** Zod for validation (shared types are possible with the web app); `express-mongo-sanitize` plus typed schemas for NoSQL-injection defence; `pino` logging; Jest + Supertest + `mongodb-memory-server` for tests.

## A.3 Data model

General rules: `timestamps: true`; `deletedAt` for soft delete; `ObjectId` refs; enums in `config/constants`; every list query is paginated and indexed.
Location format (GeoJSON): `{ type: "Point", coordinates: [lng, lat] }` with `2dsphere` index. Public/derived fields: `publicLocation` (fuzzed, rounded) vs private `location` (exact).

### A.3.1 Identity

| Collection | Key fields | Indexes / notes |
|---|---|---|
| **Users** | `name, email(unique,lowercase), phone, passwordHash, role(user|technician|refurbisher|recycler|admin), status(active|pending_verification|suspended|deleted), emailVerified, avatar{url,publicId}, lastLoginAt, failedLogins, lockUntil` | `email` unique; `role+status`; never return `passwordHash` (`select:false`) |
| **UserProfiles** | `user(ref,unique), bio, addressArea, city, state, pincode, location(Point,private), publicLocation, orgProfile{ isOrg, orgType, orgName, registrationNo, recipientVerified }, preferences{notifications,theme}[]` | `location` 2dsphere; orgProfile powers donation recipients (A-02) |
| **TechnicianProfiles** | `user, headline, experienceYears, qualifications[], specializations[], deviceCategories[ref Categories], serviceLocation(Point), serviceRadiusKm, baseRate, availability{status, weekly[]}, verification{status, reviewedBy, reviewedAt, reason}, ratingAvg, ratingCount, completedJobs, earningsTotal` | 2dsphere; `verification.status+deviceCategories`; `ratingAvg` |
| **RefurbisherProfiles** | `user, businessName, gstOrRegNo, categories[], address, location, verification{...}, ratingAvg, ratingCount` | 2dsphere |
| **RecyclingCenters** | `user, name, authorizationNo, authorizingBody, validUntil, facilityDetails, acceptedCategories[], collectionLocations[Point+label], operatingHours, verification{...}, ratingAvg, totals{actualKg, estimatedKg}` | 2dsphere; shown as "Authorized" only if `verification.status=approved` and not expired |
| **VerificationDocuments** | `owner, ownerRole, docType(id_proof|qualification|business|authorization|other), file{publicId, resourceType, deliveryType:"authenticated", bytes, mime}, status(pending|approved|rejected), reviewedBy, reason, submittedAt` | Private storage; admin access via signed URL (A.8) |
| **RefreshTokens** *(added)* | `user, tokenHash, family, device, ip, expiresAt, revokedAt, replacedBy` | TTL index on `expiresAt`; rotation + reuse detection |
| **DeviceTokens** *(added)* | `user, fcmToken(unique), platform, lastSeenAt` | prune on FCM `UNREGISTERED` |

### A.3.2 Devices and listings

| Collection | Key fields | Indexes / notes |
|---|---|---|
| **Categories** *(added)* | `name, slug, icon, group, hazardous(bool), defaultMaterialFactors{}, active, order` | `slug` unique; seeded with 15 categories |
| **Devices** | `owner, name, category(ref), brand, model, purchaseYear, ageYears, specs{}, photos[{url,publicId}], aiSuggestion{category,type,brand,visibleDamage[],confidence,confirmedByUser}, deletedAt` | `owner`; text index on `name,brand,model` |
| **DeviceListings** | `device(ref), owner, condition, description, preferredService, expectedPrice, pickupPreference, location(Point private), publicLocation, addressArea, status(draft|listed|in_service|completed|withdrawn|removed_by_admin), lockedBy{kind,refId}, viewCount, reportCount, deletedAt` | `status+preferredService+createdAt`; 2dsphere on `location`; text via device; compound filter indexes |
| **Reports** *(added)* | `reporter, targetType(listing|review|product|user), targetId, reason, details, status(open|actioned|dismissed), reviewedBy` | `targetType+targetId` |

### A.3.3 Services, quotations, pickups

| Collection | Key fields | Notes |
|---|---|---|
| **ServiceRequests** | `listing, customer, technician(nullable), mode(targeted|open), invitedTechnicians[], status, statusHistory[{status,by,at,note,photos[]}], diagnosisNotes, repairNotes[], progressPhotos[], completionPhotos[], activeQuotation(ref), pickup(ref PickupSchedules), customerConfirmedAt, reviewed(bool)` | Indexes: `customer+status`, `technician+status`, `status+createdAt`; state machine A.4.1 |
| **Quotations** | `serviceRequest, technician, version, amount, breakdown[{label,amount}], parts[], etaDays, validUntil, notes, status(submitted|accepted|rejected|expired|superseded), decidedAt` | Only one `accepted`; revised quote supersedes |
| **PickupSchedules** | `context{type,id}, requester, provider, date, timeSlot, addressArea, exactAddressShared(bool), status(requested|confirmed|rescheduled|collected|cancelled), rescheduleCount, handoverConfirmed{byOwner,byProvider}, checklistAcknowledgedAt` | See A.13 |

### A.3.4 Donation, marketplace, recycling

| Collection | Key fields | Notes |
|---|---|---|
| **Donations** | `listing, donor, status(open|requested|accepted|handover_scheduled|completed|cancelled), acceptedRequest, pickup, confirmation{refNo, issuedAt}, history[]` | |
| **DonationRequests** | `donation, requester(org user), justification, intendedUse, status(pending|accepted|rejected|withdrawn), decidedAt` | Unique `(donation, requester)` |
| **RefurbishmentJobs** *(added)* | `listing, refurbisher, offer{amount,status}, status(offered|accepted|collected|assessment|in_progress|testing|ready_to_list|listed|cancelled), beforePhotos[], afterPhotos[], workLog[], product(ref)` | |
| **MarketplaceProducts** | `seller(ref refurbisher), refurbishmentJob, title, category, brand, model, specs{}, condition, refurbishmentInfo, price, stock, photos[], status(active|sold|hidden|removed), isRefurbished:true, ratingAvg` | Text index; `category+price+status` |
| **Orders** | `product, buyer, seller, quantity, priceAtOrder, status(placed|confirmed|ready|delivered|completed|cancelled), paymentMethod(cod|offline), paymentStatus(unpaid|paid_offline|confirmed), deliveryArea, notes, statusHistory[]` | |
| **Transactions** | `type(repair|order|refurb_purchase|donation|recycling), refType, refId, payer, payee, amount, method(cod|offline), reference, status(recorded|confirmed|disputed), confirmedBy` | Records only; platform handles no money (BR-10) |
| **RecyclingRecords** | `request{...}, listing, requester, center, categories[], status, pickup, handover{byUser,byCenter,at}, receivedAt, materials[{type, actualKg, estimatedKg, measuredBy, measuredAt}], reportNotes` | `actual*` and `estimated*` always separate fields (BR-06) |

### A.3.6 Communication & trust

| Collection | Key fields |
|---|---|
| **Conversations** | `participants[2], context{type,id}, lastMessage{text,at,sender}, unread{userId:count}` — unique `(context, sortedParticipants)` |
| **Messages** | `conversation, sender, text, attachments[], readBy[{user,at}], createdAt` — index `conversation+createdAt` |
| **Notifications** | `user, type, title, body, data{type,id,deepLink}, readAt, channels{inApp,push,email}, createdAt` — index `user+readAt+createdAt`; optional TTL |
| **Reviews** | `reviewer, target(user/provider), targetRole, contextType, contextId, rating, quality, communication, timeliness, comment, status(visible|hidden|removed), reportCount` — unique `(reviewer, contextType, contextId)` |
| **Complaints** | `filedBy, against, refType, refId, subject, description, evidence[], status(open|assigned|in_review|resolved|rejected), assignedTo, resolution, history[]` |

### A.3.7 Impact, admin

| Collection | Key fields |
|---|---|
| **EnvironmentalImpact** | Event-sourced: `user, type(repair|reuse|donation|refurbishment|recycling), refType, refId, category, devices:1, materials{actual{},estimated{}}, co2eEstimate, verifiedBy, verifiedAt, month, year` — written only on verified completion; aggregates computed from it (or cached nightly) |
| **AdminLogs** | `admin, action, targetType, targetId, before, after, reason, ip, createdAt` — insert-only |
| **Announcements** *(added)* | `title, body, audience[], startsAt, endsAt, createdBy` |
| **EducationArticles** *(added)* | `title, slug, topic, body, cover, status, author` |

## A.4 State machines

All transitions are validated in `services/workflow/*`; illegal transitions return `409 INVALID_TRANSITION`. Every change appends to `statusHistory` and triggers notifications.

### A.4.1 Service request (FR-SVC-005/006)

| From | To | Actor | Guard |
|---|---|---|---|
| — | **1 Request Submitted** | Customer | Listing owned, verified provider (if targeted) |
| 1 | **2 Technician Assigned** | Technician (accept targeted) / Customer (choose quote in open mode) | Technician verified & available |
| 1 | `rejected` | Technician | Reason |
| 2 | **3 Device Collection Pending** | Technician/Customer | Pickup schedule created (or on-site flag) |
| 3 | **4 Device Collected** | Technician + customer handover confirm | Checklist acknowledged (A.13) |
| 2 or 4 | **5 Diagnosis in Progress** | Technician | |
| 5 | **6 Quotation Submitted** | Technician | Quotation created |
| 6 | **7 Customer Approval Pending** | System (auto after notify) | |
| 7 | **8 Repair in Progress** | Customer **approves** quotation | BR-02 |
| 7 | `5` (re-diagnose) or `cancelled` | Customer rejects | Reason |
| 8 | **9 Repair Completed** | Technician | Completion photos required |
| 9 | **10 Device Delivery Pending** | Technician | |
| 10 | **11 Device Delivered** | Technician + customer confirm | |
| 11 | **12 Service Completed** | Customer confirms | Triggers review unlock + impact event (BR-05) |
| any ≤ 7 | `cancelled` | Customer / Admin | |

*Free (no-cost) repairs* may skip 6–7 only if the technician declares `amount: 0` and customer acknowledges.
A revised quotation (extra damage found during repair) returns the request from 8 to 6 and pauses work.

### A.4.2 Verification
`not_submitted → pending → approved | rejected → (resubmission_required → pending)`. Approval flips profile `verification.status`, activates discovery eligibility, notifies, and logs to AdminLogs.

### A.4.3 Donation
`open → requested → accepted → handover_scheduled → completed` (+`cancelled`). Accepting one request auto-rejects the others. Completion requires both confirmations → issue `confirmation.refNo`.

### A.4.4 Recycling
`requested → accepted → pickup_scheduled → collected → received_at_center → processed → completed` (+`rejected`, `cancelled`). `received_at_center` requires center confirmation; `completed` requires recorded materials (actual and/or estimated).

### A.4.5 Refurbishment & order
Job: `offered → accepted → collected → assessment → in_progress → testing → ready_to_list → listed`.
Order: `placed → confirmed → ready → delivered → completed` (+`cancelled`); on `confirmed` decrement stock; on `completed` record offline payment.

### A.4.6 Listing
`draft → listed → in_service → completed`; `listed ⇄ withdrawn`; Admin: `→ removed_by_admin`. `in_service` is set when any workflow locks the listing (`lockedBy`); unlocked on cancel/reject.

## A.5 Matching engine (FR-MATCH-*)

Location: `services/matching/`. Pure functions + a thin DB candidate query; weights in `config/matching.js`.

**Pipeline**
1. **Hard filters (eligibility):** provider role matches preferred service; `verification=approved`; account active; accepts the device category; within `serviceRadiusKm`/search radius; availability ≠ unavailable.
2. **Score (0–100):**

| Factor | Default weight | Calculation |
|---|---:|---|
| Category/specialisation fit | 30 | exact category = 1.0; related category = 0.5 |
| Proximity | 25 | `1 − min(distanceKm / radiusKm, 1)` |
| Rating | 15 | `ratingAvg/5`, Bayesian-smoothed for low counts |
| Availability | 10 | available now = 1, limited = 0.5 |
| Condition fit | 10 | e.g., technician handles "major damage"? refurbisher prefers "working/minor" |
| Experience/completed jobs | 5 | log-scaled |
| Verification freshness | 5 | recent re-verification bonus |

3. **Sort** by score, tie-break by distance.
4. **Explain:** return `reasons[]` strings and the `breakdown` for transparency (FR-MATCH-006).
5. **Estimated charge:** technician `baseRate` adjusted by condition multiplier (documented, clearly labelled "estimate").

**Service routing:** Repair → technicians · Refurbishment/Reuse → refurbishers · Recycling → centres (accepted categories + authorised) · Donation → verified recipient orgs (need-based filter, distance).
Extensible by registering new scorers; no ML in v1.

## A.6 Environmental impact (FR-IMP-*)

### A.6.1 Events
An `EnvironmentalImpact` event is created **only** when a workflow reaches its verified terminal state:

| Activity | Verifying event |
|---|---|
| Successful repair | Customer confirms *Service Completed* |
| Donation | Recipient + donor confirm completion |
| Reuse (device sold/handed on whole) | Both parties confirm |
| Refurbishment | Order completed for product from the job |
| Authorised recycling | Verified centre confirms receipt/processing |
| Review left (verified transaction) | Review saved | 2 (max 1 per txn) |

Rules: points are idempotent per `(user, eventRef)`; reversals if a complaint is upheld; no points for listing, browsing or unverified providers; optional daily caps to prevent gaming.
Badge examples: *First Repair*, *Donor*, *Circular Champion* (≥ N activities across 3 types), *Material Saver* (verified kg).

### A.6.2 Actual vs estimated
| Metric | Source | Label in UI |
|---|---|---|
| Device counts (repaired, donated…) | Completed events | **Actual** |
| Recovered material mass | Centre-recorded `actualKg` | **Measured** |
| Material mass without measurement | Category factor × units | **Estimated** (dashed bars / "est." chip) |
| CO₂e avoided | Category factor × units | **Estimated** only |

Category factors live in `Categories.defaultMaterialFactors` as placeholders. **They must be replaced with cited values before any public environmental claim.**

### A.6.3 Analytics
Aggregation pipelines grouped by `month/year/category/type`; cached (in-memory or a `daily_stats` snapshot) for public endpoints; user-level endpoint `GET /api/analytics/user-impact`; platform `GET /api/analytics/platform-impact`; time series `GET /api/analytics/monthly`.

## A.7 Authentication & security design

| Concern | Design |
|---|---|
| Passwords | bcrypt cost 12 (env-tunable); min 8 chars, 1 letter + 1 number; compare in constant time |
| Access token | JWT HS256 (**Decision:** consider RS256 later), TTL 15 min, claims `sub, role, status, tokenVersion` |
| Refresh token | Opaque random 256-bit, stored hashed in `RefreshTokens`; TTL 7–30 days; **rotate on every use**; reuse of a rotated token revokes the whole family |
| Web storage | Access token in memory (Redux); refresh token in `httpOnly; Secure; SameSite=Lax/None` cookie; CSRF mitigated via SameSite + custom header on refresh |
| Mobile storage | `flutter_secure_storage` for both tokens; Dio interceptor refreshes on 401 once, then logs out |
| Authorisation | `authorize('technician')` role middleware + resource guards (`isOwner`, `isParticipant`, `isAssignedProvider`) + state guards |
| Status gating | Middleware rejects `suspended`/`deleted`; unverified providers blocked from provider-only actions with `403 NOT_VERIFIED` |
| Brute force | `express-rate-limit` (strict on `/auth/*`), incremental lockout after N failures |
| Reset password | Random token, hashed at rest, 30-min expiry, single use; generic responses to avoid user enumeration |
| Injection | Zod `.strict()`; `express-mongo-sanitize`; never pass raw `req.query` into Mongo filters; whitelisted sort/filter keys |
| Headers/CORS | Helmet; CORS allow-list from `CORS_ORIGINS`; `credentials:true` only for the web origin |
| Uploads | A.8 |
| Privacy | Response serializers strip `email, phone, location, passwordHash`; exact address released via `PickupSchedules.exactAddressShared` only to the assigned counterparty |
| Audit | `audit` middleware writes `AdminLogs` for every admin mutation and verification decision |
| Secrets | Env only; `.env.example` committed; `.env*` in `.gitignore`; no secrets in web bundle (only `VITE_*` public values) |

Threat checklist for Phase 10: IDOR on every `:id` route; mass assignment; role escalation on register; JWT `alg` confusion; token reuse; XSS in user content (escape/sanitise); open redirect in reset links; SSRF via image URLs (accept uploads, not arbitrary URLs); log injection.

## A.8 File uploads and storage

- `multer` memory storage → validate (MIME **and** magic bytes with `file-type`, extension allow-list, size caps) → stream to Cloudinary.
- Public images (device photos, product photos, avatars): standard delivery, folder `ewaste/{type}/{userId}`; transformations for thumbnails/WebP/`q_auto,f_auto`.
- **Private documents** (verification documents, authorisations): `type: "authenticated"` (or `private`) upload; the DB stores `publicId`; Admin/owner receives **short-lived signed URLs** from the API — never a permanent public URL.
- Limits (defaults): images ≤ 5 MB, documents ≤ 10 MB (PDF/JPG/PNG), chat attachments ≤ 5 MB; counts per request enforced.
- Dev fallback: `LocalDiskStorage` adapter writing to `backend/uploads/` (git-ignored), served only in `NODE_ENV=development` and logged as a warning. Private docs in dev are served through an authenticated route.
- Orphan cleanup job: remove Cloudinary assets whose DB references were deleted.

## A.9 Real-time chat (Socket.IO) — FR-CHAT-*

**Connection:** `io(url, { auth: { token: accessToken } })`; server middleware verifies JWT, loads user, rejects suspended users. Reconnect re-auths with a fresh token.

**Rooms:** `user:{userId}` (personal notifications) and `conv:{conversationId}` (chat). On `chat:join`, the server checks the user is in `participants` and the related request is still in a chat-allowed state.

| Event (client → server) | Payload | Behaviour |
|---|---|---|
| `chat:join` / `chat:leave` | `{conversationId}` | authorise + join room |
| `chat:message` | `{conversationId, text, attachments?, clientId}` | validate, persist, ack `{id, createdAt, clientId}`, emit to room, create notification if recipient offline |
| `chat:typing` | `{conversationId, isTyping}` | rebroadcast to room (not persisted) |
| `chat:read` | `{conversationId, upToMessageId}` | mark read, emit receipt |

| Event (server → client) | Payload |
|---|---|
| `chat:message` | message object |
| `chat:read` | `{conversationId, userId, upTo}` |
| `chat:typing` | `{conversationId, userId, isTyping}` |
| `notification:new` | notification object |
| `error:event` | `{code, message}` |

REST fallbacks: `GET /api/chat/conversations`, `GET /api/chat/conversations/:id/messages?before=`, `POST /api/chat/conversations/:id/messages`, `PUT /api/chat/conversations/:id/read`. Message sends over REST also fan out through the socket server so both clients stay in sync.

Scaling note: single Node instance in v1; if multiple instances are required later, add the Socket.IO Redis adapter (open-source). Message length ≤ 2000 chars; per-socket rate limit.

## A.10 Notifications — FR-NOTIF-*

`notificationService.notify({userIds, type, title, body, data, channels})` is the only entry point:
1. Persist `Notifications` (in-app) → emit `notification:new` to `user:{id}`.
2. If the user has device tokens and FCM is configured → send push (data payload contains `type, id, deepLink`).
3. Optional email for critical events (verification result, password reset) via Nodemailer.
4. Failures are logged and never block the originating transaction (fire-and-forget after commit).

**Type catalogue:** `service.request.new`, `service.request.accepted|rejected`, `quotation.new`, `quotation.approved|rejected`, `pickup.scheduled|rescheduled`, `device.collected`, `repair.progress`, `repair.completed`, `donation.requested|accepted`, `recycling.confirmed`, `chat.message`, `verification.updated`, `complaint.updated`, `order.updated`, `announcement`.
Deep links: `ewaste://service/{id}` (mobile), `/service-requests/{id}` (web).

## A.11 Maps and geolocation — FR-MAP-*

- **Storage/queries:** GeoJSON `Point` + `2dsphere`; nearby queries use `$geoNear` (returns `distanceMeters`) combined with eligibility filters.
- **Privacy:** private users' coordinates are *fuzzed* for public display (round to ~2 decimals ≈ 1 km and add small deterministic jitter); exact location is only used server-side for distance and released per BR-08. Providers (businesses) may display their service location.
- **Geocoding (Nominatim):** backend proxy `GET /api/geo/search?q=` and `/api/geo/reverse`; descriptive `User-Agent` + contact email from env; global throttle ≤ 1 request/second queue; cache results (in-memory/Mongo TTL); client debounce ≥ 500 ms and *search-on-submit* (no per-keystroke autocomplete). Fallback: manual lat/lng or map tap.
- **Web:** `react-leaflet` with OSM tiles, attribution shown; marker clustering for dense areas; map components lazy-loaded.
- **Mobile:** `flutter_map` + `latlong2`, OSM tile layer with proper `userAgentPackageName`; `geolocator` permission flow with a clear rationale and manual-entry fallback.
- **Tile policy:** OSM's public tile servers have usage limits; default to them for development/demo and document how to switch to a self-hosted or other free-tier-compatible tile source if traffic grows.

## A.12 AI device classification — FR-AI-*

```
upload photo → POST /api/ai/classify-device
   ├─ GEMINI_ENABLED && key present && under local quota counter?
   │     → call Gemini (vision, JSON-schema response) → sanitise → return suggestion {category,type,brand?,visibleDamage[],possibleRepairs[],confidence,source:"gemini"}
   └─ else/timeout/quota error → rule-based classifier (name/description keywords, filename, user-selected hints) → {source:"rules"}
UI: show as "Suggestion" with editable fields; user must confirm; disclaimer text.
```
Disclaimer (verbatim intent): *"This is a visual suggestion only. Internal hardware faults can't be detected from a photo."*
Never send images containing personal data intentionally; store the suggestion and the user's confirmation flag for transparency. Track a daily local counter to stay inside free quotas.

## A.13 Pickup scheduling and data-protection checklist

- `PickupSchedules` is polymorphic over `context{type: service|donation|recycling|offer, id}`.
- Flow: requester proposes `date + timeSlot` → provider confirms or proposes alternative → status `confirmed` → exact address released to the provider (BR-08) → handover.
- Reschedule allowed while status ∈ {requested, confirmed} and ≥ 2 h before slot; max 3 reschedules.
- **Handover gate:** before status `collected`, the owner must tick the checklist: back up personal data · sign out of accounts · remove locks where appropriate · remove SIM · remove memory card · securely erase personal data · confirm handover. `checklistAcknowledgedAt` is stored.
- Both parties press "Confirm handover"; the later confirmation moves the workflow forward.

## A.14 API design

**Conventions:** base `/api`; nouns plural; `GET` list supports `page, limit, sort, q` plus resource-specific filters; `PUT` for updates; `201` on create; `409` for state conflicts; `422` for validation; `429` for rate limit. All required SRS endpoints (see `requirements.md` §7.1) are implemented exactly as named.

**Additional endpoints (proposed paths)**

| Area | Endpoints |
|---|---|
| Auth extras | `POST /api/auth/refresh` · `POST /api/auth/verify-email` · `POST /api/auth/resend-verification` · `GET /api/auth/sessions` · `DELETE /api/auth/sessions/:id` |
| Technicians | `PUT /api/technicians/profile` · `PUT /api/technicians/availability` |
| Verification | `GET /api/verification/me` · `POST /api/verification/documents` (technicians, refurbishers, recyclers) |
| Requests/quotes | `GET /api/service-requests/:id/quotations` · `PUT /api/service-requests/:id/quotation/:qid/decision` · `POST /api/service-requests/:id/progress` (notes + photos) · `POST /api/service-requests/:id/confirm-completion` · `POST /api/service-requests/:id/cancel` |
| Matching | `GET /api/matching/recommendations?listingId=&service=` |
| Donations | `GET /api/donations/:id` · `PUT /api/donations/:id` · `PUT /api/donation-requests/:id/decision` · `GET /api/donations/:id/confirmation` |
| Marketplace | `PUT /api/marketplace/:id` · `DELETE /api/marketplace/:id` · `GET /api/orders` · `GET /api/orders/:id` · `PUT /api/orders/:id/status` · `POST /api/marketplace/:id/enquiry` |
| Refurbishment | `GET /api/refurbishment/opportunities` · `POST /api/refurbishment/offers` · `PUT /api/refurbishment/offers/:id/decision` · `GET /api/refurbishment/jobs` · `PUT /api/refurbishment/jobs/:id/status` · `POST /api/refurbishment/jobs/:id/photos` |
| Recycling | `GET /api/recycling-centers/:id` · `GET /api/recycling-requests/:id` · `POST /api/recycling-requests/:id/materials` · `GET /api/recycling-reports?from&to` |
| Pickup | `POST /api/pickups` · `GET /api/pickups` · `PUT /api/pickups/:id/confirm` · `PUT /api/pickups/:id/reschedule` · `PUT /api/pickups/:id/handover` |
| Chat | `GET /api/chat/conversations` · `POST /api/chat/conversations` · `GET /api/chat/conversations/:id/messages` · `POST /api/chat/conversations/:id/messages` · `PUT /api/chat/conversations/:id/read` |
| Reviews | `POST /api/reviews` · `GET /api/reviews?target=` · `POST /api/reviews/:id/report` |
| Complaints | `POST /api/complaints` · `GET /api/complaints` · `GET /api/complaints/:id` |
| Transactions | `GET /api/transactions` · `PUT /api/transactions/:id/confirm` |
| Notifications | `PUT /api/notifications/read-all` · `POST /api/notifications/device-token` · `DELETE /api/notifications/device-token` |
| Reports | `POST /api/reports` |
| Impact | `GET /api/analytics/green-score` |
| AI / Geo | `POST /api/ai/classify-device` · `GET /api/geo/search` · `GET /api/geo/reverse` |
| Education | `GET /api/education` · `GET /api/education/:slug` |
| Admin | `PUT /api/admin/users/:id/status` · `GET /api/admin/users/:id` · `GET/POST/PUT /api/admin/categories` · `GET /api/admin/listings` · `DELETE /api/admin/listings/:id` · `GET /api/admin/reports` · `PUT /api/admin/reports/:id` · `GET/PUT /api/admin/complaints/:id` · `GET /api/admin/reviews` · `PUT /api/admin/reviews/:id` · `GET/POST/PUT/DELETE /api/admin/announcements` · `GET /api/admin/audit-logs` · `GET /api/admin/reports/export` · `GET/POST/PUT /api/admin/education` |
| Ops | `GET /api/health` |

Auto-generated OpenAPI is optional; `docs/API_DOCUMENTATION.md` must list each endpoint with auth, roles, request/response, errors.

## A.15 Client architecture

### Web (React + Vite)
```
web/src/
  assets/ components/{ui,glass,charts,forms,maps,layout} pages/{public,dashboard,admin,...}
  layouts/{PublicLayout,DashboardLayout,AdminLayout} hooks/ services/(axios + api modules)
  store/(Redux Toolkit: auth, ui, notifications; RTK Query optional) routes/(guards) utils/
```
**Decision:** Redux Toolkit (+ RTK Query for server cache). Route guards: `RequireAuth`, `RequireRole(roles)`, `RequireVerified`. Axios instance with interceptor for silent refresh; socket client singleton hooking into the store. Forms: React Hook Form + Zod resolver (same rules as backend where possible). Code-split by route; Leaflet and Recharts lazy-loaded.

### Mobile (Flutter)
```
mobile/lib/
  core/(theme, constants, di, router, utils) models/ providers/(Riverpod) services/(dio api, socket, fcm, storage, location)
  screens/ widgets/(glass, buttons, cards, skeletons) routes/
```
**Decision:** Riverpod + `go_router`. Dio with auth interceptor (secure storage, single-flight refresh). Offline cache with Hive or `shared_preferences` (read-only snapshots of listings, requests, notifications). `socket_io_client` for chat. FCM via `firebase_messaging`; local fallback when Firebase config absent.

## A.16 Configuration (env vars)

**backend/.env.example**
```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ewaste
CLIENT_WEB_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
REFRESH_TTL_DAYS=14
BCRYPT_COST=12
CLOUDINARY_CLOUD_NAME=  CLOUDINARY_API_KEY=  CLOUDINARY_API_SECRET=
STORAGE_DRIVER=cloudinary|local
FIREBASE_SERVICE_ACCOUNT_PATH=   # or *_JSON; empty = push disabled
GEMINI_ENABLED=false  GEMINI_API_KEY=  GEMINI_DAILY_LIMIT=
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= MAIL_FROM=   # empty = log emails to console
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=EWasteOpportunityNetwork/1.0
NOMINATIM_CONTACT_EMAIL=
RATE_LIMIT_WINDOW_MS=900000  RATE_LIMIT_MAX=300  AUTH_RATE_LIMIT_MAX=20
ADMIN_SEED_EMAIL=  ADMIN_SEED_PASSWORD=
```
**web/.env.example:** `VITE_API_BASE_URL`, `VITE_SOCKET_URL`.
**mobile:** `--dart-define=API_BASE_URL=... --dart-define=SOCKET_URL=...`; Firebase via `google-services.json` (git-ignored).

## A.17 Deployment and operations

- Containers optional; run scripts: `npm run dev|start|seed|test` (backend), `npm run dev|build|test` (web), `flutter run|test|build apk` (mobile).
- Free-tier hosting choices must be verified at deployment time (CON-10); document the chosen host, its sleep/cold-start behaviour and Socket.IO support in `SETUP_GUIDE.md`.
- Health check, structured logs, `trust proxy` configured, HTTPS enforced, Mongo Atlas IP allow-list, backups via Atlas (if available on the free tier) or documented manual export.
- Release checklist: env audit, secrets rotation, seed admin password changed, rate limits tuned, CORS locked, debug routes removed.

---

# PART B — UI/UX DESIGN SYSTEM

## B.1 Design intent
*Sophisticated, futuristic, minimal, premium sustainability technology.* A calm green-tinted canvas, frosted glass layers, tasteful 3D-style illustration, and restrained motion. The web and Flutter apps share one visual language (NFR-UX-07).

**Do:** clear hierarchy · generous whitespace · glass only where it adds depth (nav, stat cards, modals, filters) · consistent radii and spacing · meaningful motion.
**Don't:** Bootstrap-style grids of identical white cards · full-page blur · neon overload · more than ~3 blurred layers stacked · decorative animation that delays tasks.

## B.2 Colour tokens

### B.2.1 Palette
| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-primary` | `#14532D` | `#34D399`* | Primary actions, headings accents |
| `--c-secondary` | `#10B981` | `#10B981` | Decorative fills, glows, dark-mode icons/charts |
| `--c-secondary-strong` | `#047857` | `#10B981` | Meaningful icons, borders, chart strokes on light backgrounds |
| `--c-accent` | `#A3E635` | `#A3E635` | Glows, badges, chart accent (decorative) |
| `--c-bg` | `#F5F8F5` | `#0B1712` | App background |
| `--c-glass` | `rgba(255,255,255,0.65)` | `rgba(20,35,28,0.70)` | Glass surfaces |
| `--c-glass-border` | `rgba(255,255,255,0.45)` | `rgba(255,255,255,0.10)` | Glass edges |
| `--c-text` | `#1F2937` | `#E8F1EB` | Primary text |
| `--c-text-muted` | `#6B7280` | `#9FB2A7` | Secondary text |
| `--c-surface-solid` | `#FFFFFF` | `#12241C` | Solid cards, popovers, tables |
| Semantic | success `#16A34A` · warning `#D97706` · danger `#DC2626` · info `#0284C7` | adjusted for dark | Status chips, validation |

\* Dark-mode primary is a lighter tint of the brand green so it stays legible on `#0B1712`; the SRS lists only the dark background/glass values, so the other dark tokens are design proposals.

### B.2.2 Contrast rules (verify with a checker during Phase 1)
- `#14532D` on white/light glass ≈ very high contrast → use for **buttons with white text** and headings.
- `#10B981` has **2.54:1 with white text and only 2.37:1 on the light background** (measured; see `ASSETS.md`) → it fails even the 3:1 bar for UI components on light surfaces. On light backgrounds use `--c-secondary-strong` `#047857` for meaningful icons, borders and chart strokes; keep `#10B981` for decorative fills, glows and dark mode (7.23:1 on `#0B1712`). Never use it as a white-text button fill.
- `#A3E635` is decorative/large-text only on dark green; never as text on light backgrounds.
- `#6B7280` on white meets AA for normal text; on translucent glass over gradients re-check, or use `--c-text` for essential copy.
- Glass over busy imagery gets a minimum solid tint (≥ 0.65 alpha) behind text.

### B.2.3 Gradients and glow
```
--grad-hero:    radial-gradient(60% 60% at 20% 10%, rgba(16,185,129,.25), transparent 60%),
                radial-gradient(50% 50% at 85% 20%, rgba(163,230,53,.20), transparent 60%),
                linear-gradient(180deg, #F5F8F5 0%, #EAF3EC 100%);
--grad-primary: linear-gradient(135deg, #14532D 0%, #166534 55%, #10B981 120%);
--glow-accent:  0 0 40px rgba(163,230,53,.35);
--glow-emerald: 0 0 60px rgba(16,185,129,.30);
```
Keep gradients soft and low-contrast; at most one hero gradient per view.

## B.3 Glassmorphism system

### B.3.1 CSS tokens and utilities (web)
```css
:root{
  --glass-bg: rgba(255,255,255,.65);
  --glass-border: rgba(255,255,255,.45);
  --glass-blur: 16px;
  --glass-shadow: 0 8px 32px rgba(20,83,45,.10);
  --radius-sm:10px; --radius-md:16px; --radius-lg:24px; --radius-xl:32px;
}
.dark{
  --glass-bg: rgba(20,35,28,.70);
  --glass-border: rgba(255,255,255,.10);
  --glass-shadow: 0 8px 32px rgba(0,0,0,.40);
}
.glass{
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow), inset 0 1px 0 rgba(255,255,255,.35);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
          backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  border-radius: var(--radius-lg);
}
@supports not (backdrop-filter: blur(1px)){ .glass{ background: var(--c-surface-solid); } }
@media (prefers-reduced-transparency: reduce){ .glass{ background: var(--c-surface-solid); backdrop-filter:none; } }
```
Tailwind: expose as `glass`, `glass-strong` (blur 24px, alpha .80 for modals), `glass-subtle` (blur 8px for list rows) via `@layer components`, and map tokens in `tailwind.config.js` (`colors`, `borderRadius`, `boxShadow`, `fontFamily`).

### B.3.2 Layering model
| Layer | Content | Treatment |
|---|---|---|
| L0 | Page background | `--c-bg` + hero gradient + blurred blobs (static) |
| L1 | Content canvas | Solid or `glass-subtle` sections |
| L2 | Cards, stat widgets, filters | `glass` |
| L3 | Floating nav, sidebar, bottom nav | `glass-strong` + shadow |
| L4 | Modals, sheets, popovers | `glass-strong` over scrim `rgba(11,23,18,.45)` |

Limit simultaneous blurred elements; never blur large scrolling lists (use solid rows).

## B.4 Typography

| Role | Font | Weights | Notes |
|---|---|---|---|
| Display / headings | **Plus Jakarta Sans** | 600–800 | Tight tracking (-0.02em) at large sizes |
| Body / UI | **Inter** | 400–600 | Default font |
| Numerals / stat figures | **Manrope** | 600–800 | Tabular figures for stats and prices |

Self-host fonts (via `@fontsource/*` on web; bundled assets in Flutter) so there are no runtime calls to third-party font CDNs and offline use works.

| Token | Web size / line | Use |
|---|---|---|
| display | clamp(2.5rem, 5vw, 4.25rem) / 1.05 | Hero headline |
| h1 | 2.25rem / 1.15 | Page titles |
| h2 | 1.75rem / 1.2 | Section titles |
| h3 | 1.25rem / 1.3 | Card titles |
| body | 1rem / 1.6 | Paragraph |
| small | 0.875rem / 1.5 | Meta, captions |
| micro | 0.75rem / 1.4 | Chips, labels |

Flutter `TextTheme` mirrors these values (`displayLarge` ≈ 56, `headlineLarge` 36, `headlineMedium` 28, `titleLarge` 20, `bodyLarge` 16, `bodyMedium` 14, `labelSmall` 12).

## B.5 Spacing, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96. Grid: 12 columns web (max width 1280); 4/8 dp rhythm on mobile.
- Radii: inputs 12 · buttons 12–9999 (primary pill) · cards 24 · modals 28–32 · chips 9999.
- Elevation: `e1` (cards) `0 4px 16px rgba(20,83,45,.08)`, `e2` (floating nav) `0 8px 32px rgba(20,83,45,.12)`, `e3` (modals) `0 24px 64px rgba(0,0,0,.20)`. Avoid stacking more than two shadows.

## B.6 Iconography
- Web: **Lucide React**; 20 px default, 24 px in nav, stroke 1.75.
- Flutter: **Lucide icon package** (e.g., `lucide_icons`) so web and mobile share the same glyph set. Icon size tokens: 16/20/24/32.
- Category icons map one-to-one to the 15 device categories (laptop, monitor, smartphone, tablet, tv, keyboard, mouse, printer, plug, battery, cable/accessories, cpu/circuit, hard-drive/components, box).

## B.7 Graphics and illustration

**Goal:** a cohesive set of premium 3D-style visuals — no generic low-quality stock imagery.

| Asset | Where | Approach |
|---|---|---|
| 3D recycling symbol + floating devices (laptop, phone, circuit board, battery) | Landing hero | Pre-rendered **WebP/AVIF** 3D-style renders with transparent PNG/WebP layers for parallax; static fallback |
| Isometric electronic components | How It Works, repair services | Custom SVG isometric set in one palette |
| Circular-economy loop illustration | Impact, About | SVG with animated stroke-dash path |
| Abstract environmental backgrounds | Hero, dashboards, auth pages | Blurred gradient blobs (CSS) + subtle noise overlay |
| Onboarding illustrations (3–4) | Flutter onboarding | Same 3D-style set exported at @2x/@3x WebP |
| Empty states | Lists, chat, notifications | Small isometric SVG + helpful copy + CTA |
| Role illustrations | Registration, role selection | One illustration per role |

**Sourcing rule (free policy applies to assets too):** create assets in-house (SVG/CSS/WebGL) or use assets with a licence that permits commercial use and record the licence in `docs/ASSETS.md`. Do not use copyrighted brand characters or logos. Optional interactive 3D (e.g., a lightweight WebGL scene) must be lazy-loaded, capped to the hero, auto-disabled for `prefers-reduced-motion`, on low-power devices and on mobile web, with the static render as default.

Optimisation: WebP/AVIF with `srcset`, explicit `width/height` (no layout shift), `loading="lazy"` below the fold, `fetchpriority="high"` for the hero image, ≤ 200 KB per hero layer, SVGs optimised.

## B.8 Motion

| Token | Value |
|---|---|
| `dur-fast` | 120 ms (press, hover) |
| `dur-base` | 220 ms (cards, dropdowns) |
| `dur-slow` | 400 ms (modals, page transitions) |
| `ease-standard` | `cubic-bezier(.2,.8,.2,1)` |
| `ease-emphasized` | `cubic-bezier(.3,0,0,1)` |

| Interaction | Web (Framer Motion) | Flutter (native) |
|---|---|---|
| Page transition | `AnimatePresence`, fade + 8 px translate | `PageRouteBuilder` + `FadeTransition`/`SlideTransition` |
| Card hover | `whileHover={{ y:-4 }}`, shadow increase | `InkWell` + `AnimatedContainer` elevation |
| Button press | `whileTap={{ scale:.97 }}` | `AnimatedScale` |
| Section reveal | `whileInView` fade-up, `once:true` | `AnimatedOpacity` / `TweenAnimationBuilder` on scroll threshold |
| Floating illustrations | Looping `y: [0,-12,0]`, 6–8 s, transform-only | `AnimationController` repeat/reverse |
| Animated statistics | Count-up on first view (≤ 1.2 s) | `TweenAnimationBuilder<int>` |
| Skeleton | Shimmer gradient | `ShaderMask` shimmer (custom, no extra package required) |
| Modals/sheets | Scale .96→1 + fade | `showModalBottomSheet` with custom transition |
| Progress/timeline | Width/stroke animation | `LinearProgressIndicator`/`CustomPainter` |

Rules: animate `transform` and `opacity` only; no layout-thrashing; no more than one looping animation in the viewport at a time; wrap with `useReducedMotion()` and `MediaQuery.of(context).disableAnimations`; never block interaction while animating.

## B.9 Component library

Build once, reuse everywhere (web: `components/ui`, `components/glass`; Flutter: `widgets/`).

| Component | Spec |
|---|---|
| **Button** | Variants: primary (deep green, white text), secondary (glass), ghost, danger. Sizes sm/md/lg. States: hover, active, focus ring (2 px emerald + offset), disabled, loading (spinner). Min tap target 44 px. |
| **GlassCard** | Radius 24, padding 20–24, optional header/actions, hover lift. |
| **StatCard** | Icon chip, Manrope number with count-up, label, delta chip, optional sparkline; actual vs estimate badge. |
| **Input / Select / Textarea / Dropzone** | Radius 12, glass-subtle fill, label above, helper text, error state (red border + icon + message), success state. Image dropzone with previews, reorder, remove, progress. |
| **Form wizard** | "List Your Device" as a 4-step stepper: Device → Condition & Photos → Service & Location → Review (with checklist). |
| **StatusBadge / Timeline** | Colour-coded chips per status; vertical timeline for the 12-step repair flow with timestamps, actor, notes, photos. |
| **Navbar** | Floating glass bar (top, centred, max-width 1200, 16 px from the top), logo, links, theme toggle, notifications bell, avatar menu; collapses to a sheet on mobile web. |
| **Sidebar** | Glass, collapsible, role-aware items with icons and active pill; bottom profile card. |
| **Data table** | Solid surface rows for performance, sticky header, sort, filter chips, pagination, row actions, bulk actions (admin), responsive card mode on mobile. |
| **ProviderCard** | Avatar, verified badge, rating stars, specialisation chips, distance, estimated charge, availability dot, CTA "Request service". |
| **ProductCard** | Large image, "Refurbished" label, condition chip, price in Manrope, seller, hover zoom. |
| **Map panel** | Leaflet/Flutter Map inside rounded glass frame; list ↔ map sync; selected marker highlight; attribution visible. |
| **Chart wrappers** | Recharts themed with brand palette; tooltips as glass; estimate series use dashed/hatched styling and "Estimated" legend entry. |
| **Modal / Drawer / Sheet** | `glass-strong`, scrim, focus trap, ESC to close, scroll lock, return-focus. |
| **Toast / Alert / Banner** | Success/warn/error/info; announcement banner for admin messages. |
| **Skeletons / EmptyState / ErrorState** | One per list/card/dashboard; error state with retry. |
| **Chat** | Conversation list + thread; bubble styles (own = deep green tint, other = glass), timestamps, read ticks, typing indicator, attachment preview. |
| **Checklist modal** | Data-protection checklist with required ticks before handover confirm. |

## B.10 Page-level design (web)

### Public
- **Landing:** full-bleed hero (`--grad-hero`) with floating glass navbar; left: eyebrow chip, display headline *"Give Your Electronics a Second Life."*, supporting text *"Transform electronic waste into opportunities through repair, reuse, donation and responsible recycling."*, CTAs **List Your E-Waste** (primary) and **Browse the marketplace** (secondary glass); right: large 3D recycling illustration with 3–4 floating glass device cards (e.g., "Laptop · Repair", "Phone · Donate") and soft lime glow. Below: trust strip (counts), How It Works (4 steps, isometric icons), Device Categories grid (15), Repair Services, Donation Marketplace preview, Refurbished Products carousel, Recycling Partners, Impact statistics (animated), Featured Technicians, Testimonials, FAQ accordion, premium footer with newsletter/contact.
- **Browse/Find/Marketplace pages:** left glass filter panel (collapsible drawer on mobile), results grid/list toggle, map toggle, sort, pagination, skeletons.
- **Device details:** gallery with zoom, glass spec panel, condition, preferred service, location (approximate) map, action rail (Request / Offer / Chat), report link.
- **Auth pages:** split layout — glass form card over an abstract green background with illustration; role selection cards on registration; password strength meter; clear validation.
- **Impact page:** hero numbers, charts (monthly/yearly, category, materials with actual-vs-estimated styling), methodology note.
- **Education:** article cards with cover art; reading view with table of contents; "Data security before handover" featured.

### Dashboards (shared shell)
Glass sidebar + top bar (search, notifications, theme, avatar). Content: greeting + quick actions → row of 4 StatCards → main chart/timeline → tables/cards. Role-specific content:

| Role | Primary widgets |
|---|---|
| User | My listings, active requests with timeline, quotations awaiting decision, recent notifications, recommended providers |
| Technician | Verification banner, nearby requests (map + list), quotations sent, active jobs board (Kanban by status), earnings chart, ratings |
| Refurbisher | Reusable device feed, offers, jobs pipeline with before/after photo uploader, product listings, orders |
| Recycling Center | Collection requests, schedule calendar, receipt confirmations, material recording form, report builder |
| Admin | KPI tiles, verification queue (priority), reported items, complaints, growth/impact charts, audit log feed |

### Admin specifics
Dense but calm: solid-surface tables for performance, glass only for tiles and panels. Document viewer opens signed URLs in a modal (image/PDF preview) with Approve / Reject (reason required). Destructive actions need confirm dialogs and write audit entries.

## B.11 Mobile design (Flutter)

- **Navigation:** floating, frosted glass bottom bar (pill, 16 dp margins, `BackdropFilter` blur 16), 4–5 role-aware tabs (Home · Discover · [＋ List] · Requests · Profile) with a prominent centre action; secondary items in the profile/drawer. Back gestures and shared-axis transitions.
- **Onboarding:** 3–4 full-bleed illustrated pages with parallax and a "Get started" CTA; skip option; shown once.
- **Home:** greeting, quick-action grid (List device, Find technician, Recycle, Donate), active request carousel, nearby providers, impact snapshot.
- **List device:** camera-first flow (take/choose photos → AI suggestion (optional, editable) → details → service → location (map pin/GPS/manual) → checklist → submit).
- **Discovery:** map + draggable bottom sheet list; chips for filters.
- **Request tracking:** vertical timeline with status icons, photo carousel, sticky action bar (Approve quote / Confirm completion / Chat).
- **Chat:** native-feeling bubbles, input with attach/camera, keyboard-aware layout, unread badges.
- **Theme:** `ThemeData` built from the same tokens (`ColorScheme.fromSeed` is *not* used; define the scheme explicitly), light and dark `ThemeExtension<GlassTheme>` providing blur, alpha, border; `GlassContainer` widget reused everywhere (use `RepaintBoundary` to isolate blur).
- **Android specifics:** edge-to-edge, transparent status bar, adaptive layout via `LayoutBuilder` (phone/large/tablet), safe areas, large-text support up to 1.3× without overflow.
- **Performance:** limit `BackdropFilter` to nav, sheets and 1–2 hero cards per screen; `const` constructors; `ListView.builder`; cached images with placeholders; avoid rebuilding blur layers during scroll (blur static headers only).
- **Offline:** show last cached lists with an "Offline · last updated" banner; disable write actions that need the network, with clear messaging.

## B.12 Accessibility

- Contrast per B.2.2; focus indicators on every interactive element; logical tab order; skip-to-content link.
- Semantic landmarks (`header, nav, main, footer`), headings in order; ARIA only where native semantics are insufficient.
- Forms: visible labels, `aria-describedby` for errors, error summary on submit, no colour-only status (icon + text).
- Maps and charts: provide a text/table alternative.
- Touch targets ≥ 44×44 px (web) / 48×48 dp (Flutter); Flutter `Semantics` labels for icon buttons and images.
- Reduced motion, reduced transparency fallbacks (B.3.1), 200% zoom and 1.3× text scale without breaking layouts.
- Language: English default; copy written at an accessible reading level; avoid jargon in safety instructions.

## B.13 Performance budget

| Area | Budget |
|---|---|
| Web initial JS (landing, gzip) | ≤ 200 KB |
| Hero imagery | ≤ 400 KB total, AVIF/WebP |
| LCP (mobile profile) | ≤ 2.5 s on a typical connection |
| CLS | ≤ 0.1 |
| Blur layers in viewport | ≤ 3 |
| Animations | transform/opacity only; ≤ 1 looping animation at once |
| Flutter frame time | ≤ 16 ms typical; profile on a mid-range Android device |

## B.14 Web ↔ Mobile parity map

| Concept | Web | Flutter |
|---|---|---|
| Theme tokens | CSS variables + Tailwind config | `AppColors`, `AppSpacing`, `GlassTheme` extension |
| Glass surface | `.glass` utility | `GlassContainer` widget |
| Icons | Lucide React | Lucide package for Flutter |
| Fonts | `@fontsource` Plus Jakarta Sans / Inter / Manrope | bundled font assets, same families |
| Charts | Recharts | `fl_chart` (open-source) styled to the same palette |
| Maps | react-leaflet + OSM | flutter_map + OSM |
| Motion | Framer Motion | Implicit/explicit animations |
| Navigation | Floating glass navbar + sidebar | Floating glass bottom bar |
| Skeleton | CSS shimmer | Custom shimmer shader |
| Status colours/labels | Shared constants file mirrored in `mobile/lib/core/constants` | same strings & colours |

Design tokens are authored once in `docs/tokens.json` (optional) and mirrored into Tailwind and Dart constants to prevent drift.
