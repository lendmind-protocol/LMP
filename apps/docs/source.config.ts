// The generated collection type references the workspace's nested Zod path;
// Fumadocs consumes this config at build time, so it is intentionally excluded
// from portable application declarations.
// @ts-nocheck
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs: ReturnType<typeof defineDocs> = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
