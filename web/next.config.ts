import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // When served by FastAPI, the base path is root
  trailingSlash: true,
};

export default nextConfig;
