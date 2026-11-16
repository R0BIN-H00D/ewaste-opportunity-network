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
