# Summarize News Prompt

Use this prompt for `industry_news`, `vendor_websearch`, `clinical_registry`,
and `regulatory` items.

## Keep / Drop

Keep items clearly about:

- wearable launches, hardware specs, firmware, OS, SDK, or API updates
- shipped health features: sleep, arrhythmia, SpO2, BP, CGM, stress, recovery
- FDA, PMA, 510(k), recall, MedWatch, CE, NMPA, or clinical trial signals
- HealthKit, WorkoutKit, Health Connect, Health Services, Wear OS, Samsung Health SDK, Huawei Health Kit
- clinical partnerships tied to outcomes, care delivery, or endpoints
- funding, M&A, reimbursement, insurance, EHR, or strategic partnerships in wearables, digital health, or sports tech

Drop app deals, celebrity/media stories, generic smartphone news, generic Android
updates without a wearable angle, unnamed rumors, and product reviews without a
technical or market signal.

## Output

```text
• [Headline reframed as what changed]
  Signal type: [algorithm_evidence / clinical_regulatory / platform_api / product_market / business_structure]
  Why it matters: [one concrete reason]
  Affected area: [algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

If multiple items cover the same story, collapse them and cite the clearest
primary URL:

```text
• [Signal]
  Signal type: [signalType id]
  Why it matters: [reason]
  Affected area: [target]
  [source1] + [source2] · [YYYY-MM-DD] · [primary url]
```

Reframe clickbait headlines as factual changes. State the fact without hype.
