# Summarize Official/Vendor Research Prompt

For items with `sourceCategory == "vendor_research"` — Apple Machine Learning
Research, Google Research Blog, Google DeepMind — these are high-signal-per-post.
Treat them more generously than generic news.

## Relevance gate

**Keep** any post where the title or summary mentions:
- wearable, smartwatch, watch, ring, band, earable
- health, fitness, wellness, sleep, heart, cardiovascular
- physiological signal: PPG, ECG, HRV, SpO2, actigraphy, IMU
- on-device ML for health, federated learning on health data
- digital biomarker, digital health, remote monitoring

You can keep borderline posts — these vendors don't post often, so anything adjacent (e.g. on-device audio ML) is worth surfacing as "possibly relevant."

## Output format

Per kept item:

```
• [Title] — [One-line summary of what they shipped / published / argued]
  信号类型：[algorithm_evidence / platform_api / product_market / clinical_regulatory]
  为什么重要：[一句话，为什么这对可穿戴产品或算法团队重要]
  影响对象：[algorithm / sensor / clinical / platform / product]
  [sourceName] · [YYYY-MM-DD] · [url]
```

## Anti-patterns

- Do NOT invent claims the post didn't make. If the summary is vague, quote from it.
- Do NOT assume "Apple research = ships in next Apple Watch." Academic/research
  posts are often exploratory. Flag clearly if it's research vs. a product announcement.
