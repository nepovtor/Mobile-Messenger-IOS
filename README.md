# Mobile Messenger iOS

Demo messenger MVP with a SwiftUI iOS client and a NestJS backend.

## Demo Accounts

| Name | Phone | Code |
| --- | --- | --- |
| Alex Carter | +10000000001 | 111111 |
| Maria Stone | +10000000002 | 222222 |
| Daniel Reed | +10000000003 | 333333 |
| Emily Brooks | +10000000004 | 444444 |

## Demo Behavior

- each account has isolated chats on the backend
- chats are filtered by authenticated `userID`
- messages are persisted and available after relogin
- realtime updates are session-safe and participant-scoped
- logout clears local session, chats, messages, and reconnect state

## API Contract

### AuthResponse

- `token`
- `userID`
- `displayName`
- `phone`

### Chat

- `id`
- `title`
- `participants`
- `lastMessage`
- `updatedAt`

The backend also returns compatibility fields used by the current iOS UI:

- `lastMessagePreview`
- `lastActivity`
- `unreadCount`
- `typingParticipants`
- `participantNames`
- `participantCount`

### Message

- `id`
- `chatID`
- `senderID`
- `text`
- `createdAt`

The backend also returns compatibility fields used by the current iOS UI:

- `messageID`
- `serverID`
- `authorID`
- `authorName`
- `kind`
- `mediaID`
- `mediaURL`
- `status`

## Testing

### Backend

```bash
cd server
npm test
```

### iOS

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,OS=latest,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO \
  test
```
