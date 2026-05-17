# Wearables Tech Frontiers Skill

`/wtf` stands for Wearables Tech Frontiers.

It is an on-demand skill for following wearables R&D, platform, clinical, product, and market signals across Apple, Google/Fitbit, Oura, Garmin, Samsung, WHOOP, and adjacent sports-health companies. It reads a maintained central feed and turns it into a short signal brief through Claude Code or Codex.

## Information Sources

The source catalog is `config/sources.json`.

- **Academic evidence**: papers, preprints, validation studies, datasets, and physiological time-series methods from arXiv, PubMed, medRxiv, bioRxiv, and digital-health journals.
- **Vendor research**: official research channels such as Apple Machine Learning Research, Google Research, and DeepMind.
- **Clinical / Regulatory**: ClinicalTrials.gov, FDA MedWatch, openFDA 510(k), PMA, and recall signals.
- **Platform & API**: HealthKit, WorkoutKit, Health Connect, Health Services, Wear OS, and related developer updates.
- **Product / Market**: launches, health features, partnerships, funding, M&A, category movement, and official vendor updates.

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
```

`remote_feed` is the default path. It reads the central feed through the GitHub Contents API.

`local_rss` is the fallback path. It is used by `--no-remote` or `~/.wtf/sources.json`, and only fetches local RSS plus the local openFDA subset.

Schema note: `config/sources.json` uses `schema_version`; `feed-wearables.json` uses `schemaVersion`.

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
- `/wtf academic and vendor research only`
- `/wtf switch output to Chinese`
- `/wtf add this private RSS source: https://example.com/feed.xml`
