"use client";

type AgentVendor = { name: string; slug: string };

const vendors: AgentVendor[] = [
  { name: "Claude Code", slug: "claudecode" },
  { name: "Cursor", slug: "cursor" },
  { name: "GitHub Copilot", slug: "githubcopilot" },
  { name: "Gemini CLI", slug: "googlegemini" },
  { name: "Cline", slug: "cline" },
  { name: "Windsurf", slug: "windsurf" },
];
function VendorItem({ vendor }: { vendor: AgentVendor }) {
  return (
    <div className="lmp-vendor-label flex min-w-0 shrink-0 items-center gap-3 bg-transparent px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em]">
      <img
        src={`https://cdn.simpleicons.org/${vendor.slug}`}
        alt={`${vendor.name} logo`}
        className="size-4 object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
      <span className="min-w-0 break-words">{vendor.name}</span>
    </div>
  );
}

export function AgentVendorCarousel() {
  return (
    <div
      aria-label="Supported AI agent integrations"
      aria-roledescription="carousel"
      className="min-w-0 pt-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="lmp-vendor-caption shrink-0 font-mono text-[9px] uppercase tracking-[0.16em]">
          Supported agents
        </span>
        <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--lmp-ink)]/40">
          local MCP clients
        </span>
      </div>
      <div className="lmp-carousel-viewport mt-3 min-w-0 overflow-hidden">
        <div className="lmp-carousel-track flex w-max gap-2" aria-hidden="true">
          {vendors.map((vendor) => (
            <VendorItem key={vendor.name} vendor={vendor} />
          ))}
          {vendors.map((vendor) => (
            <VendorItem key={`${vendor.name}-repeat`} vendor={vendor} />
          ))}
        </div>
      </div>
      <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--lmp-ink)]/45">
        Local-first Policy Runtime
      </div>
    </div>
  );
}
