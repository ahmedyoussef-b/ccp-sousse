import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    'chromadb',
    '@tensorflow/tfjs-node',
    '@tensorflow/tfjs',
    '@tensorflow-models/mobilenet',
    '@xenova/transformers',
    'better-sqlite3',
    'tesseract.js',
    'pdf-parse',
    '@mapbox/node-pre-gyp',
    'cohere-ai',
    'chokidar',
    'fsevents',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
    ],
  },
  
  // ✅ DÉPLACÉ ICI - hors de experimental
  outputFileTracingExcludes: {
    '*': [
      '**/node_modules/@tensorflow/**',
      '**/node_modules/@xenova/**',
      '**/node_modules/onnxruntime-node/**',
      '**/node_modules/tesseract.js/**',
      '**/node_modules/pdf-parse/**',
      'data/**',
    ],
  },
  
  webpack: (config, { isServer }) => {
    // Ignorer les modules problématiques
    config.resolve.alias = {
      ...config.resolve.alias,
      'cohere-ai': false,
      'chokidar': false,
      'fsevents': false,
      'sharp': require.resolve('./src/lib/utils/sharp-shim.js'),
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        assert: false,
        url: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
        child_process: false,
        fsevents: false,
        chokidar: false,
        sharp: false,
      };
      
      config.externals = {
        ...config.externals,
        '@tensorflow/tfjs-node': 'commonjs @tensorflow/tfjs-node',
        '@mapbox/node-pre-gyp': 'commonjs @mapbox/node-pre-gyp',
      };
    }

    if (isServer) {
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        ({ request }: { request?: string }, callback: Function) => {
          if (request === 'sharp' || request?.startsWith('@img/')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

    return config;
  },
  
  // ✅ experimental simplifié
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;