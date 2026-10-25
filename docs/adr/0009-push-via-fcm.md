# ADR-0009 — Push notifications via FCM

**Status:** Proposed · 2026-10-25

## Decision
Send pushes from the worker through **Firebase Cloud Messaging** (APNs reached via FCM) using native device tokens captured by the app. A `PushSender` interface isolates the provider.

## Consequences
- ✅ One backend integration for iOS + Android; the Flutter project already created a Firebase project/config to reuse (verify before reuse).
- ⚠️ Requires APNs key upload in Firebase and handling of `UNREGISTERED` tokens.
- Payloads carry ids only (privacy), and are collapsed per conversation.

## Alternatives
Expo Push Service (simplest from the app side, extra hop/vendor, rate limits), OneSignal (feature-rich, vendor lock-in).
