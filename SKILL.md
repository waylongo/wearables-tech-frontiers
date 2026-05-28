---
name: wtf
description: /wtf is a curated wearables and sports-health digest. Use when the user invokes /wtf or asks what's new in wearables, Apple Watch, Google/Fitbit, Oura, smart rings, PPG, HRV, sleep tracking, digital biomarkers, or smart health algorithms.
---

# /wtf

`/wtf` stands for Wearables Tech Frontiers. It produces an on-demand signal brief from a centrally generated feed.

## Runtime Model

- Use only `items` from `prepare-digest.js`.
- Do not run web search or refetch article URLs during digest generation.
- Default feed path: `remote_feed`, with central RSS/API/Tavily results.
- Fallback feed path: `local_rss`, with local RSS plus the local openFDA subset.
- Public source catalog: `config/sources.json`.
- User overrides: `~/.wtf/config.json`, `~/.wtf/sources.json`, `~/.wtf/prompts/*.md`.

## First Run

If `~/.wtf/config.json` does not exist with `onboardingComplete: true`, ask for:

- `windowDays`: 1 / 7 / 14 / 30; default is 30.
- `language`: `en` / `zh` / `bilingual`; default is `en`.
- `categories`: any of `industry_news`, `company_research`, `academic`, `clinical_regulatory`.

Save the selected values:

```bash
mkdir -p ~/.wtf
cat > ~/.wtf/config.json << 'CFGEOF'
{
  "windowDays": 30,
  "language": "en",
  "categories": ["industry_news", "company_research", "academic", "clinical_regulatory"],
  "onboardingComplete": true
}
CFGEOF
```

Then run the digest.

## Digest Run

Run:

```bash
node "${CLAUDE_SKILL_DIR:-$PWD}/scripts/prepare-digest.js"
```

One-time overrides:

- `past N days` -> `--days=N`
- `academic only` -> `--category=academic`
- `local only` or `skip remote` -> `--no-remote`

The script output contains:

- `items` and `groupedByCategory`
- `prompts`
- `healthcheck`
- `scarcityTaxonomy`

If `stats.keptItems == 0`, say:

```text
No items matched the filters for the past [windowDays] days. Try a broader category set.
```

Then stop.

## Remix

Follow the prompts returned by the script:

- `prompts.digest_intro`: source-category section order, Top Signals, healthcheck footer
- `prompts.summarize_news`: Industry News items (`industry_news`, `vendor_websearch`) and Clinical / Regulatory items (`clinical_regulatory`)
- `prompts.summarize_official`: Company Research items from `company_research`
- `prompts.summarize_papers`: Academic items from `academic`
- `prompts.translate`: apply when `config.language` is `zh` or `bilingual`
- `prompts.slides_report`: optional HTML slide report generation after the
  digest has been written

Use this body order after Top Signals:

1. Industry News
2. Company Research
3. Academic
4. Clinical / Regulatory

Populate:

- `healthcheck.top3_categories`
- `healthcheck.top3_scores`
- `healthcheck.top3_rejected_candidates`

Language behavior:

- `en`: English only
- `zh`: Chinese only, keeping product names and technical abbreviations in English
- `bilingual`: Chinese first, paired with English where useful

## Optional HTML Slides

After producing the digest, ask the user:

```text
Generate an HTML slide report for this digest?
```

If the user says no, stop. If the user says yes:

1. Reuse the current `prepare-digest.js` JSON from this digest run. Do not rerun
   the feed script, refetch article URLs, or run web search.
2. Read `${CLAUDE_SKILL_DIR:-$PWD}/templates/slides.html`,
   `${CLAUDE_SKILL_DIR:-$PWD}/prompts/slides-design.md`, and
   `prompts.slides_report`.
3. Generate a 16:9 interactive slide deck with richer editorial analysis than
   the digest text, following the slide report prompt and design spec. Treat
   each slide as a fixed 16:9 canvas: at most 3 Top Signal cards on the overview
   slide, at most 4 body cards per slide, and no important content that requires
   scrolling to read.
4. Write the file to the current working directory as
   `wtf-YYYY-MM-slides.html`, using the digest `generatedAt` month in UTC.
   If the file exists, append `-2`, `-3`, and so on.
5. Verify the HTML has no remaining `{{...}}` placeholders before reporting the
   path.

Then ask:

```text
Export the slide report to PDF?
```

If the user says yes, run:

```bash
bash "${CLAUDE_SKILL_DIR:-$PWD}/scripts/export-slides-pdf.sh" <html-file>
```

The PDF should use the same basename, for example `wtf-2026-05-slides.pdf`.
After export, inspect representative pages for page-edge clipping, single-column
card collapse, hidden headings, and missing source links. If Chrome/Chromium is
unavailable, explain that the user can print the HTML from a browser with a
960x540px page size, no margins, and background graphics enabled.

## Configuration

Persist user defaults by editing `~/.wtf/config.json`. Do not persist one-time requests such as `past 14 days`.

Supported fields:

- `windowDays`: 1 / 7 / 14 / 30
- `language`: `en` / `zh` / `bilingual`
- `categories`: `industry_news`, `company_research`, `academic`, `clinical_regulatory`

For source changes, edit `~/.wtf/sources.json`; this forces `local_rss`.

For prompt changes, copy the relevant repo prompt to `~/.wtf/prompts/<name>.md` and edit the user override.

## Debug

If the user says `debug` or `dump JSON`, rerun:

```bash
node "${CLAUDE_SKILL_DIR:-$PWD}/scripts/prepare-digest.js"
```

Output the full JSON, then briefly note feed source, failed RSS/API sources, Tavily center-run stats, and filter counts.

## Absolute Rules

- Every bullet must include a URL; drop items without URLs.
- Do not invent sources, categories, scores, dates, URLs, claims, sample sizes, or model details.
- Do not repeat a Top Signal in later sections.
- Do not use hype.
- Top Signals category labels must match `scarcityTaxonomy.categories`.
