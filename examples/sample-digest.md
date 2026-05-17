# Sample Digest Output

This example shows the default English digest structure. It uses only central
feed items and does not include runtime search.

---

Wearables Tech Frontiers — 2026-05-16
Past 30 days · 913 raw items -> blacklist -0 -> keywords -646 -> date window -30 -> 237 kept -> 12 selected

## Top Signals

★ FDA MedWatch flags TRUE METRIX blood-glucose monitoring risk
  FDA safety communication and recall-related MedWatch alerts point to a live glucose-monitoring quality issue.
  Signal type: clinical_regulatory
  Scarcity: regulatory milestone (quarterly) · score 4.8
  Affected area: clinical / sensor / product
  FDA MedWatch Safety Alerts · 2026-05-05 · http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/trividia-health-correction-true-metrix-blood-glucose-monitoring-systems

★ FDA clears nasal alar SpO2 sensor through 510(k)
  A pulse-oximetry sensor clearance is a concrete signal for respiratory and perioperative monitoring hardware.
  Signal type: clinical_regulatory
  Scarcity: regulatory milestone (quarterly) · score 4.8
  Affected area: sensor / clinical
  openFDA Device 510(k): wearable-relevant clearances · 2026-05-01 · https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K253887

★ Health platform changelogs are now first-class feed sources
  Apple HealthKit / WorkoutKit and Android Health Connect / Health Services docs are monitored centrally as platform API signals.
  Signal type: platform_api
  Scarcity: platform surface change (monthly) · score 3.6
  Affected area: platform / product
  Apple HealthKit Updates + Android Health Connect Release Notes · 2026-05-16 · https://developer.apple.com/documentation/Updates/HealthKit

## Algorithm & Evidence

• ECG and PPG papers remain grouped as evidence, not mixed into product news
  Signal type: algorithm_evidence
  Why it matters: validation methods, datasets, and sensor assumptions are easier to scan before product decisions.
  Affected area: algorithm / sensor
  arXiv eess.SP · 2026-05-16 · https://arxiv.org/list/eess.SP/recent

## Clinical / Regulatory

• Blood-glucose monitoring alerts are kept as hard regulatory signals
  Signal type: clinical_regulatory
  Why it matters: CGM and blood-glucose monitoring failures affect clinical trust, support burden, and risk messaging.
  Affected area: clinical / sensor / product
  FDA MedWatch Safety Alerts · 2026-05-05 · http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/trividia-health-correction-true-metrix-blood-glucose-monitoring-systems

• openFDA 510(k) clearances add early device-path visibility
  Signal type: clinical_regulatory
  Why it matters: 510(k) decisions expose device categories and competitors before they appear in product coverage.
  Affected area: clinical / sensor / market
  openFDA Device 510(k): wearable-relevant clearances · 2026-05-01 · https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K253887

## Platform & API

• Apple HealthKit and WorkoutKit docs are monitored as platform-change sources
  Signal type: platform_api
  Why it matters: data-type, permission, and workout API changes can alter app architecture and roadmap timing.
  Affected area: platform / product
  Apple HealthKit Updates · 2026-05-16 · https://developer.apple.com/documentation/Updates/HealthKit

• Android Health Connect and Health Services docs are monitored as Wear OS health signals
  Signal type: platform_api
  Why it matters: Health Connect schema and Wear OS health-service changes affect Android health data interoperability.
  Affected area: platform / product
  Android Health Connect Release Notes · 2026-05-16 · https://developer.android.com/jetpack/androidx/releases/health-connect

## Product / Market

• Device launches and official vendor updates stay below hard evidence unless they change platform, clinical, or category direction
  Signal type: product_market
  Why it matters: this keeps the digest from becoming a launch-news list.
  Affected area: product / market
  9to5Mac / 9to5Google / official vendor sources · 2026-05-16 · https://9to5mac.com/

## Worth Skimming

• Broader industry news is retained only when it has a wearable, sensor, digital-health, or business-model angle.
  Signal type: business_structure
  Why it matters: funding, partnerships, EHR integration, and reimbursement can matter when tied to wearable adoption.
  Affected area: market / product
  MobiHealthNews · 2026-05-16 · https://www.mobihealthnews.com/

--- Run Healthcheck ---
feed: local_rss · generatedAt=2026-05-16T12:44:00Z
RSS: 14/22 with results · API: 2/5 with results · Tavily: 0/0 with results
filters: blacklist 0 · keyword 610 · source exclude 10 · Tavily quality 0 · cap 0 · date 30
Top Signals: regulatory milestone / regulatory milestone / platform surface change · scores: 4.8 / 4.8 / 3.6
