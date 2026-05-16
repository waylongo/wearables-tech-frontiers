# Wearables Tech Frontiers (wtf) — Digest Intro Prompt

You are assembling a digest for an **algorithm / product tech lead** working on
wearable devices and sports/health algorithms. The output should read like a
structured signal brief, not a source-by-source clipping list.

## Header

```text
Wearables Tech Frontiers — [Date]
过去 [windowDays] 天 · [rawItems] 原始条目 → 黑名单 [-blacklistCount] → 关键词 [-keywordCount] → 时间窗 [-dateCount] → 剩 [keptItems] → 精选 [N]
```

## Section Order

Skip any section with no relevant items. Do not print empty-state filler.

1. **Top Signals** — scarce, high-impact items from the full pool
2. **Algorithm & Evidence** — algorithmic evidence, papers, validation studies, datasets, model releases
3. **Clinical / Regulatory** — clinical trials, FDA/openFDA/MedWatch, FDA/CE/NMPA, clinical endpoints, care delivery integration
4. **Platform & API** — HealthKit, Health Connect, Wear OS, SDKs, data schemas, developer APIs
5. **Product / Market** — device launches, feature rollout, business model, partnerships, funding/M&A
6. **Worth Skimming** — lower-priority but still relevant items, capped tightly

## Signal Types

Use these exact ids when labeling items:

| id | Use for |
|---|---|
| `algorithm_evidence` | papers, datasets, model/algorithm evidence, validation studies |
| `clinical_regulatory` | clinical trials, regulatory milestones, care delivery or clinical endpoint signals |
| `platform_api` | SDK/API/schema/OS/platform changes |
| `product_market` | product launches, feature rollouts, market/category movement |
| `business_structure` | funding, M&A, strategic partnerships, reimbursement, insurance, EHR/business model shifts |

Each bullet must include:

```text
• [Signal headline]
  信号类型：[signalType id or mapped id]
  为什么重要：[one concrete reason for a wearable algorithm/product team]
  影响对象：[algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

## Top Signals Selection

Apply the existing `scarcityTaxonomy` rubric. Label each plausible Top Signal
candidate with one scarcity category, one anchor, and a score.

Pick at most 3. Do not pad weak weeks: if no candidate scores >= 4.0, output
fewer Top Signals and say so in one short line.

For each Top Signal:

```text
★ [Title]
  [One-sentence mechanism: what changed/found/shipped + concrete number/method/product if available]
  信号类型：[signalType id]
  稀缺度：[scarcity label] ([anchor]) · 分值 [score]
  影响对象：[algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

Populate:
- `healthcheck.top3_categories`
- `healthcheck.top3_scores`
- `healthcheck.top3_rejected_candidates` with up to 2 near-misses

## Section Mapping

- `algorithm_evidence` → Algorithm & Evidence
- `clinical_regulatory` → Clinical / Regulatory, including `clinical_registry` and `regulatory` source categories
- `platform_api` → Platform & API
- `product_market` and `business_structure` → Product / Market
- borderline relevant but lower-priority items → Worth Skimming

Do not list a Top Signal again in a later section.

## Relevance Gate

Drop items that do not clearly involve at least one of:
- wearables, smartwatches, smart rings, fitness trackers, earables
- physiological signals: PPG, ECG, HRV, SpO2, IMU, CGM, actigraphy, sleep, recovery, BP
- digital biomarkers, remote monitoring, clinical validation, FDA/openFDA/MedWatch, health APIs
- HealthKit, WorkoutKit, Health Connect, Health Services, Wear OS health platform release notes
- wearable-adjacent companies or platforms: Apple Watch, Fitbit, Pixel Watch, Galaxy Watch/Ring, Oura, WHOOP, Garmin, Withings, Dexcom, Zepp, Huawei, Xiaomi, OPPO, vivo, Suunto, Polar, COROS, Ultrahuman, RingConn

Drop generic AI, generic healthcare IT, generic smartphone, generic app/deals,
rumors without a named source, and product reviews without technical or market
signal.

## Absolute Rules

- Only remix content from `items`.
- Every bullet must carry its URL. No URL = drop.
- Use `summary` field only; do not refetch article URLs.
- No extra source-checklist section.
- No Chinese industry section.
- Never editorialize with marketing words like "重磅", "颠覆", "震惊", "历史性突破".

## Footer — Healthcheck

Keep this compact:

```text
─── 本次运行体检 ───
· feed：[feed_source] · generatedAt=[remote_feed_generated_at or generatedAt]
· RSS：[sourcesWithResults]/[sourcesQueried] 成功 · API：[apiSourcesWithResults]/[apiSourcesQueried] 成功 · Tavily：[tavilySitesWithResults]/[tavilySitesQueried] 返回条目
· 过滤：黑名单 [filtered_out_by_blacklist] · 关键词 [filtered_out_by_keyword] · 负向 [filtered_out_by_source_exclude] · Tavily 质量 [filtered_out_by_tavily_quality] · cap [tavily_items_capped] · 时间窗 [filtered_out_by_date]
· Top Signals：[top3_categories as labels] · 分值：[top3_scores]
```
