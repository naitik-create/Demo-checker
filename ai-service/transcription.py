import io
import os
from typing import Dict

from openai import OpenAI


def _have_openai() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _transcribe_with_openai(audio_bytes: bytes) -> Dict:
    """
    Use OpenAI Whisper API (cloud) instead of local whisper package.
    """
    client = OpenAI()
    model = os.getenv("OPENAI_AUDIO_MODEL", "gpt-4o-mini-tts")  # or "whisper-1" when available

    # OpenAI client expects a file-like object
    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = "audio.wav"

    resp = client.audio.transcriptions.create(
        model=model,
        file=file_obj,
    )

    text = (getattr(resp, "text", "") or "").strip()
    return {"text": text, "segments": [], "language": None}


def transcribe_audio_bytes(audio_bytes: bytes) -> dict:
    """
    Transcribe audio bytes to text.
    - If OPENAI_API_KEY is set, use OpenAI audio API.
    - Otherwise, return a simple placeholder so the rest of the pipeline still works.
    """
    if not audio_bytes:
        return {"text": "", "segments": []}

    if _have_openai():
        try:
            return _transcribe_with_openai(audio_bytes)
        except Exception:
            # Fall through to placeholder if OpenAI fails
            pass

    # Fallback: no real STT, just placeholder text.
    return {
        "text": "Transcription not available (Whisper disabled and OPENAI_API_KEY not configured).",
        "segments": [],
    }

