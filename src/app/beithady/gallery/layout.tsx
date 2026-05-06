import type { ReactNode } from 'react';
import { GalleryProvider } from './_components/gallery-provider';
import { UploadTray } from './_components/upload-tray';

// This layout wraps every /beithady/gallery/** route.
// GalleryProvider holds the upload queue + selection state, so it
// survives intra-gallery navigation (between buildings, units,
// general-area). It tears down only when the user leaves the
// /beithady/gallery section entirely.
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return (
    <GalleryProvider>
      {children}
      <UploadTray />
    </GalleryProvider>
  );
}
