import { notFound } from 'next/navigation';
import { getGalleryByToken } from '@/lib/beithady/communication/attachment-gallery';

export const dynamic = 'force-dynamic';

// Public gallery viewer — opened by guests when they click the
// /g/<token> link in a Beit Hady WhatsApp/Airbnb message. No auth.

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await getGalleryByToken(token);
  if (!row) notFound();

  const items = row.items;
  const imageItems = items.filter(it => it.mime?.startsWith('image/'));
  const fileItems = items.filter(it => !it.mime?.startsWith('image/'));

  return (
    <div className="bh-gallery">
      <style dangerouslySetInnerHTML={{ __html: GALLERY_CSS }} />

      <header className="bhg-header">
        <div className="bhg-brand">Beit Hady</div>
        <div className="bhg-count">
          {items.length === 1 ? '1 file' : `${items.length} files`}
        </div>
      </header>

      {imageItems.length > 0 && (
        <section className="bhg-carousel">
          {imageItems.length > 1 && (
            <button id="bhg-prev" className="bhg-nav bhg-prev" aria-label="Previous" type="button">‹</button>
          )}
          <div id="bhg-track" className="bhg-track">
            {imageItems.map((it, i) => (
              <div key={i} className="bhg-slide" data-idx={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.name} loading={i < 2 ? 'eager' : 'lazy'} />
                <div className="bhg-caption">{it.name}</div>
              </div>
            ))}
          </div>
          {imageItems.length > 1 && (
            <button id="bhg-next" className="bhg-nav bhg-next" aria-label="Next" type="button">›</button>
          )}
          {imageItems.length > 1 && (
            <div className="bhg-dots">
              {imageItems.map((_, i) => (
                <span key={i} className="bhg-dot" data-idx={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {fileItems.length > 0 && (
        <section className="bhg-files">
          <h2>Other files</h2>
          <ul>
            {fileItems.map((it, i) => (
              <li key={i}>
                <a href={it.url} target="_blank" rel="noopener noreferrer">
                  <span className="bhg-ext">{(it.mime?.split('/')[1] || 'file').toUpperCase()}</span>
                  <span className="bhg-name">{it.name}</span>
                  <span className="bhg-dl">Open</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="bhg-footer">
        Shared securely by Beit Hady Hospitality.
      </footer>

      {imageItems.length > 1 && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var track = document.getElementById('bhg-track');
                var prev = document.getElementById('bhg-prev');
                var next = document.getElementById('bhg-next');
                var dots = document.querySelectorAll('.bhg-dot');
                if (!track) return;
                var slides = track.querySelectorAll('.bhg-slide');
                var current = 0;
                function go(i) {
                  if (i < 0) i = 0;
                  if (i >= slides.length) i = slides.length - 1;
                  current = i;
                  slides[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                  dots.forEach(function(d, di) { d.classList.toggle('on', di === i); });
                }
                prev && prev.addEventListener('click', function() { go(current - 1); });
                next && next.addEventListener('click', function() { go(current + 1); });
                dots.forEach(function(d) {
                  d.addEventListener('click', function(e) {
                    var idx = parseInt(e.currentTarget.getAttribute('data-idx') || '0', 10);
                    go(idx);
                  });
                });
                document.addEventListener('keydown', function(e) {
                  if (e.key === 'ArrowLeft') go(current - 1);
                  if (e.key === 'ArrowRight') go(current + 1);
                });
                var scrollTimer = null;
                track.addEventListener('scroll', function() {
                  clearTimeout(scrollTimer);
                  scrollTimer = setTimeout(function() {
                    var idx = Math.round(track.scrollLeft / track.clientWidth);
                    if (idx !== current) {
                      current = idx;
                      dots.forEach(function(d, di) { d.classList.toggle('on', di === idx); });
                    }
                  }, 80);
                }, { passive: true });
                if (dots[0]) dots[0].classList.add('on');
              })();
            `,
          }}
        />
      )}
    </div>
  );
}

const GALLERY_CSS = `
  .bh-gallery, .bh-gallery * { box-sizing: border-box; }
  .bh-gallery {
    position: fixed; inset: 0;
    background: #0a0e1a;
    color: #e8edf2;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .bhg-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #1c2436;
    background: #0d1424;
    flex-shrink: 0;
  }
  .bhg-brand { font-weight: 700; letter-spacing: 0.02em; color: #d4a93a; }
  .bhg-count { font-size: 12px; color: #a0adba; }
  .bhg-carousel {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .bhg-track {
    flex: 1;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
    background: #050810;
  }
  .bhg-track::-webkit-scrollbar { display: none; }
  .bhg-slide {
    flex: 0 0 100%;
    height: 100%;
    scroll-snap-align: start;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 16px;
  }
  .bhg-slide img {
    max-width: 100%;
    max-height: calc(100% - 60px);
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  }
  .bhg-caption {
    margin-top: 12px;
    font-size: 13px;
    color: #a0adba;
    text-align: center;
    word-break: break-all;
    max-width: 100%;
    flex-shrink: 0;
  }
  .bhg-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: rgba(20, 28, 48, 0.85);
    color: #e8edf2;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    z-index: 5;
    backdrop-filter: blur(8px);
    transition: background 0.15s;
  }
  .bhg-nav:hover { background: rgba(40, 56, 92, 0.95); }
  .bhg-prev { left: 16px; }
  .bhg-next { right: 16px; }
  .bhg-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: #0d1424;
    border-top: 1px solid #1c2436;
    flex-shrink: 0;
  }
  .bhg-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2a3450;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .bhg-dot.on { background: #d4a93a; transform: scale(1.3); }
  .bhg-dot:hover { background: #5f7397; }
  .bhg-files {
    padding: 20px;
    border-top: 1px solid #1c2436;
    background: #0d1424;
    flex-shrink: 0;
    max-height: 40vh;
    overflow-y: auto;
  }
  .bhg-files h2 {
    font-size: 14px; font-weight: 600; margin: 0 0 12px;
    color: #a0adba; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .bhg-files ul { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; margin: 0; }
  .bhg-files li a {
    display: flex; align-items: center; gap: 12px;
    padding: 12px;
    background: #131c30;
    border: 1px solid #1c2436;
    border-radius: 8px;
    color: #e8edf2;
    text-decoration: none;
    transition: background 0.15s;
  }
  .bhg-files li a:hover { background: #1a2440; }
  .bhg-ext {
    width: 56px; text-align: center;
    font-size: 11px; font-weight: 700;
    color: #d4a93a; background: #1c2436;
    padding: 4px 6px; border-radius: 4px;
  }
  .bhg-name { flex: 1; font-size: 14px; word-break: break-all; }
  .bhg-dl { font-size: 12px; color: #5f7397; }
  .bhg-footer {
    padding: 12px 20px;
    text-align: center;
    font-size: 11px;
    color: #5f7397;
    border-top: 1px solid #1c2436;
    background: #0d1424;
    flex-shrink: 0;
  }
  @media (max-width: 600px) {
    .bhg-nav { width: 36px; height: 36px; font-size: 22px; }
    .bhg-prev { left: 8px; }
    .bhg-next { right: 8px; }
  }
`;
