/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['jspdf', 'jspdf-autotable'],
  },
};

module.exports = nextConfig;
