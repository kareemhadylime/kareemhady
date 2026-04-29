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

// Map file extension (Guesty's `type` field) to MIME + kind classification.
function classifyByExt(ext: string): { mime: string; kind: ExtractedAttachment['kind'] } {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(e)) {
    const mimeExt = e === 'jpg' ? 'jpeg' : e;
    return { mime: `image/${mimeExt}`, kind: 'image' };
  }
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac'].includes(e)) {
    return { mime: `audio/${e}`, kind: 'audio' };
  }
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(e)) {
    return { mime: `video/${e}`, kind: 'video' };
  }
  if (e === 'pdf') return { mime: 'application/pdf', kind: 'file' };
  return { mime: '', kind: 'file' };
}

// Resolve a Guesty attachment storage path into an absolute CDN URL.
// Verified shape from beithady_messages.raw (real photo upload by guest):
//   { attachmentUrl: "production/<accountId>/png/<hash>_<filename>.png", type: "png" }
// Guesty serves these via app-public-cdn.guesty.com.
function absoluteAttachmentUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Strip any leading slashes to keep the join clean
  const clean = raw.replace(/^\/+/, '');
  return `https://app-public-cdn.guesty.com/${clean}`;
}

function deriveAttachments(post: GuestyPost): ExtractedAttachment[] {
  const out: ExtractedAttachment[] = [];

  if (Array.isArray(post.attachments)) {
    for (const a of post.attachments as Array<Record<string, unknown>>) {
      // Guesty Open API uses `attachmentUrl` (relative storage path) +
      // `type` (file extension like 'png', 'jpeg'). Some payloads also
      // carry `url` or `downloadUrl` as absolute URLs — try those first.
      const directUrl = typeof a.url === 'string' ? a.url
        : typeof a.downloadUrl === 'string' ? a.downloadUrl
        : null;
      const relUrl = typeof a.attachmentUrl === 'string' ? a.attachmentUrl : null;
      const url = directUrl || absoluteAttachmentUrl(relUrl);
      if (!url) continue;

      const ext = typeof a.type === 'string' ? a.type : '';
      const mimeFromExt = ext ? classifyByExt(ext) : null;
      const explicitMime = typeof a.mimeType === 'string' ? a.mimeType
        : typeof a.contentType === 'string' ? a.contentType
        : null;
      const mime = explicitMime || mimeFromExt?.mime || '';
      const name = typeof a.origFileName === 'string' ? a.origFileName
        : typeof a.fileName === 'string' ? a.fileName
        : typeof a.name === 'string' ? a.name
        : '';
      const kind: ExtractedAttachment['kind'] =
        mime.startsWith('image/') ? 'image'
        : mime.startsWith('audio/') ? 'audio'
        : mime.startsWith('video/') ? 'video'
        : mimeFromExt?.kind || 'file';
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
    // Pull the recent thread — Guesty returns most-recent-first by default.
    // Response shape per src/lib/guesty.ts:427-433 is { posts, count, limit, sort, cursor }.
    // We also defensively check `results` and direct-array shapes in case
    // the API ever returns differently.
    const data = await listGuestyConversationPosts(conversationId, { limit: 50 });
    const dataObj = data as unknown as Record<string, unknown>;
    const posts: GuestyPost[] = Array.isArray(dataObj?.posts)
      ? (dataObj.posts as GuestyPost[])
      : Array.isArray(dataObj?.results)
        ? (dataObj.results as GuestyPost[])
        : Array.isArray(data)
          ? (data as unknown as GuestyPost[])
          : [];

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
