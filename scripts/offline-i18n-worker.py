"""Local JSON-lines worker. It never downloads models or sends text online."""
import json
import os
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sentence_parts(text, token_count, limit=384, language="en"):
    """Split only at sentence/semicolon boundaries, never cut or truncate words."""
    import pysbd
    sentences = pysbd.Segmenter(language=language, clean=False).segment(text)
    # These models are sentence models. Passing a whole short paragraph can
    # silently omit its later sentences even when it fits the token limit.
    parts = [part.strip() for sentence in sentences for part in (
        re.split(r'(?<=;)\s+', sentence) if token_count(sentence) > limit else [sentence]) if part.strip()]
    normalize = lambda value: " ".join(value.split())
    if not parts or normalize(" ".join(parts)) != normalize(text) or any(token_count(part) > limit for part in parts):
        return None
    return parts


def main():
    import ctranslate2
    import sentencepiece
    from opencc import OpenCC
    reverse = "--reverse" in sys.argv[2:]
    models = json.loads((ROOT / ("tmp/offline-i18n/reverse-models.json" if reverse else "tmp/offline-i18n/models.json")).read_text(encoding="utf-8"))
    language = sys.argv[1]
    spec = models[language]
    model_path = (ROOT / spec["modelDirectory"]).resolve()
    tokenizer_path = (ROOT / spec["tokenizer"]).resolve()
    model_root = (ROOT / "tmp/offline-i18n/models").resolve()
    if not model_path.is_relative_to(model_root) or not tokenizer_path.is_relative_to(model_root):
        raise ValueError("Model must be a locally installed, project-scoped artifact")
    if spec.get("tokenizerKind") == "bpe":
        from sacremoses import MosesTokenizer, MosesDetokenizer, MosesPunctNormalizer
        from subword_nmt.apply_bpe import BPE
        source_code, target_code = spec["fromCode"], spec["toCode"]
        moses = MosesTokenizer(source_code)
        normalizer = MosesPunctNormalizer(source_code)
        detokenizer = MosesDetokenizer(target_code)
        with tokenizer_path.open(encoding="utf-8") as codes:
            bpe = BPE(codes)
        encode = lambda value: bpe.segment_tokens(moses.tokenize(normalizer.normalize(value)))
        decode = lambda tokens: detokenizer.detokenize(" ".join(tokens).replace("@@ ", "").split(" "))
    else:
        tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(tokenizer_path))
        encode = lambda value: tokenizer.encode(value, out_type=str)
        decode = lambda tokens: tokenizer.decode_pieces(tokens).replace("\u2581", " ")
    chinese = None if reverse else OpenCC('s2twp') if language == 'zh-TW' else OpenCC('t2s') if language == 'zh-CN' else None
    # Pysbd has no Portuguese rules. Its Latin punctuation segmenter is used
    # with the same exact-source reconstruction and no-truncation guards.
    segmentation_language = {"zh-CN": "zh", "zh-TW": "zh", "pt": "en"}.get(language, language) if reverse else "en"
    threads = int(os.environ.get("UPFOREX_OFFLINE_THREADS", "4"))
    if not 1 <= threads <= 8:
        raise ValueError("Local worker threads must be between 1 and 8")
    translator = ctranslate2.Translator(str(model_path), device="cpu", compute_type="int8", intra_threads=threads, inter_threads=1)
    memory = {}
    for line in sys.stdin:
        request = json.loads(line)
        texts = request["texts"]
        if len(texts) > 256 or any(not isinstance(text, str) for text in texts):
            raise ValueError("Invalid local translation batch")
        plans = [sentence_parts(text, lambda part: len(encode(part)), language=segmentation_language) for text in texts]
        # Deduplicate exact text fragments within and across requests. This is
        # generation memory, never evidence of a semantic review/publication.
        pending = list(dict.fromkeys(part for parts in plans if parts for part in parts if part not in memory))
        if pending:
            outputs = translator.translate_batch([encode(part) for part in pending], beam_size=4,
                replace_unknowns=True, max_batch_size=1024, batch_type="tokens", length_penalty=0.2,
                max_input_length=0, max_decoding_length=1024)
            for source, result in zip(pending, outputs):
                text = unescape(decode(result.hypotheses[0]).strip())
                memory[source] = None if len(result.hypotheses[0]) >= 1024 else chinese.convert(text) if chinese else text
        values = [" ".join(memory[part] for part in parts) if parts and all(memory[part] for part in parts) else None for parts in plans]
        if len(memory) > 50000:
            memory.clear()
        print(json.dumps({"translations": values}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    main()
