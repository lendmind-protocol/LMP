import { baseOptions } from "@/app/layout.config";
import { source } from "@/lib/source";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      sidebar={{
        banner: (
          <Callout type="idea" title="Evidence first">
            Trace each rule to its source and each result to a test.
          </Callout>
        ),
      }}
      tree={source.getPageTree()}
    >
      {children}
    </DocsLayout>
  );
}
