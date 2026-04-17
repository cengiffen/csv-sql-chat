import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.html$/i,
      type: "asset/source",
    });

    if (isServer) {
      const externalModules = [
        "duckdb",
        "@mapbox/node-pre-gyp",
        "node-gyp",
        "nock",
        "mock-aws-s3",
        "aws-sdk",
      ];

      const externalHandler = ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
        if (request && externalModules.includes(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      };

      if (Array.isArray(config.externals)) {
        config.externals.push(externalHandler);
      } else if (typeof config.externals === "function") {
        config.externals = [config.externals, externalHandler];
      } else {
        config.externals = [externalHandler];
      }
    }

    return config;
  },
};

export default nextConfig;
