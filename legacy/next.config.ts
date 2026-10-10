import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.localhost"],
  typescript: {
    ignoreBuildErrors: true,
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://*.supabase.co https://checkout.flutterwave.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.supabase.co https://*.paystack.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "frame-src https://js.paystack.co https://checkout.flutterwave.com",
              "connect-src 'self' https://*.supabase.co https://api.paystack.co https://api.flutterwave.com https://api.resend.com https://api.openai.com https://api.anthropic.com https://vitals.vercel-insights.com https://va.vercel-scripts.com",
              "object-src 'none'",
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
    ],
  },
};

export default nextConfig;
