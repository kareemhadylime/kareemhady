// src/lib/beithady/youtube/templates.test.ts
import { describe, it, expect } from 'vitest';
import { YOUTUBE_TEMPLATES, findTemplate } from './templates';

describe('YOUTUBE_TEMPLATES', () => {
  it('exports exactly 8 templates', () => {
    expect(YOUTUBE_TEMPLATES.length).toBe(8);
  });

  it('every template has a unique id', () => {
    const ids = YOUTUBE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every title_template renders under 100 chars when {scene} = "Living room tour"', () => {
    for (const t of YOUTUBE_TEMPLATES) {
      const sample = t.title_template.replace(/\{scene\}/g, 'Living room tour');
      expect(sample.length, `template ${t.id} title too long`).toBeLessThanOrEqual(100);
    }
  });

  it('every description_template contains {booking_url} placeholder', () => {
    for (const t of YOUTUBE_TEMPLATES) {
      expect(t.description_template, `template ${t.id} missing {booking_url}`).toContain('{booking_url}');
    }
  });

  it('every description_template contains {whatsapp_url} placeholder', () => {
    for (const t of YOUTUBE_TEMPLATES) {
      expect(t.description_template, `template ${t.id} missing {whatsapp_url}`).toContain('{whatsapp_url}');
    }
  });

  it('every title_template contains "Beithady"', () => {
    for (const t of YOUTUBE_TEMPLATES) {
      expect(t.title_template, `template ${t.id} missing "Beithady"`).toContain('Beithady');
    }
  });

  it('Shorts templates include "#Shorts" in description_template', () => {
    for (const t of YOUTUBE_TEMPLATES.filter(x => x.applies_to === 'shorts')) {
      expect(t.description_template, `Shorts template ${t.id} missing #Shorts`).toContain('#Shorts');
    }
  });

  it('every variable.name is referenced in title_template OR description_template', () => {
    for (const t of YOUTUBE_TEMPLATES) {
      for (const v of t.variables) {
        const inTitle = t.title_template.includes(`{${v.name}}`);
        const inDesc = t.description_template.includes(`{${v.name}}`);
        expect(inTitle || inDesc, `template ${t.id} variable ${v.name} not referenced`).toBe(true);
      }
    }
  });
});

describe('findTemplate', () => {
  it('returns the matching template by id', () => {
    const t = findTemplate('bh26-shorts-tour');
    expect(t).toBeDefined();
    expect(t!.id).toBe('bh26-shorts-tour');
  });

  it('returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined();
  });
});
