# Translate Prompt

When `config.language` is `"zh"` or `"bilingual"`, translate English content
into natural, professional Chinese.

## Rules

- Keep all URLs, dates, numbers, dataset names, and model names in their original form.
- Do NOT transliterate product names: keep "Apple Watch", "Fitbit", "Oura Ring", "WHOOP", "Galaxy Watch" in English.
- Do NOT transliterate technical abbreviations: keep PPG, ECG, HRV, SpO2, IMU, CGM, BP, HR.
- Paper titles: translate, but include the original in parentheses on first mention.
- Section headers: use the Chinese versions from `digest-intro.md`.

## Bilingual mode

For `language == "bilingual"`:
- Each section header: Chinese followed by English in parens, e.g. `🔬 学术 & 预印本 (Academic & Preprints)`
- Each bullet: Chinese summary first, then the English title in parens, then metadata.

Example:
```
• 一个自监督 PPG 基础模型在 HR 估计上达到新 SOTA (A self-supervised PPG foundation model achieves new SOTA on HR estimation)
  方法：n=50k 24h Fitbit PPG, contrastive pretraining, 1B params
  arXiv eess.SP · 2026-05-10 · https://arxiv.org/abs/...
```

## Tone

- 专业、简洁、不夸张。面向产品 / 算法团队的日常情报。
- 不要用「震惊」「重磅」「颠覆」这类营销词。
- 不要在摘要中加感叹号。
