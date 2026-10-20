# App Store Release Checklist

This checklist records the checked-in configuration and the checks still needed
for a release. It does not confirm an App Store upload or production readiness.

## Checked-in App Configuration

| Setting | Current value |
| --- | --- |
| Project / shared scheme | `MobileMessengerIOS.xcodeproj` / `MobileMessengerIOS` |
| Supported devices | iPhone and iPad, iOS 17.0 or later |
| Swift language mode | Swift 5 |
| Bundle identifier | `com.mobilemessenger.app` |
| Version / build | `MARKETING_VERSION = 1.0` / `CURRENT_PROJECT_VERSION = 1` |
| Target signing | Automatic signing, team `TUNYHP729L` |
| Run / archive configuration | Release |
| Test / analyze configuration | Debug |
| Active entitlements file | `MobileMessengerIOS/App/Utilities/MobileMessengerIOS.Free.entitlements` |

Both app build configurations use that entitlements file. Its
`aps-environment` value expands from `$(APS_ENVIRONMENT)`: Debug sets
`development`, and Release sets `production`. The other two checked-in
`MobileMessengerIOS.entitlements` files are not selected by the app target.
The active filename does not establish eligibility for APNs; verify the actual
Apple account, App ID, and provisioning profile.

Both Debug and Release enable realtime, push, and media. Only Debug enables
verbose logging. `Info.plist` includes the `remote-notification` background mode,
photo library, microphone, and when-in-use location purpose strings. It has no
`NSAllowsArbitraryLoads`; its insecure HTTP exceptions are limited to
`localhost` and `127.0.0.1`.

## Before Archive

- [ ] Resolve the release blockers in [the security audit](docs/SECURITY_AUDIT.md)
  and [E2EE integration gate](docs/E2EE_ARCHITECTURE.md). Production E2EE is not
  implemented; a successful iOS build does not close that gate.
- [ ] Verify `PRODUCTION_API_HOST` and `PRODUCTION_WS_HOST` in
  `MobileMessengerIOS/Configurations/Release.xcconfig`. They currently point to
  `phpstack-1634854-6489525.cloudwaysapps.com`, using HTTPS for `/api` and WSS for
  `/realtime`. Confirm the selected backend, TLS, authentication, media storage,
  and WebSocket behavior in the intended release environment.
- [ ] Confirm the Release build uses the intended API host. Debug may include a
  local `MobileMessengerIOS/Configurations/Debug.public.xcconfig`; Release does
  not include it. `Config/Config.example.xcconfig` is a reference template, not
  an automatically loaded override.
- [ ] Confirm the owning Apple Developer team, App ID, distribution signing,
  and provisioning profile for `com.mobilemessenger.app`. Do not assume the
  checked-in team identifier or development signing identity is suitable for
  distribution.
- [ ] Verify APNs capability and the signed archive's `aps-environment`, plus
  backend `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`,
  and `APNS_ENVIRONMENT`. Keep keys outside the repository. If push is excluded
  from the release, deliberately update the feature flag and capabilities.
- [ ] Confirm Release has no Debug demo-account buttons or runtime backend
  editor, and the production backend disables demo accounts and test OTPs.
  The iOS demo-account list is compiled only under `#if DEBUG`.
- [ ] Increment `MARKETING_VERSION` in the app target and
  `CURRENT_PROJECT_VERSION` in the applicable xcconfig files.
- [ ] Review the existing `AppIcon` asset set, including `icon-1024.png`, and
  capture final screenshots from the build being submitted.
- [ ] Review permission text and privacy disclosures against actual account,
  chat, media, push, and location behavior. Verify that location permission is
  requested through an explicit sharing action and that stopping sharing,
  grant expiry/revocation, and background transitions stop local tracking.

## Apple Account / App Store Connect

- [ ] Confirm or create the app record with the matching bundle identifier.
- [ ] Complete description, keywords, support URL, privacy policy URL, privacy
  disclosures, age rating, and review information for this release.
- [ ] Supply screenshots for the supported iPhone and iPad devices requested
  by App Store Connect. `docs/screenshots/` is portfolio documentation; it does
  not confirm that store screenshots have been uploaded.
- [ ] Give reviewers a working, approved access path and explain Telegram
  verification and any required setup without enabling public test credentials.
- [ ] Confirm that store text describes tested capabilities accurately and
  does not claim production E2EE or calls.

## Validation

- [ ] Run the iOS unit tests on an installed iOS 17+ simulator and build Release.
- [ ] Test the release candidate on a physical device: Telegram login,
  session refresh and logout, direct/group chats, message editing/deletion,
  image and voice messages, reconnect/retry, contacts, profile editing, location
  sharing with valid grants, and permission-denied states.
- [ ] Test APNs registration and delivery with the correct environment, including
  opening the routed chat and detaching the device token at logout. Simulator
  builds without signing do not validate production APNs provisioning.
- [ ] Archive for `generic/platform=iOS` with distribution signing configured.
- [ ] Inspect the archive's bundle identifier, version, endpoints, capabilities,
  and signing, then validate it in Xcode Organizer.
- [ ] Upload the validated archive to App Store Connect and verify processing
  and the selected build before submitting for review.

Unsigned Release build check:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Archive after signing is configured:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/MobileMessengerIOS.xcarchive \
  archive
```

## Notes

- The shared scheme launches Release by default. Select Debug explicitly when
  testing Debug-only diagnostics, demo UI, or a tunnel override.
- The app derives its runtime WebSocket URL from the REST base URL with the
  path `/realtime`; verify the effective endpoint instead of assuming a distinct
  `PRODUCTION_WS_HOST` will be used by the current client.
- Release startup ignores saved Debug REST overrides. This does not replace
  checking the compiled `REST_BASE_URL` in the release candidate.
- App Store upload requires an authorized Apple account and a working backend
  that has passed the repository's production deployment gates.
