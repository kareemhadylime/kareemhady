// Tiny markdown → HTML renderer for SOP articles. Handles the subset
// we use: H1/H2/H3, bold, italic, inline code, ordered + unordered
// lists, paragraphs, line breaks. NOT full CommonMark — just enough
// for our seed content + agent-authored SOPs.
//
// Server-side only (no DOMPurify needed). Inputs are admin-authored,
// not guest-controlled.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

function inline(s: string): string {
  // Bold + italic + code + links — applied after HTML-escape.
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[12px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-700 dark:text-cyan-300 hover:underline" target="_blank" rel="noopener">$1</a>');
}

export function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inP = false;
  let pBuf: string[] = [];

  const flushP = () => {
    if (pBuf.length > 0) {
      out.push(`<p class="my-2">${pBuf.map(inline).join('<br/>')}</p>`);
      pBuf = [];
    }
    inP = false;
  };
  const closeUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };
  const closeOl = () => { if (inOl) { out.push('</ol>'); inOl = false; } };
  const closeAll = () => { flushP(); closeUl(); closeOl(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') { closeAll(); continue; }

    const h3 = /^### +(.+)$/.exec(line);
    if (h3) { closeAll(); out.push(`<h3 class="font-semibold text-sm mt-4 mb-2" style="color: var(--bh-navy)">${inline(h3[1])}</h3>`); continue; }
    const h2 = /^## +(.+)$/.exec(line);
    if (h2) { closeAll(); out.push(`<h2 class="font-bold text-base mt-5 mb-2" style="color: var(--bh-navy)">${inline(h2[1])}</h2>`); continue; }
    const h1 = /^# +(.+)$/.exec(line);
    if (h1) { closeAll(); out.push(`<h1 class="font-bold text-lg mt-6 mb-3" style="color: var(--bh-navy)">${inline(h1[1])}</h1>`); continue; }

    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushP(); closeUl();
      if (!inOl) { out.push('<ol class="list-decimal list-inside space-y-1 my-2 ml-2">'); inOl = true; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushP(); closeOl();
      if (!inUl) { out.push('<ul class="list-disc list-inside space-y-1 my-2 ml-2">'); inUl = true; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    closeUl(); closeOl();
    inP = true;
    pBuf.push(line);
  }
  closeAll();
  return out.join('\n');
}
