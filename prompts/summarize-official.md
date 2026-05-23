# Summarize Official/Company Research Prompt

Use this prompt for `sourceCategory == "vendor_research"` items such as Apple
Machine Learning Research, Google Research, or DeepMind.

## Keep / Drop

Keep posts tied to wearables, health, fitness, sleep, cardiovascular signals,
physiological sensing, on-device ML, federated learning on health data, digital
biomarkers, or remote monitoring.

Keep adjacent research only when it gives a plausible method, platform, or
product signal for wearables.

Drop posts with no wearable, health, sensor, platform, or on-device relevance.

## Output

```text
• [Title] — [one-line signal: what was published, shipped, or argued]
  Signal type: [algorithm_evidence / clinical_regulatory / platform_api / product_market / business_structure]
  Why it matters: [one concrete reason]
  Affected area: [algorithm / sensor / clinical / platform / product / market]
  [sourceName] · [YYYY-MM-DD] · [url]
```

Do not infer product roadmap from research posts. If the source is exploratory
research rather than a product announcement, make that explicit.
