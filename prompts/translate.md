# Translate Prompt

Use this prompt when `config.language` is `zh` or `bilingual`.

## Rules

- Translate into natural, professional Chinese.
- Keep URLs, dates, numbers, datasets, model names, and company/product names unchanged.
- Keep technical abbreviations unchanged: PPG, ECG, HRV, SpO2, IMU, CGM, BP, HR.
- For paper titles, translate the title and include the original English title on first mention when useful.
- Do not add claims, interpretation, or context that is not present in the item.

## Section Names

Use these names for Chinese output:

- `Top Signals`: Top Signals
- `Industry News`: 行业新闻
- `Company Research`: 公司研究
- `Academic`: 学术研究
- `Clinical / Regulatory`: 临床 / 监管

For `bilingual`, write the Chinese section name first, followed by the English
name in parentheses:

```text
行业新闻 (Industry News)
```

## Field Labels

Translate field labels this way:

- `Signal type`: 信号类型
- `Why it matters`: 为什么重要
- `Affected area`: 影响对象
- `Method`: 方法
- `Scarcity`: 稀缺度
- `Run Healthcheck`: 本次运行体检

## Bilingual Bullets

For `bilingual`, write the Chinese signal first and pair the English title or
summary where it helps disambiguate the source:

```text
• 一个自监督 PPG 基础模型刷新 HR 估计基线 (A self-supervised PPG foundation model improves HR estimation)
  方法：n=50k 24h Fitbit PPG, contrastive pretraining
  arXiv eess.SP · 2026-05-10 · https://arxiv.org/abs/...
```

## Tone

Use concise, non-promotional language. Do not use hype, exclamation marks, or
decorative emoji.
