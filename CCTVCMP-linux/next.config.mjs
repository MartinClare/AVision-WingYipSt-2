import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const mdvrOrigin = (process.env.TOWER_CRANE_API_URL || "http://14.21.18.177:88").replace(/\/+$/, "");

const nextConfig = {
  experimental: {
    useWasmBinary: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Proxy MDVR static/player assets so Cmsv6Player can load same-origin.
      { source: "/mdvr-proxy/:path*", destination: `${mdvrOrigin}/:path*` },
      // Decoder wasm is requested from site root by cmsv6player.
      { source: "/libcmsv6decode.wasm", destination: `${mdvrOrigin}/libcmsv6decode.wasm` },
    ];
  },
};

export default withNextIntl(nextConfig);
