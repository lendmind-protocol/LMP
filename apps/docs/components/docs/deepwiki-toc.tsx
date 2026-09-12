"use client";

import {
  TOC,
  TOCPopover,
  type TOCPopoverProps,
  type TOCProps,
  TOCProvider,
} from "fumadocs-ui/layouts/docs/page/slots/toc";
import type { ReactNode } from "react";

const deepWikiBadge: ReactNode = (
  <a
    className="mb-4 inline-flex"
    href="https://deepwiki.com/lendmind-protocol/LMP"
    rel="noreferrer"
    target="_blank"
  >
    <img alt="Ask DeepWiki about Lending-Mind Protocol" src="https://deepwiki.com/badge.svg" />
  </a>
);

export function DeepWikiToc(props: TOCProps) {
  return <TOC {...props} header={deepWikiBadge} />;
}

export function DeepWikiTocPopover(props: TOCPopoverProps) {
  return <TOCPopover {...props} header={deepWikiBadge} />;
}

export { TOCProvider as DeepWikiTocProvider };
