#!/usr/bin/env python3
"""Run the committed Hey Badboy TFLite model through a real CPU inference runtime."""

from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np
from tflite_runtime.interpreter import Interpreter


def main() -> int:
    model_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/mobile/modules/badboy-wakeword/android/src/main/assets/wake.tflite")
    if not model_path.is_file():
        raise SystemExit(f"Wake-word model not found: {model_path}")

    interpreter = Interpreter(model_path=str(model_path), num_threads=2)
    interpreter.allocate_tensors()

    inputs = interpreter.get_input_details()
    outputs = interpreter.get_output_details()
    if len(inputs) != 1:
        raise SystemExit(f"Expected one model input, found {len(inputs)}")
    if len(outputs) != 1:
        raise SystemExit(f"Expected one model output, found {len(outputs)}")

    metadata_path = pathlib.Path("models/hey-badboy/wake.json")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    expected_output = metadata.get("output", {})
    if expected_output.get("shape") != [1] or expected_output.get("dtype") != "float32":
        raise SystemExit(f"Invalid wake.json output contract: {expected_output!r}")
    if expected_output.get("raw_value") != "logit" or expected_output.get("activation") != "sigmoid":
        raise SystemExit(f"Invalid wake.json output semantics: {expected_output!r}")

    input_detail = inputs[0]
    output_detail = outputs[0]
    input_shape = tuple(int(value) for value in input_detail["shape"])
    output_shape = tuple(int(value) for value in output_detail["shape"])
    if input_shape != (1, 40, 101):
        raise SystemExit(f"Unexpected input shape: {input_shape}; expected (1, 40, 101)")
    if input_detail["dtype"] != np.float32:
        raise SystemExit(f"Unexpected input dtype: {input_detail['dtype']}; expected float32")
    if output_detail["dtype"] != np.float32:
        raise SystemExit(f"Unexpected output dtype: {output_detail['dtype']}; expected float32")

    if output_shape != tuple(expected_output["shape"]):
        raise SystemExit(f"Unexpected output shape: {output_shape}; wake.json specifies {expected_output['shape']}")

    rng = np.random.default_rng(20261110)
    test_inputs = (
        ("silence-like features", np.zeros(input_shape, dtype=np.float32)),
        ("deterministic feature noise", rng.normal(0.0, 0.05, input_shape).astype(np.float32)),
    )
    for label, features in test_inputs:
        interpreter.set_tensor(int(input_detail["index"]), features)
        interpreter.invoke()
        result = interpreter.get_tensor(int(output_detail["index"]))
        if result.size != 1 or not np.isfinite(result).all():
            raise SystemExit(f"Inference produced an invalid output for {label}: {result!r}")
        logit = float(result.reshape(-1)[0])
        probability = 1.0 / (1.0 + math.exp(-logit)) if logit >= 0 else math.exp(logit) / (1.0 + math.exp(logit))
        print(f"PASS: {label}; input={input_shape}; output={output_shape}; logit={logit:.6f}; sigmoid_probability={probability:.6f}")

    print(f"PASS: real TFLite CPU inference completed for {model_path} ({model_path.stat().st_size} bytes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
