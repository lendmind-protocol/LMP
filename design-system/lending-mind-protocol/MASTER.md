# Lending-Mind Protocol — Design System Master

> This is the canonical visual reference for the public landing page and documentation portal. Page-specific guidance in `design-system/pages/[page-name].md` may refine these rules, but must not contradict accessibility or content-integrity requirements here.

**Updated:** 2026-09-12
**Product:** Lending-Mind Protocol (LMP)
**Surface:** Rust-first developer portal and protocol landing page
**Canonical UI:** `apps/docs/app/page.tsx` and `apps/docs/app/global.css`

## Product and audience

LMP makes engineering judgment inspectable: a profile becomes a signed package, an evaluation becomes a bounded result, and the result preserves evidence. The primary audience is engineers evaluating an AI-assisted development control plane, not consumers browsing a generic SaaS site.

The interface should feel precise, calm, skeptical, local-first, and technically credible. Every visual claim must be supportable by repository evidence or clearly labeled as planned.

## Visual direction

Use a monochrome editorial system with a restrained green status accent. The landing page is intentionally high-contrast and dark in the active theme; the documentation shell remains readable in light and dark themes. Favor long horizontal rules, compact metadata, generous whitespace, and code-like labels over decorative gradients or ornamental UI.

### Tokens

| Role | Light | Dark / landing | Usage |
| --- | --- | --- | --- |
| Page background | `oklch(0.99 0 0)` | `#090a0b` | Page canvas |
| Primary ink | `oklch(0.145 0 0)` | `#f3f4f3` | Headings and body |
| Panel | `oklch(0.965 0 0)` | `#0d0f10` | Code, cards, previews |
| Border | `oklch(0.145 0 0 / 14%)` | `rgb(255 255 255 / 10%)` | Dividers and controls |
| Muted text | `oklch(0.145 0 0 / 62%)` | `rgb(255 255 255 / 60%)` | Supporting copy |
| Subtle text | `oklch(0.145 0 0 / 42%)` | `rgb(255 255 255 / 35%)` | Metadata and labels |
| Status accent | `#047857` | `#34d399` | Links, pass states, active markers |
| Error | `#b91c1c` | `#f87171` | Blocking findings and failures |

Do not use pure black as a page background in the documentation shell. “Black text” means the light-theme foreground and highlighted keywords use dark ink; it does not mean a black fill behind text. Keep text contrast at or above WCAG AA 4.5:1 for normal text and 3:1 for large text.

### Typography

- Headings and technical labels: Geist Sans from the app shell, with `font-mono` for protocol names, commands, IDs, and eyebrow labels.
- Body: Geist Sans, readable line-height, no all-caps paragraphs.
- Labels: `10–11px`, uppercase, letter spacing around `0.12–0.18em`.
- Hero heading: responsive clamp, tight tracking, maximum two lines on desktop where possible.
- Code: preserve wrapping on narrow screens; never create horizontal page overflow.

### Layout

- Maximum content width: `1180px` on the landing page.
- Horizontal padding: `clamp(1rem, 4vw, 2rem)`.
- Section rhythm: `3–6rem` vertical hero padding; `1–2rem` internal panel padding.
- Use a visible grid or rule to separate concepts; avoid floating card piles.
- Maintain usable layouts at 375px, 768px, 1024px, and 1440px.
- Keep primary calls to action close to the user’s next decision: install, read protocol, inspect evidence, or open docs.

## Component rules

### Navigation

Use a compact wordmark, version metadata, and no more than three primary links. External links must have an accessible label and an external-link icon. The logo is an image mark without text; the product name is rendered separately.

### Buttons and links

- Prefer text links with arrow or external-link SVG icons for documentation actions.
- Minimum interactive target: `44px` in both dimensions.
- Use `cursor-pointer`, visible `:focus-visible` rings, and `150–300ms` transitions.
- Hover must change color or border, not shift layout.
- The green accent communicates an available or passing state; it is not decoration.

### Cards, tables, and code

- Use panels as evidence containers, not as generic marketing cards.
- Tables must remain readable on mobile: short headers, aligned numeric values, and a scroll-safe wrapper when required.
- Code blocks must show the exact command or schema being documented; do not use invented output as proof.
- Findings should distinguish `pass`, `warning`, `needs_revision`, `blocked`, and `error` visibly and textually.

### FAQ accordion

Use native disclosure semantics or an equivalent accessible button pattern. Questions should be skeptical and specific. Answers may highlight keywords and citations with dark ink in light mode and light ink in dark mode; never use highlighted text as the only carrier of meaning. Keep related context on the canonical page to avoid click fatigue.

## Content integrity

- Say “local verification,” “CI verification,” or “external review” precisely.
- Never imply that signatures prove policy correctness, that static checks prove universal quality, or that a deployment exists without a reachable URL check.
- Separate implemented, evidence-incomplete, blocked, and planned states.
- Prefer one canonical page with clear sections over fragmenting closely related material into thin pages.
- Use direct language for limitations and community criticism; avoid hype, vague “AI-powered” claims, and unsupported performance numbers.

## Motion and accessibility

- Respect `prefers-reduced-motion: reduce`; disable marquee and nonessential animations.
- Never use emoji as functional icons; use Lucide or another consistent SVG set.
- Preserve focus order, semantic headings, alt text, keyboard operation, and visible state changes.
- Check 375px width for clipped commands, tables, accordions, and navigation.

## Asset specifications

| Asset | Path | Specification |
| --- | --- | --- |
| Logo | `/public/assets/logo.png` | Abstract, text-free mark; transparent background; recognizable at 24–32px |
| README banner | `/public/assets/banner.png` | 2172×724 source; wide 3:1 composition; displayed at 800px max width |

Asset-generation prompts are supplied as standalone text when requested; they are not repository assets or runtime documentation.

## Delivery checklist

- [ ] Landing page uses the current palette and the banner asset is not substituted with a remote image.
- [ ] README and docs link to real routes and the local MIT license.
- [ ] No unsupported deployment, adoption, authorship, or security claims are presented as facts.
- [ ] All interactive controls have focus states and keyboard behavior.
- [ ] Reduced-motion and mobile layouts are tested.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm verify:docs` pass for UI changes.
