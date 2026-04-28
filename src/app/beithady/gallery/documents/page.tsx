import Link from 'next/link';
import { FileText, ChevronLeft } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset } from '@/lib/beithady/gallery/gallery-list';
import { signedUrlFor, type GalleryBucket } from '@/lib/beithady/gallery/storage';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { Uploader } from '../_components/uploader';
import { AssetDetailModal } from '../_components/asset-detail-modal';
import { fmtCairoDate } from '@/lib/fmt-date';
import { fmtBytes } from '@/lib/beithady/gallery/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; building?: string }>;
}) {
  // Documents are role-gated to managers + admins (Plan v0.3 §C.5).
  await requireBeithadyPermission('gallery', 'full');
  const sp = await searchParams;

  const list = await listAssets({
    filter: { category: 'document', building: sp.building },
    page: 1,
    pageSize: 100,
  });
  const asset = sp.asset ? await getAsset(sp.asset) : null;

  // Mint signed URLs for each row (documents are private)
  const urls = await Promise.all(
    list.rows.map(a => signedUrlFor(a.storage_bucket as GalleryBucket, a.storage_path))
  );

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: 'Documents' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · Documents"
        title="Documents"
        subtitle="Floor plans, house rules, owner contracts, property licenses, insurance docs. Role-gated: manager + admin only."
        right={
          <Link href="/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All gallery
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref="/beithady/gallery/documents" />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <FileText size={14} className="text-slate-500" />
          Upload document
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Building tag stamped from the URL <code>?building=BH-26</code> if present, else "common". 100MB cap.
        </p>
        <Uploader category="document" building={sp.building || null} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-semibold">Filter by building:</span>
          <Link href="/beithady/gallery/documents" className={`px-2 py-0.5 rounded ${!sp.building ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'}`}>All</Link>
          {(['BH-26','BH-73','BH-435','BH-OK','BH-34'] as const).map(b => (
            <Link
              key={b}
              href={`/beithady/gallery/documents?building=${b}`}
              className={`px-2 py-0.5 rounded ${sp.building === b ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'}`}
            >
              {b}
            </Link>
          ))}
        </div>

        {list.rows.length === 0 ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            <FileText size={20} className="mx-auto text-slate-300 mb-2" />
            No documents yet. Drop floor plans, contracts, or policies above.
          </div>
        ) : (
          <div className="ix-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-4">File</th>
                  <th className="py-2 px-4">Building</th>
                  <th className="py-2 px-4">Size</th>
                  <th className="py-2 px-4">Uploaded</th>
                  <th className="py-2 px-4 w-[180px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((a, i) => (
                  <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-stone-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-4">
                      <FileText size={12} className="inline mr-1 text-slate-400" />
                      <span className="truncate">{a.file_name || '(unnamed)'}</span>
                    </td>
                    <td className="py-2 px-4 text-xs">{a.building_code || 'common'}</td>
                    <td className="py-2 px-4 text-xs tabular-nums">{fmtBytes(a.size_bytes || 0)}</td>
                    <td className="py-2 px-4 text-xs text-slate-500">{fmtCairoDate(a.created_at)}</td>
                    <td className="py-2 px-4 text-xs space-x-2">
                      {urls[i] && (
                        <a href={urls[i]!} target="_blank" rel="noopener noreferrer" className="ix-link">Open</a>
                      )}
                      <Link href={`/beithady/gallery/documents?asset=${a.id}${sp.building ? `&building=${sp.building}` : ''}`} className="ix-link">Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </BeithadyShell>
  );
}
