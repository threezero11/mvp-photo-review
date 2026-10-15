# AI image detector attribution and limits

Model: Thermostatic/community-forensics-frontier-detector-2026-08 (MIT).
Source: https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08
Based on OwensLab/commfor-model-384 and Community Forensics by Jeongsoo Park and Andrew Owens.
This is an independently fine-tuned model, not an official OwensLab release.

ONNX SHA-256: d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d
Runtime: Microsoft ONNX Runtime Web, MIT (see ../ONNX_RUNTIME_LICENSE.txt).

Input: RGB, short edge 440, bilinear resize, center crop 384, ImageNet normalization.
Output: single raw logit. Calibrated score = sigmoid(raw_logit - 0.7403357915937764).
Published decision threshold: 0.65. App also shows an uncertain band from 0.35 to 0.65.
Thresholds are screening choices and are not validated specifically for secondhand listings.

The model classifies whole-image AI generation. It does not locate edited regions or prove scratches were hidden.
It can misclassify real photos and AI photos. Small synthetic regions, severe compression and low resolution are documented weaknesses.
The author's validation report has failed robustness gates; published development metrics are not an independent test or this app's accuracy.
Our generated camera image is a smoke test, not a benchmark. Browser canvas resizing can differ from the author's reference pipeline.
Do not use scores as sole evidence of fraud or as a condition/real-photo certification.
