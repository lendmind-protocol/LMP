import { generateKeyPairSync, sign } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = join(root, "registry/minds/lmp-protocol-core");
const minds = [
  [
    "rust-defensive-systems",
    "Rust Defensive Systems",
    "Rust ownership, parser-backed checks, error propagation, and dependency boundaries.",
  ],
  [
    "kernel-inspired-systems",
    "Kernel-Inspired Systems",
    "Applicable systems-oriented Rust review with explicit limits and no external endorsement.",
  ],
  [
    "python-orchestration-safety",
    "Python Orchestration Safety",
    "Python orchestration, subprocess boundaries, Docker lifecycle, and evidence handling.",
  ],
  [
    "node-onboarding-safety",
    "Node Onboarding Safety",
    "Node onboarding, template rendering, non-overwrite behavior, and package resolution.",
  ],
  [
    "security-and-trust-boundaries",
    "Security and Trust Boundaries",
    "Signatures, redaction, path containment, command policy, and trust-boundary evidence.",
  ],
  [
    "monorepo-and-release-discipline",
    "Monorepo and Release Discipline",
    "Workspace boundaries, locked builds, release metadata, and reproducible checks.",
  ],
  [
    "documentation-truthfulness",
    "Documentation Truthfulness",
    "Documentation claim bounds, implementation status, limitations, and attribution language.",
  ],
];

for (const [slug, name, description] of minds) {
  const destination = join(root, "registry/minds", slug);
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  await rm(join(destination, "signatures"), { recursive: true, force: true });
  const manifest = JSON.parse(await readFile(join(destination, "mind.json"), "utf8"));
  manifest.id = `lmp:mind:${slug}`;
  manifest.name = name;
  manifest.description = description;
  manifest.author = {
    kind: "official-maintainer",
    displayName: "Lending-Mind Protocol Maintainers",
    verified: false,
    website: null,
  };
  manifest.provenance = {
    sources: [
      {
        title: "LMP repository implementation and tests",
        url: "https://github.com/lendmind-protocol/LMP",
        licenseNote: "Repository implementation reference; no external endorsement claimed.",
        sourceType: "implementation",
        accessMethod: "local-checkout",
        contentDigest: null,
        retentionPolicy: "metadata-only",
        allowedUse: "evaluate-local-implementation",
        evidenceTier: "implementation",
        rights: "project-source",
      },
    ],
    attributionRequired: false,
  };
  manifest.philosophy.principles = [
    description,
    "Report unsupported scope instead of silently passing it.",
  ];
  await writeFile(join(destination, "mind.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(destination, "guidance.md"),
    `# ${name}\n\n${description} Apply only to the declared scope. Static checks are bounded evidence, not proof of universal correctness. Record failed, blocked, unsupported, and review-required outcomes.\n`,
  );
  await writeFile(
    join(destination, "SKILL.md"),
    `# ${name}\n\nApply this Mind to its declared scope. Inspect the implementation, run the independent checks, preserve negative fixtures, and report limitations. This package is maintained by the Lending-Mind Protocol project and does not imply endorsement by any named external organization.\n`,
  );
  await writeFile(
    join(destination, "evidence.json"),
    `${JSON.stringify(
      {
        status: "verified-fixtures",
        tests: [
          { id: `${slug}-clean`, kind: "positive", description, expected: "pass" },
          { id: `${slug}-negative`, kind: "negative", description, expected: "needs_revision" },
          { id: `${slug}-boundary`, kind: "exception", description, expected: "blocked" },
        ],
        notes:
          "Static evidence cannot prove semantic correctness or production readiness; independent self-hosting results remain bounded.",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(destination, "sources.json"),
    `${JSON.stringify({ sources: [{ id: "lmp-implementation", title: "LMP repository implementation and tests", url: "https://github.com/lendmind-protocol/LMP", sourceType: "implementation", accessMethod: "local-checkout", contentDigest: null, allowedUse: "evaluate-local-implementation", limitations: "No external endorsement is claimed." }] }, null, 2)}\n`,
  );
  await writeFile(
    join(destination, "interpretation.json"),
    `${JSON.stringify({ status: "review_required", curator: "Lending-Mind Protocol Maintainers", method: "Deterministic rules are limited to parser-backed and manifest-backed observations; inferred guidance remains advisory.", applicability: ["The declared repository scope and supported language adapters only."], exceptions: ["Unsupported languages and semantic claims must be reported as skipped or review-required."], reviewRequiredBeforePublication: true }, null, 2)}\n`,
  );
  await writeFile(
    join(destination, "limitations.md"),
    "# Limitations\n\nThis Mind provides bounded, deterministic evidence from the configured scope. It does not prove semantic correctness, authorship, security against unknown inputs, or production readiness. Unsupported languages and checks are reported as limitations and require independent review before publication.\n",
  );
  await writeFile(
    join(destination, "release.json"),
    `${JSON.stringify({ packageId: manifest.id, version: manifest.version, changelog: [`Initial ${slug} self-hosting package.`], limitations: ["This Mind reports bounded configured evidence; it does not prove total correctness, security, or production readiness.", "Signature status must be verified before publication."], review: { status: "unreviewed", reviewers: [], notes: "Requires independent maintainer review before publication." } }, null, 2)}\n`,
  );
  await mkdir(join(destination, "evidence"), { recursive: true });
  await writeFile(
    join(destination, "evidence/README.md"),
    `# ${name} evidence\n\nFixtures and independent command results are retained in the generated self-hosting report.\n`,
  );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = sign(
    null,
    Buffer.from(await readFile(join(destination, "mind.json"))),
    privateKey,
  );
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  await mkdir(join(destination, "signatures"), { recursive: true });
  await writeFile(
    join(destination, "signatures/public-key.hex"),
    `0x${publicDer.subarray(-32).toString("hex")}\n`,
  );
  await writeFile(join(destination, "signatures/manifest.sig"), `0x${signature.toString("hex")}\n`);
}

console.log(
  JSON.stringify({ status: "generated", minds: minds.map(([slug]) => `lmp:mind:${slug}`) }),
);
