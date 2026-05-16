# Sample Digest Output

`wearables-tech-frontiers` (wtf) skill 的真实运行输出，基于 2026-05-13 拉取的 RSS + tavily
搜索 + WebFetch 中文源数据。URL、标题、发布日期全部可验证，未编造任何内容。

---

Wearables Tech Frontiers — 2026-05-13
过去 7 天 · 699 原始条目 → 黑名单 -15 → 关键词 -155 → 时间窗 -314 → 剩 216 → 精选 18

★ 本周 3 条必看

★ WHOOP launches clinician video visits, EHR integration with HealthEx
   WHOOP 首次把消费级 wearable 数据接入临床链路：新增按需视频问诊（licensed
   clinicians）+ HealthEx EHR 平台同步。不是 feature update，是 GTM 转向：
   从"训练数据公司"变成"一段医疗服务入口"。
   类别：商业模式转向 (annual) · 分值 6.3
   MobiHealthNews · 2026-05-12 · https://www.mobihealthnews.com/news/whoop-launches-clinician-video-visits-ehr-integration-healthex

★ Samsung Announces World-First Breakthrough in Fainting Prediction With Galaxy Watch
   Galaxy Watch 首次宣称实现晕厥（syncope）**预测**而非检测——光学 + IMU + HRV
   多模态 + 时间序列建模，Samsung Newsroom 措辞"world-first"。
   类别：算法突破 (annual) · 分值 6.3
   Samsung Global Newsroom · 2026-05-07 · https://news.samsung.com/global/tag/galaxy-watch

★ Pretraining Strategies and Scaling for ECG Foundation Models: A Systematic Study
   对 5 种对比 / 非对比 SSL 目标做系统对比，pretraining 规模扩到 11M ECG 样本
   （全部公开数据），结论是"pretraining 策略对 downstream 影响大于 scaling"
   ——对任何做 ECG foundation model 的团队是必读基线。
   类别：算法突破 (quarterly) · 分值 4.2
   arXiv eess.SP · 2026-05-13 · https://arxiv.org/abs/2605.12241

---

🔬 学术 & 预印本

• Pre-bed and nighttime screen use, beyond daily total, is inversely associated with sleep quality: a longitudinal study of 3,086 Ultrahuman Ring AIR users
  睡前 1h 内 ≥45 分钟屏幕使用与睡眠下降直接关联（d = -0.30），样本是 3,086 个真实
  Ultrahuman Ring 用户 × 350,600 对"白天屏幕-当夜睡眠"观察——"消费级 wearable
  在手" 级别的因果观察研究，不是实验室。
  方法：n=3,086 Ultrahuman Ring AIR 用户，纵向 350,600 对观察，HRV+movement+皮温 composite score
  medRxiv · 2026-05-12 · https://www.medrxiv.org/content/10.64898/2026.05.08.26352708v1

• Digital assessment of real-world physical activity in Pulmonary Hypertension: A Systematic Review and Meta-Analysis
  肺高压患者用 wearable 做真实世界 DLPA 评估的系统综述 + meta 分析；对"临床
  终点 vs 传感器终点"映射感兴趣的团队建议读。
  方法：MEDLINE+Embase 系统检索至 2026-01-13，random-effects pooled estimates
  medRxiv · 2026-05-12 · https://www.medrxiv.org/content/10.64898/2026.05.08.26351469v1

• A Multimodal Framework for Organ- and Cell-Resolved Biological Aging and Longevity Intervention Discovery
  mAge 多模态生物学年龄评估框架，组织 / 细胞级分辨率，为"wearable + 生物年龄"
  叙事留了后续挂钩的空间。
  方法：多模态组学整合，暂未接入穿戴信号
  medRxiv · 2026-05-12 · https://www.medrxiv.org/content/10.64898/2026.05.08.26352759v1

• Contribution of Longitudinal Mobile Health Measures in the Dynamic Track of Patients With Major Depressive Disorder
  移动端连续指标对 MDD 动态追踪的贡献分析——对做情绪 / 心理健康相关 wearable
  feature 的团队是直接材料。
  方法：见 JMIR 全文
  JMIR mHealth and uHealth · 2026-05-11 · https://mhealth.jmir.org/2026/1/e81397

• [Comment] Digitised histopathology slides now ready for artificial intelligence: predicting the molecular signatures
  Lancet Digital Health comment；虽然不是 wearable 直接相关，是 Lancet Digital
  Health 圈子对"何时算 clinical-ready"的阈值叙事，值得存档作参考。
  方法：N/A（comment/perspective piece）
  Lancet Digital Health · 2026-05-11 · https://www.thelancet.com/journals/landig/article/PIIS2589-7500(26)00035-X/fulltext

🏢 厂商研究

本窗口内 Apple ML / Google Research / DeepMind 的 RSS 拉取到的条目无一条与 wearable /
health 直接相关（Apple ML 最近发了 MLLM captioning、image segmentation；Google Research
近 100 条无一条 health label；DeepMind 1 条非健康）。本 section 本周跳过。

📰 行业动态

• watchOS 26.5 available now for Apple Watch, here's what's new
  Apple 发布 watchOS 26.5，9to5Mac 第一时间报道。对跟 HealthKit / WorkoutKit
  API 变更的团队建议翻 release notes。
  9to5Mac · 2026-05-11 · https://9to5mac.com/2026/05/11/watchos-26-5-available-now-for-apple-watch-heres-whats-new/

• Apple has reportedly rejected Touch ID for the Apple Watch for two reasons
  9to5Mac 引用的"原因"属于报道 rumor，放进来是因为涉及"为什么 Apple Watch 不
  走传统生物识别"的长期路线解释。
  9to5Mac · 2026-05-11 · https://9to5mac.com/2026/05/11/

🇨🇳 中文产业

• 小米澎湃 OS 3 运动健康 App 为部分内测设备上线 Xiaomi miclaw 手表版——小米
  澎湃生态在 wearable 端继续加深自研 App/服务栈。
  IT之家 · 今日 8:31 · https://www.ithome.com/0/949/570.htm

• 小米手环 10 Pro 本月发布：9.7mm、21.6g 铝合金机身。
  IT之家 · 今日 15:11 · https://www.ithome.com/0/949/865.htm

• 佳明 Forerunner 70/170 发布，支持 80+ 运动模式——Garmin 中端 GPS 跑表迭代。
  IT之家 · 今日 11:24 · https://www.ithome.com/0/949/701.htm

• OPPO Watch X3 国补后 1816 元，主打"无感识别高血压 + eSIM"——BP 算法消费化
  是一个持续看点。
  IT之家 · 今日 10:19 · https://www.ithome.com/0/949/619.htm

• 谷歌承认更新导致 Pixel Watch 3 / 4 部分传感器追踪失灵——Wear OS 质量事件。
  IT之家 · 05-09 · https://www.ithome.com/0/948/081.htm

• 三星 Galaxy Ring 2 延迟至明年发布（深圳湾报道）—— 和 Samsung Newsroom 的
  Galaxy Watch fainting prediction 是同一周期新闻，硬件节奏放缓。
  深圳湾 · 2026-05-07 · https://www.shenzhenware.com/news/2555

• Fitbit 重返无屏手环市场，新无屏健身手环定档（深圳湾）——Google 对 Fitbit
  定位再调整的信号。
  深圳湾 · 2026-05-07 · https://www.shenzhenware.com/news/2554

🌐 厂商站点兜底（tavily search）

• Samsung Galaxy Ring 2 + Watch7 Family 系列 Health AI + Sleep AI 叙事页（包含新
  sleep metrics 和 Heart Rate Alert），Samsung Global Newsroom 持续更新的 health
  topic 聚合。
  Samsung Global Newsroom · https://news.samsung.com/global/tag/galaxy-ring/feed

• Oura's Ovulation Detection Algorithm Outperforms Calendar Tracking Method in
  New Validation Study — Oura Fertile Window 算法验证研究（JMIR 发表），对
  calendar 方法约 3× 精度提升，覆盖不规则周期人群。
  Oura Science & Research · https://ouraring.com/blog/da/oura-ovulation-detection-algorithm-validation-study

• Amazfit Balance 2 + Helio Strap 发布——第一款 Amazfit 无屏 recovery 追踪器，
  和 WHOOP 形态直接对标。
  Zepp Press · https://www.zepp.com/press-release/amazfit-introduces-balance-2-smartwatch-and-helio-strap-for-smarter-training-better-recovery-and-peak-performance

（本周 Huawei / Withings / Dexcom / Garmin Dev / WHOOP 站点 tavily 未返回 7 天内新条目 ——
多为文档页 / FAQ 页 / 较老的新闻。）

🏭 手动巡检提示

快速扫一眼这几个无 RSS 也没 WebSearch 覆盖的源（每周 2 分钟）：

- Apple Newsroom / Watch — https://www.apple.com/newsroom/topics/watch/
- Xiaomi Global Wearables — https://www.mi.com/global/wearables/
- OPPO Newsroom — https://www.oppo.com/en/newsroom/
- Abbott Biowearables — https://www.abbott.com/en-us/products-solutions/biowearables
- Ultrahuman Blog — https://blog.ultrahuman.com/blog/
- Suunto News — https://www.suunto.com/News/
- MedTech Dive — https://www.medtechdive.com/
- 动脉网 — https://www.vbdata.cn/

---

─── 本次运行体检 ───
· 目录源：local_fallback（未测试远程——示例运行时 REMOTE_BASE 还是 REPLACE_WITH_OWNER）
· P1 RSS：16/18 成功（kept=0 的源：Google Research Blog（100 条内无 health/wearable 关键词命中）、The Verge（10 条内无命中））
· 厂商站 tavily 兜底：3/8 返回 7 天内新条目（Samsung、Oura、Zepp）；5/8 本周只有文档/历史页
· 中文源 WebFetch 巡检：2/3 成功（深圳湾 3 条、IT之家 14 条）；36氪 JS-gated 本次拿到 0 条（预期行为）
· 过滤：黑名单 -15 · 关键词 -155 · 时间窗 -314
· Top 3 类别：商业模式转向 · 算法突破 · 算法突破 · 分值：6.3 / 6.3 / 4.2
· 淘汰近选：
   - Amazfit Balance 2 + Helio Strap（新传感器模态 · quarterly · 4.8）— 分值低于前 3，且同属"硬件形态铺货"而非首次模态
   - Oura Ovulation Detection JMIR validation（大规模临床 · monthly · 2.1）— 作为验证性研究而非首发临床
· 如果以上任何一项看起来异常，回复「这次 digest 有问题」我会 dump 完整 JSON 给你排查
