'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { generateCaptionAction } from '../../../actions';

// AI caption composer for IG Post. The user types what they want (vibe), picks
// a language, and Claude returns caption + hashtags. The component owns the
// caption + hashtags textarea/input so the AI output overwrites whatever the
// user had — the standard `name` attributes mean the form still submits them.
//
// Reads the first picked gallery URL from a sibling hidden input (image_url
// for image mode, video_url for video, first line of child_urls for carousel)
// so Claude sees the actual creative when writing copy. Falls back to no image
// if none picked yet.

type Props = {
  postType: 'image' | 'carousel' | 'video';
};

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
];

export function AiCaptionComposer({ postType }: Props) {
  const [vibe, setVibe] = useState('');
  const [language, setLanguage] = useState('en');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Sniff the first picked URL from the form so Claude can see the image.
  // For carousel we use the first child URL. For image/video, the corresponding
  // hidden input. Falls back to the manual paste field if picker is empty.
  function getFirstImageUrl(): string {
    const form = document.querySelector('form[action]') as HTMLFormElement | null;
    if (!form) return '';
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';
    if (postType === 'image') return get('image_url') || get('image_url_manual');
    if (postType === 'video') return ''; // Claude can't yet read videos
    // carousel
    const all = (get('child_urls') + '\n' + get('child_urls_manual')).split(/\n+/).map(s => s.trim()).filter(Boolean);
    return all[0] || '';
  }

  function getBuildingCode(): string {
    const form = document.querySelector('form[action]') as HTMLFormElement | null;
    if (!form) return '';
    return (form.elements.namedItem('building_code') as HTMLInputElement | null)?.value || '';
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('image_url', getFirstImageUrl());
        fd.set('building_code', getBuildingCode());
        fd.set('language', language);
        fd.set('surface', 'ig_caption');
        fd.set('vibe', vibe);
        const res = await generateCaptionAction(fd);
        setCaption(res.caption);
        setHashtags(res.hashtags.join(', '));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'generation_failed');
      }
    });
  }

  return (
    <div className="md:col-span-2 ix-card p-3 space-y-2 border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/30">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-600 dark:text-violet-300" />
        <strong className="text-xs">AI caption composer</strong>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">— describe the vibe, Claude writes caption + hashtags from the picked image</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
        <input
          type="text"
          value={vibe}
          onChange={e => setVibe(e.target.value)}
          placeholder="What do you want? e.g. 'rooftop sunset for Cairo weekend escapes' or 'family-friendly Eid stay, emphasise the pool'"
          className="ix-input text-sm"
        />
        <select value={language} onChange={e => setLanguage(e.target.value)} className="ix-input text-sm">
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="ix-btn-primary text-sm whitespace-nowrap"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {pending ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
      )}

      {/* Caption + hashtags — owned by this component so AI output overwrites */}
      <div className="space-y-1">
        <label htmlFor="caption" className="text-xs font-semibold">Caption (≤2 200 chars)</label>
        <textarea
          id="caption"
          name="caption"
          rows={4}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          className="ix-input text-sm"
          placeholder="Write it yourself, or click Generate to get an AI draft."
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="hashtags" className="text-xs font-semibold">Hashtags (comma or newline, no # needed)</label>
        <input
          id="hashtags"
          name="hashtags"
          value={hashtags}
          onChange={e => setHashtags(e.target.value)}
          className="ix-input text-sm"
          placeholder="BeitHady, Cairo, serviced apartments"
        />
      </div>
    </div>
  );
}
