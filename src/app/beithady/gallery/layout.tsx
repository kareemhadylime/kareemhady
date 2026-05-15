import type { ReactNode } from 'react';

// GalleryProvider + UploadTray are mounted one level up in
// /beithady/layout.tsx so the upload queue and any in-flight
// compression survive when the operator navigates out of /gallery
// to elsewhere in /beithady. This layout is a passthrough.
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
