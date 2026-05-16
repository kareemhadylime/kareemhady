import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Most image uploads now go direct-to-Supabase via signed URLs (the
  // boat photo path), which bypasses Vercel's function payload limit.
  // The receipt-upload server action (broker payments) and the
  // Beit Hady gallery uploader still go through a Server Action;
  // allow up to 15MB for those single-file paths (covers iPhone HEIC
  // burst photos which often land in the 8-14 MB range).
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  // Allow next/image to optimize Supabase Storage assets (gallery photos,
  // building heroes on /stay/[code] SEO landing pages).
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bpjproljatbrbmszwbov.supabase.co',
        pathname: '/storage/v1/object/**',
      },
      // Shopify product images for KIKA. cdn.shopify.com is the Shopify-wide
      // image CDN; cdn.shopifycdn.net is the alt host that some store regions
      // get served through.
      { protocol: 'https', hostname: 'cdn.shopify.com', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.shopifycdn.net', pathname: '/**' },
    ],
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
      // Singular /beithady/financial → plural /beithady/financials (cockpit).
      {
        source: '/beithady/financial',
        destination: '/beithady/financials',
        permanent: true,
      },
      {
        source: '/beithady/financial/:path*',
        destination: '/beithady/financials/:path*',
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
