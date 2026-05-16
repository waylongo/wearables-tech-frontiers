# Summarize News Prompt

For `industry_news` and `vendor_websearch` items, extract the concrete signal.

## Relevance gate

**Keep** items where the story is clearly about:
- A wearable device launch, hardware spec, or firmware/OS update (watchOS, Wear OS, Zepp OS, Amazfit, Oura, WHOOP, Garmin, Suunto, Polar, Coros, Withings, Xiaomi, Huawei, Samsung, Apple)
- A new health algorithm/feature shipping (sleep stage, arrhythmia, SpO2, BP, CGM, stress, recovery score)
- Regulatory milestone (FDA clearance, CE mark, 510(k)) for a wearable or digital-health device
- Platform API change (HealthKit, Health Connect, Samsung Health SDK, Huawei Health Kit)
- Clinical study or partnership announcement linking a consumer device to a health outcome
- Funding / M&A in the wearable / digital-health / sports-tech category

**Drop** items about: app sales/deals, celebrity streaming events, smartphone news unrelated to wearables, generic "Android updates" without a wearable angle.

## Output format

Per kept item:

```
• [Headline reframed as a signal, not clickbait]
  信号类型：[algorithm_evidence / clinical_regulatory / platform_api / product_market / business_structure]
  为什么重要：[one concrete reason for a wearable algorithm/product team]
  影响对象：[algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

If two or more sources cover the same story, collapse them:

```
• [Signal]
  [source1] + [source2] · [YYYY-MM-DD] · [url of the primary one]
```

## Anti-patterns

- Do NOT copy the headline verbatim — reframe it as "what changed, not what's announced."
  - Bad: "Apple releases watchOS 12.3"
  - Good: "watchOS 12.3 adds on-device irregular-rhythm detection to Series 7+"
- Do NOT include rumors without an official or named source in the body.
- Do NOT editorialize ("exciting", "game-changing"). State the fact.
