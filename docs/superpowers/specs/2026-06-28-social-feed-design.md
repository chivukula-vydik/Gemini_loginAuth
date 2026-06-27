# Social Feed — Post / Poll / Praise / Announcements

## Overview

Company-wide social feed on the home page. All authenticated users can create posts, polls, and praise. Admin/HR can create announcements (pinned, no interactions). Feed supports likes and comments.

## Data Model

### FeedItem (single collection)

```
type:            'post' | 'poll' | 'praise' | 'announcement'
author:          ObjectId → User
body:            String (required)
status:          'active' | 'hidden'   (default: 'active')

# Poll fields (type === 'poll')
pollOptions:     [{ text: String }]           # no counts — computed from PollVote
pollMultiChoice: Boolean                      # single vs multi-select
pollAnonymous:   Boolean                      # immutable after creation
pollVoterHashes: [String]                     # SHA-256(pollSalt + ':' + userId), unordered, no timestamps
pollSalt:        String                       # random per-poll, never sent to client

# Praise fields (type === 'praise')
praiseTarget:    ObjectId → User              # cannot equal author
praiseCategory:  String (optional)            # 'teamwork' | 'innovation' | 'leadership' | 'ownership' | 'excellence'

# Announcement fields (type === 'announcement')
pinnedUntil:     Date                         # default: createdAt + 30 days; max 3 active at once

# Interactions (not on announcements)
likes:           [ObjectId]                   # user refs, toggled via $addToSet/$pull
comments:        [{
  author:    ObjectId → User,
  body:      String,
  createdAt: Date,
  status:    'active' | 'hidden'
}]

createdAt, updatedAt (timestamps: true)
```

### PollVote (separate collection — single path for all polls)

```
pollId:        ObjectId → FeedItem
optionIndices: [Number]                       # array for both single and multi-choice
userId:        ObjectId | null                # null for anonymous, populated for visible
```

- Visible polls: unique index `{ pollId, userId }` prevents double-vote, upsert to change vote.
- Anonymous polls: double-vote prevention via `pollVoterHashes` on FeedItem (hash check before insert). No userId stored. Votes are final — cannot be changed or retracted.

### Why two collections for votes

Structural anonymity guarantee. Anonymous poll votes have no userId anywhere in PollVote — the linkage physically does not exist. The `pollVoterHashes` array uses per-poll salted SHA-256 hashes so membership can be checked without storing raw identity, and the array is unordered with no timestamps to prevent write-ordering correlation.

Visible polls also go through PollVote (with userId populated) so there is one vote-storage path, one tally query, one render path. The anonymous/visible difference collapses to "is userId null or not."

Vote counts are never denormalized onto FeedItem — always computed via aggregation from PollVote to avoid drift.

## API

Single router mounted at `/feed`. All endpoints require `requireAuth`.

### Feed queries

```
GET /feed?cursor=<lastId>&limit=20
```
Returns active pinned announcements (pinnedUntil > now) first, then all other active items sorted by createdAt desc. Populates author (displayName, email), praiseTarget, comment authors. For polls, aggregates vote counts from PollVote.

```
GET /feed/:id
```
Single item with full detail.

### CRUD

```
POST /feed
Body: { type, body, pollOptions?, pollMultiChoice?, pollAnonymous?, praiseTarget?, praiseCategory? }
```
- Announcements: requires admin/hr role. Rejects if 3 active pinned announcements already exist.
- Praise: rejects if praiseTarget === caller (400).
- Polls: generates random pollSalt, stores pollAnonymous as immutable.

```
DELETE /feed/:id
```
Author or admin/hr. Sets status to 'hidden'.

### Interactions

```
POST /feed/:id/like          — toggle like (add/remove). Not on announcements.
POST /feed/:id/comment       — { body }. Not on announcements.
DELETE /feed/:id/comment/:commentId  — comment author or admin/hr sets comment status to 'hidden'.
```

### Polls

```
POST /feed/:id/vote
Body: { optionIndices: [number] }
```
- Single-choice: validates `optionIndices.length === 1`.
- Anonymous: hashes userId with pollSalt, checks pollVoterHashes for membership, rejects with 409 if already voted. Inserts PollVote with `userId: null`. Anonymous votes are final.
- Visible: upserts PollVote by `{ pollId, userId }`. Re-voting allowed.
- Response includes updated tallies. Anonymous polls never return voter identities.

### Moderation

```
PATCH /feed/:id/moderate
Body: { status: 'hidden' | 'active', commentId?: string }
```
Admin/HR only. Hides/restores items or individual comments.

## Permissions

| Action | Who |
|---|---|
| Create post/poll/praise | All authenticated users |
| Create announcement | admin, hr |
| Like / comment | All (not on announcements) |
| Vote on poll | All |
| Delete own item/comment | Author |
| Moderate (hide/restore) | admin, hr |

## Frontend

Everything lives in the existing HomePage right column — no new pages.

### Composer (existing Post/Poll/Praise tabs)

- **Post tab**: textarea + submit → `POST /feed { type: 'post', body }`.
- **Poll tab**: question textarea, dynamic option inputs (add/remove, min 2), toggle switches for multi-choice and anonymous. Submit → `POST /feed { type: 'poll', body, pollOptions, pollMultiChoice, pollAnonymous }`.
- **Praise tab**: person picker dropdown (from `/users`), optional category dropdown, message textarea → `POST /feed { type: 'praise', body, praiseTarget, praiseCategory }`.

### Feed display

Scrollable list of FeedCard components below the composer:
- **Post**: author avatar + name, body, like button with count, expandable comment section.
- **Poll**: question, option buttons showing results after voting, vote count, anonymous/multi-choice badges. After voting, options show percentage bars.
- **Praise**: highlighted card with praiseTarget avatar, category badge chip (if present), confetti accent.
- **Announcement**: pinned banner at top of feed, admin badge, no like/comment controls.

### Announcements section

The existing "No announcements" area renders active pinned announcements filtered from the feed response. The + button opens a compose modal and is only visible to admin/hr.

### Interactions

- Like: optimistic toggle via `POST /feed/:id/like`.
- Comments: expandable section per item, input field at bottom.
- Poll voting: click option(s), submit, results animate in.

### "Organization" vs "Product Design" tabs

Both show the same global feed — no team/group concept exists yet. The tab structure is preserved for future differentiation.

## Deletion / Deactivation Policy

- Deactivated/deleted user's posts remain, author rendered as "Former Employee".
- praiseTarget of a deleted user: same treatment.
- Comments by deleted users: body replaced with "[removed]", status set to 'hidden'.

## Edge Cases

- Poll with 0 votes: all options render with count 0.
- Anonymous re-vote attempt: 409 "already voted" (votes are final).
- Announcement pinnedUntil expiry: excluded from pinned section, remains in chronological feed.
- 4th announcement while 3 active: 400 "max 3 active announcements".
- Empty feed: "No posts yet. Be the first!"
- Comment on hidden item: 404.
- Concurrent like toggles: atomic `$addToSet` / `$pull`.
- Self-praise: 400 at creation.

## Testing

Backend tests (node:test):
- Create each type, verify response shape and auth.
- Announcement: non-admin 403, max-3 enforcement, expired exclusion.
- Poll: single-choice rejects multi-option, anonymous has no userId in PollVote, hash prevents double-vote, visible stores userId and allows re-vote.
- Praise: self-praise blocked.
- Like toggle, comment CRUD, announcement comment blocked.
- Moderation: admin can hide, non-admin 403.
- Hidden items excluded from GET /feed.
