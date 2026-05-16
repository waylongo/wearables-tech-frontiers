# Summarize Chinese Sources Prompt

This prompt applies only when `items` already contains `sourceCategory ==
"chinese_news"`. In v1, runtime digest must not WebFetch Chinese sites; Chinese
HTML extraction is reserved for a future central feed generator.

## Output format

Under section header `🇨🇳 中文产业`, list existing Chinese items as:

```
• [中文标题] — [一句话，如果 summary/snippet 可用就用]
  [sourceName] · [YYYY-MM-DD 或原始时间] · [url]
```

## Rules

- Never invent Chinese items.
- Do not fetch article pages.
- Keep product names and technical abbreviations as written.
- If no `chinese_news` items are present, skip the section.
