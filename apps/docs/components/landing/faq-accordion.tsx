"use client";

import { ChevronDown } from "lucide-react";
import { sitePath } from "@/lib/site";
import type { ReactNode } from "react";
import { useState } from "react";

function Highlight({ children }: { children: ReactNode }) {
  return <span className="text-black">{children}</span>;
}

function Citation({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:text-white"
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

const faqs = [
  {
    question: "Is LMP just a more elaborate skills.sh wrapper?",
    answer: (
      <>
        No. A script that pastes instructions into an agent context is a{" "}
        <Highlight>passive delivery mechanism</Highlight>; it can be useful, but it cannot prove
        that the instructions were followed. LMP packages guidance with declared rules, evaluates
        the selected change, and records the result and its evidence. That is a{" "}
        <Highlight>control-and-evidence loop</Highlight>, not a claim that text injection alone
        creates enforcement.{" "}
        <Citation href={sitePath("/docs/concepts/overview")}>See the protocol boundaries</Citation>.
      </>
    ),
  },
  {
    question: "What happens when the agent ignores the rules under pressure?",
    answer: (
      <>
        That is the failure mode LMP is designed to expose. The agent still generates the change,
        but the evaluator checks the selected scope against the active Mind and returns{" "}
        <Highlight>pass, needs_revision, blocked, or evaluation_error</Highlight>. A passing result
        means the configured checks ran and passed; it does not mean the model was obedient or the
        code is universally correct.{" "}
        <Citation href={sitePath("/docs/reference/results")}>Inspect the result states</Citation>.
      </>
    ),
  },
  {
    question: "Can an agent still install a dependency, fake a test, or edit around a rule?",
    answer: (
      <>
        Do not assume LMP makes those actions impossible. Its guarantee is bounded by the{" "}
        <Highlight>adapter, evaluator, scope, and enabled checks</Highlight>. LMP should report
        missing or unperformed evidence rather than convert it into a pass. Network controls,
        protected branches, CI, dependency review, and human approval remain necessary for stronger
        operational guarantees.{" "}
        <Citation href={sitePath("/docs/operations/security")}>Read the security boundary</Citation>.
      </>
    ),
  },
  {
    question: "Does LMP intercept every file write at the operating-system boundary?",
    answer: (
      <>
        That is not the promise documented here. LMP evaluates agent-generated changes through a{" "}
        <Highlight>local runtime and evidence boundary</Highlight>; it is not presented as a
        universal filesystem firewall. Claims about a Rust daemon physically rejecting every write
        should only be made once that behavior is implemented, tested, and independently
        demonstrated.{" "}
        <Citation href={sitePath("/docs/architecture/overview")}>Review the architecture</Citation>.
      </>
    ),
  },
  {
    question: "Is the Rust core a compiler, or is that marketing shorthand?",
    answer: (
      <>
        It is <Highlight>compiler-grade infrastructure for declared policy evaluation</Highlight>,
        not a replacement for a language compiler. AST checks can catch structural patterns when a
        supported parser and rule exist, but they cannot infer intent, prove architecture quality,
        or make an arbitrary engineering preference objective. The exact rule, parser, scope, and
        evidence artifact matter.{" "}
        <Citation href={sitePath("/docs/concepts/enforcement")}>See what enforcement means in LMP</Citation>.
      </>
    ),
  },
  {
    question: "Can a 128 MB sandbox and a 15 ms threshold prove code quality?",
    answer: (
      <>
        No. Resource ceilings and timing measurements can provide useful{" "}
        <Highlight>operational evidence</Highlight> for a defined workload. They cannot, by
        themselves, establish maintainability, security, correctness, or production readiness. Any
        telemetry claim needs a reproducible fixture, workload definition, environment, variance,
        and a record of what was not measured.{" "}
        <Citation href={sitePath("/docs/operations/monitoring")}>See the monitoring limits</Citation>.
      </>
    ),
  },
  {
    question: "What does an Ed25519 signature actually protect?",
    answer: (
      <>
        A valid signature can establish{" "}
        <Highlight>artifact integrity and signer identity</Highlight> under the configured trust
        model. It does not prove that the rule is wise, that its source is authoritative, or that
        the resulting code is safe. Provenance, review, versioning, and evaluation evidence are
        separate obligations, not things cryptography magically supplies.{" "}
        <Citation href={sitePath("/docs/reference/mind-vault")}>Check package provenance</Citation>.
      </>
    ),
  },
  {
    question: "Could a bad Mind silently encode someone’s bias as policy?",
    answer: (
      <>
        Yes, if people treat a signed package as unquestionable truth. A signature authenticates
        bytes; it does not confer universal authority. Minds need{" "}
        <Highlight>visible provenance, declared scope, review, and version history</Highlight>, plus
        a way to reject or replace them. The system should make judgment inspectable, not hide
        judgment behind a green check.{" "}
        <Citation href={sitePath("/docs/operations/governance")}>Read the governance model</Citation>.
      </>
    ),
  },
  {
    question: "Will LMP create noisy false positives and slow every edit down?",
    answer: (
      <>
        It can. Policy evaluation adds cost, and poorly scoped rules create friction without
        improving decisions. The meaningful test is whether LMP catches issues reviewers care about
        with <Highlight>lower noise than the existing toolchain</Highlight>. That requires fixed
        tasks, repeated runs, latency reporting, and negative results—not a demo score.{" "}
        <Citation href={sitePath("/docs/operations/roadmap")}>See what still needs evidence</Citation>.
      </>
    ),
  },
  {
    question: "Does LMP replace code review, CI, or the engineer responsible for the change?",
    answer: (
      <>
        No. LMP is an additional, <Highlight>inspectable decision boundary</Highlight>. It does not
        replace domain ownership, independent tests, security review, deployment controls, or final
        human and CI authority. If a page says otherwise, it is overselling the protocol rather than
        describing its current evidence boundary.{" "}
        <Citation href={sitePath("/docs/concepts/overview")}>Read what LMP does not claim</Citation>.
      </>
    ),
  },
  {
    question: "What would convince a skeptical community that this is real?",
    answer: (
      <>
        <Highlight>Reproducible public evidence</Highlight>: the same real-world tasks run with and
        without LMP, identical model and tool conditions, independent review, security evaluation,
        cost and latency numbers, failure cases, and artifacts anyone can inspect. The strongest
        claim should be no stronger than the result proves. “Designed to” and “under test” are more
        credible than calling an unverified capability hardware-enforced.{" "}
        <Citation href={sitePath("/docs/operations/quality-checks")}>Review the quality checklist</Citation>.
      </>
    ),
  },
] as const;

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      aria-labelledby="faq-heading"
      className="mx-auto max-w-[1180px] border-x border-b border-white/10"
    >
      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[0.8fr_1.6fr] lg:gap-16">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
            Questions worth asking
          </div>
          <h2 id="faq-heading" className="mt-4 max-w-md font-mono text-3xl tracking-[-0.05em]">
            No hand-waving in the fine print.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/55">
            The useful distinction is not whether a tool sounds more sophisticated. It is what the
            runtime can actually enforce, what it only evaluates, and what still needs an engineer.
          </p>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;

            return (
              <div key={faq.question}>
                <h3>
                  <button
                    type="button"
                    aria-controls={answerId}
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex min-h-16 w-full items-center justify-between gap-5 py-4 text-left font-mono text-sm text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-emerald-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </h3>
                <div id={answerId} hidden={!isOpen}>
                  <p className="pb-5 pr-8 text-sm leading-7 text-white/55">{faq.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
