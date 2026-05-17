'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { generatePmaxCopyAction } from '../../../actions';

// AI copy composer for Google PMax. Owns the three required textareas
// (headlines, long headlines, descriptions) so a Generate click can
// overwrite their contents in place without a page reload, preserving
// the rest of the form (budget, campaign name, building codes, …).
//
// Mirrors AiCaptionComposer on the IG Post page. Sniffs building_codes,
// target_countries, business_name and final_url from the enclosing form
// so Claude has the building + country context when writing copy.

type Props = {
  defaultHeadlines: string;
  defaultLongHeadlines: string;
  defaultDescriptions: string;
};

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
];

export function AiPmaxComposer({ defaultHeadlines, defaultLongHeadlines, defaultDescriptions }: Props) {
  const [language, setLanguage] = useState('en');
  const [headlines, setHeadlines] = useState(defaultHeadlines);
  const [longHeadlines, setLongHeadlines] = useState(defaultLongHeadlines);
  const [descriptions, setDescriptions] = useState(defaultDescriptions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function getFormValue(name: string): string {
    const form = document.querySelector('form[action]') as HTMLFormElement | null;
    if (!form) return '';
    return (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('building_codes', getFormValue('building_codes'));
        fd.set('target_countries', getFormValue('target_countries'));
        fd.set('business_name', getFormValue('business_name'));
        fd.set('final_url', getFormValue('final_url'));
        fd.set('language', language);
        const res = await generatePmaxCopyAction(fd);
        if (res.headlines.length) setHeadlines(res.headlines.join('\n'));
        if (res.longHeadlines.length) setLongHeadlines(res.longHeadlines.join('\n'));
        if (res.descriptions.length) setDescriptions(res.descriptions.join('\n'));
        if (!res.headlines.length && !res.longHeadlines.length && !res.descriptions.length) {
          setError('AI returned empty copy. Try again, or fill in manually.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'generation_failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="ix-card p-3 space-y-2 border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/30">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-600 dark:text-violet-300" />
          <strong className="text-xs">AI copy generator</strong>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">— uses building codes + target countries above to write 5 headlines, 3 long headlines, 3 descriptions</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={language} onChange={e => setLanguage(e.target.value)} className="ix-input text-sm w-32">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="ix-btn-primary text-sm whitespace-nowrap"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {pending ? 'Generating…' : 'Generate copy'}
          </button>
          {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="headlines" className="text-xs font-semibold">Short headlines (3–15, one per line, ≤30 chars each)</label>
        <textarea
          id="headlines"
          name="headlines"
          required
          rows={5}
          value={headlines}
          onChange={e => setHeadlines(e.target.value)}
          className="ix-input font-mono text-xs"
          placeholder={'Beit Hady Apartments\nLuxury Cairo Stays\nBook on WhatsApp'}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="long_headlines" className="text-xs font-semibold">Long headlines (1–5, one per line, ≤90 chars each)</label>
        <textarea
          id="long_headlines"
          name="long_headlines"
          required
          rows={3}
          value={longHeadlines}
          onChange={e => setLongHeadlines(e.target.value)}
          className="ix-input font-mono text-xs"
          placeholder={'Premium serviced apartments in Cairo — direct host, 24/7 concierge'}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="descriptions" className="text-xs font-semibold">Descriptions (2–5, one per line, ≤90 chars each)</label>
        <textarea
          id="descriptions"
          name="descriptions"
          required
          rows={4}
          value={descriptions}
          onChange={e => setDescriptions(e.target.value)}
          className="ix-input font-mono text-xs"
          placeholder={'Premium furnishings, direct host, WhatsApp booking. Message us for live availability.'}
        />
      </div>
    </div>
  );
}
