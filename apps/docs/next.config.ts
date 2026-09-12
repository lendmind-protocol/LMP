import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const staticExport = process.env.LMP_STATIC_EXPORT === "true";
const basePath = process.env.LMP_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["fumadocs-ui"],
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath ? `${basePath}/` : undefined,
      }
    : {}),
};

export default withMDX(config);
