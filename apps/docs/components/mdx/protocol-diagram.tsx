"use client";

import { animate, createMotionPath, createTimeline } from "animejs";
import { useEffect, useId, useRef, useState } from "react";

type DiagramVariant = "decision" | "gates" | "topology" | "delta" | "isolation" | "landing";
const colors = {
  accent: "var(--lmp-diagram-accent, #14b8a6)",
  accentSoft: "var(--lmp-diagram-accent-soft, #99f6e4)",
  card: "var(--lmp-diagram-card, #111827)",
  ink: "var(--lmp-diagram-ink, #e5e7eb)",
  muted: "var(--lmp-diagram-muted, #94a3b8)",
  path: "var(--lmp-diagram-path, #64748b)",
  warning: "var(--lmp-diagram-warning, #f59e0b)",
};

function variantFor(chart: string): DiagramVariant {
  if (chart.includes("LMP landing workflow")) return "landing";
  if (chart.includes("Source record") && chart.includes("Policy result")) return "decision";
  if (chart.includes("Gate 1: Rust static evaluation")) return "gates";
  if (chart.includes("Agent host") && chart.includes("lmp-mcp JSON-RPC transport"))
    return "topology";
  if (chart.includes("Agent->>LMPD")) return "delta";
  return "isolation";
}

function SvgNode({
  id,
  label,
  detail,
  x,
  y,
  width = 150,
  height = 62,
  shape = "rect",
}: {
  id: string;
  label: string;
  detail?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  shape?: "rect" | "diamond";
}) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const points = `${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}`;

  return (
    <g className="diagram-node" data-node-id={id} id={`node-${id}`}>
      {shape === "diamond" ? (
        <polygon fill={colors.card} points={points} stroke={colors.accent} strokeWidth="1.5" />
      ) : (
        <rect
          fill={colors.card}
          height={height}
          rx="10"
          stroke={colors.accent}
          strokeWidth="1.5"
          width={width}
          x={x}
          y={y}
        />
      )}
      <text
        fill={colors.ink}
        fontSize="15"
        fontWeight="600"
        textAnchor="middle"
        x={centerX}
        y={centerY - (detail ? 4 : -5)}
      >
        {label}
      </text>
      {detail ? (
        <text fill={colors.muted} fontSize="11" textAnchor="middle" x={centerX} y={centerY + 16}>
          {detail}
        </text>
      ) : null}
    </g>
  );
}

function SvgRoute({
  id,
  d,
  label,
  labelX,
  labelY,
}: {
  id: string;
  d: string;
  label?: string;
  labelX?: number;
  labelY?: number;
}) {
  return (
    <g className="diagram-route" data-route-id={id}>
      <path
        className="diagram-path"
        d={d}
        fill="none"
        id={`route-${id}`}
        markerEnd="url(#diagram-arrow)"
        pathLength="1000"
        stroke={colors.path}
        strokeDasharray="1000"
        strokeDashoffset="1000"
        strokeWidth="1.5"
      />
      {label ? (
        <text
          className="diagram-route-label"
          fill={colors.muted}
          fontSize="11"
          textAnchor="middle"
          x={labelX}
          y={labelY}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function Packet({ id, route }: { id: string; route: string }) {
  return (
    <circle
      className="diagram-packet"
      data-route={route}
      data-packet-id={id}
      fill={colors.accentSoft}
      id={`packet-${id}`}
      r="5"
      stroke={colors.accent}
      strokeWidth="2"
    />
  );
}

function DiagramSvg({ variant, titleId }: { variant: DiagramVariant; titleId: string }) {
  const svgClass = "block h-auto w-full max-w-full";
  if (variant === "landing") {
    return (
      <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1160 220">
        <title id={titleId}>LMP workflow from source record to evidence artifact</title>
        <defs>
          <marker
            id="diagram-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
          </marker>
        </defs>
        <SvgRoute d="M180 110 H225" id="landing-source-compiler" />
        <SvgRoute d="M375 110 H420" id="landing-compiler-package" />
        <SvgRoute d="M570 110 H615" id="landing-package-change" />
        <SvgRoute d="M765 110 H810" id="landing-change-evaluator" />
        <SvgRoute d="M960 110 H1005" id="landing-evaluator-evidence" />
        <SvgNode id="landing-source" label="Source record" detail="provenance" x={30} y={79} />
        <SvgNode
          id="landing-compiler"
          label="Mind compiler"
          detail="rules + guidance"
          x={225}
          y={79}
        />
        <SvgNode id="landing-package" label="Signed package" detail="digest" x={420} y={79} />
        <SvgNode id="landing-change" label="Agent change" detail="selected scope" x={615} y={79} />
        <SvgNode
          id="landing-evaluator"
          label="Rust evaluator"
          detail="finding / state"
          x={810}
          y={79}
        />
        <SvgNode
          id="landing-evidence"
          label="Evidence artifact"
          detail="reproducible record"
          x={1005}
          y={79}
        />
        <Packet id="landing-source-packet" route="landing-source-compiler" />
        <Packet id="landing-evidence-packet" route="landing-evaluator-evidence" />
      </svg>
    );
  }

  if (variant === "decision") {
    return (
      <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1220 300">
        <title id={titleId}>
          LMP policy decision path from source record to evidence or revision
        </title>
        <defs>
          <marker
            id="diagram-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
          </marker>
        </defs>
        <SvgRoute d="M180 150 H225" id="source-compiler" />
        <SvgRoute d="M375 150 H420" id="compiler-package" />
        <SvgRoute d="M570 150 H615" id="package-guidance" />
        <SvgRoute d="M765 150 H810" id="guidance-change" />
        <SvgRoute d="M960 150 H1005" id="change-evaluate" />
        <SvgRoute
          d="M1085 118 V70 H1140"
          id="pass-evidence"
          label="pass"
          labelX={1110}
          labelY={62}
        />
        <SvgRoute
          d="M1085 182 V230 H1140"
          id="revision-agent"
          label="needs revision"
          labelX={1110}
          labelY={246}
        />
        <SvgNode id="source" label="Source record" detail="provenance" x={30} y={119} />
        <SvgNode id="compiler" label="Mind compiler" detail="rules + guidance" x={225} y={119} />
        <SvgNode id="package" label="Signed package" detail="digest" x={420} y={119} />
        <SvgNode id="guidance" label="Agent guidance" detail="selected mind" x={615} y={119} />
        <SvgNode id="change" label="Generated change" detail="scoped files" x={810} y={119} />
        <SvgNode
          id="decision"
          label="Policy result"
          detail="deterministic"
          shape="diamond"
          x={1005}
          y={95}
          width={160}
          height={110}
        />
        <SvgNode
          id="evidence"
          label="Evidence artifact"
          detail="reproducible record"
          x={1140}
          y={29}
          width={150}
        />
        <SvgNode
          id="revision"
          label="Agent revises"
          detail="new evaluation"
          x={1140}
          y={201}
          width={150}
        />
        <Packet id="source-packet" route="source-compiler" />
        <Packet id="policy-packet" route="change-evaluate" />
      </svg>
    );
  }

  if (variant === "gates") {
    return (
      <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1120 270">
        <title id={titleId}>LMP three-gate evaluation loop</title>
        <defs>
          <marker
            id="diagram-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
          </marker>
        </defs>
        <SvgRoute d="M180 135 H235" id="agent-static" />
        <SvgRoute
          d="M415 135 H470"
          id="static-runtime"
          label="required"
          labelX={442}
          labelY={124}
        />
        <SvgRoute d="M650 135 H705" id="runtime-context" />
        <SvgRoute d="M885 135 H940" id="context-agent" />
        <SvgRoute
          d="M1000 104 V55 H95 V104"
          id="revision-loop"
          label="revise"
          labelX={540}
          labelY={46}
        />
        <SvgNode id="agent" label="Agent emits" detail="changed files" x={30} y={104} width={150} />
        <SvgNode
          id="static"
          label="Gate 1"
          detail="Rust static evaluation"
          x={235}
          y={104}
          width={180}
        />
        <SvgNode
          id="runtime"
          label="Gate 2"
          detail="Docker telemetry"
          x={470}
          y={104}
          width={180}
        />
        <SvgNode
          id="context"
          label="Gate 3"
          detail="correction context"
          x={705}
          y={104}
          width={180}
        />
        <SvgNode id="revision" label="Agent revises" detail="new run" x={940} y={104} width={150} />
        <Packet id="gate-packet" route="agent-static" />
        <Packet id="telemetry-packet" route="runtime-context" />
      </svg>
    );
  }

  if (variant === "topology") {
    return (
      <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1180 420">
        <title id={titleId}>LMP runtime topology and authority boundaries</title>
        <defs>
          <marker
            id="diagram-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
          </marker>
        </defs>
        <SvgRoute d="M180 90 H285 V180 H380" id="agent-mcp" />
        <SvgRoute d="M180 270 H285 V210 H380" id="agent-daemon" />
        <SvgRoute d="M535 195 H630" id="surfaces-core" />
        <SvgRoute d="M785 195 H880" id="core-scope" />
        <SvgRoute d="M955 165 V90 H1050" id="scope-ast" />
        <SvgRoute d="M955 225 V300 H1050" id="scope-evidence" />
        <SvgNode
          id="agent"
          label="Agent host"
          detail="delivery surface"
          x={30}
          y={59}
          width={150}
        />
        <SvgNode id="mcp" label="lmp-mcp" detail="JSON-RPC" x={380} y={150} width={155} />
        <SvgNode id="daemon" label="lmpd" detail="workspace watcher" x={30} y={239} width={150} />
        <SvgNode id="core" label="lmp-core" detail="Rust authority" x={630} y={164} width={155} />
        <SvgNode id="scope" label="Scope resolver" detail="Git delta" x={880} y={164} width={150} />
        <SvgNode id="ast" label="AST + policy" detail="deterministic" x={1050} y={59} width={130} />
        <SvgNode
          id="evidence"
          label="Evidence"
          detail="artifact + state"
          x={1050}
          y={269}
          width={130}
        />
        <Packet id="mcp-packet" route="agent-mcp" />
        <Packet id="core-packet" route="surfaces-core" />
      </svg>
    );
  }

  if (variant === "delta") {
    return (
      <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1120 240">
        <title id={titleId}>Changed-file evaluation sequence</title>
        <defs>
          <marker
            id="diagram-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
          </marker>
        </defs>
        <SvgRoute d="M200 120 H245" id="agent-watch" />
        <SvgRoute d="M415 120 H460" id="watch-git" />
        <SvgRoute d="M630 120 H675" id="git-core" />
        <SvgRoute d="M845 120 H890" id="core-rules" />
        <SvgNode id="agent" label="Agent" detail="writes a change" x={30} y={89} width={170} />
        <SvgNode id="watcher" label="lmpd" detail="workspace watcher" x={245} y={89} width={170} />
        <SvgNode id="git" label="Git" detail="changed paths" x={460} y={89} width={170} />
        <SvgNode id="core" label="lmp-core" detail="evaluate scope" x={675} y={89} width={170} />
        <SvgNode id="rules" label="Rules" detail="findings + state" x={890} y={89} width={170} />
        <Packet id="delta-packet" route="agent-watch" />
        <Packet id="result-packet" route="core-rules" />
      </svg>
    );
  }

  return (
    <svg aria-labelledby={titleId} className={svgClass} role="img" viewBox="0 0 1080 350">
      <title id={titleId}>Isolation boundary from selected change to bounded telemetry</title>
      <defs>
        <marker
          id="diagram-arrow"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill={colors.accent} />
        </marker>
      </defs>
      <SvgRoute d="M180 175 H240" id="change-static" />
      <SvgRoute
        d="M420 175 H480"
        id="static-mount"
        label="required runtime evidence"
        labelX={450}
        labelY={163}
      />
      <SvgRoute d="M660 175 H720" id="mount-container" />
      <SvgRoute d="M900 175 H960" id="container-telemetry" />
      <SvgNode
        id="change"
        label="Selected change"
        detail="scoped paths"
        x={30}
        y={144}
        width={150}
      />
      <SvgNode id="static" label="Rust static" detail="policy result" x={240} y={144} width={180} />
      <SvgNode
        id="mount"
        label="Read-only mount"
        detail="selected paths"
        x={480}
        y={144}
        width={180}
      />
      <SvgNode
        id="container"
        label="Docker"
        detail="ephemeral sandbox"
        x={720}
        y={144}
        width={180}
      />
      <SvgNode
        id="telemetry"
        label="Telemetry"
        detail="bounded evidence"
        x={960}
        y={144}
        width={120}
      />
      <Packet id="isolation-packet" route="change-static" />
      <Packet id="docker-packet" route="mount-container" />
    </svg>
  );
}

export function ProtocolDiagram({ chart }: { chart: string }) {
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId().replaceAll(":", "");
  const variant = variantFor(chart);
  const titleId = `diagram-title-${id}`;

  useEffect(() => {
    const selector = expanded
      ? `[data-protocol-diagram="${id}"]`
      : `[data-protocol-diagram="${id}"]`;
    const roots = document.querySelectorAll<HTMLElement>(selector);
    const cleanups = Array.from(roots).map((root) => {
      const routes = root.querySelectorAll<SVGPathElement>(".diagram-path");
      const nodes = root.querySelectorAll<SVGGElement>(".diagram-node");
      const packets = root.querySelectorAll<SVGCircleElement>(".diagram-packet");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (const node of nodes) node.setAttribute("opacity", "1");
        for (const route of routes) route.setAttribute("stroke-dashoffset", "0");
        return () => undefined;
      }
      const timeline = createTimeline({ defaults: { ease: "outQuad" } });

      timeline.add(nodes, {
        opacity: [0, 1],
        scale: [0.96, 1],
        duration: 500,
        delay: (_el, index) => (index ?? 0) * 70,
      });
      timeline.add(
        routes,
        {
          strokeDashoffset: [1000, 0],
          duration: 1200,
          delay: (_el, index) => (index ?? 0) * 90,
        },
        "-=260",
      );

      const packetAnimations = Array.from(packets).map((packet) => {
        const routeId = packet.dataset.route;
        const route = routeId
          ? root.querySelector<SVGPathElement>(`[data-route-id="${routeId}"] .diagram-path`)
          : null;
        if (!route) return null;
        return animate(packet, {
          ...createMotionPath(route),
          duration: 2400,
          ease: "inOutSine",
          loop: true,
          delay: 600,
        });
      });

      return () => {
        timeline.pause();
        for (const animation of packetAnimations) animation?.pause();
      };
    });

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [expanded, id]);

  useEffect(() => {
    if (!expanded) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const diagram = (
    <div className="min-w-0 w-full overflow-hidden" data-protocol-diagram={id}>
      <DiagramSvg titleId={titleId} variant={variant} />
    </div>
  );

  return (
    <>
      <button
        aria-label="Expand diagram"
        className="lmp-diagram group my-6 block min-w-0 w-full cursor-zoom-in overflow-hidden rounded-xl border border-fd-border bg-fd-card p-4 text-left transition hover:border-fd-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        onClick={() => setExpanded(true)}
        type="button"
      >
        {diagram}
        <span className="sr-only">
          Select to expand the diagram. Press Escape to close the expanded view.
        </span>
      </button>
      {expanded ? (
        <dialog
          aria-label="Expanded diagram"
          className="isolate fixed inset-0 z-[9999] m-0 flex h-dvh w-dvw items-center justify-center border-0 bg-black/70 p-4 backdrop-blur-sm"
          open
        >
          <div className="relative h-full max-h-full min-w-0 w-full max-w-none overflow-y-auto overflow-x-hidden rounded-2xl border border-fd-border bg-fd-card p-3 shadow-2xl sm:p-8">
            <button
              aria-label="Close expanded diagram"
              className="sticky left-full top-0 z-10 mb-2 ml-auto flex size-9 items-center justify-center rounded-full border border-fd-border bg-fd-card text-lg text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
              onClick={() => setExpanded(false)}
              ref={closeButtonRef}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
            {diagram}
          </div>
        </dialog>
      ) : null}
    </>
  );
}
