import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Lending-Mind Protocol",
    },
    links: [
      {
        text: "GitHub",
        url: "https://github.com/lendmind-protocol/LMP",
      },
    ],
  };
}
