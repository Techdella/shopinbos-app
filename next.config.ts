import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.localhost"],
  typescript: {
    // Types are checked by `npm run typecheck`, which `npm run build` runs before next build: type errors still fail
    // every build. Next's own check ran in the same build as webpack and pushed Vercel's 8 GB machine out of memory
    // (SIGKILL at "Running TypeScript"); tsc on its own peaks around 1.3 GB.
    ignoreBuildErrors: true,
  },
  experimental: {
    // Lower peak memory while compiling (Vercel's build machines have 8 GB).
    webpackMemoryOptimizations: true,
  },
  // Prevent Node.js-only packages from being bundled into the client bundle
  serverExternalPackages: ["@anthropic-ai/sdk", "openai", "@prisma/client", "prisma"],
  webpack: (config, { isServer, dev }) => {
    // On Vercel, compile without webpack's on-disk cache: the restored cache keeps growing between deploys
    // (1.5 GB+ after one build) and loading it ran the 8 GB build machine out of memory. A clean compile
    // takes about 3 minutes.
    if (!dev && process.env.VERCEL && config.cache) {
      config.cache = Object.freeze({ type: "memory" as const });
    }
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // connect.facebook.net: Meta's SDK for WhatsApp Embedded Signup (/home/inbox/chatbot?tab=whatsapp), and
              // the Meta Pixel on live stores. The sellers' own tags (Settings › Connections, loaded only after the
              // shopper agrees on the cookie banner): Google tag / Tag Manager and the TikTok Pixel.
              // Call Peggy (ElevenLabs, src/components/peggy/PeggyCall.tsx) loads its audio worklets from blob:/data: URLs and,
              // where the mic's sample rate needs converting, one pinned resampler worklet from jsDelivr.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js@2.1.2/ https://js.paystack.co https://checkout.paystack.com https://*.supabase.co https://va.vercel-scripts.com https://www.googletagmanager.com https://analytics.tiktok.com https://connect.facebook.net https://*.posthog.com https://cdn.mxpnl.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Theme previews show sample products with Unsplash photos (src/lib/store-templates/demo-photos.ts).
              // The store tags' tracking pixels: Google Analytics, Meta (www.facebook.com/tr) and TikTok.
              `img-src 'self' data: blob: https://*.supabase.co https://*.paystack.com https://images.unsplash.com https://i.ytimg.com https://i.vimeocdn.com https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com https://analytics.tiktok.com ${storageOrigin}`.trim(),
              "font-src 'self' https://fonts.gstatic.com data:",
              // Video studio previews its reel (blob:) and product videos are stored on Supabase; so are help videos.
              `media-src 'self' blob: https://*.supabase.co ${storageOrigin}`.trim(),
              // Embedded Signup opens its login/consent frames on www/web.facebook.com.
              // Help videos pasted as YouTube or Vimeo links play in their embeds (shared/help-videos.ts).
              // Paystack's popup moves to other paystack.com pages for some ways to pay (OPay, bank apps), in the same frame.
              "frame-src https://js.paystack.co https://checkout.paystack.com https://standard.paystack.co https://paystack.com https://*.paystack.com https://*.paystack.co https://checkout.korapay.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.googletagmanager.com https://www.facebook.com https://web.facebook.com",
              // Admin help-video uploads go straight to Storage with a signed URL (storageOrigin covers a custom/local one).
              // Store tags send their hits to Google Analytics / Tag Manager and TikTok (Meta's go to www.facebook.com).
              // Call Peggy talks to ElevenLabs over a WebSocket (or WebRTC through their LiveKit servers).
              "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://analytics.tiktok.com https://*.supabase.co https://api.paystack.co https://api.resend.com https://api.openai.com https://api.anthropic.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://graph.facebook.com https://www.facebook.com https://web.facebook.com https://*.posthog.com https://api-js.mixpanel.com https://api-eu.mixpanel.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://api.elevenlabs.io wss://api.elevenlabs.io https://livekit.rtc.elevenlabs.io wss://livekit.rtc.elevenlabs.io" + (storageOrigin ? ` ${storageOrigin}` : ""),
              // Sentry session replay compresses in a blob: worker.
              "worker-src 'self' blob:",
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
