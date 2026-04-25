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
