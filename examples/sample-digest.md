# Sample Digest Output

`wearables-tech-frontiers` (wtf) skill 的示例输出，展示当前的信号强度型结构。
示例只使用中心 feed 中的条目，不包含中文产业媒体、手动巡检段落或运行时搜索。

---

Wearables Tech Frontiers — 2026-05-16
过去 30 天 · 913 原始条目 → 黑名单 -0 → 关键词 -646 → 时间窗 -30 → 剩 237 → 精选 12

## Top Signals

★ FDA MedWatch flags TRUE METRIX blood-glucose monitoring risk
  FDA safety communication and recall-related MedWatch alerts point to a live glucose-monitoring quality issue.
  信号类型：clinical_regulatory
  稀缺度：regulatory milestone (quarterly) · 分值 4.8
  影响对象：clinical / sensor / product
  FDA MedWatch Safety Alerts · 2026-05-05 · http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/trividia-health-correction-true-metrix-blood-glucose-monitoring-systems

★ FDA clears nasal alar SpO2 sensor through 510(k)
  A pulse-oximetry sensor clearance is a concrete signal for respiratory and perioperative monitoring hardware.
  信号类型：clinical_regulatory
  稀缺度：regulatory milestone (quarterly) · 分值 4.8
  影响对象：sensor / clinical
  openFDA Device 510(k): wearable-relevant clearances · 2026-05-01 · https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K253887

★ Health platform changelogs are now first-class feed sources
  Apple HealthKit / WorkoutKit and Android Health Connect / Health Services docs are monitored centrally as platform API signals.
  信号类型：platform_api
  稀缺度：platform surface change (monthly) · 分值 3.6
  影响对象：platform / product
  Apple HealthKit Updates + Android Health Connect Release Notes · 2026-05-16 · https://developer.apple.com/documentation/Updates/HealthKit

## Algorithm & Evidence

• ECG and PPG papers remain grouped as evidence, not mixed into product news
  信号类型：algorithm_evidence
  为什么重要：algorithm teams can scan validation methods, datasets, and sensor assumptions before product teams act.
  影响对象：algorithm / sensor
  arXiv eess.SP · 2026-05-16 · https://arxiv.org/list/eess.SP/recent

## Clinical / Regulatory

• Blood-glucose monitoring alerts are kept as hard regulatory signals
  信号类型：clinical_regulatory
  为什么重要：CGM and blood-glucose monitoring failures affect clinical trust, support burden, and risk messaging.
  影响对象：clinical / sensor / product
  FDA MedWatch Safety Alerts · 2026-05-05 · http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/trividia-health-correction-true-metrix-blood-glucose-monitoring-systems

• openFDA 510(k) clearances add early device-path visibility
  信号类型：clinical_regulatory
  为什么重要：510(k) decisions expose device categories and competitors before they appear in product coverage.
  影响对象：clinical / sensor / market
  openFDA Device 510(k): wearable-relevant clearances · 2026-05-01 · https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K253887

## Platform & API

• Apple HealthKit and WorkoutKit docs are monitored as platform-change sources
  信号类型：platform_api
  为什么重要：data-type, permission, and workout API changes can alter app architecture and roadmap timing.
  影响对象：platform / product
  Apple HealthKit Updates · 2026-05-16 · https://developer.apple.com/documentation/Updates/HealthKit

• Android Health Connect and Health Services docs are monitored as Wear OS health signals
  信号类型：platform_api
  为什么重要：Health Connect schema and Wear OS health-service changes affect Android health data interoperability.
  影响对象：platform / product
  Android Health Connect Release Notes · 2026-05-16 · https://developer.android.com/jetpack/androidx/releases/health-connect

## Product / Market

• Device launches and official vendor updates stay below hard evidence unless they change platform, clinical, or category direction
  信号类型：product_market
  为什么重要：this keeps the digest from becoming a launch-news list.
  影响对象：product / market
  9to5Mac / 9to5Google / official vendor sources · 2026-05-16 · https://9to5mac.com/

## Worth Skimming

• Broader industry news is retained only when it has a wearable, sensor, digital-health, or business-model angle.
  信号类型：business_structure
  为什么重要：funding, partnerships, EHR integration, and reimbursement can matter when tied to wearable adoption.
  影响对象：market / product
  MobiHealthNews · 2026-05-16 · https://www.mobihealthnews.com/

─── 本次运行体检 ───
· feed：local_rss · generatedAt=2026-05-16T12:44:00Z
· RSS：14/22 成功 · API：2/5 成功 · Tavily：0/0 返回条目
· 过滤：黑名单 0 · 关键词 610 · 负向 10 · Tavily 质量 0 · cap 0 · 时间窗 30
· Top Signals：regulatory milestone / regulatory milestone / platform surface change · 分值：4.8 / 4.8 / 3.6
