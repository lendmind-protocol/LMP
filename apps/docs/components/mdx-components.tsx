import { ProtocolDiagram } from "@/components/mdx/protocol-diagram";
import {
  BenchmarkDashboard,
  MindVault,
  OnboardingSelector,
  ProtocolPlayground,
} from "@/components/portal/portal-widgets";
import { Badge } from "@/components/ui/badge";
import { Step, Steps } from "fumadocs-ui/components/steps";
import * as Tabs from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMdxComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    Badge,
    ...Tabs,
    Mermaid: ProtocolDiagram,
    BenchmarkDashboard,
    MindVault,
    OnboardingSelector,
    ProtocolPlayground,
    ...components,
  };
}
