import { getMdxComponents } from "@/components/mdx-components";
import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { MDXComponents } from "mdx/types";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type DocsPageData = {
  body: (props: { components: MDXComponents }) => ReactNode;
  toc: Array<{ depth: number; title: string; url: string }>;
  title: string;
  description?: string;
};

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug ?? []) as unknown as { data: DocsPageData } | undefined;
  if (!page) notFound();

  const data = page.data;
  const MDX = data.body;
  return (
    <DocsPage
      toc={data.toc}
      tableOfContent={{ enabled: data.toc.length > 0 }}
      tableOfContentPopover={{ enabled: data.toc.length > 0 }}
    >
      <DocsTitle>{data.title}</DocsTitle>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMdxComponents() as MDXComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug ?? []) as unknown as
    | { data: Pick<DocsPageData, "title" | "description"> }
    | undefined;
  if (!page) return {};
  return { title: page.data.title, description: page.data.description };
}
