import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(options: { hideNavTitle?: boolean } = {}): BaseLayoutProps {
  return {
    ...(options.hideNavTitle
      ? {}
      : {
          nav: {
            title: "Lending-Mind Protocol",
            url: "/docs",
            transparentMode: "top",
          },
        }),
    links: [
      {
        text: "Guides",
        url: "/docs/guides/installation",
      },
      {
        text: "Reference",
        url: "/docs/reference/cli",
      },
      {
        text: "Mind Vault",
        url: "/docs/reference/mind-vault",
      },
      {
        text: "GitHub",
        url: "https://github.com/lendmind-protocol/LMP",
      },
    ],
  };
}
