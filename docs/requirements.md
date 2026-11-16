# Requirements Specification — E-Waste-to-Opportunity Network

| | |
|---|---|
| **Document** | `docs/requirements.md` |
| **Version** | 1.0 |
| **Date** | 2026-11-14 |
| **Source** | Software Requirements Specification (Master Development Prompt, §1–17) and UI/UX Addendum (§18) |
| **Companion docs** | `design.md` (how it is built and how it looks), `tasklist.md` (build order and progress), `claude.md` (rules for the AI development agent) |

**Priority legend:** **M** = Must (core, release-blocking) · **S** = Should (smart features, built after core workflows work) · **C** = Could (nice to have).
**Phase** refers to the 10 development phases in `tasklist.md` (P1–P10).

---

## 1. Introduction

### 1.1 Purpose
Define, in testable form, what the **E-Waste-to-Opportunity Network** must do. Every requirement has an ID so that design, tasks and tests can trace back to it.

### 1.2 Product vision
A professional, startup-grade platform that turns unused, damaged or unwanted electronics into opportunities through **repair, reuse, refurbishment, donation and responsible recycling**. It connects device owners with technicians, students, refurbishers, donation recipients and authorised recycling centres.

### 1.3 Objectives
1. Reduce e-waste and divert devices from disposal.
2. Encourage repair and reuse.
3. Create employment for technicians and refurbishers.
4. Give electronics/CS students supervised practical experience.
5. Promote responsible recycling and recover valuable materials.
6. Support a circular economy and raise environmental awareness.

### 1.4 Scope
**In scope:** one Node.js/Express REST + Socket.IO backend; one MongoDB database; a React (MERN) responsive web app; a Flutter Android app; six role experiences (including Admin); free-tier integrations only.

**Out of scope for v1** (see §12): paid payment gateways, iOS release, SMS OTP, ML-based matching, native desktop apps.

### 1.5 Definitions
| Term | Meaning |
|---|---|
| Listing | A device listing created by an owner (`DeviceListings`) |
| Provider | Technician, Refurbisher, Recycling Center, or eligible donation recipient |
| Verified | Provider whose documents an Admin approved |
| Green Score | Per-user sustainability score computed from **verified** completed activities |
| Actual vs Estimated | *Actual* = measured/recorded by a verified party. *Estimated* = derived from category factors. Never mixed in one number. |

---

## 2. Constraints

### 2.1 Architecture constraints (mandatory)
| ID | Constraint |
|---|---|
| CON-01 | Exactly **two frontends** (React web, Flutter Android) share **one** Node.js/Express backend and **one** MongoDB database. No second backend, no second database. |
| CON-02 | Web: MongoDB, Express, React (Vite), Node, Tailwind CSS, React Router, Axios, Redux Toolkit *or* Context API, Recharts, Lucide React, React Hook Form, Framer Motion (from §18). |
| CON-03 | Mobile: Flutter/Dart, Provider *or* Riverpod, Dio, Flutter Map, Image Picker, Geolocator, Firebase Cloud Messaging. |
| CON-04 | Backend: Mongoose, REST, JWT, bcrypt, Socket.IO. |
| CON-05 | Data written on one client must be immediately visible on the other (listings, requests, approvals, notifications, profiles, chat). |
| CON-06 | Monorepo layout: `web/`, `mobile/`, `backend/`, `docs/`, `README.md`, `.gitignore`. |

### 2.2 Free API policy (mandatory)
Only free APIs, free tiers and open-source technology.

| Approved | Purpose | Required fallback when unavailable |
|---|---|---|
| MongoDB Atlas free tier (or local MongoDB in dev) | Database | Local MongoDB |
| Cloudinary free tier | Image storage | Local disk storage in dev mode (clearly flagged) |
| Firebase Cloud Messaging | Mobile push | In-app notification centre + Socket.IO still work |
| Google Gemini free tier | Optional AI classification | Manual selection + rule-based classifier |
| OpenStreetMap, Leaflet, Flutter Map | Maps | Manual address/coordinates entry |
| Nominatim | Geocoding | Manual lat/lng entry; cached results |
| Socket.IO | Realtime chat | REST polling for messages |
| Nodemailer + free SMTP | Email | Log email to console in dev; verification may be skipped in dev |
| JWT, bcrypt | Auth | — |

**Prohibited:** Google Maps/Places/Routes APIs, Razorpay or any paid gateway, paid AI APIs, paid SMS OTP, paid image hosting/cloud storage/geocoding/notification services, any mandatory paid subscription.

| ID | Rule |
|---|---|
| CON-10 | Verify each service's *current* free-tier availability before integrating; document limits. |
| CON-11 | Never enable paid billing; never silently switch to a paid API; never intentionally exceed free limits. |
| CON-12 | Every external integration has a graceful fallback (table above). |
| CON-13 | Secrets live in environment variables only; never in frontend code or git. |
| CON-14 | Respect Nominatim/OSM public usage policies (rate limit, identifying User-Agent, caching, no bulk/autocomplete abuse). Public OSM infrastructure is not unlimited production infrastructure. |
| CON-15 | Payments are **offline only**: cash-on-delivery, offline payment records, manual confirmation. |
| CON-16 | Do not claim an external service works until it has actually been tested. |

---

## 3. Roles and access

| # | Role | Self-register? | Needs Admin verification? |
|---|---|---|---|
| 1 | General User (individual, household, business, institution owning devices) | Yes | No (donation recipients: yes — see A-02) |
| 2 | Repair Technician | Yes | **Yes** |
| 3 | Electronics Student | Yes | **Yes** (student ID) |
| 4 | Refurbisher | Yes | **Yes** |
| 5 | Recycling Center | Yes | **Yes** |
| 6 | Administrator | **No** (seeded / created by an existing admin) | — |

### 3.1 Permission matrix
✔ = allowed · ◐ = limited (own data / after verification) · — = no

| Capability | User | Technician | Student | Refurbisher | Recycler | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Browse public pages, marketplace, centres | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Create/edit/delete own device listing | ✔ | ◐ | — | ◐ | — | ✔ (remove any) |
| Request repair / donation / recycling / refurbishment | ✔ | — | — | — | — | — |
| Submit repair quotation | — | ◐ verified | — | — | — | — |
| Update repair progress | — | ◐ assigned | ◐ supervised notes | — | — | ✔ |
| Browse nearby repair requests | — | ◐ verified | — | — | — | ✔ |
| Apply to learning opportunities | — | — | ◐ verified | — | — | — |
| Post learning opportunities | — | ◐ verified | — | — | — | ✔ |
| Make purchase offers on reusable devices | — | — | — | ◐ verified | — | — |
| List refurbished products | — | — | — | ◐ verified | — | ✔ (moderate) |
| Place marketplace order / enquiry | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Accept collections, record recovered materials | — | — | — | — | ◐ verified | ✔ (view) |
| Request donations | ◐ verified org | — | — | — | — | ✔ |
| Review a provider | ◐ completed txn | ◐ completed txn | — | ◐ completed txn | ◐ completed txn | — |
| Approve/reject verification, suspend accounts | — | — | — | — | — | ✔ |
| Manage categories, announcements, complaints, audit log | — | — | — | — | — | ✔ |

Server-side enforcement is mandatory (NFR-SEC-03); hiding UI is not access control.

---

## 4. Functional requirements

### 4.1 Authentication & account management — `AUTH` (Phase 3)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-AUTH-001 | Register with name, email, password, phone, role (Admin excluded). Role-specific profile is created with the account. | M |
| FR-AUTH-002 | Passwords hashed with bcrypt; password policy enforced (min length, complexity). | M |
| FR-AUTH-003 | Login returns a short-lived access token and a refresh token; refresh tokens are rotated and revocable. | M |
| FR-AUTH-004 | Logout revokes the refresh token/session. | M |
| FR-AUTH-005 | Forgot/reset password via time-limited, single-use token delivered by email. | M |
| FR-AUTH-006 | Email verification where free SMTP is available; dev fallback documented. | S |
| FR-AUTH-007 | `GET /api/auth/me` returns the current user, role, status and verification state. | M |
| FR-AUTH-008 | Role-based access control middleware on every protected route; unauthorised access returns 401/403. | M |
| FR-AUTH-009 | Account status: `active`, `pending_verification`, `suspended`, `deleted`(soft). Suspended users cannot log in or act. | M |
| FR-AUTH-010 | Session management: list/revoke active sessions (device/IP/last used). | S |
| FR-AUTH-011 | Brute-force protection: rate limiting and temporary lockout on repeated failed logins. | M |

### 4.2 Profiles — `USER` (Phase 3)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-USER-001 | View/update own profile (name, phone, bio, address area, preferences). | M |
| FR-USER-002 | Upload/replace profile photo (type/size validated). | M |
| FR-USER-003 | View another user's **public** profile (never email, phone or exact address). | M |
| FR-USER-004 | Role-specific profile data: Technician (qualifications, experience, specialisations, device categories, service location, availability, base rate); Student (college, course, year, student ID); Refurbisher (business info, categories); Recycling Center (facility, authorisation numbers, collection locations, accepted categories). | M |
| FR-USER-005 | Technician availability schedule/toggle affects matching. | M |
| FR-USER-006 | Account deletion request (soft delete, retains legally required records). | S |

### 4.3 Verification — `VER` (Phase 3, 6)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-VER-001 | Technician, Student, Refurbisher, Recycling Center submit verification documents (`POST /api/technicians/verification` and equivalents). | M |
| FR-VER-002 | Documents are stored **privately** (not publicly reachable); only the owner and Admin can view them via short-lived signed access. | M |
| FR-VER-003 | Admin can list, filter, review, **approve** or **reject** (with mandatory reason) each application (`/api/admin/verifications`). | M |
| FR-VER-004 | Verification statuses: `not_submitted`, `pending`, `approved`, `rejected`, `resubmission_required`. Applicant is notified of each change. | M |
| FR-VER-005 | Unverified providers can edit their profile but are **not** listed in matching, discovery maps or marketplace. | M |
| FR-VER-006 | Only verified recyclers appear as "Authorized Recycling Center"; authorisation status is shown. | M |
| FR-VER-007 | Rejected applicants can resubmit; history is retained. | M |
| FR-VER-008 | Every verification decision is written to the audit log. | M |

### 4.4 Device listing — `DEV` (Phase 2, 4)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-DEV-001 | Create a listing with: device name, category, brand, model, purchase year, age, condition, description, multiple photos, approximate location, preferred service, expected price (where applicable), pickup preference. | M |
| FR-DEV-002 | **Categories (15):** Laptop, Desktop computer, Smartphone, Tablet, Monitor, Television, Keyboard, Mouse, Printer, Charger, Battery, Electronic accessories, Circuit boards, Computer components, Other. Admin-manageable. | M |
| FR-DEV-003 | **Conditions (5):** Fully working, Minor damage, Major damage, Not working, For spare parts. | M |
| FR-DEV-004 | **Preferred service (5):** Repair, Reuse, Donation, Refurbishment, Recycling. | M |
| FR-DEV-005 | Each listing has unique ID, owner, creation date, device details, photos, location, status, preferred service. | M |
| FR-DEV-006 | View, edit, delete (soft) own listings. Edit/delete only while the listing is not locked by an active service (see BR-03). | M |
| FR-DEV-007 | Search (text), filter by category, condition, service type, location/radius; paginated results; sort. | M |
| FR-DEV-008 | Listing statuses: `draft`, `listed`, `in_service`, `completed`, `withdrawn`, `removed_by_admin`. | M |
| FR-DEV-009 | Public listing views show approximate location only. | M |
| FR-DEV-010 | Users can report a listing; reports go to the Admin queue. | M |
| FR-DEV-011 | Data-protection checklist is shown and must be acknowledged before handover (NFR-SEC-14). | M |
| FR-DEV-012 | Max photos per listing and per-file size limits are enforced (default ≤ 6 photos, ≤ 5 MB each; configurable). | M |

### 4.5 Smart matching — `MATCH` (Phase 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-MATCH-001 | Rule-based, transparent, modular engine ranking providers by: device category, condition, preferred service, provider specialisation, geographic proximity, availability, rating, verification status. | M |
| FR-MATCH-002 | **Repair** → nearby verified technicians; each result shows name, photo, experience, specialisation, rating, distance, estimated service charge, availability, verification badge. | M |
| FR-MATCH-003 | **Recycling** → verified recycling centres accepting that category. | M |
| FR-MATCH-004 | **Donation** → eligible recipient organisations/institutions. | M |
| FR-MATCH-005 | **Refurbishment/Reuse** → suitable verified refurbishers. | M |
| FR-MATCH-006 | Each result exposes a match score and human-readable reasons ("2.3 km away, specialises in laptops"). | S |
| FR-MATCH-007 | Matching weights are configuration, not hard-coded constants scattered in code. | M |
| FR-MATCH-008 | User can pick a result and send a service request directly. | M |

### 4.6 Repair & service management — `SVC` (Phase 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-SVC-001 | Create a service request for a listing, either **targeted** (to a chosen technician) or **open** (visible to matching nearby technicians). | M |
| FR-SVC-002 | Technician can accept or reject a targeted request, and browse/respond to open requests with photos visible. | M |
| FR-SVC-003 | Technician submits a **quotation** (amount, breakdown, parts, ETA, validity) via `POST /api/service-requests/:id/quotation`. | M |
| FR-SVC-004 | Customer can accept or reject a quotation. **Paid repair work cannot start until the customer approves.** | M |
| FR-SVC-005 | **12 statuses:** 1 Request Submitted · 2 Technician Assigned · 3 Device Collection Pending · 4 Device Collected · 5 Diagnosis in Progress · 6 Quotation Submitted · 7 Customer Approval Pending · 8 Repair in Progress · 9 Repair Completed · 10 Device Delivery Pending · 11 Device Delivered · 12 Service Completed. Plus terminal `rejected` and `cancelled`. | M |
| FR-SVC-006 | Status changes via `PUT /api/service-requests/:id/status`; only permitted actors and legal transitions are accepted; every change is timestamped with actor and note. | M |
| FR-SVC-007 | Technician adds repair notes and uploads progress and completion photos. | M |
| FR-SVC-008 | Customer confirms completion; this unlocks reviews and impact/Green Score credit. | M |
| FR-SVC-009 | Service history list/detail for both parties. | M |
| FR-SVC-010 | Request tracking page shows a timeline of all status events. | M |
| FR-SVC-011 | Supervised student participation can be attached to a request (see FR-STU). | S |

### 4.7 Donations — `DON` (Phase 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-DON-001 | Create donation listing for working or repairable devices. | M |
| FR-DON-002 | Browse/search/filter donations; view condition and photos. | M |
| FR-DON-003 | Verified educational institutions/eligible organisations submit donation requests (`POST /api/donations/:id/request`) with justification. | M |
| FR-DON-004 | Donor accepts/rejects requests; only one accepted recipient per device. | M |
| FR-DON-005 | Schedule handover (date, time, place area); track status via `PUT /api/donations/:id/status`. | M |
| FR-DON-006 | Both parties confirm completion; system generates a downloadable **donation confirmation** (PDF/printable page) with reference ID. | M |
| FR-DON-007 | Donation history for donors and recipients. | M |

### 4.8 Refurbishment marketplace — `MKT` (Phase 4, 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-MKT-001 | Refurbishers browse reusable listings, see condition, and submit purchase offers or request collection. | M |
| FR-MKT-002 | Owner accepts/rejects offers; accepted offer creates a pickup/collection record. | M |
| FR-MKT-003 | Refurbishers manage refurbishment jobs: statuses `received`, `assessment`, `in_progress`, `testing`, `ready_to_list`, `listed`; upload **before and after** photos. | M |
| FR-MKT-004 | Refurbishers create marketplace products: name, brand, model, specs, condition, refurbishment info, price, multiple photos, category. | M |
| FR-MKT-005 | **Product categories:** refurbished laptops, smartphones, tablets, desktops, monitors, accessories. | M |
| FR-MKT-006 | Public marketplace: search, category filter, price filter, sort, pagination, product details with seller info. | M |
| FR-MKT-007 | Every product is visibly labelled **Refurbished** with disclosed condition. | M |
| FR-MKT-008 | Buyers send purchase enquiries and can chat with the seller. | M |
| FR-MKT-009 | Buyers place orders (`POST /api/orders`); payment = COD / offline record / manual confirmation. Seller manages order statuses; both see order history. | M |
| FR-MKT-010 | Product stock/availability decremented on confirmed order; sold items auto-hidden. | M |

### 4.9 Recycling — `REC` (Phase 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-REC-001 | Browse verified recycling centres with details and authorisation status. | M |
| FR-REC-002 | Submit recycling request (categories, photos, pickup location, schedule). | M |
| FR-REC-003 | Centre accepts/rejects, schedules pickup, updates status (`PUT /api/recycling-requests/:id/status`): `requested`, `accepted`, `pickup_scheduled`, `collected`, `received_at_center`, `processed`, `completed`, `rejected`, `cancelled`. | M |
| FR-REC-004 | User confirms handover; centre confirms receipt. Both confirmations are recorded. | M |
| FR-REC-005 | Centre records **recovered materials** by category (copper, aluminium, iron, plastics, glass, other) with `actual` and `estimated` quantities stored in **separate fields**. | M |
| FR-REC-006 | Centre can generate recycling reports (date range, category, totals) and view historical activity. | M |
| FR-REC-007 | Only verified, non-suspended centres can be selected. | M |

### 4.10 Maps & location — `MAP` (Phase 4, 8)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-MAP-001 | Interactive OpenStreetMap maps: Leaflet (web), Flutter Map (mobile). | M |
| FR-MAP-002 | Show nearby technicians, recycling centres, refurbishers with markers (`GET /api/technicians/nearby` etc.). | M |
| FR-MAP-003 | User can set pickup/listing location by tapping the map, typing an address (Nominatim), or using device GPS. | M |
| FR-MAP-004 | If location permission is denied, manual address entry is available. | M |
| FR-MAP-005 | Approximate distance (km) shown for each provider. | M |
| FR-MAP-006 | Residential addresses are never public; markers for private users are fuzzed; exact address shared only with the assigned provider after acceptance. | M |
| FR-MAP-007 | Geocoding is proxied and cached by the backend and throttled per Nominatim policy. | M |

### 4.11 Real-time chat — `CHAT` (Phase 8)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-CHAT-001 | One-to-one conversations tied to a context (service request, order enquiry, recycling request, donation). | M |
| FR-CHAT-002 | Supported pairs: customer↔technician, customer↔refurbisher, customer↔recycling centre, donor↔recipient. | M |
| FR-CHAT-003 | Conversation list with last message, unread count. | M |
| FR-CHAT-004 | Persistent message history with timestamps; read receipts. | M |
| FR-CHAT-005 | Basic attachments (images/PDF, type/size validated). | S |
| FR-CHAT-006 | Socket.IO delivers messages in real time; REST endpoints provide history and fallback. | M |
| FR-CHAT-007 | Only participants of the related request can join/read a conversation (server-checked on every socket event and REST call). | M |
| FR-CHAT-008 | New message creates a notification when the recipient is offline. | M |

### 4.12 Notifications — `NOTIF` (Phase 8)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-NOTIF-001 | In-app notification centre (web + mobile): list, unread badge, mark read (`PUT /api/notifications/:id/read`), mark all read. | M |
| FR-NOTIF-002 | FCM push on mobile for: new service request, request accepted/rejected, new quotation, quotation approved, pickup scheduled, device collected, repair progress, repair completed, donation accepted, recycling confirmed, new chat message, verification status change. | M |
| FR-NOTIF-003 | Device token registration/deregistration per user; stale tokens pruned. | M |
| FR-NOTIF-004 | Users can set notification preferences per channel. | C |
| FR-NOTIF-005 | If FCM credentials are absent, push is skipped with a logged warning; in-app notifications continue. | M |

### 4.13 Ratings & reviews — `REV` (Phase 5)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-REV-001 | 1–5 star rating plus written review for technicians, refurbishers, recycling services and donation experiences. | M |
| FR-REV-002 | Sub-ratings: service quality, communication, timeliness. | M |
| FR-REV-003 | Only a party to a **completed** transaction may review, once per transaction. | M |
| FR-REV-004 | Reviews can be reported; Admin can hide/remove (`/api/admin` review management). | M |
| FR-REV-005 | Provider aggregate rating (mean and count) updated atomically. | M |

### 4.14 Environmental impact & Green Score — `IMP` (Phase 9)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-IMP-001 | Public/platform stats: devices listed, repaired, reused, donated, refurbished, recycled, diverted from disposal; estimated recovered materials; active technicians; student participants; completed donations. | M |
| FR-IMP-002 | Analytics: monthly, yearly, per-category, device recovery, recycling, per-user and platform-wide impact; Recharts on web. | M |
| FR-IMP-003 | **Green Score** computed from transparent, documented rules, using **completed and verified** activities only (repair, donation, reuse, refurbishment, authorised recycling). | M |
| FR-IMP-004 | User sees score, achievements/badges and a contribution history (ledger). | M |
| FR-IMP-005 | UI clearly distinguishes **actual measurements** from **estimates**. | M |
| FR-IMP-006 | Impact figures are driven by recorded events, never hard-coded. | M |

### 4.15 AI device classification — `AI` (Phase 9)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-AI-001 | User uploads a photo; Gemini (free tier) may suggest category, device type, possible brand, visible damage, possible repair needs. | S |
| FR-AI-002 | User must confirm or correct suggestions before they are saved. | S |
| FR-AI-003 | UI wording never claims internal hardware damage can be determined from a photo. | S |
| FR-AI-004 | If Gemini is unavailable/quota-limited/not configured, fall back to manual selection and a rule-based classifier (keywords from name/description). | S |

### 4.16 Student learning — `STU` (Phase 5, 9)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-STU-001 | Student registers with college, course, student ID upload; Admin verifies. | M |
| FR-STU-002 | **Practical Learning Opportunities:** list shows task, device type, required skills, supervising technician, location, difficulty, application deadline, assignment status. | M |
| FR-STU-003 | Verified technicians create opportunities; verified students apply (`POST /api/students/applications`); technician accepts/rejects. | M |
| FR-STU-004 | Students only join **supervised** tasks; hazardous e-waste handling is excluded from student tasks and tagged accordingly. | M |
| FR-STU-005 | Track assignments; completed ones feed experience history (`GET /api/students/experience`) and a skill portfolio. | M |
| FR-STU-006 | Participation certificate issued on supervisor completion + Admin approval; downloadable with unique certificate ID. | S |

### 4.17 Pickup scheduling — `PICK` (Phase 9)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-PICK-001 | Select collection date and preferred time slot; submit pickup request. | M |
| FR-PICK-002 | View pickup status; provider confirms or proposes a new slot. | M |
| FR-PICK-003 | Reschedule while status is eligible (not yet collected). | M |
| FR-PICK-004 | Confirm handover (both parties), after the data-protection checklist. | M |

### 4.18 Environmental education — `EDU` (Phase 4, 9)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-EDU-001 | Content pages/articles on: e-waste problems, safe disposal, reuse, repair benefits, recycling, data security before handover, sustainability. | M |
| FR-EDU-002 | Admin can create/edit/publish education content. | S |

### 4.19 Administrator — `ADM` (Phase 6)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-ADM-001 | Separate admin login and dashboard (route-protected + server-side authorised). | M |
| FR-ADM-002 | **Overview tiles:** total/active users; technicians; students; refurbishers; recycling centres; device listings; repair, donation, refurbishment and recycling counts; completed services; pending verifications. | M |
| FR-ADM-003 | Users: list, search, filter by role, view profile, suspend, reactivate (reason required). | M |
| FR-ADM-004 | Verification queue: review documents, approve, reject with reason, track status. | M |
| FR-ADM-005 | Listings: view, search, review reported, remove inappropriate; manage device categories. | M |
| FR-ADM-006 | Monitor repair requests, donations, refurbishment activity, recycling requests, transactions. | M |
| FR-ADM-007 | Complaints: view, assign, update status, resolve, retain history. | M |
| FR-ADM-008 | Review moderation. | M |
| FR-ADM-009 | Analytics: monthly registrations, categories, service activity, donation and recycling statistics, environmental impact, platform growth. | M |
| FR-ADM-010 | Generate/export reports (CSV at minimum). | S |
| FR-ADM-011 | Manage platform announcements shown to users. | S |
| FR-ADM-012 | **Audit log** of administrative actions (who, what, target, when, before/after). Immutable from the UI. | M |

### 4.20 Complaints, transactions & support — `CMP`, `TXN` (Phase 6)
| ID | Requirement | Pri |
|---|---|:--:|
| FR-CMP-001 | Users file a complaint against a provider/listing/order with description and optional evidence. | M |
| FR-CMP-002 | Complaint lifecycle: `open → assigned → in_review → resolved/rejected`; both parties notified. | M |
| FR-TXN-001 | Transaction records (quotation payments, orders, offline payments, donations as zero-value) with status and offline payment method/reference. | M |
| FR-TXN-002 | Users see their transaction history; technicians/refurbishers see earnings and recorded payments. | M |
| FR-SUP-001 | Help & Support and Contact pages with a working contact/support form. | M |

---

## 5. Business rules

| ID | Rule |
|---|---|
| BR-01 | Only **admin-verified** providers appear in matching, maps and the marketplace. |
| BR-02 | A paid repair cannot move to *Repair in Progress* without customer approval of a quotation. |
| BR-03 | A listing with an active service/offer/request cannot be deleted and has restricted editing. |
| BR-04 | Reviews require a completed transaction between the reviewer and the provider; one review per transaction. |
| BR-05 | Green Score and impact counters change only on **completed and verified** events (e.g., customer-confirmed repair, recipient-confirmed donation, centre-confirmed recycling). |
| BR-06 | Actual and estimated quantities are stored and displayed separately. |
| BR-07 | Students may only take part in supervised tasks; no independent hazardous-waste handling. |
| BR-08 | Exact addresses are visible only to the counterparty of an accepted request, and only until completion. |
| BR-09 | Suspended accounts cannot log in, transact, or appear in listings; their data is retained. |
| BR-10 | Payments are recorded offline; the platform never processes money. |
| BR-11 | Refurbished products must show condition and a "Refurbished" label. |
| BR-12 | Handover requires acknowledgement of the data-protection checklist. |
| BR-13 | All admin actions are audit-logged. |
| BR-14 | Deletion is soft where records have legal, financial or reputational value. |
| BR-15 | Admin accounts cannot be created via public registration. |

---

## 6. Non-functional requirements

### 6.1 Security & privacy (`NFR-SEC`)
| ID | Requirement |
|---|---|
| NFR-SEC-01 | bcrypt password hashing (cost ≥ 10; configurable). |
| NFR-SEC-02 | JWT access tokens (short TTL) + rotating refresh tokens; web stores refresh token in an `httpOnly` cookie, mobile in secure storage. |
| NFR-SEC-03 | Role-based authorisation **and** resource-ownership checks on the server for every endpoint. |
| NFR-SEC-04 | Input validation on every endpoint (schema validator); reject unknown fields. |
| NFR-SEC-05 | NoSQL-injection protection (operator sanitisation, typed queries). |
| NFR-SEC-06 | Rate limiting (global, stricter on auth, uploads, geocoding, chat). |
| NFR-SEC-07 | Upload validation: MIME + magic-byte check, extension allow-list, size limits, random filenames. |
| NFR-SEC-08 | Verification documents stored privately with signed, expiring access. |
| NFR-SEC-09 | CORS allow-list from environment; security headers (Helmet); HTTPS in production. |
| NFR-SEC-10 | Secrets in environment variables only; `.env.example` committed, `.env` ignored. |
| NFR-SEC-11 | Audit log for administrative and verification actions. |
| NFR-SEC-12 | Socket.IO connections authenticated with JWT; room joins authorised. |
| NFR-SEC-13 | PII minimisation: public API responses exclude email, phone, exact address. |
| NFR-SEC-14 | Data-protection checklist shown before handover: back up data; sign out of accounts; remove device locks where appropriate; remove SIM; remove memory cards; securely erase personal data; confirm handover. |
| NFR-SEC-15 | Consent, privacy notice, data-retention and deletion paths designed against India's e-waste rules and data-protection law (see A-09). |

### 6.2 Performance (`NFR-PERF`)
| ID | Requirement |
|---|---|
| NFR-PERF-01 | List endpoints paginate (default 12–20, max 100). |
| NFR-PERF-02 | Indexes on all filter/sort/lookup fields and a `2dsphere` index for geo queries. |
| NFR-PERF-03 | Typical API response ≤ 500 ms (p95) at expected load on free-tier infrastructure (excluding cold start). |
| NFR-PERF-04 | Images optimised (WebP/AVIF where possible), lazy-loaded, responsive sizes; Cloudinary transformations used. |
| NFR-PERF-05 | `backdrop-filter` used sparingly (≤ 2–3 stacked blur layers per view); animations GPU-friendly and lightweight. |
| NFR-PERF-06 | Flutter: `const` widgets, minimal rebuilds, cached network images, pagination on lists. |
| NFR-PERF-07 | Web: route-level code-splitting; Lighthouse Performance target ≥ 85 on the landing page (mobile profile). |

### 6.3 Usability, accessibility & design (`NFR-UX`)
| ID | Requirement |
|---|---|
| NFR-UX-01 | Responsive: desktop, laptop, tablet, mobile browsers; Flutter on varied Android sizes. |
| NFR-UX-02 | WCAG 2.1 AA contrast for text and UI components; visible focus; keyboard navigation; semantic HTML; labelled form fields; alt text. |
| NFR-UX-03 | Every screen implements loading (skeleton), empty, success and error states. |
| NFR-UX-04 | Every form validated client- and server-side with clear messages. |
| NFR-UX-05 | Light and dark themes; persisted choice; respects OS preference. |
| NFR-UX-06 | `prefers-reduced-motion` respected (web) and `MediaQuery.disableAnimations` (Flutter). |
| NFR-UX-07 | One design system across web and mobile (see `design.md` Part B): glassmorphism, premium palette, Inter / Plus Jakarta Sans / Manrope, Lucide icons. |
| NFR-UX-08 | No basic Bootstrap-style UI, no plain white pages with ordinary cards, no effect overload. |
| NFR-UX-09 | No dead buttons: every visible control performs a real action or is not shown. |

### 6.4 Reliability & operations (`NFR-OPS`)
| ID | Requirement |
|---|---|
| NFR-OPS-01 | Centralised error handling; consistent JSON error envelope; no stack traces in production responses. |
| NFR-OPS-02 | Structured logging; health endpoint `GET /api/health`. |
| NFR-OPS-03 | Graceful degradation of every external service (§2.2). |
| NFR-OPS-04 | Seed script: admin, categories, demo data (dev only). |
| NFR-OPS-05 | Mobile app shows cached data offline (read-only) and queues nothing destructive. |
| NFR-OPS-06 | Reproducible setup via documented steps and `.env.example` files for backend, web and mobile. |

### 6.5 Maintainability & quality (`NFR-QA`)
| ID | Requirement |
|---|---|
| NFR-QA-01 | Modular backend (routes → controllers → services → models), reusable React components and Flutter widgets. |
| NFR-QA-02 | Automated tests for backend modules (§9), web and Flutter key flows. |
| NFR-QA-03 | Documentation kept in sync: README, API docs, DB schema, architecture, setup, testing, deployment. |
| NFR-QA-04 | Linting/formatting configured (ESLint + Prettier; `flutter analyze`). |
| NFR-QA-05 | A maintained progress checklist (`tasklist.md`). |

### 6.6 Compatibility
- Web: current evergreen Chrome, Edge, Firefox, Safari (backdrop-filter fallback for unsupported cases).
- Android: API level 24+ (Android 7.0) as the default minimum; confirm during Phase 1.
- Node.js current LTS; Flutter stable channel.

---

## 7. Interfaces

### 7.1 REST API (required endpoints)

| Group | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password` · `GET /api/auth/me` |
| Users | `GET /api/users/profile` · `PUT /api/users/profile` · `GET /api/users/:id` |
| Devices | `POST /api/devices` · `GET /api/devices` · `GET /api/devices/:id` · `PUT /api/devices/:id` · `DELETE /api/devices/:id` |
| Services | `POST /api/service-requests` · `GET /api/service-requests` · `GET /api/service-requests/:id` · `PUT /api/service-requests/:id/status` · `POST /api/service-requests/:id/quotation` |
| Technicians | `GET /api/technicians` · `GET /api/technicians/nearby` · `GET /api/technicians/:id` · `POST /api/technicians/verification` |
| Students | `GET /api/students/opportunities` · `POST /api/students/applications` · `GET /api/students/experience` |
| Donations | `POST /api/donations` · `GET /api/donations` · `POST /api/donations/:id/request` · `PUT /api/donations/:id/status` |
| Marketplace | `GET /api/marketplace` · `POST /api/marketplace` · `GET /api/marketplace/:id` · `POST /api/orders` |
| Recycling | `GET /api/recycling-centers` · `POST /api/recycling-requests` · `GET /api/recycling-requests` · `PUT /api/recycling-requests/:id/status` |
| Notifications | `GET /api/notifications` · `PUT /api/notifications/:id/read` |
| Analytics | `GET /api/analytics/user-impact` · `GET /api/analytics/platform-impact` · `GET /api/analytics/monthly` |
| Admin | `GET /api/admin/dashboard` · `GET /api/admin/users` · `GET /api/admin/verifications` · `PUT /api/admin/verifications/:id` · `GET /api/admin/analytics` |
| Additional (required by SRS §11, paths defined in `design.md` §A.14) | Chat · Reviews · Pickup scheduling · Complaints · Transactions · Student applications · Learning opportunities · Refurbishment management |

Common API requirements: JSON envelope, pagination (`page`, `limit`), validation errors with field-level detail, 401/403/404/409/422/429 semantics, auth + authorisation per route.

### 7.2 Real-time (Socket.IO)
Authenticated connection; events for message send/receive, typing, read receipts, notification push. Details in `design.md` §A.9.

### 7.3 Web pages (30)
**Public (16):** Landing · About Us · How It Works · Browse Devices · List Your Device · Find Technicians · Recycling Centers · Donation Marketplace · Refurbished Marketplace · Environmental Impact · Environmental Education · Login · Registration · Privacy Policy · Terms and Conditions · Contact and Support.
**Authenticated (14):** User Dashboard · Technician Dashboard · Student Dashboard · Refurbisher Dashboard · Recycling Center Dashboard · Admin Dashboard · Device Details · Service Details · Request Tracking · Chat · Notifications · Profile Settings · Transaction History · Help and Support.

*Note:* "List Your Device" is reachable publicly but prompts login before submission.

**Landing page:** nav (Logo, Home, How It Works, Browse Devices, Find Services, Marketplace, Environmental Impact, Login, Get Started); hero ("Give Your Electronics a Second Life.", CTAs "List Your E-Waste" and "Explore Opportunities"); sections: How It Works, Device Categories, Repair Services, Student Opportunities, Donation Marketplace, Refurbished Products, Recycling Partners, Environmental Impact Statistics, Featured Technicians, Testimonials, FAQ, Footer.

### 7.4 Mobile screens (23)
Splash · Onboarding · Login · Registration · Role Selection · Home Dashboard · Device Listing · Camera Upload · Device Details · Service Selection · Nearby Technicians · Recycling Centers · Donation Marketplace · Refurbished Marketplace · Student Opportunities · Request Tracking · Chat · Notifications · Environmental Impact · User Profile · Settings · Transaction History · Help and Support.

Mobile requirements: secure token storage, camera and gallery access, location permission, image upload, FCM, real-time chat, form validation, loading/error handling, offline-friendly cached data, floating glass bottom navigation. Mobile is **adapted**, not a shrunken website.

---

## 8. Data requirements

### 8.1 Collections required by the SRS (27)
Users · UserProfiles · Devices · DeviceListings · ServiceRequests · TechnicianProfiles · StudentProfiles · RefurbisherProfiles · RecyclingCenters · VerificationDocuments · Quotations · Donations · DonationRequests · MarketplaceProducts · Orders · Transactions · PickupSchedules · Conversations · Messages · Notifications · Reviews · RecyclingRecords · EnvironmentalImpact · Complaints · AdminLogs · StudentApplications · LearningOpportunities.

### 8.2 Additional collections identified during analysis
These are not named in the SRS but are required to satisfy listed features. They are proposed in `design.md` §A.3.

| Collection | Needed for |
|---|---|
| Categories | Admin-managed device categories (FR-DEV-002, FR-ADM-005) |
| RefreshTokens (or sessions) | Refresh rotation/revocation (FR-AUTH-003/010) |
| Reports | Reported listings/reviews (FR-DEV-010, FR-REV-004) |
| DeviceTokens | FCM tokens (FR-NOTIF-003) |
| GreenScoreLedger | Transparent Green Score history (FR-IMP-004) |
| Announcements | Admin announcements (FR-ADM-011) |
| EducationArticles | Education content (FR-EDU-002) |
| Certificates | Student participation certificates (FR-STU-006) |
| RefurbishmentJobs | Refurbishment progress and before/after photos (FR-MKT-003) |

### 8.3 Data-layer requirements
Mongoose schemas with validation; ObjectId references; indexes; timestamps; pagination; text search; ownership validation; soft deletion where appropriate; efficient queries (lean, projection, avoid N+1).

---

## 9. Acceptance criteria

### 9.1 Mandatory end-to-end repair scenario (SRS §14)
1. A user registers and logs in.
2. Lists an unused laptop with photos.
3. Selects **Repair**.
4. The matching engine recommends verified, nearby, available laptop technicians.
5. A technician submits a quotation.
6. The user approves the quotation.
7. The technician repairs the laptop.
8. The technician updates the status to completed.
9. The user confirms service completion.
10. The user submits a review.
11. The environmental dashboard and Green Score update with the completed, verified activity.

**Pass condition:** the same scenario succeeds when steps are split across web and Flutter (e.g., list on web, approve on mobile), with identical data visible on both.

### 9.2 Other required workflows (start to finish)
| Workflow | Pass condition |
|---|---|
| Donation | Donor lists → verified org requests → donor accepts → handover scheduled → both confirm → confirmation document generated → history + impact updated |
| Refurbishment | Owner lists reusable device → refurbisher offers → accepted → collected → refurbished with before/after photos → listed in marketplace → buyer orders (offline payment) → order completed |
| Recycling | User requests verified centre → accepted → pickup scheduled → collected → centre confirms receipt → records actual + estimated materials → report generated → impact updated |
| Student | Technician posts opportunity → student applies → accepted → supervised completion → experience/portfolio updated → certificate (when approved) |
| Verification | Provider submits docs → Admin approves/rejects with reason → provider notified → provider appears/does not appear in discovery |
| Moderation | User reports listing → Admin reviews → removes → owner notified → audit entry written |
| Suspension | Admin suspends user → login blocked → listings hidden → reactivation restores access |

### 9.3 Security acceptance
- Non-admin cannot call any `/api/admin/*` route (403) even with a forged client role.
- User A cannot read/modify User B's listings, requests, chats or documents (403/404).
- Unverified technician cannot quote or appear in search.
- NoSQL operator payloads (`{"$gt": ""}`) are rejected.
- Uploads with wrong type/oversize are rejected.
- Verification documents are not retrievable by unauthenticated URL.

### 9.4 Definition of Done (per feature)
Implemented against real MongoDB data · validated inputs · authz enforced · loading/empty/error/success states · responsive (web) · tests passing · docs updated · checklist ticked · works on both clients where applicable.

---

## 10. Assumptions and resolved ambiguities

| ID | Observation in SRS | Resolution adopted (confirm with product owner) |
|---|---|---|
| A-01 | SRS lists **Device** and **DeviceListing** collections without distinguishing them. | `Devices` = physical device facts (category, brand, model, specs, photos, history); `DeviceListings` = the market/service offering of a device (preferred service, status, price, pickup). One device can be re-listed later. |
| A-02 | Donation recipients are "verified educational institutions and eligible organisations", but only six roles exist. | Recipient = **General User with an organisation profile** (`orgType`: school, college, NGO, etc.) that must pass Admin verification before requesting donations. No seventh role. |
| A-03 | Repair flow mentions both choosing a technician and technicians browsing "nearby requests". | Support **targeted** and **open** requests (FR-SVC-001). |
| A-04 | Statuses 6 (*Quotation Submitted*) and 7 (*Customer Approval Pending*) are adjacent. | 6 is set on technician submit; 7 is set automatically once the customer has been notified. Both are recorded in history. A revised quotation after diagnosis restarts at 6. |
| A-05 | Two different hero supporting texts (§7 vs §18). | Hero uses §18 text ("Transform electronic waste into opportunities through repair, reuse, donation and responsible recycling."); §7 text is reused as the section/meta description. |
| A-06 | Two background colours (#F8FAF8 §7, #F5F8F5 §18) and white cards vs glass surfaces. | §18 supersedes §7: background `#F5F8F5`, glass surface `rgba(255,255,255,0.65)`. |
| A-07 | §18 adds Framer Motion, Plus Jakarta Sans/Manrope, dark theme; §2 library list omits them. | Add Framer Motion to the web stack. Inter for body, Plus Jakarta Sans for headings, Manrope optional for numerals/stat cards. |
| A-08 | "Redux Toolkit or Context API", "Provider or Riverpod" — choice left open. | Chosen in `design.md`: **Redux Toolkit** (web) and **Riverpod** (Flutter). Revisit in Phase 1. |
| A-09 | "Follow applicable Indian e-waste management and data protection requirements". | Design for India's E-Waste (Management) Rules and the Digital Personal Data Protection Act. Specific clauses (authorisation numbers, EPR, consent, retention) must be reviewed by a qualified legal/compliance professional before launch; the app records authorisation numbers and consent and supports deletion requests. |
| A-10 | Free-tier terms change over time. | Phase 8 starts with a documented verification of current Cloudinary, Firebase, Gemini, Atlas and SMTP limits; numbers are recorded in `docs/SETUP_GUIDE.md` with the date checked. |
| A-11 | Green Score and environmental estimates have no formula in the SRS. | Rule table and category conversion factors are defined as **configurable defaults** in `design.md` §A.6; factors must be sourced/cited before public claims are made. |
| A-12 | Mobile permitted for 6 roles? SRS says mobile has "all major user-facing functionality". | Mobile supports all five non-admin roles; the Admin dashboard is web-only. |
| A-13 | Documentation folder in SRS (`API_DOCUMENTATION.md`, etc.) vs requested `docs/` files. | The four planning files here sit alongside the four SRS docs inside `docs/`. |
| A-14 | Refresh tokens "where implemented". | Implemented (FR-AUTH-003) because mobile sessions need them. |

---

## 11. Traceability — modules to phases

| Module | Primary phase(s) |
|---|---|
| Architecture, repo, env, design tokens | P1 |
| Models, APIs, middleware, validation, error handling | P2 |
| AUTH, USER, VER (submission) | P3 |
| Public web pages, dashboards shell, DEV, marketplace browse, search | P4 |
| MATCH, SVC, DON, STU, MKT, REC business workflows, REV, TXN | P5 |
| ADM, CMP, VER (review), analytics | P6 |
| Flutter app | P7 |
| Cloudinary, FCM, Maps, Socket.IO (CHAT, NOTIF), Gemini, SMTP | P8 |
| IMP, Green Score, AI, material tracking, PICK, EDU | P9 |
| Testing, security checks, docs, deployment | P10 |

---

## 12. Out of scope / future enhancements
Paid payment gateways and escrow · SMS OTP · iOS build · ML/learned matching · route optimisation for pickups · multilingual UI · logistics partner integrations · carbon credits · blockchain-based certification · push-to-web notifications (optional).
