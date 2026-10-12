import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.localhost"],
  typescript: {
    ignoreBuildErrors: false,
  },
  // Prevent Node.js-only packages from being bundled into the client bundle
  serverExternalPackages: ["@anthropic-ai/sdk", "openai", "@prisma/client", "prisma"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Stub out Node.js built-in modules that leak into client bundles via SDK imports
      const nodeBuiltins = ["fs", "path", "os", "crypto", "stream", "buffer", "util", "url", "http", "https", "net", "tls", "child_process", "worker_threads", "process", "events", "assert", "string_decoder", "querystring", "zlib", "readline"];
      config.resolve.fallback = { ...config.resolve.fallback };
      config.resolve.alias = { ...config.resolve.alias };
      for (const mod of nodeBuiltins) {
        config.resolve.fallback[mod] = false;
        config.resolve.alias[`node:${mod}`] = false;
      }
    }
    return config;
  },
  async headers() {
    // Uploaded photos and logos are served from the project's Supabase storage. Allow its exact origin as well
    // as *.supabase.co, so a custom storage domain or a local Supabase still shows images.
    const storageOrigin = (() => {
      try {
        return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
      } catch {
        return "";
      }
    })();
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // connect.facebook.net: Meta's SDK for WhatsApp Embedded Signup (/home/inbox/chatbot?tab=whatsapp).
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://*.supabase.co https://checkout.flutterwave.com https://va.vercel-scripts.com https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Theme previews show sample products with Unsplash photos (src/lib/store-templates/demo-photos.ts).
              `img-src 'self' data: blob: https://*.supabase.co https://*.paystack.com https://images.unsplash.com ${storageOrigin}`.trim(),
              "font-src 'self' https://fonts.gstatic.com data:",
              // Video studio previews its reel (blob:) and product videos are stored on Supabase.
              "media-src 'self' blob: https://*.supabase.co",
              // Embedded Signup opens its login/consent frames on www/web.facebook.com.
              "frame-src https://js.paystack.co https://checkout.flutterwave.com https://www.facebook.com https://web.facebook.com",
              "connect-src 'self' https://*.supabase.co https://api.paystack.co https://api.flutterwave.com https://api.resend.com https://api.openai.com https://api.anthropic.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://graph.facebook.com https://www.facebook.com https://web.facebook.com",
              "object-src 'none'",
              // Same as X-Frame-Options DENY, for browsers that only read CSP.
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
