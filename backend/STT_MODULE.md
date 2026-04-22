# Speech-to-Text Meeting Module (No Teams Transcript Dependency)

This module adds audio-based transcription using Azure Speech-to-Text and PostgreSQL.

## Endpoints

- `POST /api/stt/start-meeting`
  - Body: `{ "employee_id": "E123" }`
  - Returns: `{ meeting_id, employee_id, created_at }`

- `POST /api/stt/upload-audio`
  - Multipart form-data:
    - `meeting_id`: UUID from start-meeting
    - `audio`: file (`.mp3`, `.mp4`, `.wav`, `.m4a`)
    - optional `locale` (default `en-US`)
  - Auto-transcribes by default (`STT_AUTO_TRANSCRIBE=true`)

- `POST /api/stt/upload-audio/:meetingId`
  - Same as above, with meeting ID in URL

- `GET /api/stt/transcript/:meetingId`
  - Returns transcript and meeting metadata

## PostgreSQL schema

Run:

```sql
\i backend/sql/stt_meetings_schema.sql
```

Table created:

- `meetings (id, employee_id, audio_path, transcript, created_at)`

## Required environment variables

- `POSTGRES_URI=postgres://user:pass@host:5432/dbname`
- `POSTGRES_SSL=false`
- `AZURE_SPEECH_KEY=...`
- `AZURE_SPEECH_REGION=...`

Optional:

- `STT_AUTO_TRANSCRIBE=true`
- `STT_MAX_UPLOAD_BYTES=262144000`

## Notes

- This module does **not** use Teams/Google transcript APIs.
- For non-WAV formats, Azure SDK runtime support can require host media dependencies.
- If auto-transcribe is disabled, upload stores audio and you can process asynchronously later.

