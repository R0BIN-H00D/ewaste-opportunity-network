# Database Schema

Source of truth is the Mongoose models in `backend/src/models/` (one file per collection). Field-level design is in `design.md` §A.3; this file records what was actually implemented.

**36 collections** = the 27 named in the SRS + 9 added (marked *added*; see `requirements.md` §8.2).

Conventions: `timestamps` on all; `versionKey` off; sensitive fields (`passwordHash`, token hashes) are `select:false` and stripped from `toJSON`; `softDelete` plugin (`deletedAt`) on **Device, DeviceListing, Donation, MarketplaceProduct, LearningOpportunity, EducationArticle** — `find/findOne/count/update*` hide deleted docs unless `.setOptions({ withDeleted: true })`; **`aggregate()` is not filtered — add `{ deletedAt: null }` yourself**. Locations are GeoJSON `Point` (`[lng, lat]`) with `2dsphere` indexes; public views use the fuzzed `publicLocation`.

| Collection | Model file | Key indexes / constraints |
|---|---|---|
| Users | User.js | `email` unique; `role+status` |
| UserProfiles | UserProfile.js | `user` unique; `location` 2dsphere; derives fuzzed `publicLocation`; holds org profile for donation recipients (A-02) |
| TechnicianProfiles | TechnicianProfile.js | `user` unique; `serviceLocation` 2dsphere; `verification.status+deviceCategories`; `ratingAvg` |
| RefurbisherProfiles | RefurbisherProfile.js | `user` unique; 2dsphere; `verification.status+categories` |
| RecyclingCenters | RecyclingCenter.js | `user` unique; 2dsphere; `verification.status+acceptedCategories` |
| VerificationDocuments | VerificationDocument.js | `owner`; `status+submittedAt`; private file reference only (no public URL) |
| RefreshTokens *(added)* | RefreshToken.js | `tokenHash` unique; `family`; TTL on `expiresAt` |
| DeviceTokens *(added)* | DeviceToken.js | `fcmToken` unique |
| Categories *(added)* | Category.js | `name`, `slug` unique; `active+order` |
| Devices | Device.js | `owner`; `category`; max 6 photos; soft delete |
| DeviceListings | DeviceListing.js | `status+preferredService+createdAt`; `status+category+condition+createdAt`; `owner+status+createdAt`; `expectedPrice`; 2dsphere `location`; text (title 5, brand 3, model 3, description 1); soft delete. `moderation {previousStatus, reason, by, at}` is set while an admin has removed it (status `removed_by_admin`) and cleared on restore |
| Reports *(added)* | Report.js | unique `(reporter,targetType,targetId)`; `decisionNote` holds the admin's note when decided |
| ServiceRequests | ServiceRequest.js | `customer+status`, `technician+status`, `status+mode` |
| Quotations | Quotation.js | unique `(serviceRequest, version)` |
| PickupSchedules | PickupSchedule.js | `(contextType,contextId)`; `provider+date+status`; `requester+date`. Read through `GET /api/pickups` (5H); reschedule limits live in `services/pickupRules.js` |
| Donations | Donation.js | `status+createdAt`; unique sparse `confirmation.refNo`; soft delete. `confirmations{donorAt, recipientAt, checklistAcknowledgedAt}` and `cancelReason` added in 5D |
| DonationRequests | DonationRequest.js | unique `(donation, requester)` |
| RefurbishmentJobs *(added)* | RefurbishmentJob.js | `refurbisher+status`. `pickup`, `confirmations{ownerAt, refurbisherAt, checklistAcknowledgedAt}`, `history` and `cancelReason` added in 5E |
| MarketplaceProducts | MarketplaceProduct.js | `status+category+price`; text; `isRefurbished` immutable true; soft delete |
| Orders | Order.js | `buyer+createdAt`; `seller+status` |
| Transactions | Transaction.js | `payer`, `payee`, `(refType,refId)`; records only (BR-10) |
| RecyclingRecords | RecyclingRecord.js | `center+status`; `refNo` unique sparse (`REC-YYYY-XXXXXX`); `actualKg` and `estimatedKg` separate (BR-06). `pickupAddress` (private), `preferredDate`, `notes`, `checklistAcknowledgedAt`, `completedAt`, `cancelReason` and `history[{status,at,by,note}]` added in 5F |
| Conversations | Conversation.js | unique `(contextType, contextId, participantsKey)`; exactly 2 distinct participants |
| Messages | Message.js | `conversation+createdAt`; needs text or attachment |
| Notifications | Notification.js | `user+readAt+createdAt` |
| Reviews | Review.js | unique `(reviewer, contextType, contextId)`; integer 1–5 |
| Complaints | Complaint.js | `status+createdAt`; `assignedTo+status` |
| EnvironmentalImpact | EnvironmentalImpact.js | unique `(type, refType, refId)` — idempotent; `year+month+type` |
| AdminLogs | AdminLog.js | insert-only (update/delete blocked); `createdAt`. Written by `auditService.record` (user status changes, verification decisions, document views from Phase 6A; complaints, announcements and certificates from 6D and 6E; CSV downloads as `export.downloaded` with `targetType: Export` and no `targetId`) |
| Announcements *(added)* | Announcement.js | `startsAt+endsAt` |
| EducationArticles *(added)* | EducationArticle.js | `slug` unique; `status+topic`; soft delete |

## Implementation notes / deviations from design.md
- `DeviceListing` **denormalises** `title, brand, model, category` from `Device` so browse + text search need no join; `deviceService` keeps them in sync on update.
- `DeviceListing.lockedBy` is `{ kind, refId }` (renamed from `{type,id}` to avoid clashing with Mongoose's `id` virtual and the `type` keyword). `kind` is `repair`, `donation`, `refurbishment` or `recycling`; a recycling request locks its listed device until it completes, is declined or is cancelled.
- `notificationService.notify` reads ids from either a plain id or a populated document (`idOf`). Before 5F a populated document was turned into the string of the whole document, so some notifications were never delivered.
- `Conversation.participantsKey` (sorted `idA:idB`) is derived in `pre('validate')` to enforce one conversation per context + pair.
- `MarketplaceProduct.refurbishmentJob` links a product created from a finished job (that job moves to `listed`); `refurbishmentInfo` (what was done) and `condition` are required (BR-11); at most 8 photos. A product created from a job reuses the job's after photos when none are uploaded, so photo files may be shared and are never deleted from storage when removed from a product. `status` is `active|hidden|sold`; stock reaching 0 on a confirmed order sets `sold`.
- `Order` keeps `priceAtOrder` (price is frozen), `cancelReason`, `reviewed` (the buyer reviewed the seller, BR-04) and a `statusHistory` of `{ status, at, by, note }`. `paymentStatus` goes `unpaid → paid_offline` (buyer completes) `→ confirmed` (seller confirms the transaction). `deliveryArea` is an area or locality only, never an exact address (BR-08).
- Marketplace enquiries use `Conversation` with `contextType: 'enquiry'` and the product id as `contextId`; the unique key keeps one conversation per product and buyer-seller pair.
- `EnvironmentalImpact.month/year` are derived from `verifiedAt` (UTC).
- Seed (`npm run seed`): categories, admin, one demo account per role (+ profiles), 5 sample listings. Dev only.
