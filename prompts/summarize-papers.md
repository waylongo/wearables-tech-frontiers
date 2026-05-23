# Summarize Papers Prompt

Use this prompt for `sourceCategory == "academic"` items. Read only `title` and
`summary`.

## Keep / Drop

Keep papers where the study system, signal, method, or validation target is
clearly wearable or sports-health related:

- wearables, smartwatches, smart rings, smartbands, earables
- PPG, ECG, IMU, EMG, EEG, SpO2, HRV, actigraphy, CGM, BP, sleep, recovery
- activity recognition, stress, falls, arrhythmia, glucose, digital biomarkers
- physiological time-series ML, foundation models, self-supervised learning
- clinical validation of consumer or body-worn devices

Drop unrelated signal processing, pure theory without a health/wearable frame,
robotics/vision-only work, and papers whose wearable relevance is unclear.

## Output

```text
• [Paper title] — [one-line signal: what is new]
  Summary: [2-3 sentences: study goal, method/data/sensor/model when stated, and the main result or deployment implication. Use only `summary`; write `not specified` for missing details.]
  Signal type: algorithm_evidence
  Why it matters: [why this changes evidence, model choice, dataset assumptions, or validation strategy]
  Affected area: [algorithm / sensor / clinical]
  Method: [sample size / sensor / model family, or undisclosed]
  [sourceName] · [YYYY-MM-DD] · [url]
```

Write `Method: undisclosed` when the abstract does not name dataset size,
sensor, model, or sample size. Do not make up numbers.

Extract concrete deltas; do not paraphrase the abstract sentence by sentence.
The summary should be self-contained enough that the reader understands the
paper's core contribution without opening the URL.
