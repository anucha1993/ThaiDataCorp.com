import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // อัปโหลดเอกสารยืนยันบริษัท / โลโก้ / รูปข่าว ผ่าน Server Action (ค่าเริ่มต้น 1MB)
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
