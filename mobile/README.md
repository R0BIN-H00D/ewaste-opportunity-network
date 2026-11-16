# E-Waste Network — Android app (Flutter)

The mobile client of the E-Waste-to-Opportunity Network. It talks to the **same backend and database** as the web app.

## Run on the Android emulator

1. Start the backend (`backend`: `npm run dev`, port 5000) and make sure MongoDB is running.
2. In this folder:

```
flutter pub get
flutter run
```

The emulator reaches your computer at `10.0.2.2`, so the default API address is `http://10.0.2.2:5000/api`.
Debug builds show the address under the sign-in form.

### Another address (a real phone, a deployed backend)

```
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5000/api
```

Use your computer's LAN address for a phone on the same Wi-Fi. Release builds must use `https`; plain `http` is allowed only in debug builds.

## Checks

```
flutter analyze
flutter test
```

## How sign-in works

- Every request sends `X-Client-Type: mobile`, so the server returns the refresh token in the JSON body (the web app uses a cookie instead).
- The **refresh token** is kept in secure storage (Android keystore). The **access token** lives in memory only.
- When a call gets `401`, one refresh is shared by all calls that failed at the same time, and the calls are replayed. If the server refuses the refresh token, the person is signed out.
- Demo accounts (after `npm run seed` in the backend): `user@demo.local`, `tech@demo.local`, `student@demo.local`, `refurb@demo.local`, `recycler@demo.local`, password `Demo@12345`.

## Layout

```
lib/
  core/        constants, theme, network errors, secure storage, validation
  models/      API shapes (user, session, me, listing, category)
  services/    ApiClient (Dio), repositories, photo picker
  providers/   Riverpod controllers (auth, onboarding, start-up, listings)
  routes/      go_router, redirect rules
  screens/     one folder per area (auth, home, account, devices)
  widgets/     shared glass widgets
  features/    small per-feature data (role actions)
```

Devices (browse, details, My listings, list-a-device wizard) are in. Screens for service requests, marketplaces and provider work arrive in the next slices (see `docs/tasklist.md`, Phase 7).

## Driving the emulator

`tool/drive.ps1` sends a comma-separated list of steps to the emulator with adb: `tap X Y`, `text WORDS`, `key CODE`, `wait SECS`, `shot NAME`, `swipe x1 y1 x2 y2`, `push NAME` (copies `build/photos/NAME` to the device gallery), `clear`, `reset` (clears app data and relaunches) and `open`. Screenshots land in `build/shots/NAME.png`. Coordinates are in device pixels, which are 1.5 times the size of a screenshot shown at 898 pixels wide.
