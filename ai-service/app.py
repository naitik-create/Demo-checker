import os
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load .env from ai-service directory
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

from transcription import transcribe_audio_bytes
from analysis import analyze_transcript


app = Flask(__name__)
CORS(app)


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "ai-service"})


@app.post("/transcribe")
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "Missing multipart form field 'file'"}), 400

    f = request.files["file"]
    audio_bytes = f.read()
    result = transcribe_audio_bytes(audio_bytes)
    return jsonify({"ok": True, "transcript": result.get("text", ""), "transcription": result})


@app.post("/analyze")
def analyze():
    body = request.get_json(silent=True) or {}
    transcript_text = body.get("transcript") or body.get("text") or ""
    result = analyze_transcript(transcript_text)
    return jsonify({"ok": True, "analysis": result})


if __name__ == "__main__":
    # Keep separate from backend's :5000
    app.run(host="0.0.0.0", port=7000, debug=True)

