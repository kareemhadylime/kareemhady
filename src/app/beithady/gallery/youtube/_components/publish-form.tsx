// src/app/beithady/gallery/youtube/_components/publish-form.tsx
'use client';
import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { VideoSourcePicker, type GalleryAssetOption } from './video-source-picker';
import { AIAssistButton, type AIGenerated } from './ai-assist-button';

type Template = {
  id: string;
  label: string;
  applies_to: 'shorts' | 'long-form' | 'both';
  building_code: string | null;
  default_privacy: 'private' | 'unlisted' | 'public';
  default_language: string;
};

export function PublishForm({
  accountId,
  templates,
  galleryOptions,
  initialAssetId,
  generateAction,
  publishAction,
}: {
  accountId: number;
  templates: Template[];
  galleryOptions: GalleryAssetOption[];
  initialAssetId?: string | null;
  generateAction: (input: {
    template_id: string;
    building_code: string | null;
    is_shorts: boolean;
    user_brief: string;
    midpoint_frame_dataurl: string;
  }) => Promise<AIGenerated | { error: string; cost_usd?: number }>;
  publishAction: (fd: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const initialAsset = initialAssetId ? galleryOptions.find(o => o.id === initialAssetId) ?? null : null;
  const [pickedAsset, setPickedAsset] = useState<GalleryAssetOption | null>(initialAsset);
  const [templateId, setTemplateId] = useState<string>('');
  const [brief, setBrief] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('unlisted');
  const [aiGenerated, setAiGenerated] = useState<boolean>(false);
  const [aiCost, setAiCost] = useState<number>(0);

  const tmpl = templates.find(t => t.id === templateId);
  const isShorts = tmpl?.applies_to === 'shorts';
  const buildingCode = tmpl?.building_code ?? pickedAsset?.building_code ?? null;
  const videoSource: string | null = pickedAsset?.signed_url ?? null;
  const hasSource = !!videoSource;

  const onGenerated = (m: AIGenerated & { cost_usd?: number }) => {
    setTitle(m.title);
    setDescription(m.description);
    setTags(m.tags.join(', '));
    setLanguage(m.language);
    setAiGenerated(true);
    if ('cost_usd' in m && typeof m.cost_usd === 'number') setAiCost(m.cost_usd);
  };

  return (
    <form
      action={(fd) => start(() => publishAction(fd))}
      className="space-y-4"
    >
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="ai_generated" value={aiGenerated ? '1' : '0'} />
      {aiCost > 0 && <input type="hidden" name="ai_cost_usd" value={aiCost} />}
      <input type="hidden" name="is_shorts" value={isShorts ? '1' : '0'} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="building_code" value={buildingCode ?? ''} />
      <input type="hidden" name="source_url" value={pickedAsset?.signed_url ?? ''} />
      <input type="hidden" name="file_size_bytes" value={pickedAsset?.size_bytes ?? 0} />
      <input type="hidden" name="duration_seconds" value={pickedAsset?.duration_sec ?? ''} />
      <input type="hidden" name="asset_id" value={pickedAsset?.id ?? ''} />

      <section className="space-y-2">
        <label className="text-xs font-semibold">Video source</label>
        <VideoSourcePicker
          galleryOptions={galleryOptions}
          selectedId={pickedAsset?.id ?? null}
          onSelect={(a) => setPickedAsset(a)}
        />
      </section>

      <section className="space-y-2">
        <label className="text-xs font-semibold">Template</label>
        <select className="ix-input" value={templateId} onChange={e => {
          setTemplateId(e.target.value);
          const t = templates.find(x => x.id === e.target.value);
          if (t) setPrivacy(t.default_privacy);
        }}>
          <option value="" disabled>Choose a template…</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </section>

      <section className="space-y-2">
        <label className="text-xs font-semibold">Optional brief</label>
        <input className="ix-input" placeholder="What makes this video special?" value={brief}
               onChange={e => setBrief(e.target.value)} />
      </section>

      <AIAssistButton
        videoSource={videoSource}
        templateId={templateId}
        buildingCode={buildingCode}
        isShorts={isShorts}
        userBrief={brief}
        onGenerated={onGenerated}
        generateAction={generateAction}
      />

      <section className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold">Title (≤100 chars)</label>
          <input name="title" required maxLength={100} className="ix-input" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">Description (≤5000 chars)</label>
          <textarea name="description" rows={6} maxLength={5000} className="ix-input" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">Tags (comma-separated)</label>
          <input name="tags" className="ix-input" value={tags} onChange={e => setTags(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Language</label>
            <select name="language" className="ix-input" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Privacy</label>
            <select name="privacy_status" className="ix-input" value={privacy} onChange={e => setPrivacy(e.target.value as 'private' | 'unlisted' | 'public')}>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={pending || !hasSource || !title || !templateId} className="ix-btn-primary disabled:opacity-50">
          <Upload size={14} /> {pending ? 'Publishing…' : 'Publish to YouTube'}
        </button>
      </div>
    </form>
  );
}
