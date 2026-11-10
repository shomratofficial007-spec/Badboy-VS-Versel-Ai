from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "validate-wakeword-model.py"
SPEC = importlib.util.spec_from_file_location("validate_wakeword_model", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

VALID_METADATA = {
    "output": {"shape": [1], "dtype": "float32", "raw_value": "logit", "activation": "sigmoid"}
}


class FakeInterpreter:
    input_details = [{"shape": np.array([1, 40, 101]), "dtype": np.float32, "index": 0}]
    output_details = [{"shape": np.array([1]), "dtype": np.float32, "index": 1}]
    outputs = [np.array([1.0], dtype=np.float32), np.array([-1.0], dtype=np.float32)]

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.invocations = 0

    def allocate_tensors(self):
        return None

    def get_input_details(self):
        return self.input_details

    def get_output_details(self):
        return self.output_details

    def set_tensor(self, index, features):
        self.last_input = (index, features)

    def invoke(self):
        self.invocations += 1

    def get_tensor(self, index):
        return self.outputs[self.invocations - 1]


class ValidateWakeWordModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.model = pathlib.Path(self.temp.name) / "wake.tflite"
        self.model.write_bytes(b"fake-model")
        self.metadata = VALID_METADATA
        FakeInterpreter.input_details = [{"shape": np.array([1, 40, 101]), "dtype": np.float32, "index": 0}]
        FakeInterpreter.output_details = [{"shape": np.array([1]), "dtype": np.float32, "index": 1}]
        FakeInterpreter.outputs = [np.array([1.0], dtype=np.float32), np.array([-1.0], dtype=np.float32)]
        self.original_read_text = pathlib.Path.read_text

    def tearDown(self):
        self.temp.cleanup()

    def run_main(self, model_path=None):
        output = io.StringIO()

        def read_text(path, *args, **kwargs):
            if path.as_posix() == "models/hey-badboy/wake.json":
                return json.dumps(self.metadata)
            return self.original_read_text(path, *args, **kwargs)

        with patch.object(MODULE, "Interpreter", FakeInterpreter), \
             patch.object(pathlib.Path, "read_text", read_text), \
             patch.object(sys, "argv", [str(SCRIPT), str(model_path or self.model)]), \
             contextlib.redirect_stdout(output):
            result = MODULE.main()
        return result, output.getvalue()

    def assert_invalid(self, expected):
        with self.assertRaises(SystemExit) as raised:
            self.run_main()
        self.assertIn(expected, str(raised.exception))

    def test_missing_model_fails_before_interpreter_creation(self):
        with self.assertRaises(SystemExit) as raised:
            self.run_main(pathlib.Path(self.temp.name) / "missing.tflite")
        self.assertIn("Wake-word model not found", str(raised.exception))

    def test_requires_exactly_one_input(self):
        FakeInterpreter.input_details = [{}, {}]
        self.assert_invalid("Expected one model input")

    def test_requires_exactly_one_output(self):
        FakeInterpreter.output_details = [{}, {}]
        self.assert_invalid("Expected one model output")

    def test_rejects_invalid_metadata_shape(self):
        self.metadata = {"output": {"shape": [2], "dtype": "float32"}}
        self.assert_invalid("Invalid wake.json output contract")

    def test_rejects_invalid_metadata_dtype(self):
        self.metadata = {"output": {"shape": [1], "dtype": "float64"}}
        self.assert_invalid("Invalid wake.json output contract")

    def test_rejects_invalid_metadata_raw_value(self):
        self.metadata = {"output": {"shape": [1], "dtype": "float32", "raw_value": "probability", "activation": "sigmoid"}}
        self.assert_invalid("Invalid wake.json output semantics")

    def test_rejects_invalid_metadata_activation(self):
        self.metadata = {"output": {"shape": [1], "dtype": "float32", "raw_value": "logit", "activation": "softmax"}}
        self.assert_invalid("Invalid wake.json output semantics")

    def test_rejects_wrong_input_shape(self):
        FakeInterpreter.input_details = [{"shape": np.array([1, 40, 100]), "dtype": np.float32, "index": 0}]
        self.assert_invalid("Unexpected input shape")

    def test_rejects_wrong_input_dtype(self):
        FakeInterpreter.input_details = [{"shape": np.array([1, 40, 101]), "dtype": np.float64, "index": 0}]
        self.assert_invalid("Unexpected input dtype")

    def test_rejects_wrong_output_dtype(self):
        FakeInterpreter.output_details = [{"shape": np.array([1]), "dtype": np.float64, "index": 1}]
        self.assert_invalid("Unexpected output dtype")

    def test_rejects_output_shape_that_disagrees_with_metadata(self):
        FakeInterpreter.output_details = [{"shape": np.array([2]), "dtype": np.float32, "index": 1}]
        self.assert_invalid("Unexpected output shape")

    def test_rejects_non_finite_inference_result(self):
        FakeInterpreter.outputs = [np.array([np.nan], dtype=np.float32), np.array([0.0], dtype=np.float32)]
        self.assert_invalid("Inference produced an invalid output")

    def test_rejects_inference_result_with_more_than_one_value(self):
        FakeInterpreter.outputs = [np.array([0.1, 0.2], dtype=np.float32), np.array([0.0], dtype=np.float32)]
        self.assert_invalid("Inference produced an invalid output")

    def test_runs_two_realistic_tensor_invocations_and_reports_stable_sigmoid(self):
        result, output = self.run_main()
        self.assertEqual(result, 0)
        self.assertIn("silence-like features", output)
        self.assertIn("deterministic feature noise", output)
        self.assertIn("sigmoid_probability=0.731059", output)
        self.assertIn("sigmoid_probability=0.268941", output)
        self.assertIn("real TFLite CPU inference completed", output)


if __name__ == "__main__":
    unittest.main()
