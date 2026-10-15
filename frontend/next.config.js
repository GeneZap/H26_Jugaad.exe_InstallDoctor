/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = (process.env.INSTALLDOCTOR_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};
module.exports = nextConfig;
