"""Generate the 10 storyboard slides for the TikTok Content Posting API audit demo.

Output: docs/tiktok-app-audit/build/scene_NN.png (1920x1080 each)

Scenes match docs/tiktok-app-audit/SUBMISSION.md section 4.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "tiktok-app-audit" / "build"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Brand palette derived from the live app.
BG_CREAM = (245, 240, 232)
BG_WHITE = (255, 255, 255)
BG_DARK = (15, 23, 42)
BORDER = (226, 232, 240)
TEXT_PRIMARY = (15, 23, 42)
TEXT_MUTED = (100, 116, 139)
EMERALD = (16, 185, 129)
EMERALD_BG = (220, 252, 231)
AMBER = (245, 158, 11)
AMBER_BG = (254, 243, 199)
ROSE = (244, 63, 94)
VIOLET = (139, 92, 246)
ROSE_BG = (255, 228, 230)
VIOLET_BG = (237, 233, 254)
SLATE_200 = (226, 232, 240)
SLATE_400 = (148, 163, 184)
SLATE_700 = (51, 65, 85)
ACCENT_BLUE = (59, 130, 246)


def font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        path = "C:/Windows/Fonts/consola.ttf"
    else:
        path = "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"
    return ImageFont.truetype(path, size)


def base_canvas(scene_num: int, scene_title: str, subtitle: str = "") -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG_CREAM)
    d = ImageDraw.Draw(img)

    # Top header strip
    d.rectangle((0, 0, W, 110), fill=BG_DARK)
    d.text((60, 30), "Lime Investments · TikTok Content Posting API — Demo", fill=(255, 255, 255), font=font(22))
    d.text((60, 62), f"Scene {scene_num:02d} — {scene_title}", fill=(255, 255, 255), font=font(36, bold=True))
    if subtitle:
        d.text((60, 110 + 6), subtitle, fill=TEXT_MUTED, font=font(20))

    # Bottom URL bar (visible always so reviewers see the domain)
    d.rectangle((0, H - 60, W, H), fill=(30, 41, 59))
    d.text((60, H - 45), "app.limeinc.cc", fill=(125, 211, 252), font=font(20, mono=True))
    d.text((W - 280, H - 45), f"Beit Hady demo · 0:{scene_num*10:02d}", fill=(148, 163, 184), font=font(18))

    return img, d


def draw_browser_chrome(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, url: str) -> tuple[int, int]:
    """Browser frame; returns (content_x, content_y) for the inner viewport."""
    # Outer frame
    d.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=BG_WHITE, outline=BORDER, width=2)
    # Tab bar
    d.rectangle((x, y, x + w, y + 50), fill=(241, 245, 249))
    d.ellipse((x + 16, y + 17, x + 32, y + 33), fill=(248, 113, 113))
    d.ellipse((x + 40, y + 17, x + 56, y + 33), fill=(250, 204, 21))
    d.ellipse((x + 64, y + 17, x + 80, y + 33), fill=(74, 222, 128))
    # URL bar
    d.rounded_rectangle((x + 110, y + 12, x + w - 30, y + 38), radius=6, fill=BG_WHITE, outline=BORDER)
    d.text((x + 130, y + 18), url, fill=TEXT_PRIMARY, font=font(16, mono=True))
    return x + 1, y + 51


def draw_app_topnav(d: ImageDraw.ImageDraw, x: int, y: int, w: int, breadcrumb: list[str]) -> int:
    """Returns y after the topnav."""
    d.rectangle((x, y, x + w, y + 70), fill=BG_WHITE, outline=BORDER, width=1)
    # Logo
    d.rounded_rectangle((x + 20, y + 18, x + 56, y + 54), radius=8, fill=EMERALD)
    d.text((x + 80, y + 25), "Lime Investments", fill=TEXT_PRIMARY, font=font(20, bold=True))
    # Breadcrumb
    bx = x + 320
    for i, crumb in enumerate(breadcrumb):
        if i > 0:
            d.text((bx, y + 30), ">", fill=TEXT_MUTED, font=font(16))
            bx += 30
        is_last = i == len(breadcrumb) - 1
        c = TEXT_PRIMARY if is_last else (16, 185, 129)
        d.text((bx, y + 28), crumb, fill=c, font=font(18, bold=is_last))
        bw = d.textlength(crumb, font=font(18, bold=is_last))
        bx += int(bw) + 20
    # Right side
    d.text((x + w - 300, y + 28), "kareemhady", fill=TEXT_PRIMARY, font=font(16))
    d.rounded_rectangle((x + w - 200, y + 24, x + w - 130, y + 50), radius=4, fill=EMERALD_BG)
    d.text((x + w - 192, y + 28), "ADMIN", fill=EMERALD, font=font(14, bold=True))
    return y + 70


def draw_callout(d: ImageDraw.ImageDraw, text: str, x: int, y: int, *, anchor_x: int, anchor_y: int) -> None:
    """Draw a callout box with an arrow pointing at (anchor_x, anchor_y)."""
    pad = 16
    f = font(20, bold=True)
    tw = int(d.textlength(text, font=f))
    box_w, box_h = tw + pad * 2, 50
    d.rounded_rectangle((x, y, x + box_w, y + box_h), radius=8, fill=AMBER, outline=AMBER_BG, width=3)
    d.text((x + pad, y + 13), text, fill=(0, 0, 0), font=f)
    # Arrow line
    d.line((x + box_w // 2, y + box_h, anchor_x, anchor_y), fill=AMBER, width=4)
    # Arrow head
    d.ellipse((anchor_x - 8, anchor_y - 8, anchor_x + 8, anchor_y + 8), fill=AMBER)


def draw_caption_strip(d: ImageDraw.ImageDraw, lines: list[str], y_top: int = H - 200) -> None:
    """Bottom caption strip (above URL bar)."""
    d.rectangle((0, y_top, W, H - 60), fill=BG_DARK)
    cy = y_top + 30
    for i, line in enumerate(lines):
        f = font(28, bold=(i == 0))
        d.text((60, cy), line, fill=(255, 255, 255) if i == 0 else (203, 213, 225), font=f)
        cy += 38


# ---------- Individual scene renderers ----------

def scene_01_signin() -> Image.Image:
    img, d = base_canvas(1, "Sign in to the operations platform", "All access is gated by named credentials")
    cx, cy = draw_browser_chrome(d, 460, 180, 1000, 600, "app.limeinc.cc/login")
    # Login card
    box_x, box_y = cx + 220, cy + 90
    d.rounded_rectangle((box_x, box_y, box_x + 560, box_y + 380), radius=14, fill=BG_WHITE, outline=BORDER, width=2)
    d.text((box_x + 200, box_y + 30), "Lime Investments", fill=TEXT_PRIMARY, font=font(28, bold=True))
    d.text((box_x + 230, box_y + 70), "Operator sign-in", fill=TEXT_MUTED, font=font(18))
    # Username field
    d.text((box_x + 40, box_y + 130), "Username", fill=TEXT_PRIMARY, font=font(16, bold=True))
    d.rounded_rectangle((box_x + 40, box_y + 155, box_x + 520, box_y + 195), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((box_x + 55, box_y + 165), "kareemhady", fill=TEXT_PRIMARY, font=font(18, mono=True))
    # Password field
    d.text((box_x + 40, box_y + 215), "Password", fill=TEXT_PRIMARY, font=font(16, bold=True))
    d.rounded_rectangle((box_x + 40, box_y + 240, box_x + 520, box_y + 280), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((box_x + 55, box_y + 250), "•" * 12, fill=TEXT_PRIMARY, font=font(20))
    # Button
    d.rounded_rectangle((box_x + 40, box_y + 310, box_x + 520, box_y + 355), radius=6, fill=EMERALD)
    d.text((box_x + 245, box_y + 320), "Sign in", fill=BG_WHITE, font=font(20, bold=True))

    draw_caption_strip(d, [
        "Operator authenticates with named credentials.",
        "Role-based permissions; every publish action is audit-logged.",
    ])
    return img


def scene_02_nav() -> Image.Image:
    img, d = base_canvas(2, "Navigate to Beit Hady → Ads → TikTok Reels")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])
    # Page title
    d.text((cx + 40, ny + 30), "BEIT HADY · ADS", fill=TEXT_MUTED, font=font(16, bold=True))
    d.text((cx + 40, ny + 60), "Publish — TikTok Reels (organic)", fill=TEXT_PRIMARY, font=font(40, bold=True))
    d.text((cx + 40, ny + 120), "Push a video to TikTok via the Content Posting API.", fill=TEXT_MUTED, font=font(20))
    # Tab grid (manage/publish/settings)
    tab_y = ny + 200
    d.rounded_rectangle((cx + 40, tab_y, cx + 1750, tab_y + 220), radius=10, fill=BG_WHITE, outline=BORDER, width=2)
    sections = [("MANAGE", ["Overview", "Campaigns", "Leads", "Performance"]),
                ("PUBLISH", ["Meta CTWA", "Google Search", "Google PMax", "TikTok Ads", "IG Reels", "Boost IG", "TikTok Reels"]),
                ("SETTINGS", ["Gallery", "Accounts", "Templates"])]
    sy = tab_y + 20
    for label, items in sections:
        d.text((cx + 60, sy + 8), label, fill=TEXT_MUTED, font=font(14, bold=True))
        bx = cx + 200
        for item in items:
            highlight = (item == "TikTok Reels")
            fill = EMERALD_BG if highlight else BG_WHITE
            outline = EMERALD if highlight else BORDER
            tw = int(d.textlength(item, font=font(16))) + 30
            d.rounded_rectangle((bx, sy, bx + tw + 20, sy + 36), radius=6, fill=fill, outline=outline, width=2)
            color = EMERALD if highlight else TEXT_PRIMARY
            d.text((bx + 15, sy + 8), item, fill=color, font=font(16, bold=highlight))
            bx += tw + 30
        sy += 52

    # Callout pointing at "TikTok Reels" tab
    draw_callout(d, "Selected tab", cx + 1300, tab_y - 70, anchor_x=cx + 1450, anchor_y=tab_y + 90)

    draw_caption_strip(d, [
        "From the dashboard, marketing operators reach the publish form in 2 clicks.",
        "TikTok Reels uses the Content Posting API.",
    ])
    return img


def scene_03_account() -> Image.Image:
    img, d = base_canvas(3, "Connected TikTok account", "OAuth-linked, refresh token encrypted at rest")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/accounts")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "Accounts", "TikTok"])
    d.text((cx + 40, ny + 30), "TikTok accounts", fill=TEXT_PRIMARY, font=font(40, bold=True))

    # Connected banner
    by = ny + 110
    d.rounded_rectangle((cx + 40, by, cx + 1750, by + 70), radius=10, fill=EMERALD_BG, outline=EMERALD, width=2)
    d.ellipse((cx + 60, by + 25, cx + 80, by + 45), fill=EMERALD)
    d.text((cx + 100, by + 22), "Connected: @beit.hady (production TikTok account, OAuth-linked)", fill=(6, 78, 59), font=font(22, bold=True))

    # Account row card
    ay = by + 100
    d.rounded_rectangle((cx + 40, ay, cx + 1750, ay + 280), radius=10, fill=BG_WHITE, outline=BORDER, width=2)
    d.text((cx + 60, ay + 30), "Beithady Tiktok", fill=TEXT_PRIMARY, font=font(28, bold=True))
    d.text((cx + 320, ay + 38), "(beithady)", fill=TEXT_MUTED, font=font(20, mono=True))
    d.text((cx + 60, ay + 80), "OAuth: ", fill=TEXT_PRIMARY, font=font(18))
    d.text((cx + 130, ay + 80), "connected", fill=EMERALD, font=font(18, bold=True))
    d.text((cx + 60, ay + 120), "open_id: -000c31VaSdPq6nxvJBP634dyeogsRyQFPc3", fill=TEXT_MUTED, font=font(16, mono=True))
    d.text((cx + 60, ay + 150), "refresh_token: AES-256-GCM encrypted (never in source control)", fill=TEXT_MUTED, font=font(16, mono=True))
    d.text((cx + 60, ay + 180), "scopes: user.info.basic, video.publish, video.upload", fill=TEXT_MUTED, font=font(16, mono=True))

    # Reconnect button
    d.rounded_rectangle((cx + 60, ay + 220, cx + 220, ay + 260), radius=6, fill=BG_WHITE, outline=AMBER, width=2)
    d.text((cx + 90, ay + 230), "Reconnect", fill=AMBER, font=font(16, bold=True))

    draw_caption_strip(d, [
        "Token storage is private to Lime Investments operators.",
        "We never read other users’ data — only publish to our own account.",
    ])
    return img


def scene_04_picker() -> Image.Image:
    img, d = base_canvas(4, "Source from Instagram — click a Reel to mirror", "Server fetches the IG video and stores it in our own Supabase bucket")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic?from_ig=...")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])

    # Picker card
    py = ny + 30
    d.rounded_rectangle((cx + 40, py, cx + 1750, py + 280), radius=10, fill=BG_WHITE, outline=BORDER, width=2)
    d.text((cx + 60, py + 20), "Source from Instagram — ", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.text((cx + 320, py + 20), "Reels", fill=VIOLET, font=font(18, bold=True))
    d.text((cx + 380, py + 20), " + currently-live ", fill=TEXT_PRIMARY, font=font(18))
    d.text((cx + 540, py + 20), "Stories", fill=ROSE, font=font(18, bold=True))
    d.text((cx + 620, py + 20), " (click to mirror video + pre-fill)", fill=TEXT_MUTED, font=font(18))

    thumb_y = py + 70
    for i in range(8):
        thumb_x = cx + 60 + i * 130
        is_selected = i == 2
        ring = VIOLET if is_selected else BORDER
        # Mock thumbnail
        thumb_color = [(254, 215, 170), (167, 243, 208), (199, 210, 254), (254, 202, 202),
                       (245, 208, 254), (191, 219, 254), (254, 240, 138), (252, 165, 165)][i]
        d.rounded_rectangle((thumb_x, thumb_y, thumb_x + 100, thumb_y + 160), radius=8, fill=thumb_color, outline=ring, width=4 if is_selected else 1)
        if is_selected:
            d.rectangle((thumb_x + 4, thumb_y + 4, thumb_x + 50, thumb_y + 22), fill=VIOLET)
            d.text((thumb_x + 8, thumb_y + 6), "REEL", fill=BG_WHITE, font=font(11, bold=True))

    # Sourced banner under picker
    sy = py + 290
    d.rounded_rectangle((cx + 40, sy, cx + 1750, sy + 90), radius=10, fill=VIOLET_BG, outline=VIOLET, width=2)
    d.text((cx + 60, sy + 18), "✓  Sourced from Instagram Reel", fill=(76, 29, 149), font=font(22, bold=True))
    d.text((cx + 60, sy + 50), "Video mirrored to Supabase public storage so TikTok can fetch it server-side.", fill=(76, 29, 149), font=font(16))

    # Callout
    draw_callout(d, "Operator picks an existing IG Reel", cx + 100, py - 80, anchor_x=cx + 320, anchor_y=thumb_y + 80)

    draw_caption_strip(d, [
        "Video bytes are mirrored from Instagram to OUR Supabase bucket.",
        "TikTok upload uses FILE_UPLOAD source — no third-party domain involved.",
    ])
    return img


def scene_05_caption() -> Image.Image:
    img, d = base_canvas(5, "Operator reviews caption and hashtags", "Final say on every post stays with the human")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])

    fy = ny + 40
    d.rounded_rectangle((cx + 40, fy, cx + 1750, fy + 540), radius=10, fill=BG_WHITE, outline=BORDER, width=2)

    # Account select + Privacy
    d.text((cx + 60, fy + 20), "Account", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.rounded_rectangle((cx + 60, fy + 50, cx + 800, fy + 95), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((cx + 80, fy + 60), "Beithady Tiktok", fill=TEXT_PRIMARY, font=font(20))
    d.text((cx + 770, fy + 60), "v", fill=TEXT_MUTED, font=font(20))

    d.text((cx + 870, fy + 20), "Privacy", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.rounded_rectangle((cx + 870, fy + 50, cx + 1700, fy + 95), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((cx + 890, fy + 60), "Public", fill=TEXT_PRIMARY, font=font(20))

    # Video URL
    d.text((cx + 60, fy + 120), "Video URL (mirrored from IG, hosted on our Supabase)", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.rounded_rectangle((cx + 60, fy + 150, cx + 1700, fy + 195), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((cx + 80, fy + 162), "https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/beithady-gallery-public/ig-tiktok/...mp4",
           fill=TEXT_PRIMARY, font=font(15, mono=True))

    # Caption
    d.text((cx + 60, fy + 220), "Caption", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.rounded_rectangle((cx + 60, fy + 250, cx + 1700, fy + 360), radius=6, fill=(248, 250, 252), outline=BORDER)
    cap = "Where to next? The choice is entirely yours.\nFrom the moment you decide to go, the Beit Hady Car Service\nensures the assurance of your stay."
    d.multiline_text((cx + 80, fy + 262), cap, fill=TEXT_PRIMARY, font=font(18))

    # Hashtags
    d.text((cx + 60, fy + 380), "Hashtags", fill=TEXT_PRIMARY, font=font(18, bold=True))
    d.rounded_rectangle((cx + 60, fy + 410, cx + 1700, fy + 455), radius=6, fill=(248, 250, 252), outline=BORDER)
    d.text((cx + 80, fy + 422), "BeitHady, CairoAdventures, Hospitality, ExclusiveService", fill=TEXT_PRIMARY, font=font(18))

    # Callout
    draw_callout(d, "Operator can edit before publish", cx + 1100, fy + 380 - 70, anchor_x=cx + 1300, anchor_y=fy + 432)

    draw_caption_strip(d, [
        "Captions, hashtags, privacy and account are all human-controlled.",
        "Nothing is auto-pushed without operator review and submit.",
    ])
    return img


def scene_06_directpost() -> Image.Image:
    img, d = base_canvas(6, "Privacy options + Direct Post toggle", "After audit, ticking 'Direct post?' bypasses the inbox step")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])

    # Privacy panel + checkbox
    py = ny + 40
    d.rounded_rectangle((cx + 40, py, cx + 1750, py + 540), radius=10, fill=BG_WHITE, outline=BORDER, width=2)

    d.text((cx + 60, py + 20), "Privacy", fill=TEXT_PRIMARY, font=font(20, bold=True))
    options = [
        ("PUBLIC_TO_EVERYONE", "Public", True),
        ("MUTUAL_FOLLOW_FRIENDS", "Friends", False),
        ("FOLLOWER_OF_CREATOR", "Followers", False),
        ("SELF_ONLY", "Private", False),
    ]
    oy = py + 60
    for code, label, sel in options:
        bullet_color = EMERALD if sel else SLATE_400
        d.ellipse((cx + 70, oy + 6, cx + 90, oy + 26), outline=bullet_color, width=3)
        if sel:
            d.ellipse((cx + 76, oy + 12, cx + 84, oy + 20), fill=bullet_color)
        d.text((cx + 110, oy + 4), label, fill=TEXT_PRIMARY, font=font(20, bold=sel))
        d.text((cx + 270, oy + 6), code, fill=TEXT_MUTED, font=font(15, mono=True))
        oy += 40

    # Direct Post toggle (highlighted)
    dy = py + 280
    d.rounded_rectangle((cx + 60, dy, cx + 1700, dy + 130), radius=10, fill=AMBER_BG, outline=AMBER, width=3)
    d.rounded_rectangle((cx + 80, dy + 30, cx + 110, dy + 60), radius=4, fill=BG_WHITE, outline=AMBER, width=3)
    d.text((cx + 88, dy + 31), "✓", fill=AMBER, font=font(22, bold=True))
    d.text((cx + 130, dy + 25), "Direct post? (Bypass inbox — requires audited app)", fill=(120, 53, 15), font=font(22, bold=True))
    d.text((cx + 130, dy + 60), "When ticked AND TikTok has approved your app for Content Posting,", fill=(120, 53, 15), font=font(17))
    d.text((cx + 130, dy + 85), "the video skips the inbox draft step and posts directly to @beit.hady.", fill=(120, 53, 15), font=font(17))

    # Big publish button mock
    by = py + 440
    d.rounded_rectangle((cx + 1480, by, cx + 1700, by + 70), radius=8, fill=EMERALD)
    d.text((cx + 1530, by + 22), "Publish", fill=BG_WHITE, font=font(24, bold=True))

    # Callout
    draw_callout(d, "Direct Post = audit-gated", cx + 1100, dy - 70, anchor_x=cx + 1500, anchor_y=dy + 60)

    draw_caption_strip(d, [
        "Direct Post is the capability we are requesting in this audit submission.",
        "It removes the manual inbox-finalize step from each post.",
    ])
    return img


def scene_07_publish() -> Image.Image:
    img, d = base_canvas(7, "Operator clicks Publish → server uploads bytes to TikTok", "FILE_UPLOAD source: no third-party domain in the loop")

    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])

    # Success banner
    by = ny + 40
    d.rounded_rectangle((cx + 40, by, cx + 1750, by + 110), radius=10, fill=EMERALD_BG, outline=EMERALD, width=3)
    d.ellipse((cx + 70, by + 30, cx + 110, by + 70), fill=EMERALD)
    d.text((cx + 80, by + 32), "✓", fill=BG_WHITE, font=font(28, bold=True))
    d.text((cx + 130, by + 26), "Submitted post #6 — status: SEND_TO_USER_INBOX", fill=(6, 78, 59), font=font(24, bold=True))
    d.text((cx + 130, by + 65), "Pre-audit flow lands the video in the @beit.hady TikTok inbox.", fill=(6, 78, 59), font=font(18))
    d.text((cx + 130, by + 88), "After audit + Direct Post: status → PUBLISH_COMPLETE.", fill=(6, 78, 59), font=font(18))

    # Sequence diagram
    sx, sy = cx + 60, by + 160
    boxes = [
        ("Operator clicks", "Publish", EMERALD),
        ("Server fetches", "video bytes\nfrom Supabase", ACCENT_BLUE),
        ("Init upload", "FILE_UPLOAD\n+ video_size", VIOLET),
        ("PUT bytes to", "TikTok upload_url\n(Content-Range)", AMBER),
        ("Poll status", "until terminal", ROSE),
    ]
    bw, bh, gap = 290, 160, 30
    for i, (line1, line2, color) in enumerate(boxes):
        x = sx + i * (bw + gap)
        d.rounded_rectangle((x, sy, x + bw, sy + bh), radius=10, fill=BG_WHITE, outline=color, width=3)
        d.text((x + 16, sy + 16), line1, fill=TEXT_MUTED, font=font(18))
        d.multiline_text((x + 16, sy + 50), line2, fill=color, font=font(22, bold=True))
        if i < len(boxes) - 1:
            d.line((x + bw + 4, sy + bh // 2, x + bw + gap - 4, sy + bh // 2), fill=TEXT_MUTED, width=4)
            d.polygon([(x + bw + gap - 4, sy + bh // 2 - 8),
                       (x + bw + gap + 8, sy + bh // 2),
                       (x + bw + gap - 4, sy + bh // 2 + 8)], fill=TEXT_MUTED)

    draw_caption_strip(d, [
        "Server-side flow: fetch → init → PUT bytes → poll. No PULL_FROM_URL.",
        "All steps audit-logged in our database (ads_tiktok_posts table).",
    ])
    return img


def scene_08_phone() -> Image.Image:
    img, d = base_canvas(8, "Video lands on @beit.hady (TikTok app, mobile)", "Operator finalizes from Inbox — OR auto-publishes after audit")

    # Mock phone frame
    px, py = 660, 180
    pw, ph = 600, 750
    d.rounded_rectangle((px, py, px + pw, py + ph), radius=40, fill=BG_DARK, outline=SLATE_700, width=4)
    # Notch
    d.rounded_rectangle((px + pw // 2 - 80, py + 16, px + pw // 2 + 80, py + 36), radius=10, fill=(0, 0, 0))
    # Inner screen
    sx, sy = px + 16, py + 60
    sw, sh = pw - 32, ph - 80
    d.rectangle((sx, sy, sx + sw, sy + sh), fill=BG_WHITE)

    # TikTok app mock
    d.text((sx + 20, sy + 15), "TikTok", fill=TEXT_PRIMARY, font=font(28, bold=True))
    d.text((sx + sw - 100, sy + 22), "Inbox", fill=ROSE, font=font(20, bold=True))

    # Notification card
    nx, ny_ = sx + 20, sy + 80
    d.rounded_rectangle((nx, ny_, nx + sw - 40, ny_ + 130), radius=12, fill=ROSE_BG, outline=ROSE, width=2)
    d.text((nx + 20, ny_ + 18), "TikTok • just now", fill=ROSE, font=font(15, bold=True))
    d.text((nx + 20, ny_ + 45), "Your draft is ready", fill=TEXT_PRIMARY, font=font(20, bold=True))
    d.text((nx + 20, ny_ + 78), "Tap to review and post the video pushed", fill=TEXT_MUTED, font=font(15))
    d.text((nx + 20, ny_ + 100), "from your operations platform.", fill=TEXT_MUTED, font=font(15))

    # Video preview thumbnail
    vx, vy = sx + 80, sy + 240
    d.rounded_rectangle((vx, vy, vx + sw - 200, vy + 380), radius=12, fill=(254, 215, 170))
    d.text((vx + 80, vy + 160), "@beit.hady", fill=TEXT_PRIMARY, font=font(28, bold=True))
    d.text((vx + 50, vy + 200), "Where to next? 🌍", fill=TEXT_PRIMARY, font=font(20))
    # Play button
    d.ellipse((vx + 160, vy + 260, vx + 240, vy + 340), fill=BG_WHITE)
    d.polygon([(vx + 185, vy + 280), (vx + 185, vy + 320), (vx + 220, vy + 300)], fill=ROSE)

    # Callout
    draw_callout(d, "Post ready in @beit.hady", 1320, 280, anchor_x=860, anchor_y=400)

    # Right-side caption box
    rx, ry = 1320, 500
    d.rounded_rectangle((rx, ry, rx + 540, ry + 360), radius=12, fill=BG_WHITE, outline=BORDER, width=2)
    d.text((rx + 20, ry + 20), "Today (pre-audit):", fill=TEXT_MUTED, font=font(18, bold=True))
    d.text((rx + 20, ry + 50), "Status → SEND_TO_USER_INBOX", fill=TEXT_PRIMARY, font=font(20, mono=True))
    d.text((rx + 20, ry + 80), "Operator opens TikTok app, taps", fill=TEXT_PRIMARY, font=font(18))
    d.text((rx + 20, ry + 105), "the draft, hits Post.", fill=TEXT_PRIMARY, font=font(18))

    d.line((rx + 20, ry + 160, rx + 520, ry + 160), fill=BORDER, width=2)

    d.text((rx + 20, ry + 180), "After this audit approves:", fill=AMBER, font=font(18, bold=True))
    d.text((rx + 20, ry + 210), "Status → PUBLISH_COMPLETE", fill=TEXT_PRIMARY, font=font(20, mono=True))
    d.text((rx + 20, ry + 240), "Video posts directly. No app step.", fill=TEXT_PRIMARY, font=font(18))
    d.text((rx + 20, ry + 270), "This is the capability we are", fill=TEXT_PRIMARY, font=font(18))
    d.text((rx + 20, ry + 295), "requesting in this submission.", fill=TEXT_PRIMARY, font=font(18))

    draw_caption_strip(d, [
        "Today: post lands in our brand account’s Inbox; operator finalizes manually.",
        "After audit: Direct Post auto-publishes to @beit.hady. Same video, fewer clicks.",
    ])
    return img


def scene_09_audit() -> Image.Image:
    img, d = base_canvas(9, "Audit trail — every publish is logged", "ads_tiktok_posts table records operator, timestamp, status, video URL")
    cx, cy = draw_browser_chrome(d, 60, 180, 1800, 700, "app.limeinc.cc/beithady/ads/tiktok/organic#recent")
    ny = draw_app_topnav(d, cx, cy, 1798, ["Home", "Beit Hady", "Ads", "TikTok Reels"])

    d.text((cx + 40, ny + 20), "Recent posts", fill=TEXT_PRIMARY, font=font(28, bold=True))

    # Table
    ty = ny + 70
    headers = ["When", "Building", "Caption", "Status", "Link"]
    col_widths = [220, 180, 700, 280, 200]
    cx_acc = cx + 40
    for i, h in enumerate(headers):
        d.rectangle((cx_acc, ty, cx_acc + col_widths[i], ty + 40), fill=(241, 245, 249))
        d.text((cx_acc + 10, ty + 8), h, fill=TEXT_MUTED, font=font(16, bold=True))
        cx_acc += col_widths[i]

    rows = [
        ("15 May, 04:12 UTC", "BH-435", "Where to next? The choice...", "SEND_TO_USER_INBOX", "open"),
        ("15 May, 03:57 UTC", "BH-435", "Where to next? The choice...", "FAILED (resolved)", "—"),
        ("14 May, 19:57 UTC", "BH-435", "Where to next? The choice...", "FAILED (PULL fixed)", "—"),
    ]
    ry = ty + 40
    for vals in rows:
        cx_acc = cx + 40
        for i, v in enumerate(vals):
            d.rectangle((cx_acc, ry, cx_acc + col_widths[i], ry + 50), fill=BG_WHITE, outline=BORDER)
            color = EMERALD if v == "SEND_TO_USER_INBOX" else (TEXT_PRIMARY if "FAILED" not in v else (148, 163, 184))
            f_ = font(16, bold=(v == "SEND_TO_USER_INBOX"))
            d.text((cx_acc + 10, ry + 14), v[:36], fill=color, font=f_)
            cx_acc += col_widths[i]
        ry += 50

    # SQL snippet
    sy = ry + 40
    d.rounded_rectangle((cx + 40, sy, cx + 1750, sy + 200), radius=10, fill=BG_DARK)
    d.text((cx + 60, sy + 20), "Postgres audit trail (ads_tiktok_posts):", fill=(125, 211, 252), font=font(18, bold=True, mono=True))
    sql = ("SELECT id, ads_account_id, status, published_at, created_by\n"
           "FROM ads_tiktok_posts\n"
           "WHERE ads_account_id = 4 AND created_at > now() - interval '1 day'\n"
           "ORDER BY created_at DESC;")
    d.multiline_text((cx + 60, sy + 60), sql, fill=(255, 255, 255), font=font(16, mono=True))

    draw_caption_strip(d, [
        "Every publish creates a row with operator identity, timestamp, status, and raw response.",
        "Failed publishes preserve the TikTok error payload for forensics.",
    ])
    return img


def scene_10_close() -> Image.Image:
    img, d = base_canvas(10, "End frame — confirming domain", "Privacy policy + Terms reachable at the same domain reviewers see in the URL bar")
    # Big-text close
    d.rectangle((60, 200, W - 60, H - 200), fill=BG_WHITE, outline=BORDER, width=2)
    d.text((150, 280), "app.limeinc.cc", fill=TEXT_PRIMARY, font=font(80, bold=True, mono=True))
    d.text((150, 380), "Internal hospitality CRM — Lime Investments", fill=TEXT_MUTED, font=font(28))

    items = [
        ("Privacy Policy", "app.limeinc.cc/legal/privacy"),
        ("Terms of Service", "app.limeinc.cc/legal/terms"),
        ("OAuth redirect", "app.limeinc.cc/api/auth/tiktok/callback"),
        ("Brand account", "@beit.hady (production)"),
        ("Scopes requested", "user.info.basic · video.publish · video.upload"),
    ]
    iy = 470
    for label, val in items:
        d.text((150, iy), label, fill=TEXT_MUTED, font=font(20, bold=True))
        d.text((550, iy), val, fill=TEXT_PRIMARY, font=font(22, mono=True))
        iy += 50

    d.rounded_rectangle((150, 800, 1100, 870), radius=10, fill=EMERALD_BG, outline=EMERALD, width=3)
    d.text((180, 820), "Requesting Direct Post capability for our own brand account.", fill=(6, 78, 59), font=font(22, bold=True))

    draw_caption_strip(d, [
        "Same domain across the app, OAuth callback, and legal pages.",
        "Thank you for reviewing this submission.",
    ])
    return img


# ---------- Main ----------

SCENES = [
    scene_01_signin,
    scene_02_nav,
    scene_03_account,
    scene_04_picker,
    scene_05_caption,
    scene_06_directpost,
    scene_07_publish,
    scene_08_phone,
    scene_09_audit,
    scene_10_close,
]


def main() -> None:
    for i, fn in enumerate(SCENES, start=1):
        out = OUT_DIR / f"scene_{i:02d}.png"
        img = fn()
        img.save(out, optimize=True)
        print(f"  wrote {out.name}")


if __name__ == "__main__":
    main()
