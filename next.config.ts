import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Most image uploads now go direct-to-Supabase via signed URLs (the
  // boat photo path), which bypasses Vercel's function payload limit.
  // The receipt-upload server action (broker payments) still goes through
  // a Server Action; allow up to 12MB for that single-file path.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  // Backward-compat redirects after pulling Beit Hady out of the
  // /emails/* legacy hierarchy. Old bookmarks or hardcoded links to
  // /emails/beithady/* land on the new /beithady/* tree without a 404.
  async redirects() {
    return [
      {
        source: '/emails/beithady',
        destination: '/beithady',
        permanent: true,
      },
      {
        source: '/emails/beithady/:path*',
        destination: '/beithady/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Service worker must always be revalidated so updates roll out
        // immediately. Allowing whole-app scope via Service-Worker-Allowed.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;
