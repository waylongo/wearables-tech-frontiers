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
   GitHub Actions -> scripts/generate-feed.js
   schedule: every Monday 07:30 Beijing time
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
