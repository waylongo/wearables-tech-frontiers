# Digest Intro Prompt

Assemble a concise signal brief for wearables and sports-health R&D. The digest
should read like a prioritized brief, not a source-by-source clipping list.

## Header

```text
Wearables Tech Frontiers — [Date]
Past [windowDays] days · [rawItems] raw items -> blacklist [-blacklistCount] -> keywords [-keywordCount] -> date window [-dateCount] -> [keptItems] kept -> [N] selected
```

## Sections

Skip empty sections.

1. **Top Signals**
2. **Industry News**
3. **Company Research**
4. **Academic**
5. **Clinical / Regulatory**

Section mapping is based on `sourceCategory`, not `signalType`:

- `industry_news` and `vendor_websearch` -> Industry News
- `company_research` -> Company Research
- `academic` -> Academic
- `clinical_regulatory` -> Clinical / Regulatory

Do not output lower-priority items that are not worth including in one of the
four main source sections.

Keep `Signal type` in every bullet to describe whether the item is algorithm,
clinical, platform, product, market, or business-related, but do not use
`signalType` to decide the top-level section.

## Signal Types

Use only these ids:

| id | Meaning |
|---|---|
| `algorithm_evidence` | papers, datasets, models, algorithms, validation evidence |
| `clinical_regulatory` | clinical trials, regulatory milestones, recalls, care-delivery signals |
| `platform_api` | SDK, API, schema, OS, permission, or platform changes |
| `product_market` | launches, feature rollouts, device categories, market movement |
| `business_structure` | funding, M&A, partnerships, reimbursement, insurance, EHR integration |

Standard bullet:

```text
• [Signal headline]
  Summary: [2-3 sentences summarizing what happened, the concrete evidence/detail in the item, and the implication for wearables/sports-health. Use only `summary`; write `not specified` for missing details.]
  Signal type: [signalType id]
  Why it matters: [one concrete reason]
  Affected area: [algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

## Top Signals

Apply `scarcityTaxonomy` to the full item pool. Pick at most 3 items. Do not pad
weak weeks: if no candidate scores >= 4.0, output fewer Top Signals and say so
in one short line.

For each plausible candidate, assign one taxonomy category, one anchor, and one
score. For each selected Top Signal:

```text
★ [Title]
  Summary: [2-3 sentences explaining what changed/found/shipped, the concrete method/product/number when available, and why this is a scarce signal. Use only `summary`; write `not specified` for missing details.]
  Signal type: [signalType id]
  Scarcity: [scarcity label] ([anchor]) · score [score]
  Affected area: [algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

Populate:

- `healthcheck.top3_categories`
- `healthcheck.top3_scores`
- `healthcheck.top3_rejected_candidates` with up to 2 near-misses

Do not repeat selected Top Signals in later sections.

## Relevance Gate

Keep only items with a clear wearable, sports-health, physiological-signal,
digital-biomarker, clinical/regulatory, health-platform, or wearable-adjacent
company angle.

Drop generic AI, generic healthcare IT, unrelated smartphone/app/deal stories,
unnamed rumors, and product reviews without technical or market signal.

## Hard Rules

- Use only `items` from the script JSON.
- Every bullet must carry a URL. No URL means drop the item.
- Use `summary`; do not refetch URLs or run web search.
- Each selected item must include a `Summary` field with 2-3 useful sentences so the reader can usually avoid opening the link.
- Do not invent claims, sample sizes, dates, URLs, source names, scores, or categories.
- Do not add an extra source-checklist section.
- Do not use hype.

## Healthcheck Footer

```text
--- Run Healthcheck ---
feed: [feed_source] · generatedAt=[remote_feed_generated_at or generatedAt]
RSS: [sourcesWithResults]/[sourcesQueried] with results · API: [apiSourcesWithResults]/[apiSourcesQueried] with results · Tavily: [tavilySitesWithResults]/[tavilySitesQueried] with results
filters: blacklist [filtered_out_by_blacklist] · keyword [filtered_out_by_keyword] · source exclude [filtered_out_by_source_exclude] · Tavily quality [filtered_out_by_tavily_quality] · cap [tavily_items_capped] · date [filtered_out_by_date]
Top Signals: [top3_categories as labels] · scores: [top3_scores]
```
