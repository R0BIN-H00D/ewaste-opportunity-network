# API Documentation

Base URL: `/api`. Envelope: `{ success, message, data, meta? }`; errors `{ success:false, message, code, errors? }`.

## System
### GET /api/health
Auth: none. Returns service status.
```json
{ "success": true, "message": "OK", "data": { "status": "ok", "uptime": 12.3, "env": "development", "db": "disconnected" } }
```
`db` is one of `disconnected | connected | connecting | disconnecting`.

## Authentication
Tokens: a short-lived **access token** (JWT, `Authorization: Bearer …`) and a rotating opaque **refresh token** (stored hashed; reuse of a rotated token revokes the whole session chain → `401 TOKEN_REUSED`).
- **Web** gets the refresh token only as an `httpOnly` cookie (`ewaste_rt`, path `/api/auth`). Calling `refresh`/`logout` with the cookie needs the header `X-Requested-With: ewaste-web` (else `403 CSRF_BLOCKED`). Send requests with credentials.
- **Mobile** sends header `X-Client-Type: mobile` and receives `refreshToken` in the JSON body; it sends it back as `{ "refreshToken": "…" }`.
- Session response: `data: { user, accessToken, expiresIn (seconds), refreshToken? }`.
- Passwords: 8-72 chars, at least one letter and one number. Unknown body fields → 422.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/register` | – | `{ name, email, password, role? (user\|technician\|student\|refurbisher\|recycler), phone?, organizationName? }` (`organizationName` required for refurbisher/recycler). Provider roles start as `pending_verification`. `201` + session. `409 EMAIL_TAKEN`. |
| `POST /api/auth/login` | – | `{ email, password }`. Same `401` for wrong password and unknown email. 5 failures → `429 ACCOUNT_LOCKED` for 15 min. Suspended → `403 ACCOUNT_SUSPENDED`. |
| `POST /api/auth/refresh` | cookie or body | Rotates the refresh token. `401` invalid/expired, `401 TOKEN_REUSED`. |
| `POST /api/auth/logout` | cookie or body | Idempotent; revokes that session chain. |
| `POST /api/auth/logout-all` | Bearer | Ends every session and invalidates all access tokens. |
| `POST /api/auth/forgot-password` | – | `{ email }`. Always `200` (no email enumeration). Emails a 1-hour single-use link. |
| `POST /api/auth/reset-password` | – | `{ token, password }`. `400` invalid/expired/used. Ends all sessions. |
| `POST /api/auth/verify-email` | – | `{ token }` (48 h link). `400` invalid/expired/used. |
| `POST /api/auth/resend-verification` | Bearer | `409 ALREADY_VERIFIED`. |
| `POST /api/auth/change-password` | Bearer | `{ currentPassword, newPassword }`. Signs other devices out; returns a fresh session. |
| `GET /api/auth/me` | Bearer | `{ user, profile, roleProfile?, verification? }` (owner view). |
| `GET /api/auth/sessions` | Bearer | Active sessions (no secrets). |
| `DELETE /api/auth/sessions/:id` | Bearer | Revoke one session (own only, else 404). |

In development without SMTP configured, verification/reset emails are printed in the server log.

## Users and profiles (all Bearer)
| Endpoint | Notes |
|---|---|
| `PATCH /api/users/me` | `{ name?, phone? (null clears) }`. Role/status/email cannot be changed. |
| `GET /api/users/me/profile` · `PATCH /api/users/me/profile` | `bio, addressLine, addressArea, city, state, pincode, location {lat,lng} \| null, orgProfile {isOrg, orgType, orgName, registrationNo}, preferences {emailNotifications, pushNotifications, theme}`. Nested objects merge. Exact `location` is owner-only; a fuzzed `publicLocation` is derived. |
| `POST /api/users/me/avatar` · `DELETE /api/users/me/avatar` | multipart field `avatar` (one JPEG/PNG/WebP ≤ 5 MB, verified by magic bytes). |
| `GET /api/users/me/role-profile` · `PATCH /api/users/me/role-profile` | Technician / student / refurbisher / recycler only (`404` otherwise). Body fields depend on the role; verification, ratings and earnings cannot be set (→ 422). |
| `DELETE /api/users/me` | `{ password }`. Wipes personal data, ends sessions, frees the email. |

## Verification (provider roles only, all Bearer)
| Endpoint | Notes |
|---|---|
| `GET /api/verification/status` | `{ status, reason?, reviewedAt?, allowedDocTypes, documents[] }`. Document file locations are never exposed. |
| `POST /api/verification/documents` | multipart: `docType` + up to 3 files in `documents` (JPEG/PNG/WebP/PDF ≤ 10 MB). Allowed types per role (technician: id_proof, qualification, other; student: student_id, id_proof, other; refurbisher: business, id_proof, authorization, other; recycler: authorization, business, id_proof, other). Max 10 stored documents. Moves `not_submitted/rejected/resubmission_required` → `pending`. |
| `DELETE /api/verification/documents/:id` | Own pending/rejected documents. `409 DOC_APPROVED`. |

## Categories
### GET /api/categories
Public. Active device categories (`name, slug, icon, hazardous, group`), cached 5 min.

## Devices (listings)
A listing = one `Device` (facts + photos) + one `DeviceListing` (service offer). Create/update accept **multipart/form-data** (`photos` = up to 6 images, ≤ 5 MB each, JPEG/PNG/WebP, verified by magic bytes) or JSON (no photos).

### POST /api/devices
Auth: `user | technician | refurbisher`. Fields: `name`*, `category`* (id or slug), `condition`* (`fully_working|minor_damage|major_damage|not_working|for_spare_parts`), `preferredService`* (`repair|reuse|donation|refurbishment|recycling`), `brand`, `model`, `purchaseYear`, `description`, `expectedPrice`, `pickupPreference` (`pickup|drop_off|either`), `addressArea`, `city`, `lat`+`lng` (together), `status` (`draft|listed`, default `listed`). Unknown fields → 422. A published (`listed`) listing needs ≥ 1 photo; drafts don't.
→ `201` listing (owner view incl. exact `location`).

Optional `aiSuggestion` (create only): a JSON string `{ source: 'gemini'|'rules', category?, type?, brand?, visibleDamage[], possibleRepairs[], confidence? }` — what the person accepted from `/api/ai/classify`. It is stored on the device with `confirmedByUser: true` (the server sets that; a client-sent `confirmedByUser` is refused). Malformed → 422.

### POST /api/ai/classify
Auth: `user | technician | refurbisher`. Multipart: optional `photo` (one image, ≤ 5 MB, magic-byte checked), optional `title` (≤ 120), `description` (≤ 2000). Nothing is saved. Per-person limit of 20 a window (`429 RATE_LIMITED`).
→ `200` `{ source: 'gemini'|'rules', category: { _id, name, slug }|null, deviceType, brand, visibleDamage[], possibleRepairs[], confidence (0..1), usedPhoto, fallbackReason: null|'not_configured'|'no_photo'|'quota'|'unavailable', disclaimer }`.
Gemini reads the photo only when `GEMINI_ENABLED=true`, `GEMINI_API_KEY` is set, a photo was sent and today's `GEMINI_DAILY_LIMIT` is not used up (counted per UTC day in the database, safe across servers). In every other case, or if Gemini times out (8 s), is refused or answers badly, the rule-based classifier answers from the title and description (FR-AI-004): keyword → category, brand, damage the text mentions, what to look at; its confidence never exceeds 0.8. The key is sent in a header, never the URL. The photo leaves the platform only on this explicit request. `GEMINI_MODEL` (default `gemini-2.0-flash`) is configurable because models are retired (A-10). The disclaimer says a photo cannot show internal damage (FR-AI-003).

### GET /api/devices
Public (auth optional). Query: `page, limit(≤100, default 12), q (text search), category, condition, service, city, minPrice, maxPrice, lat+lng+radiusKm (default 25), sort (newest|oldest|price_asc|price_desc|relevance), mine=true (auth), status (with mine or admin)`. Unknown/operator params → 422.
→ `200` `data: [listing]`, `meta: {page, limit, total, pages}`. Non-owners never receive exact `location`, `lockedBy`, `reportCount`; `owner` is `{_id, name, avatar}` only.

### GET /api/devices/:id
Live listings are public; drafts/withdrawn/etc. only to owner/admin (others get 404). Increments `viewCount` for non-owners.

### PUT /api/devices/:id
Owner or admin. Same fields as create (all optional) + `removePhotoIds` (JSON array of photo `publicId`s) and `status` (`draft|listed|withdrawn`, legal transitions only → else `409 INVALID_TRANSITION`). `409 LISTING_LOCKED` while `in_service` (BR-03); `403` for non-owners.

### DELETE /api/devices/:id
Owner or admin. Soft delete (`409 LISTING_LOCKED` while in service).

## Contact
### POST /api/contact
Public, rate limited (5 per 15 min per IP by default, `CONTACT_RATE_LIMIT_MAX`). `{ name, email, subject, message }` (message 10–2000 chars; unknown fields → 422). Delivered by email to `SUPPORT_EMAIL` with the sender as reply-to (printed in the backend log when SMTP is not configured). Nothing is stored. → `200 { received: true }`.

## Reports
### POST /api/reports
Auth. `{ targetType: listing|review|product|user, targetId, reason: spam|inappropriate|fraud|unsafe|wrong_category|other, details? }` → `201`. `400` own content, `404` missing target, `409 ALREADY_REPORTED`.

## Technicians and matching
### GET /api/technicians
Public. Only admin-approved, active technicians. Query: `q, category (id or slug), city, minRating, available=true, lat+lng[+radiusKm] (adds distanceKm and sorts by distance), sort=rating|experience|newest|distance, page, limit`. Never returns exact location, earnings or contact details.
### GET /api/technicians/nearby
Same as above with `lat` and `lng` required.
### GET /api/technicians/:id
Public profile of one approved technician; `404` otherwise.
### PUT /api/technicians/availability
Technician. `{ status: available|limited|unavailable }`. Unavailable technicians are not suggested.
### GET /api/matching/recommendations?listingId=
Auth, listing owner only (others get `404`). Ranked technicians: `{ technician, score, breakdown[], reasons[], estimatedCharge? }`. Hard filters: approved, active account, available, accepts the device category, inside their own service radius, not the owner. Weights live in `backend/src/config/matching.js`. `estimatedCharge` is always labelled `isEstimate: true`.

## Repair requests (all Bearer)
A request is `targeted` (one technician) or `open` (first eligible technician to accept). Statuses and who may move between them are in `services/workflow/serviceRequest.js`; every response includes `viewerRole` and `actions` (what the caller can do next). Non-participants get `404`. Errors: `409 INVALID_TRANSITION`, `409 STALE_STATE`, `409 LISTING_UNAVAILABLE`, `403 NOT_VERIFIED`, `403 NOT_ELIGIBLE`, `409 QUOTATION_NOT_APPROVED` (BR-02).
- `POST /api/service-requests` `{ listingId, technicianId?, issueDescription, onSite? }` → `201`. Locks the listing (`in_service`).
- `GET /api/service-requests?as=customer|technician|board&status&active=true&page&limit` — `board` lists open requests the caller could take.
- `GET /api/service-requests/:id` — exact `listing.location` only for the customer/admin, or the technician after accepting (BR-08).
- `PUT /api/service-requests/:id/status` (multipart) `{ status, note?, photos[] }` — `technician_assigned` (accept), `rejected` (needs `note`), `diagnosis_in_progress`, `repair_completed` (needs ≥1 photo and an approved quotation), `device_delivery_pending` (optional `returnDate` in the future and `returnSlot`, shown to the owner as `returnSchedule`), `cancelled`.
- `POST /:id/quotation` `{ amount, breakdown?[{label,amount}] (must sum to amount), parts?, etaDays?, validUntil?, notes? }`; `GET /:id/quotations`; `PUT /:id/quotation/:qid/decision` `{ decision: accept|reject, reason?, cancel? }`.
- `POST /:id/progress` (multipart `note?`, `photos[]`); `POST /:id/pickup` `{ date, timeSlot?, notes? }` (max 3 reschedules, not within 2 h of the slot); `POST /:id/handover` `{ acknowledgeChecklist? }` (the owner must acknowledge before the first handover); `POST /:id/confirm-completion` (records an offline `Transaction`, verified impact event once, technician stats); `POST /:id/cancel` `{ reason? }` (unlocks the listing).

## Reviews
- `GET /api/reviews?target=<technicianId>&page&limit` — public. `meta.summary` = `{ average, count, distribution{1..5} }`. Reviewer is a short name such as "Asha R."; no ids or emails.
- `POST /api/reviews` (Bearer) `{ contextType: service|order|recycling|donation, contextId, rating 1-5, quality?, communication?, timeliness? (1-5), comment? (≤1000) }` → `201`. Only `service` is wired so far (other contexts return `422` until their slice). Rules (BR-04): the caller must be the customer of the request (`404` otherwise), the request must be `service_completed` (`409 NOT_COMPLETED`), one review per transaction (`409 ALREADY_REVIEWED`). The technician's `ratingAvg` / `ratingCount` are recomputed from visible reviews.

## Transactions (Bearer, participants only)
The platform records payments made offline between people; it never processes money (BR-10).
- `GET /api/transactions?direction=paid|received&type&status&page&limit` — each item has `direction`, `counterparty{_id,name}`, `subject{kind,id,title,link}` and `canConfirm` (true for the payee while `recorded`).
- `GET /api/transactions/summary` → `{ received{count,total}, paid{count,total}, awaitingConfirmation }` (disputed payments are excluded).
- `PUT /api/transactions/:id/confirm` `{ reference? }` — payee only: `recorded` → `confirmed`. Non-participants get `404`, the payer `403`, an already confirmed payment `409`.

## Notifications (Bearer, your own only)
The in-app notification centre (P8-05, in-app part). Every service request, quotation, handover and similar event writes one through `notificationService.notify()`. Each new notification is also pushed live over the socket (`notification:new`, see Chat below). Push (FCM) and email channels will be added later without changing these routes.
- `GET /api/notifications?unread=true&page&limit` — newest first (limit ≤ 50, default 20). Each item: `{ _id, type, title, body?, data{ id, deepLink }, readAt|null, createdAt }`. `meta` carries `page, limit, total, pages` and `unread` (the total unread count, for a badge).
- `GET /api/notifications/unread-count` → `{ unread }`.
- `PUT /api/notifications/read-all` → `{ updated, unread: 0 }`.
- `PUT /api/notifications/:id/read` — marks one read (reading twice keeps the first time). Someone else's id, an unknown id and a malformed id all return `404`.

## Chat (Bearer)
One-to-one conversations between the two people on a shared record (P8-03). The server works out the two people from the record, so a client never names the other participant and nobody can message a stranger. Text only for now (photos wait for the Cloudinary work, P8-02). A stranger, an unknown id and a malformed id all get the same `404`.
- `POST /api/chat/conversations` `{ contextType, contextId }` — finds or starts the thread. `contextType` is one of `service` (the repair's customer and its assigned technician; `404` until one is chosen), `order` (buyer and seller), `recycling` (the requester and the centre), `donation` (the id is one recipient's *donation request*: the donor and that recipient), `offer` (a refurbishment job's owner and refurbisher), `enquiry` (a listed device: the asker and its owner; not your own, and only while it is on sale). Either person may open it and gets the same thread back.
- `GET /api/chat/conversations?page&limit` — mine, most recent first (limit ≤ 50, default 20). Each: `{ _id, contextType, contextId, other{ _id, name, role }, lastMessage{ text, at, mine }|null, unread, updatedAt }`. `meta` carries the page counts and `unread`, the total waiting across all threads.
- `GET /api/chat/conversations/:id` — one conversation (same shape).
- `GET /api/chat/unread-count` → `{ unread }`.
- `GET /api/chat/conversations/:id/messages?limit&before` — oldest first within the page (limit ≤ 100, default 30). Pass the previous `meta.nextBefore` as `before` to go further back; `meta` is `{ hasMore, nextBefore }`. Each: `{ _id, conversation, sender, text, createdAt, read }`, where `read` means the *other* person has read it.
- `POST /api/chat/conversations/:id/messages` `{ text }` → `201`. 1 to 2000 characters, trimmed. `409 RECIPIENT_UNAVAILABLE` if the other account is suspended or deleted. At most 40 a minute per person (`429`).
- `PUT /api/chat/conversations/:id/read` → `{ unread: 0 }` — marks the other person's messages read and clears my count.

### Real time (Socket.IO, same server and port)
Connect with `io(origin, { auth: { token: <access token> }, transports: ['websocket'] })`. A missing, expired, revoked or suspended-account token is refused with the error `UNAUTHORIZED`: refresh the session and connect again. Each person's devices join the private room `user:<id>`; nothing is ever sent to anyone else. Everything here can also be done over REST, so chat keeps working with no socket.
- Server to client: `message:new` `{ message, conversation }` (to both people; `conversation` is that person's own view, so `unread` and `other` differ), `message:read` `{ conversationId, by, at }` (to both), `typing` `{ conversationId, userId, typing }` (to the other person only), `notification:new` `{ notification, unread }` (to its owner, after the notification is saved).
- Client to server, each with an acknowledgement `{ ok, data }` or `{ ok:false, message, code }`: `message:send` `{ conversationId, text }`, `message:read` `{ conversationId }`, `typing` `{ conversationId, typing }`. Payloads are validated; a connection is limited to 30 events per 10 seconds (`RATE_LIMITED`).

## Impact and Green Score (`/api/analytics`)
Figures come only from recorded, verified activity (FR-IMP-006). Device counts are *actual*, kilograms weighed on a scale at a recycling centre are *measured*, and everything else (unweighed material, CO2e avoided) is an *estimate* from placeholder factors, always labelled so (BR-06). Every impact response carries `factorsProvisional: true` and a `method` note. The rules and how they are applied are in `docs/ARCHITECTURE.md`.
- `GET /api/analytics/platform-impact` — public, cached for a minute (`Cache-Control: public, max-age=60`). `{ devicesListed, devices{ repaired, reused, donated, refurbished, recycled, diverted }, materials{ measuredKg, estimatedKg }, co2e{ kgEstimated, isEstimate }, activeTechnicians, studentParticipants, completedDonations, verifiedActivities, updatedAt, factorsProvisional, method }`. Reversed events are excluded. Nothing about individuals.
- `GET /api/analytics/rules` — public. The scoring rules as they run: `{ rules[{ key, points, label, who }], dailyCap, levels[{ key, name, min }], badges[{ key, name, description }], notes[], method, factorsProvisional, factors }`.
- `GET /api/analytics/monthly?months&scope` — `months` 1 to 36 (default 12), oldest first, every month present with zeros. Each: `{ month: 'YYYY-MM', devices, byType{ repair, reuse, donation, refurbishment, recycling }, measuredKg, estimatedKg, co2eKgEstimated }`. Public for the platform; `scope=me` needs a Bearer token (`401` otherwise) and covers only that person.
- `GET /api/analytics/user-impact` — Bearer. The caller's own `{ events, devices{ total, byType }, materials{ measuredKg, estimatedKg }, co2e{ kgEstimated, isEstimate }, factorsProvisional, method }`.
- `GET /api/analytics/green-score?page&limit` — Bearer. `{ score, level{ key, name, min, next{ key, name, min }|null, progress 0–1 }, badges[{ key, name, description, earned, progress{ done, needed } }], ledger[{ _id, eventRef, points, rule, label, createdAt }] }`, newest first (limit ≤ 50, default 20); `meta` carries the page counts. The ledger adds up to the score. A negative line is a reversal after an upheld complaint; a `…:capped` rule means the daily limit was reached and the line is worth 0.

## Donations
Recipients are General Users whose organisation (school, college, NGO, charity) is approved. Free transfer only: no money moves (BR-10). Statuses: `open → requested → accepted → handover_scheduled → completed`, plus `cancelled`. Every response carries `viewerRole` (`donor|recipient|requester|admin|visitor`) and `actions`; clients render controls from that list.
- `GET /api/donations?q&category&condition&city&page&limit` — public: open or requested donations. Donor appears as "Asha R."; no exact location. `as=donor|recipient` needs a Bearer token (`401` otherwise).
- `POST /api/donations` (Bearer, owner) `{ listingId, description? }` → `201`, locks the listing. `409 LISTING_NOT_FOR_DONATION | NOT_DONATABLE | LISTING_UNAVAILABLE`.
- `GET /api/donations/:id` — visitors see only open or requested donations (or ones they requested); others `404`. The exact location is shown only to the donor, an admin, or the accepted recipient while `accepted|handover_scheduled` (BR-08).
- `POST /:id/request` `{ justification (10-1000), intendedUse? }` — verified recipients only (`403 NOT_VERIFIED`; `409 ALREADY_REQUESTED | DONATION_CLOSED`). `DELETE /:id/request` withdraws.
- `PUT /:id/requests/:rid/decision` `{ decision: accept|reject }` — donor. Accepting rejects the other pending requests; rejecting the last pending request reopens the donation (`409 REQUEST_NOT_PENDING`).
- `POST /:id/handover` `{ date, timeSlot?, notes? }` — donor or accepted recipient; future date; max 3 reschedules (`RESCHEDULE_LIMIT`), not within 2 h (`RESCHEDULE_TOO_LATE`), and not once either side has confirmed (`409 HANDOVER_IN_PROGRESS`).
- `POST /:id/confirm-handover` `{ acknowledgeChecklist? }` — the donor must acknowledge the data-protection checklist (BR-12, `422` otherwise). Idempotent. When both sides have confirmed the donation completes: reference `DON-YYYY-XXXXXX`, listing `completed`, a zero-value `donation` transaction, and one verified impact event for the donor.
- `POST /:id/cancel` `{ reason? }` (also `PUT /:id/status` `{ status: 'cancelled' }`) — donor or admin; unlocks the listing, rejects open requests, cancels the pickup.
- `GET /:id/confirmation` — participants only; `409 NOT_COMPLETED` before completion.
- `GET /api/donations/recipient`, `PUT /api/donations/recipient` `{ orgType, orgName, registrationNo }` — recipient-organisation verification status and application (role `user` only; `409 ALREADY_VERIFIED`). Admin approval arrives in P6; in dev run `npm run dev:approve -- <email>`.

Donation transactions (`type: donation`, amount 0) are listed in the history but left out of the paid and received totals.

## Refurbishment (Bearer)
Verified refurbishers (BR-01) find reusable devices and make offers; owners decide. Every job response carries `viewerRole` (`owner|refurbisher|admin`), `actions` and, for the refurbisher, `nextStatus` and `photoStages`. Statuses: `offered → accepted → collected → assessment → in_progress → testing → ready_to_list → listed`, plus `cancelled`.
- `GET /api/refurbishment/opportunities?q&category&condition&city&page&limit` — refurbisher only (`403 NOT_VERIFIED` until approved). Devices with service `refurbishment`, listed and unlocked; only the fuzzed public location; `hasOffered` marks devices you already offered on.
- `POST /api/refurbishment/offers` `{ listingId, amount? (₹, 0 = free collection), message? }` → `201`. `409 LISTING_NOT_FOR_REFURBISHMENT | LISTING_UNAVAILABLE | ALREADY_OFFERED | OWN_LISTING`.
- `GET /api/refurbishment/jobs?as=owner|refurbisher&status&page&limit`, `GET /jobs/:id` — participants and admin; others `404`. The exact location is shown to the owner, admin, and the refurbisher only while `accepted` (BR-08).
- `PUT /jobs/:id/offer-decision` `{ decision: accept|reject }` — owner. Accepting locks the device (`in_service`, BR-03) and declines the other pending offers. `DELETE /jobs/:id/offer` — refurbisher withdraws.
- `POST /jobs/:id/handover` `{ date, timeSlot?, notes? }` (future; max 3 reschedules, not within 2 h; `409 HANDOVER_IN_PROGRESS` once a side confirmed) and `POST /jobs/:id/confirm-handover` `{ acknowledgeChecklist? }` (owner must acknowledge, BR-12; `409 NO_HANDOVER` before a time is set). When both confirm the job is `collected` and, for an offer above ₹0, an offline `refurb_purchase` transaction is recorded (BR-10).
- `PUT /jobs/:id/status` `{ status, note? }` — refurbisher moves one step at a time; `ready_to_list` needs at least one before and one after photo (`422`). `POST /jobs/:id/photos` (multipart `stage: before|after`, `photos[]`, `note?`) — before: collected to in_progress; after: in_progress to ready_to_list; max 8 per stage.
- `POST /jobs/:id/cancel` `{ reason? }` — owner, refurbisher or admin, only while `offered` or `accepted` and before any handover confirmation; frees the device.

## Marketplace (public reads, Bearer for the rest)
Refurbished products only (BR-11): every product carries `isRefurbished: true`, `label: "Refurbished"` and a `condition` (`like_new|excellent|good|fair`). Only products of admin-approved refurbishers (BR-01) are public; sold products stay readable by link but are not listed or orderable; hidden products are visible to the seller and admin only.
- `GET /api/marketplace?q&category&condition&minPrice&maxPrice&sort&page&limit` — public. `sort`: `newest|price_asc|price_desc|rating`. Seller shows `businessName`, city and rating only. Unknown filter values are `422`.
- `GET /api/marketplace/mine?status&page&limit` — the seller's own products (any status). Declared before `/:id`.
- `GET /api/marketplace/:id` — public; seller and admin also get `isMine` and the linked `refurbishmentJob`.
- `POST /api/marketplace` (verified refurbisher; multipart `photos[]` up to 8) `{ title, category, condition, price, stock?, brand?, model?, refurbishmentInfo, specs? (JSON string), jobId? }`. With `jobId` the job must be the caller's and `ready_to_list`: it is claimed atomically to `listed`, the device listing becomes `completed` and unlocked, stock is forced to 1, the job's after photos are reused when none are uploaded, and the owner is notified. `409` if the job is not ready or already listed.
- `PUT /api/marketplace/:id` — seller or admin; `removePhotoIds`, `status: active|hidden`. Photo files shared with a job are never deleted from storage.
- `DELETE /api/marketplace/:id` — seller or admin; `409 HAS_OPEN_ORDERS` while orders are placed, confirmed or ready.
- `POST /api/marketplace/:id/enquiries` `{ message }` — signed-in non-sellers; creates or continues a conversation (`contextType: enquiry`) with a message and notifies the seller. Real-time chat arrives in P8.

## Orders (Bearer)
No money passes through the platform (BR-10): payment is `cod` or `offline`, recorded only. Responses carry `viewerRole` (`buyer|seller|admin`), `actions` (`confirm|mark_ready|mark_delivered|complete|cancel`), `canReview`, `total` and a status `history`. Statuses: `placed → confirmed → ready → delivered → completed`, or `cancelled`.
- `POST /api/orders` `{ productId, quantity, paymentMethod, deliveryArea?, notes? }` → `201`. Area or locality only. `409` for your own product, a sold or hidden product, or not enough stock.
- `GET /api/orders?as=buyer|seller&status&page&limit`, `GET /api/orders/:id` — participants and admin; others `404`.
- `PUT /api/orders/:id/status` `{ status: confirmed|ready|delivered|completed }` — seller moves confirmed, ready, delivered; only the buyer completes. Confirming takes the stock atomically; when the last item goes the product becomes `sold` and other `placed` orders are cancelled with a notice. Completing sets `paymentStatus: paid_offline`, records a `Transaction` (`type: order`, buyer to seller, `recorded`) and a verified `refurbishment` impact event for the seller (FR-IMP-006).
- `POST /api/orders/:id/cancel` `{ reason? }` — buyer while placed or confirmed, seller while placed, confirmed or ready, admin any time. Cancelling after stock was taken restocks and returns a sold product to `active`.
- The seller's payee confirmation of the transaction syncs `paymentStatus` to `confirmed`. Buyers review the seller with `POST /api/reviews { contextType: "order", contextId }` once the order is completed (one per transaction, BR-04); the rating is stored on the refurbisher profile.

## Recycling centres (public)
Only verified centres with a current authorisation are listed. Responses carry an `authorized` flag; the detail adds `facilityDetails`, `collectionAreas` and `totals { actualKg, estimatedKg }` (kept apart, BR-06).
- `GET /api/recycling-centers?q&city&category&page&limit` — directory; `category` is a category slug the centre accepts.
- `GET /api/recycling-centers/:id` — detail. An unknown or unlisted centre is `404`.

## Recycling requests (Bearer)
Everyone except admins may send devices; a recycling centre acts on requests sent to it. Statuses: `requested → accepted → pickup_scheduled → collected → received_at_center → processed → completed`, or `rejected` / `cancelled`. Responses carry `viewerRole` (`requester|center|admin`), `actions` (`accept|reject|schedule_pickup|confirm_handover|mark_received|record_materials|process|complete|cancel`), `confirmations`, `materials`, `totals { actualKg, estimatedKg }` and a status `history`. The exact `pickupAddress` is sent to the centre only while the request is `accepted` or `pickup_scheduled` (BR-08); the requester always sees their own.
- `POST /api/recycling-requests` (multipart) `{ centerId, categories (JSON array, comma list or repeated), deviceCount 1–500, pickupAddressArea, pickupAddress (min 5), preferredDate?, notes?, listingId?, photos[] ≤ 6 }` → `201`. `409 CENTER_UNAVAILABLE` for an unlisted centre, `409 OWN_CENTER` for your own centre, `422` for categories the centre does not accept. A `listingId` must be your own listed device; it is locked (`lockedBy.kind: recycling`) until the request completes or ends.
- `GET /api/recycling-requests?as=requester|center&status&from&to&page&limit` — `as` defaults by role. `GET /api/recycling-requests/:id` — participants and admin; others `404`.
- `PUT /api/recycling-requests/:id/status` `{ status: accepted|rejected|received_at_center|processed|completed|cancelled, reason? }` — which transitions are allowed depends on the viewer; anything else is `409 INVALID_TRANSITION`. Completing adds the weighed and estimated kilograms to the centre totals and, only when a weight was measured, writes one verified `recycling` impact event for the requester (BR-05).
- `POST /api/recycling-requests/:id/pickup` `{ date, timeSlot?, notes? }` — centre only; date must be in the future. At most 3 reschedules (`409 RESCHEDULE_LIMIT`), none within 2 hours of the pickup (`409 RESCHEDULE_TOO_LATE`), none once a handover has started (`409 HANDOVER_IN_PROGRESS`).
- `POST /api/recycling-requests/:id/confirm-handover` `{ acknowledgeChecklist? }` — each side confirms once; the requester must send `acknowledgeChecklist: true` (BR-12). When both have confirmed the request becomes `collected`.
- `PUT /api/recycling-requests/:id/materials` `{ materials: [{ type: copper|aluminium|iron|plastics|glass|other, actualKg?, estimatedKg? }], reportNotes? }` — centre only, while `received_at_center` or `processed`; at least one weight per row and unique types. Actual and estimated are stored and returned separately.
- `POST /api/recycling-requests/:id/cancel` `{ reason? }` — participants while open; `409 HANDOVER_IN_PROGRESS` after a handover started.
- `GET /api/recycling-requests/report?from&to&category&format=json|csv` — recycling centres only. Counts requests created in the range and totals devices and weights for requests completed in it. Weighed and estimated kilograms are separate everywhere, including the CSV columns.

## Student learning (public reads, Bearer for the rest)
Supervised practical tasks (BR-07): only a verified technician can post one, hazardous device types are refused, and students never see an exact address. Opportunity statuses: `open | filled | closed`. Application statuses: `applied → accepted → in_progress → completed`, or `rejected` / `withdrawn`. Application responses carry `viewerRole` (`student|supervisor|admin`) and `actions` (`accept|reject|start|complete|withdraw`); the web draws its buttons from these. A supervisor sees a student's college, course, hours and skills, never contact details.
- `GET /api/students/opportunities?q&difficulty&category&skill&page&limit` — public feed of open tasks whose deadline has not passed. Each item has `seats`, `seatsTaken`, `seatsLeft`, `supervisor { name, ratingAvg, ratingCount }`, `supervised: true`. Signed-in students also get `myApplication` and `applyBlock` (`not_verified|already_applied|closed|filled|deadline_passed|null`).
- `GET /api/students/opportunities/:id` — detail. `GET /api/students/opportunities/mine?status` — technician's own tasks with `counts` per application status.
- `POST /api/students/opportunities` `{ title, description?, deviceTypeId, requiredSkills?, difficulty?, locationArea, deadline (future), seats 1–20, expectedHours?, supervisionAcknowledged: true }` — verified technician. `422` on `deviceTypeId` for a hazardous category (monitor, television, battery, circuit boards).
- `PUT /api/students/opportunities/:id` — poster only; seats cannot drop below the places already taken. `PUT /api/students/opportunities/:id/status` `{ status: open|closed }` — closing declines waiting applications and tells the students; reopening needs a future deadline (`409 DEADLINE_PASSED`).
- `GET /api/students/opportunities/:id/applications?status&page&limit` — poster or admin.
- `POST /api/students/applications` `{ opportunityId, message? ≤ 500 }` — verified student (`403 NOT_VERIFIED`); `409 ALREADY_APPLIED|CLOSED|FILLED|DEADLINE_PASSED`. A student who withdrew may apply again.
- `GET /api/students/applications?status&page&limit` — the student's own. `GET /api/students/applications/:id` — the student, the supervising technician and admin; anyone else gets `404`.
- `PUT /api/students/applications/:id/decision` `{ decision: accepted|rejected, feedback? }` — supervisor; accepting a full task is `409 SEATS_FULL`. `POST /api/students/applications/:id/start` — supervisor, after accepting.
- `PUT /api/students/applications/:id/complete` `{ hours 0.5–200, feedback? }` — supervisor, while in progress. The hours are added once to the student's profile along with the task's skills and a portfolio entry.
- `POST /api/students/applications/:id/withdraw` `{ reason? }` — the student, until the task is completed; a filled task reopens.
- `GET /api/students/experience` — completed tasks, total hours and skills. `GET /api/students/certificates` — the student's certificates. Certificates are issued by an admin (`POST /api/admin/certificates`; completed tasks only, one per application). Each experience item now also carries `certificateId`.
- `GET /api/students/certificates/:id/pdf` — the certificate as a one-page A4 PDF (`application/pdf`, `Content-Disposition: attachment; filename="certificate-CERT-2026-XXXXXX.pdf"`, `Cache-Control: private, no-store`): student name, task, hours, completion and issue dates, the supervising technician and the platform as signatories, and the certificate ID. The student it belongs to and administrators only; anyone else gets `404`. Standard fonts only, so characters outside Latin-1 print as `?`.
- `GET /api/students/certificates/verify/:certNo` — public. `{ valid: true, certNo, title, hours, completedAt, issuedAt, supervisorName, studentName }` where `studentName` is first name and last initial only. `404` for an ID that was never issued or is not an ID, with the same answer in both cases.
- Other invalid transitions are `409 INVALID_TRANSITION`.

## Pickups (Bearer; requester, provider, student, refurbisher and recycler roles; not admins)
One read-only list of every pickup, collection and handover the signed-in person is part of, across repairs, donations, refurbishment and recycling. Scheduling, rescheduling, confirming and cancelling stay on each flow (`.../pickup`, `.../confirm-handover`). Only the area is shown, never the exact address (BR-08).
- `GET /api/pickups?when=upcoming|past&page&limit` — `upcoming` (default) is requested, confirmed or rescheduled pickups that have not started, soonest first; `past` is collected or cancelled ones and those whose time has gone by, newest first. Each item: `kind` (`repair|donation|refurbishment|recycling`), `title`, `link` (the web path of the request), `date`, `timeSlot`, `notes`, `addressArea`, `status`, `rescheduleCount`, `reschedulesLeft`, `changeableUntil` (2 hours before it starts), `canChange` (still active, changes left, more than 2 hours away), `viewerRole` (`requester|provider`), `counterpart { _id, name }`. People who are not part of a pickup never see it. `422` for an unknown `when` or query key, `401` signed out, `403` admin.
- `GET /api/pickups/slots` — the collection windows for the next 14 days, in India time: `{ timezone, cutoffHours, maxReschedules, days: [{ date: 'YYYY-MM-DD', slots: [{ key: '10:00-12:00', label, start, available, reason? }] }] }`. Five fixed windows a day (08-10, 10-12, 12-14, 14-16, 16-18). A window is closed (`available: false`) with `reason: 'too_soon'` if it starts within 2 hours, or `'busy'` if the caller already has an active pickup then. The `key` is what is sent as `timeSlot` and `start` as `date` when scheduling; the server still accepts any `timeSlot` text, so older clients keep working. Same roles as the list; `401` signed out, `403` admin.
- Reschedule rules shared by all four flows: at most 3 changes (`409 RESCHEDULE_LIMIT`) and not within 2 hours of the start (`409 RESCHEDULE_TOO_LATE`).

## Admin (Bearer, admin only; other roles get `403`, signed-out `401`; rate limit 300 per window)
Every state change is written to the audit log (`AdminLog`) with the admin, the target, before/after and the reason. Unknown or malformed ids return `404`.
- `GET /api/admin/dashboard` — the overview: `people` (`total`, `active`, `suspended`, `waitingForVerification`, `newThisMonth`, `byRole`; admins and deleted accounts are not counted), `centres` (`total`, `authorised`), `listings` (`total`, `listed`, `inService`, `byStatus`), `services` (`repairs`, `donations`, `refurbishment`, `recycling`, each `{total, open, completed, stopped}`, plus `completed` for all four), `marketplace` (`activeProducts`, `orders`), `attention` (`pendingVerifications {providers, recipients, total}`, `openReports`, `openComplaints`) and the eight latest `recentActivity` audit rows.
- `GET /api/admin/monitors/:kind?status&from&to&page&limit` — read-only list, newest first. `kind` is `repairs`, `donations`, `refurbishment`, `recycling` or `transactions` (`404` otherwise). Each item has `reference`, `title`, `status`, `parties` (`[{role, name}]`; a removed account shows as "Removed account"), `createdAt`, and `amount`/`method` where money is involved. Never an address (BR-08). `status` must belong to that list (`422` otherwise); `from` and `to` are whole days (`YYYY-MM-DD`, `to` included, `422` if bad or inverted). `meta` adds `byStatus` (counts for the period, ignoring the status filter) and `statuses`.
- `GET /api/admin/listings?q&status&category&reported&page&limit` — public listings (drafts only with `status=draft`); `q` searches title, brand and model; `reported=true` puts the most reported first. Items carry owner, category, area only (never the exact address, BR-08), `reportCount`, `openReports`, `locked`, `removal {reason, at}` and `actions` (`remove`, `restore` or none).
- `PUT /api/admin/listings/:id/moderation` `{action: remove|restore, reason}` — `reason` (5+ characters) required to remove; the owner is told why and the open reports on it close. `409 LISTING_LOCKED` while part of a service (BR-03), `LISTING_FINAL` for a completed one, `NO_CHANGE` if already removed, `NOT_REMOVED` when restoring a live one. Restore returns the listing to the status it had.
- `GET /api/admin/reviews?status&rating&reported&page&limit` and `PUT /api/admin/reviews/:id/status` `{status: visible|hidden|removed, reason}` — reason required to hide or remove. The provider's average is recomputed and the reviewer is told. The row stays on record, so the same service can never be reviewed twice (BR-04). `409 NO_CHANGE`.
- `GET /api/admin/reports?status&targetType&reason&page&limit` — default is waiting reports, oldest first (`status=actioned|dismissed|all`). Each item describes the reported item (`target {type, exists, title, status, owner}`), `reportsOnItem` and `actions`. `GET /api/admin/reports/:id` adds history.
- `PUT /api/admin/reports/:id` `{decision: take_down|resolve|dismiss, reason}` — `take_down` removes a listing or product or hides a review (reason required; `409` and the report stays open if refused, for instance a locked listing); `resolve` records what was done (reason required); `dismiss` changes nothing. A person cannot be taken down from here (`422` on `decision`; use Users). The reporter is told. `409 NOT_OPEN` if already decided. A product take-down has no restore yet.
- `GET /api/admin/categories` — every category, inactive ones too, in order, with `usage {listings, products, references}` and `canDelete`. `POST /api/admin/categories` `{name, icon?, group?, hazardous?}` (slug made from the name, put last; `409 DUPLICATE_CATEGORY`). `PUT /api/admin/categories/order` `{ids}` (the full list, else `422` on `ids`). `PUT /api/admin/categories/:id` (name, icon, group, hazardous, active; the slug never changes; `409 NO_CHANGE`). `DELETE /api/admin/categories/:id` (`409 CATEGORY_IN_USE` when anything refers to it; switch it off instead). The public category list is cached for 5 minutes.
- `GET /api/admin/complaints?status&assigned&page&limit` — default `status=active` (waiting, picked up, being reviewed), oldest first; `closed`, a single status or `all` newest first. `assigned=me|unassigned`. `meta.byStatus` counts every status. `GET /api/admin/complaints/:id` adds the description, both people, the history with notes and `actions`.
- `PUT /api/admin/complaints/:id` `{action: assign|start_review|resolve|reject, note?, assignee?}` — `assign` defaults to yourself (`assignee` must be an active administrator, `422`; `409 NO_CHANGE` if already theirs); `start_review` takes it for you if nobody has it; `resolve` and `reject` close it and need a `note` of 5+ characters (`422` on `note`). `409 ALREADY_CLOSED`, `409 CHANGED` if someone else moved it first. The filer is told (the note on close); the other person is told in general terms only when a review starts or it closes. Audited as `complaint.assigned|review_started|resolved|rejected`.
- `GET /api/admin/announcements?state=current|scheduled|ended&page&limit`, `POST /api/admin/announcements` `{title (3–140), body (5–2000), audience[], startsAt?, endsAt?}` (`all` wins over roles; `endsAt` must be in the future and after `startsAt`, `422` on `endsAt`), `PUT /api/admin/announcements/:id` (only the fields sent; `endsAt: null` clears the end; ending now is `endsAt` = now; `409 NO_CHANGE`), `DELETE /api/admin/announcements/:id` (removed for good). Audited as `announcement.created|updated|deleted`.
- `GET /api/admin/audit?admin&action&targetType&from&to&page&limit` — newest first (default 25). `from` and `to` are whole days, `to` included (`422` on `to` if inverted). Items: `action`, `at`, `admin {_id, name}`, `targetType`, `targetId`, `reason`, `before`, `after`, `ip`. `meta` adds the distinct `actions`, `targetTypes` and `admins` present, for the filters.
- `GET /api/admin/analytics?months` — platform trends for 3–24 calendar months (default 12; UTC months, oldest first, every month present with zeros; `422` otherwise). Returns `period {months, from, to}`; `registrations {total, byRole, series[{month, members, providers, total}]}` (administrators are not counted); `growth[{month, total}]` (running total, starting from everyone who joined before the period); `activity[{month, repairs, donations, refurbishment, recycling}]` (started per month); `services {repairs|donations|refurbishment|recycling: {created, completed}}` (completed means the same as on the overview); `categories[{name, count}]` (top 8 by listings, the rest grouped as "All other categories"; drafts, removed and deleted listings are left out); `donations {offered, completed, series}`; `recycling {requests, completed, devices, series}` (devices count completed requests only); `impact {events, devices, weighedKg, estimatedKg, co2eEstimateKg}` from verified, non-reversed events only, with weighed and estimated kept apart (BR-06) and CO₂e always an estimate; `generatedAt`.
- `GET /api/admin/exports/:kind?role&status&category&from&to` — a CSV download. `kind`: `users`, `listings`, `repairs`, `donations`, `refurbishment`, `recycling`, `transactions` (`404` for anything else). Filters per kind: users `role, status, from, to`; listings `status, category, from, to`; the flows `status, from, to`; a filter the kind does not use is `422 This export does not use that filter`. `from` and `to` are whole days, `to` included. The file is UTF-8 with a byte-order mark and CRLF lines; text cells that start with `= + - @` get a leading `'` so a spreadsheet never runs them as a formula. Headers: `Content-Disposition: attachment; filename="<kind>-YYYY-MM-DD.csv"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Export-Rows` and `X-Export-Truncated` (`true` when the 10,000-row cap cut the file short); the last three are exposed to browsers through CORS. People: name, email, role, status, email verified, verification, joined, last sign-in (no phone; deleted accounts only with `status=deleted`). Listings: title, category, brand, model, condition, preferred service, status, owner, public area and city (never an exact address or coordinates, BR-08), expected price, reports, listed on (drafts only with `status=draft`). Flows: reference, what, status, people, created, last updated, plus per-kind columns (refurbishment offer; recycling devices, weighed kg and estimated kg in separate columns; payment amount and method). Every successful download is audited as `export.downloaded` with the kind, filters and row count; a refused request writes nothing.
- `GET /api/admin/certificates?state=waiting|issued|all&page&limit` — completed student tasks (default `waiting`: no certificate yet, oldest first; the others newest first). Items: `_id` (the application), `student {_id, name}` ("Removed account" if gone), `task`, `hours`, `completedAt`, `certificate {certNo, issuedAt}` or `null`, `canIssue`. `meta.counts {waiting, issued}`.
- `POST /api/admin/certificates` `{applicationId}` — issues the certificate (`201 {_id, certNo, issuedAt, application}`) through the same rule as the student flow: `404` unknown, `409 NOT_COMPLETED`, `409 ALREADY_ISSUED` (no second audit row). The student is notified (`learning.certificate`). Audited as `certificate.issued`.
- `GET /api/admin/users?q&role&status&page&limit` — search by name or email; `status` defaults to everything except deleted. Items include `verificationStatus` for providers.
- `GET /api/admin/users/:id` — detail with organisation facts, suspension note, `actions` (`suspend` or `reactivate`; empty for admins, yourself and deleted accounts) and recent history.
- `PUT /api/admin/users/:id/status` `{status: suspended|active, reason}` — `reason` (5+ characters) is required to suspend. Sessions are revoked on suspension (old tokens get 401), login returns `403 ACCOUNT_SUSPENDED`. `403 SELF_ACTION`, `403 ADMIN_PROTECTED`, `409` for a deleted account or `NO_CHANGE`. Reactivating an unapproved provider returns it to `pending_verification` (BR-01).
- `GET /api/admin/verifications?type=provider|recipient&status&role&page&limit` — queue, oldest first for pending.
- `GET /api/admin/verifications/:userId?type=` — facts, documents (each with a `viewUrl`), `actions` (only while pending) and history.
- `PUT /api/admin/verifications/:userId` `{type, decision: approved|rejected|resubmission_required, reason}` — `reason` required unless approving (`422`); `409 NOT_PENDING` if already decided. Approving activates a pending provider and puts it in discovery; the person is notified.
- `GET /api/admin/verifications/documents/:docId/file` — streams the private document (`Cache-Control: private, no-store`); each open is audited.

## Complaints (Bearer; every role except admin)
- `POST /api/complaints` `{subject (5–140), description (10–2000), against?, refType?: service|order|listing|other, refId?}` — `refId` needs a `refType` other than `other` (`422`). `against` must be an existing account that is not yours and not an administrator (`422` on `against`). At most 5 complaints still being handled per person (`409 TOO_MANY_OPEN`). Administrators get `403`. Active administrators are notified (`complaint.new`).
- `GET /api/complaints?status=active|closed|open|assigned|in_review|resolved|rejected&page&limit` — your own, newest first.
- `GET /api/complaints/:id` — yours only (`404` for anyone else). The view shows `timeline` (status and time only) and the `resolution` once closed. Internal notes and administrator names are never included.

## Announcements
- `GET /api/announcements` — public (`optionalAuth`; `Cache-Control: no-cache`). The announcements showing now for everyone, or for the signed-in role; newest 5; fields `_id`, `title`, `body`, `startsAt`.

## Learning centre (`/api/education`, public) and its administration
- `GET /api/education?topic&q&page&limit` — published guides as cards (`slug, title, topic, summary, featured, publishedAt, readMinutes`), featured first, then newest. `q` is searched as plain text in the title and summary. Unknown query keys or topics → `422`.
- `GET /api/education/:slug` — one published guide with its Markdown `body` and `next` (`{ slug, title }`, the guide to read after it). A draft, a deleted guide and a slug that never existed all answer the same `404`. The author is not shown.
- Administration (admin only, under the same guard as the rest of `/api/admin`): `GET /api/admin/education?status&topic&q&page&limit` (drafts included), `POST /api/admin/education`, `GET|PUT|DELETE /api/admin/education/:id`. Create/update take `title` (3–160), `topic` (`ewaste-problem|safe-disposal|reuse|repair-benefits|recycling|data-security|sustainability`), `summary` (≤ 300), `body` (Markdown, 20–20000 characters), `featured`, `status` (`draft|published`); anything else, including a `slug`, is refused `422`. The slug is made from the first title, never changes, and a deleted article's slug is not reused. `publishedAt` is set on the first publish and kept. Delete is a soft delete. Every change is audited as `education.created|published|updated|unpublished|deleted`.
- The body is stored as written. Clients draw it with a renderer that builds elements itself and never inserts HTML (web `lib/markdown.jsx`, mobile `markdown_view.dart`); links must be http(s), mailto or a path on the site.
- `npm run seed` adds the seven starting guides that are missing, published, and never overwrites an edited or deleted one. The website shows its built-in copies of these seven while the server cannot be reached.

## Planned (currently `501 NOT_IMPLEMENTED`)
`geo` (P8).

## CORS

Browsers may call the API only from the origins listed in `CORS_ORIGINS` (default `http://localhost:5173,http://localhost:4173`). Any other origin gets `403` with `code: "CORS_BLOCKED"`. Requests with no `Origin` header (mobile app, curl) are always allowed.
