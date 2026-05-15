import { requireDomainAccess } from '@/lib/auth';
import { GalleryProvider } from './gallery/_components/gallery-provider';
import { UploadTray } from './gallery/_components/upload-tray';

// Phase 12 backlog: enforce domain access at the layout level so
// unauthorized users 404 before any child page renders.
//
// GalleryProvider lives here (not in gallery/layout.tsx) so the upload
// queue + in-flight video compression survive when the operator
// navigates between Beithady pages mid-job (e.g. starts a 90s
// compression in the gallery, then jumps to the calendar to check a
// booking). The tray is also rendered here so it stays visible
// everywhere under /beithady. Compression dies only on hard reload
// or when leaving the /beithady domain entirely.
export default async function BeithadyDomainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDomainAccess('beithady');
  return (
    <GalleryProvider>
      {children}
      <UploadTray />
    </GalleryProvider>
  );
}
