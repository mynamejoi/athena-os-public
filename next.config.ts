import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  allowedDevOrigins: ['http://100.105.103.19:3001'],
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AUTH_PASSPHRASE_HASH: process.env.AUTH_PASSPHRASE_HASH,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
  },
};

export default nextConfig;
