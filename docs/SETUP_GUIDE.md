# Setup Guide

## Prerequisites
Node.js LTS (>= 20), npm, MongoDB (local) or a MongoDB Atlas free cluster, Flutter stable + Android Studio (for mobile), Git.

## 1. Backend
```bash
cd backend
cp .env.example .env        # edit secrets
npm install
npm test                    # in-memory MongoDB (downloads mongod once) — or TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ewaste_test
npm run seed                # categories, admin, demo users (password Demo@12345, incl. school@demo.local, an approved recipient organisation), sample listings — dev only
npm run dev                 # http://localhost:5000/api/health
```
> Dependency versions in `package.json` were written without registry access. If `npm install` reports a missing version, adjust it and note it in `ARCHITECTURE.md`.

## 2. Web
```bash
cd web
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
npm test
```

## 3. Mobile
```bash
cd mobile
flutter create --platforms=android --org com.ewaste --project-name ewaste_opportunity .
#   ^ generates the android/ folder. Keep the existing lib/, pubspec.yaml and test/ files
#     (if flutter create overwrites any, restore them from git).
flutter pub get
flutter analyze && flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api   # Android emulator -> host machine
```

## Free-tier verification log (task P1-21 — TO DO, needs web access)
Record current free-tier limits and the date checked.
| Service | Checked on | Limits | Notes |
|---|---|---|---|
| MongoDB Atlas | | | |
| Cloudinary | | | |
| Firebase Cloud Messaging | | | |
| Gemini API | | | |
| SMTP provider | | | |
| Nominatim / OSM tiles | | usage policy: identify app via User-Agent, ~1 request/second, no bulk/autocomplete | confirm current policy |

## Optional services (all have a working fallback)

Nothing below is needed to run the app. Each service is switched on by environment variables in `backend/.env`; with them empty the app logs a short notice and carries on. **Check each provider's current free-tier limits before relying on it** (task P1-21) and record the date here.

| Service | Needs | Variables | Without it |
|---|---|---|---|
| Reminders and the scheduler | nothing to sign up for | `SCHEDULER_ENABLED` (default on; `false` to stop the five-minute job) | Pickup reminders go out a day before and about two hours before, to both people, once each |
| Simultaneous refresh grace | nothing | `REFRESH_GRACE_SECONDS` (default 10, `0` off) | Two tabs refreshing together are not treated as theft |
| Email (SMTP) | any SMTP account, e.g. a free Brevo or Gmail app password | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Emails are printed in the server log in development (verification and reset links are visible there) |
| Image and document storage | a free Cloudinary account | `STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Files go to `backend/uploads` on this computer; in production a missing Cloudinary setup is refused rather than quietly using the disk |
| Phone push | a free Firebase project, a service-account key file | `FIREBASE_SERVICE_ACCOUNT_PATH=C:/path/to/key.json` | Push is off; in-app notifications and live updates still work. The app also needs its own `google-services.json` (not committed) |
| Address search | none (OpenStreetMap Nominatim) | `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`, `NOMINATIM_CONTACT_EMAIL` | The search answers "unavailable" and people type the area and city themselves. Put a real contact address in the variables: the service's policy asks for one |
| AI suggestions | a free Gemini API key | `GEMINI_ENABLED=true`, `GEMINI_API_KEY`, `GEMINI_DAILY_LIMIT`, `GEMINI_MODEL` | Suggestions come from the words typed (rule-based); a photo is never sent anywhere |

How to check each one:
- **Email:** register a new account; the message arrives (or appears in the log). Both an HTML and a plain-text version are sent.
- **Cloudinary:** list a device with a photo; the photo address starts with `https://res.cloudinary.com/`. Upload a verification document as a provider: it is an *authenticated* upload with no public address, and an administrator can still open it.
- **Push:** sign in on the phone; the token is saved (`POST /api/notifications/devices`). Trigger any notification (for example send a chat message from the web) with the app in the background.
- **Address search:** `GET /api/geo/search?q=Indiranagar` with a signed-in token.
- **AI:** open "List a device", add a photo and press "Suggest what this is"; the result says "From your photo" when Gemini answered.

Limits to remember: Nominatim allows one request a second (the server queues and caches for you); a free Gemini key has a daily quota (`GEMINI_DAILY_LIMIT` keeps the app under it); push needs a Firebase project per app id.
