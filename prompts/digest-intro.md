# Wearables Tech Frontiers (wtf) — Digest Intro Prompt

You are assembling a digest for an **algorithm / product tech lead** working on
wearable devices and sports/health algorithms. They want compressed signal, not
curation. Give them facts + one-line mechanism, never editorial verdicts like
"groundbreaking" or "a turning point."

## Header

```
Wearables Tech Frontiers — [Date]
过去 [windowDays] 天 · [rawItems] 原始条目 → 黑名单 [-blacklistCount] → 关键词 [-keywordCount] → 时间窗 [-dateCount] → 剩 [keptItems] → 精选 [N]
```

## Section order (skip any section with zero items)

1. **★ 本周 3 条必看** — Top 3 from the full combined pool (all sources)
2. **🔬 学术 & 预印本** — academic items
3. **🏢 厂商研究** — vendor_research items (Apple ML / Google Research / DeepMind)
4. **📰 行业动态** — industry_news items
5. **🇨🇳 中文产业** — chinese_news items (only if present in `items`)
6. **🌐 厂商站点兜底** — vendor_websearch items from the central feed
7. **🏭 手动巡检提示** — short bullet list from monitorOnlyHints

---

## ★ Top 3 selection — 8-category scoring rubric

**This is the core of the skill.** Do not shortcut it.

### Step A — Label every candidate

Every item in the combined pool (`items`) is
a candidate. For each candidate that's plausibly Top-3 worthy, pick exactly
**one category** from `scarcityTaxonomy.categories`:

| id | 中文 | base_score |
|---|---|---|
| `regulatory_milestone` | 监管里程碑 | 9 |
| `open_release` | 开源发布 | 9 |
| `structural_change` | 结构性变化 | 8 |
| `new_sensor_modality` | 新传感器模态 | 8 |
| `algorithmic_breakthrough` | 算法突破 | 7 |
| `large_clinical` | 大规模临床 | 7 |
| `business_pivot` | 商业模式转向 | 7 |
| `platform_api_change` | 平台 API 变更 | 5 |

Use `scarcityTaxonomy.categories[i].criteria` and `examples_positive` /
`examples_negative` to decide. Read them — they prevent category confusion.

**If a candidate doesn't match any category, it is NOT Top 3 material.**
Drop it from Top 3 consideration. This is by design — Top 3 is for scarce
signal, not just "interesting stuff."

### Step B — Anchor each candidate

Pick one frequency anchor based on how rare this event is **within its own
category** (not globally):

- `annual` (weight 0.9) — once-a-year or rarer for this category
- `quarterly` (weight 0.6) — few-per-year for this category
- `monthly` (weight 0.3) — routine-but-notable for this category

Read `scarcityTaxonomy.anchor_definitions` for the precise bar. You do NOT need
to know "has anyone done this in the last 5 years" — you just need to judge
frequency tier, which is a coarse semantic judgment LLMs handle reliably.

### Step C — Score

`score = base_score × anchor_weight`

Examples:
- `regulatory_milestone` + `annual` = 9 × 0.9 = **8.1**
- `structural_change` + `quarterly` = 8 × 0.6 = **4.8**
- `algorithmic_breakthrough` + `monthly` = 7 × 0.3 = **2.1**

### Step D — Pick Top 3 by score, break ties by category diversity

Sort candidates by score descending. Pick the top 3.

**Tie-breaker:** if you have ≥3 candidates scoring the same, prefer ones from
different categories (avoid "Top 3 all being algorithmic_breakthrough"). This
gives the reader coverage across the industry, not a one-note digest.

### Step E — Reject log (the executional safeguard)

After picking Top 3, emit in `healthcheck.top3_rejected_candidates` up to 2
**near-miss** candidates that *almost* made Top 3 and why they didn't. Format:

```
{"title": "...", "category": "algorithmic_breakthrough", "anchor": "monthly", "score": 2.1, "reason": "lower score than picked items"}
```

This forces you to actually apply the rubric instead of picking 3 headlines you
like. It also gives the user diagnostic insight (a good reject log is more
informative than the picks).

### Cold-week handling

If after Step D no candidate scores ≥ 4.0, emit **fewer than 3** Top 3 items
(including zero — yes, zero is a valid output) and write in place of the
missing items:

> 本周 Top 3 候选分数低于 4.0 阈值，只列 [N] 条。详见分类 section。

**Never pad Top 3 with weak candidates.** The skill's trust mechanism is that
Top 3 is genuinely scarce. Padding destroys that.

### Required format for each Top 3 item

```
★ [标题]
   [一句话机制：他们做了什么/发现了什么/改变了什么 + 具体数字/模型/方法]
   [类别：<label_zh> (<anchor>) · 分值 <score>]
   [sourceName] · [YYYY-MM-DD] · [url]
```

Example:

```
★ WHOOP launches clinician video visits, EHR integration with HealthEx
   WHOOP 首次把消费级 wearable 数据接入临床链路：新增按需视频问诊 + HealthEx EHR 平台同步。
   类别：商业模式转向 (annual) · 分值 6.3
   MobiHealthNews · 2026-05-12 · https://www.mobihealthnews.com/news/whoop-launches-clinician-video-visits-ehr-integration-healthex
```

### Healthcheck fields to populate

After Top 3 selection, write into `healthcheck`:

- `top3_categories`: `["business_pivot", "algorithmic_breakthrough", "new_sensor_modality"]`
- `top3_scores`: `[6.3, 4.2, 7.2]`
- `top3_rejected_candidates`: array of ≤2 near-miss objects (see Step E)

These surface in the footer for user diagnostics.

---

## Other sections — per-item format

```
• [Title — 一句话信号]
  [sourceName] · [YYYY-MM-DD] · [url]
```

- Academic: follow `summarize_papers` (include 方法: n / 模型 / 传感器 line).
- Vendor research: follow `summarize_official`.
- Industry news: follow `summarize_news`.
- Chinese news: follow `summarize_chinese` only if `chinese_news` items are present.

Each non-Top-3 section: target 5–10 items, not everything.

---

## Relevance gate (for non-Top-3 sections)

Drop items that:
- Don't mention wearables, smartwatches, rings, physiological signals (PPG/ECG/HRV/etc.), or related health tasks
- Duplicate a story already listed in another section — pick the more primary source
- Are already in Top 3 — don't list them twice

---

## Absolute rules

- Only remix content from `items`. **Never invent.**
- Every bullet MUST carry its URL. No URL = drop.
- Use `summary` field for extraction; don't refetch article URLs.
- Never editorialize. No "重磅", "颠覆", "震惊", "历史性突破".
- No emoji in individual bullets (section headers only).
- Top 3 category label MUST match exactly one id from `scarcityTaxonomy.categories`. No ad-hoc categories.

---

## Footer — 本次运行体检

Output this template, filling from `healthcheck`:

```
─── 本次运行体检 ───
· 目录源：[catalog_source]  [remote_catalog_version if present]
· feed 源：[feed_source]（remote_feed_generated_at / remote_feed_lookback_days if present）
· P1 RSS：[sourcesWithResults]/[sourcesQueried] 成功（失败源：[from per_source errors]）
· 厂商站 Tavily 兜底：[tavilySitesWithResults]/[tavilySitesQueried] 返回条目（中心 GitHub Actions 运行）
· 中文源自动抓取：v1 未启用；见手动巡检提示
· 过滤：黑名单 [filtered_out_by_blacklist] · 关键词 [filtered_out_by_keyword] · 时间窗 [filtered_out_by_date]
· Top 3 类别：[top3_categories 按 label_zh 翻译] · 分值：[top3_scores]
· 淘汰近选：[top3_rejected_candidates 每条一行：类别 · 分值 · 原因]
· 如果以上任何一项看起来异常，回复「这次 digest 有问题」我会 dump 完整 JSON 给你排查
```

The `Top 3 类别` and `淘汰近选` lines are the new A+D trust mechanism. If the
user sees the same category 3 weeks in a row, or sees a consistently low score,
or sees a reject with a higher score than a pick — they immediately know
something's off. Don't hide these lines even when they're unflattering.
