# TikTok Content Posting API — Audit Submission Pack

Everything needed to submit our TikTok app for "Content Posting API" audit so we can use **Direct Post** (auto-publish) instead of being forced through the Inbox flow.

Last updated: 15 May 2026.

---

## 1. URLs to paste into the TikTok Developer Portal

| Field | URL |
|---|---|
| Privacy Policy | `https://app.limeinc.cc/legal/privacy` |
| Terms of Service | `https://app.limeinc.cc/legal/terms` |
| App website / homepage | `https://limeinc.cc` |
| Support contact (email) | `kareem.hady@gmail.com` |

> Both legal pages are public, no auth required, and contain a dedicated section about the TikTok Content Posting integration (privacy section 3, terms section 3).

---

## 2. Scopes we are requesting

In the TikTok Developer Portal, under **App Review → Content Posting API**, request:

- `user.info.basic` — to display the connected account's username
- `video.publish` — for Direct Post (auto-publish)
- `video.upload` — for file-upload source (already in use)

Keep `video.list` only if we actually plan to read posts back; leave it out if not, since fewer scopes = faster review.

---

## 3. Justification text (paste verbatim)

Use this in the "Use case description" / "Why do you need this scope?" field:

> Lime Investments operates Beit Hady, a hospitality brand that manages short-term-rental
> properties in Egypt. We use a private internal operations platform (hosted at
> app.limeinc.cc) to run our marketing pipeline. Within that platform, our marketing
> operators select an existing Instagram Reel or Story we have already published to our
> own brand Instagram account, and mirror it to our own brand TikTok account.
>
> The video is mirrored server-side to our own storage (Supabase), then uploaded to TikTok
> via the Content Posting API (FILE_UPLOAD source). Publishing is exclusively to our own
> brand TikTok account (username: @beit.hady). The platform never publishes on behalf of
> third-party users, never reads other accounts' data, and never accesses content beyond
> the connected account's own publishing scope.
>
> We are requesting Direct Post capability so that our marketing operators can complete
> the publish flow within our internal CRM without having to switch to the TikTok mobile
> app to finalize each post. Today, every video lands in our account's TikTok Inbox and
> requires a manual finalize step in the app, which adds friction and delays.
>
> All operators of the platform are vetted Lime Investments staff with named accounts and
> role-based permissions. All publish actions are audit-logged in our database
> (`ads_tiktok_posts` table) with operator identity, timestamp, video URL, and final
> status.

---

## 4. Demo video

### Auto-generated animated walkthrough — `demo.mp4`

A ready-to-submit MP4 has been pre-generated at [`docs/tiktok-app-audit/demo.mp4`](demo.mp4):

- 1920×1080 H.264, 30 fps, 85 seconds, ~5 MB.
- 10 mock-UI slides matching the scene script below, with crossfade transitions.
- Each slide carries the `app.limeinc.cc` URL bar so reviewers can confirm domain.

This is acceptable as a first submission. **To regenerate after edits to scenes:**

```bash
python tools/build-tiktok-demo.py     # writes 10 PNGs to docs/tiktok-app-audit/build/
ffmpeg ...                             # see tools/build-tiktok-demo.py header for the FFmpeg invocation
```

### When you'd want a real screen recording instead

The auto-generated demo uses mock UI (clean, on-brand, but not pixel-identical to the live app).
If TikTok rejects the first submission with a request for a real screen recording, follow the
scene-by-scene script below — it's calibrated for OBS / macOS Screen Recording at 1080p.

---

## 4b. Real-screen-recording script (only if reviewers ask for it)

### What to record

TikTok wants a screen recording (1–3 minutes is ideal) showing the publish flow end-to-end. Record on the desktop app — `app.limeinc.cc` — with one of the test IG reels in the picker.

### Script (record these screens in this order)

1. **Sign-in screen** (0:00–0:05)
   Open `https://app.limeinc.cc/login`, sign in with admin credentials.
   *Says to TikTok: "this is gated by auth, not public."*

2. **Navigate to TikTok Reels publish page** (0:05–0:15)
   Beit Hady → Ads → TikTok Reels.
   Hover over the breadcrumb so it's readable.

3. **Show the connected TikTok account** (0:15–0:25)
   Click the **Accounts** sub-tab. Show that the Beithady Tiktok account is "OAuth: connected" — pause for 2–3 seconds so reviewers can see "@beit.hady".
   Then back to TikTok Reels.

4. **Show the IG source picker** (0:25–0:40)
   The horizontal strip of IG Reels and Stories. Click one of the Reels.
   Wait for the page to reload with the green "Sourced from Instagram Reel" banner.
   Show that the Video URL field auto-populated with the mirrored Supabase URL.

5. **Show / edit the caption + hashtags** (0:40–0:55)
   Scroll down to the Caption + Hashtags fields. Edit one word so reviewers can see operator control over the content.

6. **Privacy + Direct Post selection** (0:55–1:05)
   Open the Privacy dropdown — show all four options (Public / Friends / Followers / Private).
   Tick the **Direct post?** checkbox. Hover the tooltip if there is one.

7. **Click Publish** (1:05–1:15)
   Wait for the success banner to appear: `Submitted post #N — status: PUBLISH_COMPLETE` (or `SEND_TO_USER_INBOX` while we're still pre-audit — it's fine to show this since the demo is for the moment AFTER audit).

8. **Show the post in TikTok app** (1:15–1:35)
   Cut to a phone screen recording: open TikTok app → notifications/inbox → the just-published video. Open the video to confirm it's live on the @beit.hady account.

9. **Show audit trail in our app** (1:35–1:50)
   Back to the desktop. Scroll to the "Recent posts" section on the publish page. Show the row with status, share URL, and timestamp.

10. **End frame** (1:50–2:00)
    Hold on the page for 5 seconds with the URL bar visible (`app.limeinc.cc/beithady/ads/tiktok/organic`) so reviewers can confirm the domain matches the privacy policy.

### Recording tips

- Use **OBS Studio** or **macOS Screen Recording** at 1080p, 30fps. MP4 output.
- Increase the browser zoom to 110–120% so text is readable when TikTok reviewers compress the video.
- No audio narration is required, but if you add it: state your name, role, the brand TikTok handle, and what feature you're demonstrating.
- Keep cursor movement deliberate — pause for ~1 second on each important UI element.
- Don't blur the URL bar — reviewers want to see the domain matches your privacy policy URL.

---

## 5. Pre-submission checklist

Tick each before clicking "Submit for review" in the Developer Portal.

- [ ] `https://app.limeinc.cc/legal/privacy` returns 200 OK in incognito (no auth).
- [ ] `https://app.limeinc.cc/legal/terms` returns 200 OK in incognito (no auth).
- [ ] Privacy Policy mentions TikTok by name (it does, in section 3).
- [ ] Privacy Policy lists the data we collect from the TikTok scope (open_id, username, refresh token).
- [ ] Privacy Policy explains that we do NOT read other users' data.
- [ ] Demo video uploaded somewhere accessible (Vimeo / unlisted YouTube / direct file). TikTok's portal accepts a URL.
- [ ] App icon set in Developer Portal (PNG, 1024×1024 ideally).
- [ ] App description in Developer Portal matches the justification text above.
- [ ] OAuth redirect URI set to: `https://app.limeinc.cc/api/auth/tiktok/callback`
- [ ] Production app, not Sandbox (Sandbox apps cannot use Direct Post even after audit).

---

## 6. After approval — code change required

Once TikTok approves the audit, the publish UI already supports Direct Post via the
"Direct post?" checkbox at [src/app/beithady/ads/tiktok/organic/page.tsx](../../src/app/beithady/ads/tiktok/organic/page.tsx)
(which sets `directPost: true` on the form).

The branching already exists in [src/lib/beithady/ads/tiktok-organic-publish.ts:107](../../src/lib/beithady/ads/tiktok-organic-publish.ts):

```ts
const initPath = input.directPost
  ? '/v2/post/publish/video/init/'         // Direct → PUBLISH_COMPLETE
  : '/v2/post/publish/inbox/video/init/';  // Inbox → SEND_TO_USER_INBOX
```

So the only follow-up after approval is to start ticking the checkbox.

---

## 7. Realistic timeline

- **Submit:** day 0
- **Initial response from TikTok:** typically 5–10 business days
- **Possible "needs more info" round-trips:** add 3–7 days each
- **Total:** ~2 weeks if first submission is clean

Most rejections are for: privacy policy not mentioning TikTok, demo video not showing the
full flow, or scopes requested that don't match the demonstrated use case. The pack above
is designed to avoid all three.
