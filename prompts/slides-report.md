# Slides Report Prompt

Use this prompt after a `/wtf` digest has already been generated and the user
chooses to create an HTML slide report. Reuse the current `prepare-digest.js`
JSON from the digest run. Do not rerun the feed script, refetch article URLs, or
run web search.

## Source Files

- Use `templates/slides.html` as the HTML template.
- Use `docs/slides-design.md` as the visual system. The generated report must
  follow that design spec: warm parchment background, terracotta accent, warm
  neutrals, serif headings, light shadows, grid cards, no gradients, and no heavy
  shadows.
- Use `scripts/export-slides-pdf.sh` only after the HTML exists and the user
  chooses PDF export.

## Output Names

Write the HTML to the current working directory as:

```text
wtf-YYYY-MM-slides.html
```

Use the digest `generatedAt` month in UTC for `YYYY-MM`. If that file already
exists, append `-2`, `-3`, and so on. If exporting PDF, use the same basename:

```text
wtf-YYYY-MM-slides.pdf
```

## Content Rules

- Generate a 16:9 interactive slide deck, not a long article page.
- Write rich editorial content from the digest JSON. Do not simply paginate the
  plain-text digest.
- Every claim must come from the current JSON item `title`, `summary`,
  `publishedAt`, `sourceName`, `sourceCategory`, `signalType`, `url`, scoring
  fields, `stats`, `healthcheck`, or `scarcityTaxonomy`.
- Drop items without URLs.
- Do not invent sample sizes, claims, scores, dates, source names, or regulatory
  IDs.
- Do not repeat Top Signals in later body sections.
- Do not use hype.

## Selection

Top Signals:

- Select up to 3 highest-value items.
- Prefer `selectionScore` when present.
- If `selectionScore` is absent, apply `scarcityTaxonomy` and the digest intro
  Top Signals rules to assign category, anchor, and score.
- If no candidate scores at least 4.0, use fewer than 3 Top Signals and say so
  briefly on the overview slide.

Body sections:

1. Industry News (`industry_news` and `vendor_websearch`)
2. Company Research (`company_research`)
3. Academic (`academic`)
4. Clinical / Regulatory (`clinical_regulatory`)

Select 4-6 body items per non-empty section, excluding Top Signals. Put at most
4 body cards on any single slide; split a section across additional slides when
needed. Remove empty sections entirely.

Always keep title, Top Signals overview, Top Signal detail slides for selected
signals, stats/funnel, and end slide.

## Slide Content

Top Signal detail slides should include:

- Background: 1-2 concise sentences, no more than 45 words total.
- What happened: concrete method, product, result, launch, or regulatory action,
  no more than 90 words total.
- Key data: numbers, model names, sample sizes, regulatory IDs, company names, or
  `not specified` if the JSON does not provide them, no more than 35 words.
- Impact: one clear paragraph inside `.highlight-box`, no more than 45 words.

Body cards should contain 4-6 concise sentences covering:

- What changed, reframed as a factual signal.
- Concrete details from the item summary.
- Practical implication for wearables, sports health, physiological signals,
  digital biomarkers, clinical/regulatory work, or health platforms.
- Academic cards should name method, sensor, dataset, model, or sample details
  only when present.
- Clinical/regulatory cards should name trial status, NCT ID, FDA ID, decision
  type, device, company, and population only when present.
- Keep each body card below 95 words. If an item needs more context, prefer a
  sharper implication sentence rather than adding more source detail.

Stats slide should use `stats` and `healthcheck` only. Include raw items, kept
items, RSS/API/Tavily source result counts, failures, window days, and a compact
top-source summary. Keep the top-source summary to one wrapped line or fewer
than 90 characters.

## Language

Use `config.language`:

- `en`: English only.
- `zh`: Chinese throughout; keep product names and technical abbreviations such
  as PPG, ECG, HRV, SpO2, CGM, BP, HR, and IMU in English.
- `bilingual`: Chinese first, paired with English where useful.

## HTML Requirements

- Fill every `{{PLACEHOLDER}}` used by the template.
- Treat each slide as a fixed 16:9 canvas for PDF export. Do not rely on
  vertical scrolling for important content.
- Preserve the template slide role classes (`title-slide`, `top-signals-slide`,
  `detail-slide`, `cards-slide`, `stats-slide`, `end-slide`). They drive the
  print-safe layout.
- Preserve `.detail-tags` on the optional Top Signal tag row. The print layout
  hides that row so source links and impact text stay inside the page.
- Do not place more than 3 cards on the Top Signals overview slide or more than
  4 cards on any `cards-slide`.
- Localize UI placeholders such as `{{HERO_LABEL}}`,
  `{{TOP_SIGNALS_LABEL}}`, `{{TOP_SIGNALS_TITLE}}`, stats labels,
  `{{END_TITLE}}`, and `{{NAV_HINT}}` according to `config.language`.
- Remove slide blocks for empty optional sections.
- Escape dynamic HTML text. Source URLs must remain valid `href` attributes.
- Use absolute or relative source links exactly as provided in JSON.
- Preserve the template navigation behavior: arrow keys, click, swipe, progress
  bar, and slide counter.
- Before presenting the result, verify there are no remaining `{{...}}`
  placeholders in the HTML.
- If exporting PDF, render or inspect representative pages after export. The
  acceptance bar is: no page-edge clipping, no single-column card collapse, no
  hidden slide heading, and no important source link lost below the page.
