# Haq Bahu Tandoor — mobile app (Android and iOS)

A Flutter app for the restaurant website in the parent folder. It has **no server of its own**: it calls the same
API as the website (default `https://hbt-ns.vercel.app`), so the menu, orders, accounts and staff roles are shared.

## What is in it

**Customers:** Home and Menu tabs, each with a Deals category, search, categories and favourites; product and deal
pages; cart; email one-time-code sign-in; checkout (delivery or pickup, map pin with delivery radius, coupons, payment details and screenshot); live
order tracking with timer; cancel, payment resubmission, feedback, reorder; call, WhatsApp, directions.
**Download Menu (PDF)** (Menu tab and More) saves the same published PDF as the website's button (see
`../docs/MENU_PDF.md`); it needs the website's menu PDF feature to be deployed.

While the shop has a timer on an order, the order screen shows a large countdown with a delivery rider who moves
through Confirmed, Cooking, Ready to go / pick and Completed. A payment reminder from the shop shows on the order
with the form to send proof.

**Staff:** there is no visible sign-in button. While not signed in as a customer, open **More**, scroll to the bottom
and tap the **version line seven times**. Staff stay signed in for 12 hours. Owner/admin get the whole admin portal: **Orders** (search, filters, accept, status
changes, payment check, confirm without proof, remind the customer, edit items, timer, discount, receipt, delete),
**Kitchen**, **Menu & Stock**, **Dashboard**, and under **More**: Deals, Menu PDF, Reports and exports, Customers and
Coupons, Storage and Backups (including reports from a saved backup), Activity and Staff Access (owner only) and Shop
Settings. Kitchen staff get the Kitchen board; riders get their Deliveries. A new-order alarm rings until the order is
accepted or cancelled.

Screens show the last data straight away and reload in the background; a read that fails on a weak connection is
retried by itself. Changes are never sent twice.

**Still only on the website:** browser notifications while closed (see below) and printing pages. The newest features
(payment reminders, confirm without proof) need the website's current code to be deployed.

## Build and run

Needs Flutter 3.50+, and for Android JDK 17 and the Android SDK.

```sh
flutter pub get
flutter run                         # a connected phone or emulator
flutter build apk --release         # build/app/outputs/flutter-apk/app-release.apk
```

Point a build at another server with `--dart-define=API_BASE=https://your-domain`.

### On the PC this was set up on

The tools are in `C:\dev` (Flutter, JDK 17, Android SDK) and are not on `PATH`. In PowerShell:

```powershell
$env:Path = "C:\dev\flutter\bin;C:\dev\jdk17\bin;$env:Path"
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\dev\tmp'   # avoids "Unable to establish loopback connection"
$env:GRADLE_USER_HOME = 'C:\dev\gradle-home'
$env:PUB_CACHE = 'C:\dev\pub-cache'
```

Build from a copy outside OneDrive (for example `C:\dev\hbt-build`), otherwise OneDrive syncs gigabytes of build
files and can lock them mid-build.

### iPhone

iOS can only be compiled on macOS with Xcode (your own Mac, or a cloud build service such as Codemagic):

```sh
flutter pub get
flutter build ipa
```

An Apple Developer account is needed to install on real iPhones and to publish. Set your team in
`ios/Runner.xcworkspace` → Runner → Signing & Capabilities.

## Tests

```sh
flutter analyze
flutter test
```

`test/e2e_local_test.dart` and `test/e2e_admin_local_test.dart` place orders, create accounts and take backups,
so they only run against a local copy of the website with a local database and a mail catcher. See the comment at the
top of each file. `test/admin_fixtures.json` holds answers saved from such a local copy (made-up data), and
`test/backup_fixture.json` a made-up backup with the website's own report of it.

## Before publishing to the stores

1. **Android signing:** release builds are currently signed with the debug key. Create an upload keystore and
   configure it in `android/app/build.gradle.kts` (never commit the keystore or its passwords).
2. **App ID:** `com.haqbahutandoor.app` (Android and iOS). Change it before the first upload if you want another
   one; it cannot be changed afterwards.
3. **Account deletion and privacy policy:** both stores require apps with accounts to let people delete their account
   and to link a privacy policy. The website's API has neither yet.
4. **Review sign-in:** reviewers cannot read your emails, so they need a test account whose code they can receive.
5. **Map tiles:** the map uses the free OpenStreetMap tile server (as the website does). Its usage policy does not
   cover heavy traffic.

## Not included

- **Push notifications while the app is closed.** The website's push uses browser Web Push, which a native app
  cannot receive. It needs Firebase Cloud Messaging (your own Firebase project and a small server change). Until
  then the new-order alarm works while the staff app is open; keep it on screen.
