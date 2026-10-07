# Wearables Tech Frontiers Skill

`/wtf` stands for Wearables Tech Frontiers.

It is an on-demand skill for following wearables R&D, platform, clinical, product, and market signals across Apple, Google/Fitbit, Oura, Garmin, Samsung, WHOOP, and adjacent sports-health companies. It reads a maintained central feed and turns it into a short signal brief through Claude Code or Codex.

## Information Sources

The source catalog is `config/sources.json`.

- **Industry News** (`industry_news`): launches, health features, partnerships, funding, M&A, category movement, and official vendor updates. Platform and API surfaces (HealthKit, WorkoutKit, Health Connect, Health Services, Wear OS, related developer updates) are tracked under Industry News.
- **Company Research** (`company_research`): official company research channels such as Apple Machine Learning Research, Google Research, and DeepMind.
- **Academic** (`academic`): papers, preprints, validation studies, datasets, and physiological time-series methods from arXiv, PubMed, medRxiv, bioRxiv, and digital-health journals.
- **Clinical / Regulatory** (`clinical_regulatory`): ClinicalTrials.gov, FDA MedWatch, openFDA 510(k), PMA, and recall signals.

Not covered: X/Twitter, paid funding databases, individual openFDA adverse-event reports, push notifications, or telemetry.

## Data Flow

```text
1. Source catalog
   config/sources.json

2. Central feed generation
   GitHub Actions -> scripts/run-feed.js -> scripts/generate-feed.js
   target schedule: every Monday 07:30 Beijing time (GitHub may delay runs)
   lookback: 30 days

3. Published feed
   feed-wearables.json
   state-feed.json

4. Digest preparation
   scripts/prepare-digest.js
   default display window: 30 days
   applies local language/category/source overrides

5. Agent output
   prompts/*.md
   Claude Code / Codex digest

6. Optional slide report
   templates/slides.html -> wtf-YYYY-MM-slides.html
   scripts/export-slides-pdf.sh -> wtf-YYYY-MM-slides.pdf
```

By default, `/wtf` reads the central feed through the GitHub raw CDN.

## Collection and coverage

PubMed searches an absolute date window from `--days`, pages through at most
1,000 results, and fetches metadata in batches of 100. A valid electronic
publication date takes precedence over the print issue date; both raw dates
remain available for diagnosis. arXiv uses its API with category, wearable
keywords and a `submittedDate` window. Each source is limited to 1,000 results,
and API requests are spaced by at least three seconds. Papers use their first
submission date and are deduplicated by arXiv ID without the version suffix.

RSS requests retry network errors, timeouts, 429 and 5xx responses up to three
attempts. Backoff is one then two seconds, with `Retry-After` respected up to
30 seconds. A 403 or 418 is recorded immediately. If MobiHealthNews, JBHI or
Lancet RSS fails, an available `TAVILY_API_KEY` enables one domain-limited
fallback search with at most one retry per source (six additional requests
total). Fallback articles must have an in-window publication date and retain
the source's category and filters; at most three can be selected per source.

The feed remains `schemaVersion: 2`. Its optional
`healthcheck.coverageStatus` is `healthy` or `degraded`; warnings explain
request failures, pagination limits and unsuccessful fallbacks. Source metrics
distinguish empty retrieval, exhausted date filtering, and normal relevance or
selection filtering. PubMed and arXiv warn after two consecutive empty
scheduled cycles. Manual runs and reruns do not advance those counters.

`prepare-digest.js` carries central warnings into the `/wtf` healthcheck footer
and warns when the central feed is more than eight days old. Local fallback
supports RSS, the two arXiv API sources and the configured openFDA subset.

## Generation and diagnosis

Actions stages the candidate in a temporary directory, then requires a
nonempty feed and a passing quality report before publishing. A single source
failure can still publish valid content with warnings. Generation or quality
failure preserves the previous feed and URL history, commits only diagnostic
state, and leaves the workflow failed.

The run summary and warning annotations report source counts, fallback results,
target and actual start times, scheduling/queue delays and publication time.
Diagnostic artifacts are retained for 90 days. `state-feed.json` preserves URL
records and adds source counters and compact run history for the last 180 days,
up to 200 runs, including failure types and affected titles/URLs. Older state
files start with empty counters and history. No external notification service
is required.

To stage and validate a full run without changing the published files:

```bash
node scripts/run-feed.js --days=30 --output-dir=/tmp/wtf-candidate
node scripts/run-feed.js --summary --output-dir=/tmp/wtf-candidate
```

Set `TAVILY_API_KEY` to include web searches, or use `--rss-only` to skip them
while retaining API collection. `scripts/generate-feed.js --output-dir=...`
also supports generation alone, and `scripts/check-feed-quality.js
--feed=... --strict --report=...` always writes a structured validation report.
Run the deterministic test suite with `node --test tests/*.test.mjs`.

## Install

Claude Code:

```bash
git clone https://github.com/waylongo/wearables-tech-frontiers.git ~/.claude/skills/wearables-tech-frontiers
```

Codex:

```bash
git clone https://github.com/waylongo/wearables-tech-frontiers.git ~/.codex/skills/wearables-tech-frontiers
```

Requires Node 22+. There are no npm dependencies.

## Use

Use `/wtf` directly in Claude Code or Codex.

Examples:

- `/wtf`
- `/wtf latest wearable tech frontiers`
- `/wtf past 14 days`
- `/wtf academic and company research only`
- `/wtf switch output to Chinese`

After a digest, `/wtf` first asks whether to save the digest as Markdown. It can
then optionally generate a 16:9 HTML slide report and export it to PDF:

```text
wtf-YYYY-MM-digest.md
wtf-YYYY-MM-slides.html
wtf-YYYY-MM-slides.pdf
```

Markdown, HTML, and PDF files are written to the current directory; existing
names get `-2`, `-3`, and so on. PDF export requires Chrome/Chromium and uses
print-safe slide CSS.
