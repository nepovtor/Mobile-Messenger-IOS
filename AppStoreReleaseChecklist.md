# App Store Release Checklist

## Before Archive

1. Set `PRODUCTION_API_HOST` and `PRODUCTION_WS_HOST` in `MobileMessengerIOS/Configurations/Release.xcconfig`.
2. Verify the production backend uses HTTPS and valid TLS certificates.
3. Confirm remote notifications are either fully configured in Signing & Capabilities or disabled for the release build.
4. Confirm the demo/test account is removed or acceptable for production.
5. Increment `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`.
6. Verify the App Store app icon and screenshots are final.

## Apple Account / App Store Connect

1. Confirm the correct `PRODUCT_BUNDLE_IDENTIFIER`.
2. Confirm the correct Apple Developer team and signing setup.
3. Create the app record in App Store Connect.
4. Fill in description, keywords, support URL, privacy policy URL, and age rating.
5. Add screenshots for required iPhone/iPad sizes.

## Validation

1. Build `Release`.
2. Archive for `generic/platform=iOS`.
3. Validate the archive in Xcode Organizer or Transporter.
4. Upload to App Store Connect.

## Notes

- `NSAllowsArbitraryLoads` was removed; only `localhost` and `127.0.0.1` remain as ATS exceptions for local development fallback.
- Debug builds are now expected to use a public endpoint by default or a generated tunnel override in `MobileMessengerIOS/Configurations/Debug.public.xcconfig`.
- The project currently has no checked-in `.entitlements` file, so APNs and any other capabilities must be configured explicitly before shipping if they are required.
- App Store upload still requires a real production backend and your Apple account credentials.
