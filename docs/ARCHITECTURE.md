## Architecture

### Services

- **Frontend (React/Vite)**: UI to trigger monitoring workflows and view results.
- **Backend (Express)**: API gateway + orchestration.
  - Connects to **MongoDB** via **Mongoose**
  - Integrates with **Microsoft Graph API** for Teams meetings
  - Calls **AI service** for transcription/analysis
- **AI service (Flask)**: isolated Python service for model-dependent work.

### Local ports

- **Backend**: `http://localhost:5000`
- **AI service**: `http://localhost:7000`
- **Frontend**: `http://localhost:5173`

### Data flow (intended)

1. Frontend calls backend to fetch meetings / start monitoring.
2. Backend calls Graph API to locate meetings and assets.
3. Backend stores meeting metadata in MongoDB.
4. Backend sends audio/transcripts to AI service.
5. AI service returns transcription + analysis results.
6. Backend persists results, frontend displays dashboards.
