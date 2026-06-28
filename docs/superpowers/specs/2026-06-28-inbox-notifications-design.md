# Inbox, Notifications & My Posts

## Overview

Two-panel notification system: **Inbox** for direct messages (wishes, praise, comments on your posts) and **Notifications** for event alerts (likes, approval decisions, @mentions). Both appear as dropdown panels from icons in the nav bar. A "My Posts" tab lets users browse their own post history.

## Data Model

### InboxMessage collection

```
recipient:    ObjectId → User (required)
sender:       ObjectId → User (required)
type:         'birthday_wish' | 'praise' | 'comment'
body:         String (required — wish message, praise text, or comment body)
refItem:      ObjectId → FeedItem | null (linked feed item for praise/comment, null for wishes)
read:         Boolean (default: false)
createdAt     (timestamps: true)
```

Index: `{ recipient: 1, createdAt: -1 }`
Index: `{ recipient: 1, read: 1 }` (for unread count)

### Notification collection

```
recipient:    ObjectId → User (required)
type:         'like' | 'leave_approved' | 'leave_rejected' |
              'timesheet_approved' | 'claim_approved' | 'claim_denied' | 'mention'
actor:        ObjectId → User (required — who triggered the event)
refItem:      ObjectId | null (feed item for likes, leave/claim id for approvals)
refModel:     String — 'FeedItem' | 'Leave' | 'ClaimRequest' (discriminator for refItem)
read:         Boolean (default: false)
createdAt     (timestamps: true)
```

Index: `{ recipient: 1, createdAt: -1 }`
Index: `{ recipient: 1, read: 1 }`

### My Posts

No new model. Uses existing `FeedItem` with query `{ author: callerId, status: 'active' }`.

## API

### Inbox — `/inbox`

All endpoints require `requireAuth`.

```
GET  /inbox?cursor=<lastId>&limit=20
```
Returns caller's inbox messages, newest first. Populates sender (displayName, email). Cursor-based pagination.

```
GET  /inbox/unread-count
```
Returns `{ count: number }` — count of messages where `read: false` for caller.

```
POST /inbox/wish
Body: { recipientId, body }
```
Creates InboxMessage `type: 'birthday_wish'`. Rejects 400 if recipientId === caller.

```
POST /inbox/:id/read
```
Sets `read: true` on the message. 404 if message doesn't belong to caller.

```
POST /inbox/read-all
```
Sets `read: true` on all caller's unread messages.

### Notifications — `/notifications`

All endpoints require `requireAuth`.

```
GET  /notifications?cursor=<lastId>&limit=20
```
Returns caller's notifications, newest first. Populates actor (displayName, email). Cursor-based pagination.

```
GET  /notifications/unread-count
```
Returns `{ count: number }`.

```
POST /notifications/:id/read
```
Sets `read: true`. 404 if not caller's notification.

```
POST /notifications/read-all
```
Sets `read: true` on all caller's unread notifications.

### My Posts — `/feed/mine`

```
GET  /feed/mine?cursor=<lastId>&limit=20
```
Returns caller's own active feed items, newest first. Same response shape as `GET /feed` but without pinned announcements logic.

## Notification Triggers

Side-effects added to existing route handlers. No notification is created when the actor is the same as the recipient (self-like, self-comment).

| Event | Existing route | Creates | Collection |
|---|---|---|---|
| Like added | `POST /feed/:id/like` | `type: 'like'` to post author | Notification |
| Comment added | `POST /feed/:id/comment` | `type: 'comment'` to post author | InboxMessage |
| Praise created | `POST /feed` (type=praise) | `type: 'praise'` to praiseTarget | InboxMessage |
| Birthday wish | `POST /inbox/wish` | `type: 'birthday_wish'` to recipient | InboxMessage |
| Leave decided | `PATCH /leave/:id/decide` | `type: 'leave_approved'` or `'leave_rejected'` to requester | Notification |
| Claim decided (manager) | `PATCH /claim-requests/:id` | `type: 'claim_approved'` or `'claim_denied'` to requester | Notification |
| Claim decided (finance) | `PATCH /claim-requests/:id/finance-decide` | `type: 'claim_approved'` or `'claim_denied'` to requester | Notification |

Trigger calls are fire-and-forget (`.catch(console.error)`) — a notification failure must never break the primary operation.

## Frontend

### Nav bar icons

Two icons added to the AppShell top bar (right side):
- **Envelope icon** — Inbox. Badge shows unread count.
- **Bell icon** — Notifications. Badge shows unread count.

Both poll `GET /inbox/unread-count` and `GET /notifications/unread-count` on mount and every 60 seconds.

### Dropdown panels

Both use the same dropdown component pattern:
- Opens on icon click, closes on click-outside or Escape
- Header: title + "Mark all read" link (calls `/read-all`)
- Scrollable list, max 20 items visible, "Load more" at bottom
- Each item: sender/actor avatar, description text, time ago, blue dot if unread
- Click → marks read + navigates to source

### Inbox item display

| Type | Text | Click target |
|---|---|---|
| `birthday_wish` | "[Sender] sent you a birthday wish: [body]" | Just marks read |
| `praise` | "[Sender] praised you: [body preview]" | Navigate to feed item |
| `comment` | "[Sender] commented on your post: [body preview]" | Navigate to feed item |

### Notification item display

| Type | Text | Click target |
|---|---|---|
| `like` | "[Actor] liked your post" | Navigate to feed item |
| `leave_approved` | "Your leave request was approved" | Navigate to /attendance |
| `leave_rejected` | "Your leave request was rejected" | Navigate to /attendance |
| `claim_approved` | "Your claim was approved" | Navigate to /my-requests |
| `claim_denied` | "Your claim was denied" | Navigate to /my-requests |

### Birthday wish flow

Replace the current `alert()` in HomePage's `handleWish`:
1. Click "Wish" → open a small modal with textarea (pre-filled "Happy Birthday!")
2. Submit → `POST /inbox/wish { recipientId, body }`
3. On success → button text changes to "Wished" (disabled), close modal

### My Posts tab

Add "My Posts" as a third tab alongside "Organization" / "Product Design" in the feed section. When active, calls `GET /feed/mine` and renders the same `FeedCard` components showing only the caller's own posts with cursor pagination.

## Permissions

| Action | Who |
|---|---|
| Read own inbox | All authenticated |
| Read own notifications | All authenticated |
| Send birthday wish | All authenticated |
| Mark read | Own messages/notifications only |
| View my posts | All authenticated (own posts only) |

## Edge Cases

- Self-like: no notification created (actor === post author)
- Self-comment: no inbox message created
- Self-praise: already blocked at creation (400)
- Wishing yourself: 400
- Rapid like toggle (add/remove/add): only the "add" creates a notification. Duplicate prevention: check if an unread `like` notification from the same actor on the same refItem already exists — if so, skip.
- Deleted/deactivated user as sender: render "Former Employee"
- Inbox/notification for a hidden feed item: item click returns 404 — handle gracefully in UI (show "Post no longer available")
- Unread count overflow: cap badge display at "99+"

## Testing

### Backend (node:test)

**Inbox:**
- `POST /inbox/wish` creates InboxMessage for recipient
- `POST /inbox/wish` rejects 400 when wishing yourself
- `GET /inbox` returns only caller's messages, newest first
- `GET /inbox` excludes other users' messages
- `GET /inbox/unread-count` returns correct count
- `POST /inbox/:id/read` marks as read, returns updated message
- `POST /inbox/:id/read` returns 404 for another user's message
- `POST /inbox/read-all` marks all caller's messages as read

**Notifications:**
- Like on another's post creates notification for post author
- Self-like does not create notification
- Comment on another's post creates inbox message for post author
- Self-comment does not create inbox message
- Praise creates inbox message for praiseTarget
- `GET /notifications` returns only caller's notifications
- `POST /notifications/read-all` marks all as read
- Duplicate like notification prevention: second like on same post by same actor (after unlike+relike) does not create duplicate

**Approval triggers:**
- Leave approval creates notification `type: 'leave_approved'` for requester
- Leave rejection creates notification `type: 'leave_rejected'` for requester
- Claim approval creates notification for requester

**My Posts:**
- `GET /feed/mine` returns only caller's posts
- Hidden posts excluded
- Cursor pagination works
- Other users' posts not returned
