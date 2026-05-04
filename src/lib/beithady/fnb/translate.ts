import 'server-only';
import { anthropic, HAIKU } from '@/lib/anthropic';

export type FnbField = 'name' | 'description' | 'modifier_name';
export type FnbLang = 'ar' | 'ru' | 'fr';

const LANG_LABEL: Record<FnbLang, string> = {
  ar: 'Modern Standard Arabic (with culinary loanwords kept)',
  ru: 'Russian',
  fr: 'French',
};

const FIELD_LABEL: Record<FnbField, string> = {
  name: 'menu item name',
  description: 'menu item description',
  modifier_name: 'menu item add-on / modifier name',
};

export async function translateMenuField(input: {
  text: string;
  field: FnbField;
  target_lang: FnbLang;
}): Promise<{ translation: string }> {
  const { text, field, target_lang } = input;
  if (!text.trim()) return { translation: '' };

  const prompt = `Translate the following Egyptian-hospitality ${FIELD_LABEL[field]} from English to ${LANG_LABEL[target_lang]}.
Keep it brief, evocative, and respectful of culinary terms (preserve loanwords like "Ful", "Taameya", "Baladi" if they appear).
Return ONLY the translated text, no quotes, no commentary.

English: ${text}`;

  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const txt = (res.content as Array<{ type: string; text?: string }>)
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')
    .trim();

  return { translation: txt };
}
