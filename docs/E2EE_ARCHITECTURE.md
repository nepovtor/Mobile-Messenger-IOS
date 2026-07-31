# E2EE Architecture and Integration Gate

Status: **blocked; not a production E2EE implementation**
Review date: 2026-07-31

This document separates the opaque-delivery server work in this branch from
the client cryptography that is still missing. The project must not advertise
end-to-end encryption or enable a public production rollout until every exit
criterion below is satisfied.

## Decision record

The preferred dependency was the official
[`signalapp/libsignal` v0.99.2](https://github.com/signalapp/libsignal/releases/tag/v0.99.2).
It was not added for four independently blocking reasons:

1. The official project says use outside Signal is unsupported and its bridge
   APIs can change without notice.
2. `@signalapp/libsignal-client` is a Node package containing platform-specific
   `.node` native addons. It is not a supported browser/WASM distribution, so
   the TypeScript label does not make it usable in this Vite web client.
3. The Swift binding's supported consumption path is CocoaPods. Its own
   documentation says use as a Swift Package is unsupported; this repository
   currently uses an Xcode project without a CocoaPods workspace.
4. Version 0.99.2 declares `AGPL-3.0-only`. This repository has no root project
   license and no recorded legal decision accepting AGPL obligations.

No fork, copied Signal code, improvised Double Ratchet, shared server AES key,
or home-grown key distribution scheme is an acceptable workaround.

## What this branch provides

The server-side data model and boundary are designed for opaque delivery:

- public device identity material and signed/one-time prekeys;
- atomic one-time-prekey claims;
- per-device encrypted message envelopes;
- ciphertext-only attachment records;
- idempotency keys and membership epochs;
- device/session revocation;
- generic push notifications;
- `E2EE_ENABLED`, `E2EE_REQUIRED`, and legacy-read feature flags;
- production validation that requires `E2EE_REQUIRED=true`.

These controls can prevent new plaintext from reaching the server once the
clients use a reviewed protocol. They do not create E2EE by themselves.

## Target data flow

```text
sender plaintext
  -> sender device's reviewed protocol implementation
  -> envelope per active recipient device
  -> TLS
  -> backend authorization + opaque persistence
  -> WebSocket/poll/push availability signal
  -> TLS
  -> recipient device's reviewed protocol implementation
  -> recipient plaintext
```

The backend may see chat membership, device identifiers, envelope size,
timestamps, network metadata, delivery state, and storage object keys. It must
never receive plaintext, private identity keys, ratchet state, attachment keys,
nonces, filenames, captions, precise coordinates, or decrypted previews.

## Required protocol properties

The selected implementation must provide, without project-written
cryptographic primitives:

- per-device identity keys and signed prekeys;
- one-time prekeys for asynchronous first contact;
- authenticated session establishment;
- a fresh message key for every message;
- forward secrecy and post-compromise security;
- replay protection and bounded skipped-key handling;
- out-of-order delivery;
- explicit multi-device fan-out;
- visible identity-key changes and verified-contact safety state;
- a supported group mechanism with epoch/key rotation on membership changes;
- deterministic cross-platform serialization and official test vectors.

Text, replies, edits, deletes, reactions, attachments, voice, documents,
location, and sensitive system events must all use the same reviewed security
boundary.

## Client key stores

After a protocol is selected:

- iOS private keys and session state must use Keychain with
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; Secure Enclave may be used
  only for compatible operations supported by the selected library;
- web private state must use an encrypted IndexedDB design whose wrapping key
  is not stored in `localStorage`; XSS remains able to access an unlocked web
  session, so CSP, dependency integrity, and short sessions are mandatory;
- private keys, ratchet state, attachment keys, and safety numbers must never
  enter telemetry, crash reports, logs, clipboard history, or server backups.

## Identity verification

The client UX must derive a protocol-defined fingerprint/safety number from
both identity keys, offer a QR representation, persist a `verified` state
locally, and make key changes visible. A previously verified contact must never
silently become trusted after an identity-key change.

## Attachments

The sender generates a random 256-bit content key and a unique nonce using the
selected library's authenticated-encryption API, encrypts the entire file
locally, hashes the ciphertext, and uploads only the ciphertext. The key,
nonce, hash, original name, media type, caption, and any thumbnail metadata
travel inside an E2EE message. The backend stores only a random object key,
ciphertext size/hash, status, and retention time.

No nonce reuse is permitted. The receiving client verifies authentication and
the ciphertext hash before decoding the file.

## Group membership

`membership_epoch` is server-visible authorization metadata, not a group key.
The reviewed protocol must rotate cryptographic group state whenever a member
or device is added, removed, blocked, or revoked. Removed members must not read
future epochs, and new members must not receive historical keys unless every
existing participant explicitly authorizes history sharing.

## Evaluated alternatives

No alternative has been selected or implemented.

The strongest implementation candidate found is the official
[Matrix Rust SDK](https://github.com/matrix-org/matrix-rust-sdk). It is
Apache-2.0, described by its maintainers as production-ready, backs Element X,
and exposes higher-level bindings for Swift and JavaScript. Its
`matrix-sdk-crypto` component is a no-network-I/O E2EE state machine, while the
official
[`@matrix-org/matrix-sdk-crypto-wasm`](https://www.npmjs.com/package/@matrix-org/matrix-sdk-crypto-wasm)
package provides a real browser WASM path. It is a credible cross-platform
candidate.

It is not a drop-in dependency. It implements Matrix Olm/Megolm semantics and
expects Matrix-style device, room, key-query, to-device, and sync state. An
architecture decision must choose either a Matrix-compatible transport/data
model or a separately reviewed adapter that does not weaken those semantics.
The current custom envelope API must not be declared compatible without
protocol vectors, lifecycle mapping, and external review.

MLS ([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)) remains the
preferred standards-based protocol to evaluate for a redesign. OpenMLS is a
promising implementation, but its own support matrix lists iOS and WASM among
targets built but not tested. It is therefore not currently approved as this
project's production cross-platform drop-in.

Selecting either candidate is not permission to implement cryptographic
primitives locally. Abandoned Signal/Olm forks, WebCrypto-only custom ratchets,
and a per-chat static key do not satisfy this gate.

## Exit criteria

Production E2EE remains blocked until all are recorded:

- protocol and exact library version selected;
- legal approval and a root project license/notice strategy;
- supported iOS and browser integration paths;
- dependency hashes/checksums pinned and reproducible;
- upstream test vectors passing on iOS and web;
- Alice iOS ↔ Bob web interoperability in both directions;
- offline, reordered, duplicate, tampered, and replayed envelope tests;
- multi-device and revoked-device tests;
- identity-change warning and verified-contact tests;
- group membership epoch tests;
- encrypted attachment interoperability tests;
- external cryptographic design review;
- production telemetry proves no plaintext/key material crosses the backend
  boundary;
- recovery, loss-of-key, and rollback UX approved.

Until then, keep the deployment fail-closed rather than weakening
`E2EE_REQUIRED`.
