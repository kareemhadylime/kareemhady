// src/lib/beithady/youtube/templates.ts

export type YouTubeTemplate = {
  id: string;
  label: string;
  applies_to: 'shorts' | 'long-form' | 'both';
  building_code: 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'BH-34' | null;
  title_template: string;
  description_template: string;
  default_tags: string[];
  default_privacy: 'private' | 'unlisted' | 'public';
  default_language: 'en' | 'ar';
  default_category_id: number;
  variables: Array<{
    name: string;
    prompt_for_ai: string;
    max_length?: number;
  }>;
};

const SHORTS_DESC = (intro: string) =>
  `#Shorts\n\n${intro}\n\nBook direct → {booking_url}\n\n#BeitHady #Cairo #ShortTermRental`;

const LONGFORM_DESC = (intro: string) =>
  `${intro}\n\nBook direct → {booking_url}\n\n#BeitHady #Cairo #LuxuryStay`;

export const YOUTUBE_TEMPLATES: YouTubeTemplate[] = [
  {
    id: 'bh26-shorts-tour',
    label: 'BH-26 · Shorts tour',
    applies_to: 'shorts',
    building_code: 'BH-26',
    title_template: 'BH-26 Cairo · {scene}',
    description_template: SHORTS_DESC('A quick look inside one of our most-booked apartments at 26 Cleopatra, Cairo.'),
    default_tags: ['beithady', 'cairo', 'shortterm rental', 'cleopatra'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [{ name: 'scene', prompt_for_ai: 'Describe the room/area shown in 4 words max.', max_length: 50 }],
  },
  {
    id: 'bh73-shorts-tour',
    label: 'BH-73 · Shorts tour',
    applies_to: 'shorts',
    building_code: 'BH-73',
    title_template: 'BH-73 Cairo · {scene}',
    description_template: SHORTS_DESC('Step inside our serviced apartment at 73 Cleopatra, Cairo.'),
    default_tags: ['beithady', 'cairo', 'shortterm rental', 'cleopatra'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [{ name: 'scene', prompt_for_ai: 'Describe the room/area shown in 4 words max.', max_length: 50 }],
  },
  {
    id: 'bh435-shorts-tour',
    label: 'BH-435 · A1 Shorts tour',
    applies_to: 'shorts',
    building_code: 'BH-435',
    title_template: 'BH-435 A1 · {scene}',
    description_template: SHORTS_DESC('A peek at our A1 Hospitality building, Cairo.'),
    default_tags: ['beithady', 'a1hospitality', 'cairo', 'shortterm rental'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [{ name: 'scene', prompt_for_ai: 'Describe the room/area shown in 4 words max.', max_length: 50 }],
  },
  {
    id: 'bhok-shorts-tour',
    label: 'BH-OK · OKAT Shorts tour',
    applies_to: 'shorts',
    building_code: 'BH-OK',
    title_template: 'OKAT Cairo · {scene}',
    description_template: SHORTS_DESC('A look inside our OKAT building, Cairo.'),
    default_tags: ['beithady', 'okat', 'cairo', 'shortterm rental'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [{ name: 'scene', prompt_for_ai: 'Describe the room/area shown in 4 words max.', max_length: 50 }],
  },
  {
    id: 'bh34-shorts-tour',
    label: 'BH-34 · Shorts tour',
    applies_to: 'shorts',
    building_code: 'BH-34',
    title_template: 'BH-34 Cairo · {scene}',
    description_template: SHORTS_DESC('Inside our apartment at 34 Cleopatra, Cairo.'),
    default_tags: ['beithady', 'cairo', 'shortterm rental', 'cleopatra'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [{ name: 'scene', prompt_for_ai: 'Describe the room/area shown in 4 words max.', max_length: 50 }],
  },
  {
    id: 'bh26-longform-tour',
    label: 'BH-26 · Long-form property tour',
    applies_to: 'long-form',
    building_code: 'BH-26',
    title_template: 'Full tour: BH-26 Cleopatra Cairo · {feature}',
    description_template: LONGFORM_DESC(
      'Welcome to BH-26 — one of our most-booked serviced apartments at 26 Cleopatra Street, Cairo. {body}\n\nWhat you will see: {feature}.'
    ),
    default_tags: ['beithady', 'cairo', 'shortterm rental', 'cleopatra', 'apartmenttour', 'walkthrough'],
    default_privacy: 'unlisted',
    default_language: 'en',
    default_category_id: 19,
    variables: [
      { name: 'feature', prompt_for_ai: 'One-line summary of the standout amenity or view shown.', max_length: 60 },
      { name: 'body',    prompt_for_ai: 'A 2-3 sentence description of what is shown in the tour.', max_length: 400 },
    ],
  },
  {
    id: 'area-guide-cairo',
    label: 'Area guide · Cairo (generic, no building)',
    applies_to: 'long-form',
    building_code: null,
    title_template: 'Cairo guide · {area}',
    description_template: LONGFORM_DESC(
      'A short Cairo guide from the Beit Hady team. {body}\n\nFeatured: {area}.'
    ),
    default_tags: ['beithady', 'cairo', 'travelguide', 'cairoguide', 'egypt'],
    default_privacy: 'public',
    default_language: 'en',
    default_category_id: 19,
    variables: [
      { name: 'area', prompt_for_ai: 'The Cairo neighborhood / landmark featured (e.g. "Khan el-Khalili").', max_length: 50 },
      { name: 'body', prompt_for_ai: 'A 2-3 sentence description of the area shown.',                  max_length: 400 },
    ],
  },
  {
    id: 'internal-staff-intro',
    label: 'Internal · Staff intro (default private)',
    applies_to: 'long-form',
    building_code: null,
    title_template: 'Beit Hady team · {role}',
    description_template: 'Internal team intro. {body}\n\nMeet: {role}.\n\nMore at {booking_url}',
    default_tags: ['beithady', 'team'],
    default_privacy: 'private',
    default_language: 'en',
    default_category_id: 19,
    variables: [
      { name: 'role', prompt_for_ai: 'The role/position of the person shown.', max_length: 40 },
      { name: 'body', prompt_for_ai: 'A 1-2 sentence intro for this team member.', max_length: 200 },
    ],
  },
];

export function findTemplate(id: string): YouTubeTemplate | undefined {
  return YOUTUBE_TEMPLATES.find(t => t.id === id);
}
