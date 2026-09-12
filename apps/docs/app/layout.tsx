import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./global.css";
import { cn } from "@/lib/utils";
import { Geist } from "next/font/google";
import { sitePath } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://lendmind-protocol.github.io/LMP/"),
  title: {
    default: "Lending-Mind Protocol",
    template: "%s · Lending-Mind Protocol",
  },
  description: "Deterministic code-quality policy for AI-assisted engineering.",
  icons: {
    icon: sitePath("/logo.png"),
    shortcut: sitePath("/logo.png"),
    apple: sitePath("/logo.png"),
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body>
        <RootProvider
          search={{ options: { type: "static" } }}
          theme={{
            attribute: "class",
            defaultTheme: "system",
            disableTransitionOnChange: true,
            enableSystem: true,
            storageKey: "lmp-theme",
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
