"""Local generation safeguards; no model loading, download or paid request."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("offline_worker", Path(__file__).with_name("offline-i18n-worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class SentencePreservationTests(unittest.TestCase):
    def test_short_financial_paragraph_is_not_sent_to_model_as_one_sentence(self):
        source = "The Standard account requires $100. UPFOREX publishes $1,000 for Pro-ECN and $5,000 for Elite-ECN. All three accounts are denominated in USD."
        parts = worker.sentence_parts(source, len)
        self.assertEqual(len(parts), 3)
        self.assertEqual(" ".join(parts), source)

    def test_decimal_and_ratio_stay_inside_original_sentence(self):
        source = "Maximum leverage is 1:300 with a minimum of 0.01 lots."
        self.assertEqual(worker.sentence_parts(source, len), [source])

    def test_company_abbreviation_does_not_create_a_false_sentence(self):
        source = "UP Global Markets Ltd. provides services. Read the risk disclosure."
        self.assertEqual(worker.sentence_parts(source, len), ["UP Global Markets Ltd. provides services.", "Read the risk disclosure."])

    def test_unsplittable_long_source_is_held_instead_of_truncated(self):
        self.assertIsNone(worker.sentence_parts("word " * 1000, len, 90))


if __name__ == "__main__":
    unittest.main(verbosity=2)
