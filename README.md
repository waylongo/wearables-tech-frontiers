# Wearables Tech Frontiers (wtf)

给**可穿戴算法 / 产品技术 lead** 用的按需 digest skill。它不做定时推送、不做即席搜索；当你输入 `/wtf` 时，读取中心 feed，输出一份按信号强度组织的结构化可穿戴行业情报。

## 覆盖范围

| 层 | 机制 | 源 |
|---|---|---|
| 学术 / 预印本 | GitHub Actions 中心抓 RSS/API | arXiv、PubMed、medRxiv、bioRxiv、npj Digital Medicine、Nature BME、JMIR mHealth、Lancet Digital Health、PLOS Digital Health、IEEE JBHI、Frontiers Digital Health、Sensors |
| 厂商研究 | GitHub Actions 中心抓 RSS | Apple ML Research、Google Research、DeepMind |
| 临床注册 | GitHub Actions 中心调用公开 API | ClinicalTrials.gov |
| 监管硬信号 | GitHub Actions 中心抓 RSS/API | FDA MedWatch、openFDA device 510(k)、PMA、Recall |
| 行业媒体 | GitHub Actions 中心抓 RSS + 关键词过滤 | MobiHealthNews、9to5Mac、9to5Google、The Verge、Fierce Healthcare |
| 官方 / 厂商 / 行业兜底 | GitHub Actions 中心调用 Tavily | Apple、Google、Samsung、Huawei、Xiaomi、OPPO、vivo、OnePlus、Oura、WHOOP、Garmin、Withings、Dexcom、Abbott、Zepp、Suunto、Polar、COROS、Ultrahuman、RingConn、Levels、MedTech Dive、Rock Health 等 |
| 平台 API 变更 | GitHub Actions 中心调用 Tavily | Apple HealthKit / WorkoutKit / watchOS docs、Android Health Connect / Health Services / Wear OS docs |

中心 feed 每天由 GitHub Actions 更新到 `feed-wearables.json`。用户本地只负责拉取 JSON、按个人配置过滤，并让 agent 按 prompts remix。

## 不覆盖的

- **X / Twitter**：需要 auth 和服务端 scraper；如需跟人，建议并用 `follow-builders`。
- **中文媒体源**：不抓中文科技/产业媒体页面。
- **openFDA adverse event**：首版不接个案不良事件，避免把 digest 拉向高噪声病例报告。
- **商业融资数据库 API**：不接 Crunchbase、PitchBook、Dealroom、Tracxn 等付费 API。
- **定时推送**：这是按需 skill，不发 Telegram/邮件。
- **遥测**：不向第三方发送用户配置或运行数据。

## 安装

### Codex

```bash
git clone https://github.com/waylongo/wearables-tech-frontiers.git ~/.codex/skills/wearables-tech-frontiers
```

### Claude Code

```bash
git clone https://github.com/waylongo/wearables-tech-frontiers.git ~/.claude/skills/wearables-tech-frontiers
```

要求：Node 22+ 推荐；脚本使用 native `fetch`，无 npm 依赖。

## 独立运行

```bash
node scripts/prepare-digest.js --days=7
node scripts/prepare-digest.js --days=14 --category=academic
node scripts/prepare-digest.js --no-remote
```

脚本默认通过 GitHub Contents API 读取中心 feed，避免 raw CDN 缓存延迟。人工查看可用：

```text
https://raw.githubusercontent.com/waylongo/wearables-tech-frontiers/main/feed-wearables.json
```

`--no-remote` 会跳过中心 feed，改用本地 `config/sources.json` 直接抓 RSS/API。若存在 `~/.wtf/sources.json`，脚本也会跳过中心 feed，以便包含你的私有源。

## 资源优先级

1. 用户 override：`~/.wtf/sources.json`、`~/.wtf/prompts/<name>.md`
2. 中心 feed：`feed-wearables.json`
3. 远程 prompts / catalog：GitHub raw
4. 本地 fallback：仓库里的 `config/sources.json` 和 `prompts/*.md`

## 中心 feed 维护

GitHub Actions workflow 位于 `.github/workflows/generate-feed.yml`：

- 每天 06:00 UTC 运行
- 支持手动触发
- 使用 Node 22
- 需要在 GitHub repo secrets 配置 `TAVILY_API_KEY`
- 生成并提交 `feed-wearables.json`、`state-feed.json`

本地可测试：

```bash
node scripts/generate-feed.js --rss-only
TAVILY_API_KEY=... node scripts/generate-feed.js
```

不要把 API key 写进仓库。

## 调配置

可以直接用自然语言让 agent 修改：

- “换成双语” / “switch to English”
- “看过去 14 天”
- “只看学术”
- “加上厂商研究”
- “加一个源 https://example.com/feed”
- “summary 再短一点”

## 体检段

每次 digest 末尾都会显示：

```text
─── 本次运行体检 ───
· feed 源：remote_feed / local_rss
· RSS / API：成功/失败统计
· 厂商站 Tavily 兜底：成功/失败统计
· 过滤：黑名单 / 关键词 / 时间窗
· Top Signals 类别与分值
```

回复“这次 digest 有问题” / “debug” / “dump JSON” 时，agent 会重新运行 `prepare-digest.js` 并输出完整 JSON 供排查。

## 设计原则

1. 面向算法 / 产品技术 lead，不面向泛行业读者。
2. Top Signals 用稀缺度 rubric，不按“最新”或“最像新闻标题”排序。
3. 中心端只抓取和去重，不做 LLM 摘要，避免模型 API 成本。
4. 用户端负责 remix、翻译和 Top Signals 判断。
5. 每次输出都保留短体检段，让源健康度和过滤情况可见。
