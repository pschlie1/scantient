import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/generated/prisma/**/*"],
    "/dashboard": ["./src/generated/prisma/**/*"],
    "/apps/**/*": ["./src/generated/prisma/**/*"],
    "/reports": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
