#!/usr/bin/env python3
"""
Bangla Caption Studio — Whisper worker.

Wraps faster-whisper (https://github.com/SYSTRAN/faster-whisper) to produce
word-level timestamped transcripts for Bangla / English / mixed audio.

Usage:
    python3 whisper_transcribe.py --audio in.wav --lang bn --model medium

Requires:
    pip install faster-whisper

Prints a single JSON object to stdout:
    {
      "segments": [
        {
          "start": 0.0, "end": 2.4, "text": "হ্যালো সবাইকে",
          "words": [{"w": "হ্যালো", "start": 0.0, "end": 0.6}, ...]
        }
      ]
    }
"""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, help="Path to a 16kHz mono WAV file")
    parser.add_argument("--lang", default="bn", help="Language code, e.g. bn / en")
    parser.add_argument("--model", default="medium", help="small | medium | large-v3")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.stderr.write(
            "faster-whisper প্যাকেজ পাওয়া যায়নি। ইনস্টল করুন:\n"
            "    pip install faster-whisper\n"
        )
        sys.exit(1)

    # compute_type="int8" keeps this usable on CPU-only machines;
    # switch to "float16" automatically if a CUDA GPU is available.
    device = "cuda"
    compute_type = "float16"
    try:
        model = WhisperModel(args.model, device=device, compute_type=compute_type)
    except Exception:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")

    segments_iter, _info = model.transcribe(
        args.audio,
        language=args.lang,
        word_timestamps=True,
        vad_filter=True,
    )

    out_segments = []
    for seg in segments_iter:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({"w": w.word.strip(), "start": w.start, "end": w.end})
        out_segments.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "words": words,
        })

    json.dump({"segments": out_segments}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
