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
  attachmentId?: string;
  postId?: string;
  conversationId?: string;
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

// Resolve a Guesty attachment storage path into a URL the browser can
// actually load.
//
// Guesty's CDN at assets.guesty.com requires authentication (returns
// HTTP 400 to public GETs) — verified by direct test of the URL the
// probe successfully identified. Our solution: proxy the binary through
// our backend at /api/beithady/communication/guesty-attachment, which
// uses the service-account Bearer token to fetch from Guesty and
// streams the response back to the browser.

function absoluteAttachmentUrl(
  raw: string | null | undefined,
  ids: { attachmentId?: string; postId?: string; conversationId?: string } = {},
): string | null {
  if (!raw) return null;
  // Already an absolute URL → just use it.
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const clean = raw.replace(/^\/+/, '');
  const params = new URLSearchParams({ path: clean });
  if (ids.attachmentId) params.set('attachmentId', ids.attachmentId);
  if (ids.postId) params.set('postId', ids.postId);
  if (ids.conversationId) params.set('conversationId', ids.conversationId);
  return `/api/beithady/communication/guesty-attachment?${params.toString()}`;
}

function deriveAttachments(post: GuestyPost): ExtractedAttachment[] {
  const out: ExtractedAttachment[] = [];
  const postId = post._id || post.id || undefined;
  // ConversationId is on the post payload (not the parent envelope) per
  // the raw shape we inspected earlier.
  const conversationId = (post as Record<string, unknown>).conversationId as string | undefined;

  if (Array.isArray(post.attachments)) {
    for (const a of post.attachments as Array<Record<string, unknown>>) {
      const directUrl = typeof a.url === 'string' ? a.url
        : typeof a.downloadUrl === 'string' ? a.downloadUrl
        : null;
      const relUrl = typeof a.attachmentUrl === 'string' ? a.attachmentUrl : null;
      const attachmentId = typeof a._id === 'string' ? a._id
        : typeof a.id === 'string' ? a.id
        : undefined;
      const url = directUrl || absoluteAttachmentUrl(relUrl, { attachmentId, postId, conversationId });
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

    // CRITICAL: do NOT fall back to posts[0] when no timestamp match was
    // found. If the user clicked a placeholder on a message that has no
    // counterpart post in Guesty's API (structured-card messages with
    // empty postId), returning the most recent post would show wrong
    // media — the user thinks they clicked an empty card and sees a
    // photo from a totally unrelated message in the thread.
    if (!target) {
      return NextResponse.json(
        {
          ok: true,
          post: {
            id: null,
            body: '',
            bodyHtml: null,
            module: null,
            type: null,
            createdAt: sentAt,
            attachments: [],
          },
          note: 'no matching post in Guesty thread for this timestamp',
        },
      );
    }

    const attachments = deriveAttachments(target);
    // DEBUG mode: include the raw target post so we can inspect what
    // URL fields Guesty actually returns. Trigger with ?debug=1.
    const debugMode = req.nextUrl.searchParams.get('debug') === '1';
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
      ...(debugMode ? { _raw_target: target, _raw_first_post: posts[0] } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
