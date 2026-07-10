import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Provider tariff files go through the uploadAndParse Server Action as a
    // raw File; the 1MB default rejects real files with a 413 and leaves the
    // upload form stuck in "Procesando archivo…" (same failure the resolution
    // PDFs hit before moving to client blob uploads).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
