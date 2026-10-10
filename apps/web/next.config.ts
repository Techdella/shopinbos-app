import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@shopinbos/api-client',
    '@shopinbos/config',
    '@shopinbos/integrations',
    '@shopinbos/tokens',
    '@shopinbos/ui-web',
    '@shopinbos/validation',
  ],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
};

export default config;
