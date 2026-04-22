# demo-monitoring-ai-system

Full-stack starter with:

- `frontend`: React (Vite)
- `backend`: Node.js + Express + Mongoose (runs on **port 5000**)
- `ai-service`: Python Flask service for transcription + analysis stubs

## Prereqs

- Node.js 18+ (recommended)
- Python 3.10+
- MongoDB (local or Atlas)

## Quick start

### 1) Backend (port 5000)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Health check: `GET http://localhost:5000/api/health`

### 2) AI service (Flask)

```bash
cd ai-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Health check: `GET http://localhost:7000/health`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

## Microsoft Teams / Graph API integration

The backend includes a `GraphService` placeholder wired behind routes under `GET /api/teams/*`.
To make it fully functional you’ll need to create an Azure AD app registration and set:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

See `docs/GRAPH_SETUP.md`.
