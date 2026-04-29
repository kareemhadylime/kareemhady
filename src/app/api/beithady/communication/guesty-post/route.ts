import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { listGuestyConversationPosts } from '@/lib/guesty';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Phase Q.4 follow-up — fetch the original conversation post (with full
// attachments / media URLs) from Guesty Open API on demand. Used by the
// MediaPlaceholder component when the inbox webhook delivered an empty
// body (Airbnb / Booking rich cards etc.).
//
// We use our service-account OAuth token, so this works regardless of
// the calling user's Guesty UI permissions — solves the "You don't have
// access to this page" 403 they were hitting on direct deep-links.
//
// Query params:
//   conversationId — Guesty conversation _id (required)
//   sentAt         — ISO timestamp of the message we want to find (required;
//                    used to match the post since postId is sometimes empty
//                    in the webhook payload)

type GuestyPost = {
  _id?: string;
  id?: string;
  body?: string;
  bodyHtml?: string;
  type?: string;
  module?: string;
  createdAt?: string;
  attachments?: unknown;
  images?: unknown;
  files?: unknown;
};

type ExtractedAttachment = {
  url: string;
  name?: string;
  mime?: string;
  kind: 'image' | 'file' | 'audio' | 'video';
};

function deriveAttachments(post: GuestyPost): ExtractedAttachment[] {
  const out: ExtractedAttachment[] = [];

  // Some Guesty payloads have an `attachments` array of {url, fileName, mimeType}.
  if (Array.isArray(post.attachments)) {
    for (const a of post.attachments as Array<Record<string, unknown>>) {
      const url = typeof a.url === 'string' ? a.url
        : typeof a.downloadUrl === 'string' ? a.downloadUrl
        : null;
      if (!url) continue;
      const mime = typeof a.mimeType === 'string' ? a.mimeType
        : typeof a.contentType === 'string' ? a.contentType
        : '';
      const name = typeof a.fileName === 'string' ? a.fileName
        : typeof a.name === 'string' ? a.name
        : '';
      const kind: ExtractedAttachment['kind'] =
        mime.startsWith('image/') ? 'image'
        : mime.startsWith('audio/') ? 'audio'
        : mime.startsWith('video/') ? 'video'
        : 'file';
      out.push({ url, name, mime, kind });
    }
  }

  // Some payloads carry images at `images[].url`.
  if (Array.isArray(post.images)) {
    for (const i of post.images as Array<Record<string, unknown>>) {
      const url = typeof i.url === 'string' ? i.url
        : typeof i.original === 'string' ? i.original
        : typeof i.thumbnail === 'string' ? i.thumbnail
        : null;
      if (!url) continue;
      out.push({ url, kind: 'image' });
    }
  }

  // Some payloads carry rich-card bodyHtml without a separate media URL.
  // We let the caller render bodyHtml as a fallback.
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  const allowed = user.is_admin
    || (await hasBeithadyPermission(user, 'communication', 'read'));
  if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  const sentAt = req.nextUrl.searchParams.get('sentAt');
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: 'missing_conversationId' }, { status: 400 });
  }

  try {
    // Pull the recent thread — Guesty returns most-recent-first by default
    const data = await listGuestyConversationPosts(conversationId, { limit: 50 });
    const posts: GuestyPost[] = ((data as unknown) as { results?: GuestyPost[] })?.results
      || ((data as unknown) as GuestyPost[])
      || [];

    // If sentAt provided, find the matching post within ~5 min tolerance.
    // (Guesty's recorded createdAt may differ slightly from our beithady_messages.sent_at.)
    let target: GuestyPost | null = null;
    if (sentAt) {
      const sentMs = Date.parse(sentAt);
      if (!Number.isNaN(sentMs)) {
        let bestDelta = Infinity;
        for (const p of posts) {
          if (!p.createdAt) continue;
          const pMs = Date.parse(p.createdAt);
          if (Number.isNaN(pMs)) continue;
          const delta = Math.abs(pMs - sentMs);
          if (delta < bestDelta && delta < 5 * 60 * 1000) {
            bestDelta = delta;
            target = p;
          }
        }
      }
    }
    // No target match → just return the most recent post (still useful for
    // viewing the latest media in the thread).
    if (!target && posts.length > 0) target = posts[0];

    if (!target) {
      return NextResponse.json({ ok: false, error: 'no_posts_found' }, { status: 404 });
    }

    const attachments = deriveAttachments(target);
    return NextResponse.json({
      ok: true,
      post: {
        id: target._id || target.id || null,
        body: target.body || '',
        bodyHtml: target.bodyHtml || null,
        module: target.module || null,
        type: target.type || null,
        createdAt: target.createdAt || null,
        attachments,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
