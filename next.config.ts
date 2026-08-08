import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@remotion/renderer'],
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          path: false,
        },
      }
    }
    return config
  },
}

export default nextConfig
