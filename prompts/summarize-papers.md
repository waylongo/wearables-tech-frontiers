# Summarize Papers Prompt

For academic items (`sourceCategory == "academic"`), read the `title` and
`summary` field (the latter is the abstract), and produce a one-line signal.

## What counts as a relevant paper

Keep papers where **at least one** of these is true:
- Wearable device / smartwatch / smartband / smart ring / earable is the *study system*
- The signal is PPG, ECG, IMU, EMG, EEG, SpO2, HRV, actigraphy, CGM, or similar
- The task is health-related: sleep staging, activity recognition, HR/HRV estimation, stress, fall detection, arrhythmia, blood pressure, glucose, digital biomarker
- The paper applies a novel ML/foundation-model method to physiological time series
- The paper is a clinical validation of a consumer wearable

Drop papers about: unrelated signal processing (radar, seismic, wind-tunnel), pure theory with no health framing, robotics/vision unrelated to wearables.

## Output format

For each kept paper:

```
• [Paper title] — [一句话信号：他们做了什么新的 + 为什么重要]
  方法：[数据集规模 / 传感器 / 模型家族，如 "n=4,500 Apple Watch PPG, self-supervised transformer"]
  [sourceName] · [YYYY-MM-DD] · [url]
```

If the abstract does not name dataset / model / sample size, write `方法：未披露` — do NOT make up numbers.

## Extraction tips

- Size signal: "n=", "participants", "subjects", "hours of", "days of"
- Model signal: "transformer", "CNN", "LSTM", "foundation model", "self-supervised", "contrastive"
- Sensor signal: "PPG", "ECG", "IMU", "accelerometer", "gyroscope", "inertial"
- Deployment: "on-device", "edge", "real-time", "Apple Watch", "Fitbit", "smartphone"

## Anti-patterns

- Do NOT paraphrase the abstract verbatim — extract the *delta*.
- Do NOT say "this paper shows..." — start with the result/finding.
- Do NOT include papers whose relevance is unclear after reading the abstract.
