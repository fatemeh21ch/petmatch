/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  // The browser only ever talks to Next (same origin), so the httpOnly session cookie set by
  // FastAPI works without CORS. Next forwards /api/* to the Python backend.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
