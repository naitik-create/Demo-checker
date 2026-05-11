# Deployment Guide — Ubuntu 24.04 Server
## Demo Monitoring AI System · v3.1.1

**Document Date:** 2026-05-11  
**Target OS:** Ubuntu 24.04 LTS  
**Access:** Internal network (all team members on the same network can use the app)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Install System Dependencies](#step-1--install-system-dependencies)
4. [Step 2 — PostgreSQL Database Setup](#step-2--postgresql-database-setup)
5. [Step 3 — Transfer Code to Server](#step-3--transfer-code-to-server)
6. [Step 4 — Backend Configuration](#step-4--backend-configuration)
7. [Step 5 — AI Service Configuration](#step-5--ai-service-configuration)
8. [Step 6 — Frontend Configuration and Build](#step-6--frontend-configuration-and-build)
9. [Step 7 — Install All Dependencies](#step-7--install-all-dependencies)
10. [Step 8 — Run with PM2 (Process Manager)](#step-8--run-with-pm2-process-manager)
11. [Step 9 — Nginx Reverse Proxy Setup](#step-9--nginx-reverse-proxy-setup)
12. [Step 10 — Firewall Configuration](#step-10--firewall-configuration)
13. [Step 11 — Azure App Registration Update](#step-11--azure-app-registration-update-critical)
14. [Step 12 — Verify the Deployment](#step-12--verify-the-deployment)
15. [Day-to-Day Operations](#day-to-day-operations)
16. [Troubleshooting](#troubleshooting)

---

## 1. Architecture Overview

```
                        Ubuntu 24 Server  (<server-ip>)
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │   Browser → Nginx :80                                   │
  │              │                                          │
  │              ├─ /          → frontend/dist/ (static)    │
  │              ├─ /api/*     → Node.js backend :5000      │
  │              └─ /uploads/  → backend/uploads/ (logos)   │
  │                                                         │
  │   Node.js Backend :5000                                 │
  │              │                                          │
  │              ├─ PostgreSQL :5432 (database)             │
  │              └─ AI Service :7000 (Python Flask)         │
  │                                                         │
  │   AI Service :7000                                      │
  │              └─ Claude Sonnet API (Anthropic)           │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
                         │
              Microsoft Graph API (Teams data)
```

**Services running on the server:**

| Service | Port | Managed by |
|---|---|---|
| Nginx (web server / proxy) | 80 | systemd |
| Node.js backend (Express API) | 5000 (internal) | PM2 |
| Python AI service (Flask) | 7000 (internal) | PM2 |
| PostgreSQL database | 5432 (internal) | systemd |

Only port **80** needs to be open to the network. All other ports are internal.

---

## 2. Prerequisites

**On the Ubuntu server, you need:**
- Ubuntu 24.04 LTS (fresh install or existing)
- SSH access with `sudo` privileges
- Internet access (to install packages and call Anthropic/Microsoft APIs)
- Server IP address on your network (e.g. `10.20.40.x`)

**Credentials you must have ready:**
- Azure App `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (from current `.env`)
- Anthropic API key (`ANTHROPIC_API_KEY`)
- A PostgreSQL password you will create during setup

---

## Step 1 — Install System Dependencies

SSH into the Ubuntu server and run:

```bash
sudo apt update && sudo apt upgrade -y

# Prerequisites
sudo apt install -y curl ca-certificates

# Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v    # should print v20.x.x
npm -v     # should print 10.x.x

# Python 3.12 (default on Ubuntu 24.04 — no extra repo needed)
sudo apt install -y python3.12 python3.12-full python3.12-venv python3-pip

# Verify
python3.12 --version   # should print Python 3.12.x

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Nginx + Git
sudo apt install -y nginx git

# PM2 (Node.js process manager)
sudo npm install -g pm2

# Verify PM2
pm2 -v
```

---

## Step 2 — PostgreSQL Database Setup

```bash
# Switch to the postgres system user
sudo -u postgres psql
```

Inside the PostgreSQL shell, run:

```sql
-- Create a dedicated database user
CREATE USER demoapp WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- Create the database
CREATE DATABASE demo_monitoring OWNER demoapp;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE demo_monitoring TO demoapp;

-- Exit
\q
```

> **Save the password** you set here — you will need it in Step 4.

Verify PostgreSQL is running:

```bash
sudo systemctl status postgresql
# Should show: active (running)
```

---

## Step 3 — Transfer Code to Server

### Option A — Copy from Windows machine (recommended for first deploy)

Run this command from **your Windows machine** in PowerShell or Command Prompt:

```powershell
scp -r "D:\OneDrive - Motadata\AI\Demo check\demo-monitoring-ai-system\demo-monitoring-ai-system" your_user@<server-ip>:/opt/demo-monitoring
```

**Skip these folders** when copying (large, auto-generated):
- `backend/node_modules/`
- `frontend/node_modules/`
- `ai-service/venv/`
- `backend/uploads/` (will be recreated)

If `rsync` is available (faster, skips node_modules automatically):

```bash
# From Windows Git Bash or WSL:
rsync -av --exclude='node_modules' --exclude='venv' --exclude='uploads' \
  "D:/OneDrive - Motadata/AI/Demo check/demo-monitoring-ai-system/demo-monitoring-ai-system/" \
  your_user@<server-ip>:/opt/demo-monitoring/
```

### Option B — Push to Git and clone on server

```bash
# On the server
git clone <your-git-repo-url> /opt/demo-monitoring
```

### Set correct ownership

```bash
sudo chown -R $USER:$USER /opt/demo-monitoring
```

---

## Step 4 — Backend Configuration

Create the backend environment file:

```bash
nano /opt/demo-monitoring/backend/.env
```

Paste and fill in:

```env
PORT=5000
DATABASE_URL=postgresql://demoapp:YOUR_STRONG_PASSWORD_HERE@localhost:5432/demo_monitoring

JWT_SECRET=replace-this-with-a-long-random-string-at-least-64-chars
JWT_EXPIRES_IN=7d

# Azure / Microsoft Teams
AZURE_TENANT_ID=fc4f4c2e-4ff3-4aaa-aa72-a8b487cfd5d6
AZURE_CLIENT_ID=cd99f740-f97d-4317-9d82-afcfc40ae08b
AZURE_CLIENT_SECRET=e6_8Q~ftPH3MCMcym61qnRoeOyoZifiQBCFaAaQP

# *** Replace <server-ip> with your Ubuntu server's IP address ***
AZURE_REDIRECT_URI=http://<server-ip>/api/teams/oauth/callback

AZURE_SCOPE=offline_access User.Read Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All Chat.Read

# Calendar sync window
GRAPH_SYNC_DAYS_PAST=30
GRAPH_SYNC_DAYS_FUTURE=30

# AI service (runs locally on same server)
AI_SERVICE_URL=http://localhost:7000

# *** Replace <server-ip> with your Ubuntu server's IP address ***
FRONTEND_URL=http://<server-ip>
```

> Generate a secure JWT secret with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## Step 5 — AI Service Configuration

Create the AI service environment file:

```bash
nano /opt/demo-monitoring/ai-service/.env
```

```env
# Claude AI (primary analysis engine)
ALLOW_CLAUDE_ANALYSIS=true
ANTHROPIC_API_KEY=sk-ant-api03-...your-key-here...
CLAUDE_MODEL=claude-sonnet-4-6

# OpenAI (optional fallback — leave commented unless you have a key)
# ALLOW_OPENAI_ANALYSIS=true
# OPENAI_API_KEY=sk-...
```

Set up the Python virtual environment:

```bash
cd /opt/demo-monitoring/ai-service
python3.12 -m venv venv
source venv/bin/activate

# Install Python packages (this may take 5–10 minutes)
pip install -r requirements.txt

deactivate
```

> **Note on `torch` + `transformers`:** These packages are ~2 GB and are used for local audio transcription. If your server has **no GPU** and you only use Teams transcripts (not audio file uploads), you can skip them:
> ```bash
> # Edit requirements.txt to remove these two lines before pip install:
> # torch==2.2.2
> # transformers==4.48.3
> ```
> The app will still work fully — Claude handles all analysis, and Teams provides transcripts automatically.

---

## Step 6 — Frontend Configuration and Build

Create the frontend environment file:

```bash
# *** Replace <server-ip> with your Ubuntu server's IP address ***
echo "VITE_BACKEND_URL=http://<server-ip>" > /opt/demo-monitoring/frontend/.env
```

Build the React app:

```bash
cd /opt/demo-monitoring/frontend
npm install
npm run build
```

This creates the `frontend/dist/` folder — a set of static HTML/JS/CSS files that Nginx will serve directly.

> The build step only needs to be repeated when frontend code changes.

---

## Step 7 — Install All Dependencies

```bash
# Backend Node.js dependencies
cd /opt/demo-monitoring/backend
npm install

# Create the uploads directory (for logo files)
mkdir -p /opt/demo-monitoring/backend/uploads
```

The backend auto-creates all database tables on first start (`sequelize.sync({ alter: true })`), so no manual SQL migrations are needed.

---

## Step 8 — Run with PM2 (Process Manager)

PM2 keeps the backend and AI service running in the background and restarts them automatically if they crash or the server reboots.

```bash
# Start the Node.js backend
pm2 start /opt/demo-monitoring/backend/server.js \
  --name demo-backend \
  --cwd /opt/demo-monitoring/backend

# Start the Python AI service
pm2 start "/opt/demo-monitoring/ai-service/venv/bin/python app.py" \
  --name demo-ai \
  --cwd /opt/demo-monitoring/ai-service

# Check both are running
pm2 status
```

Expected output:
```
┌─────┬──────────────┬─────────┬──────┬───────────┬──────────┐
│ id  │ name         │ mode    │ ↺    │ status    │ cpu      │
├─────┼──────────────┼─────────┼──────┼───────────┼──────────┤
│ 0   │ demo-backend │ fork    │ 0    │ online    │ 0%       │
│ 1   │ demo-ai      │ fork    │ 0    │ online    │ 0%       │
└─────┴──────────────┴─────────┴──────┴───────────┴──────────┘
```

Save the PM2 process list and enable auto-start on reboot:

```bash
pm2 save

# This prints a command — copy and run it exactly as printed
pm2 startup
# e.g.: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u youruser --hp /home/youruser
```

---

## Step 9 — Nginx Reverse Proxy Setup

Create the Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/demo-monitoring
```

Paste this configuration (replace `<server-ip>` with your actual server IP):

```nginx
server {
    listen 80;
    server_name <server-ip>;

    # Serve the React frontend (built static files)
    root /opt/demo-monitoring/frontend/dist;
    index index.html;

    # React Router support — all unknown paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy all /api/ requests to the Node.js backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # Allow large file uploads (transcripts, logos)
        client_max_body_size 20M;
    }

    # Serve uploaded logo files
    location /uploads/ {
        alias /opt/demo-monitoring/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

Enable the site and reload Nginx:

```bash
# Enable this site
sudo ln -s /etc/nginx/sites-available/demo-monitoring /etc/nginx/sites-enabled/

# Disable the default Nginx placeholder page
sudo rm -f /etc/nginx/sites-enabled/default

# Test the config for syntax errors
sudo nginx -t

# Apply the configuration
sudo systemctl reload nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx
```

---

## Step 10 — Firewall Configuration

```bash
# Allow SSH (important — do this first so you don't lock yourself out)
sudo ufw allow 22/tcp

# Allow HTTP (port 80 — the app)
sudo ufw allow 80/tcp

# Enable the firewall
sudo ufw enable

# Verify
sudo ufw status
```

Expected output:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
```

> Ports 5000, 7000, and 5432 are **not** opened — they only accept connections from localhost, which is correct.

---

## Step 11 — Azure App Registration Update (CRITICAL)

This step is required for Microsoft Teams OAuth to work from the server. Without it, consultants will get an error when connecting their Teams account.

1. Go to [https://portal.azure.com](https://portal.azure.com)
2. Navigate to: **Azure Active Directory → App registrations → your app**
3. Click **Authentication** in the left menu
4. Under **Redirect URIs**, click **Add URI**
5. Add: `http://<server-ip>/api/teams/oauth/callback`
6. Click **Save**

**Admin Consent (one-time, required for transcripts):**

If not already done, an Azure admin must grant consent for `OnlineMeetingTranscript.Read.All`:

1. Still in the app registration, go to **API permissions**
2. Click **Grant admin consent for [your organization]**
3. Confirm

> Without admin consent on `OnlineMeetingTranscript.Read.All`, Teams meeting transcripts cannot be fetched and no analysis will run.

---

## Step 12 — Verify the Deployment

Run these checks from the server itself or from any machine on the network:

```bash
# 1. Backend health check
curl http://<server-ip>/api/health
# Expected: {"ok":true,...}

# 2. AI service health (from server only, internal port)
curl http://localhost:7000/health
# Expected: {"ok":true,"service":"ai-service"}

# 3. PM2 process status
pm2 status
# Expected: both demo-backend and demo-ai show "online"

# 4. Nginx status
sudo systemctl status nginx
# Expected: active (running)

# 5. PostgreSQL status
sudo systemctl status postgresql
# Expected: active (running)

# 6. Check backend logs for errors
pm2 logs demo-backend --lines 50

# 7. Check AI service logs for errors
pm2 logs demo-ai --lines 50
```

Then open a browser on any machine on the network and go to:
```
http://<server-ip>
```

You should see the login page. Register the first manager account, then log in.

---

## Day-to-Day Operations

### Deploying code updates

```bash
# 1. Copy updated files to the server (or git pull)
# 2. Restart backend (picks up code changes)
pm2 restart demo-backend

# 3. If frontend code changed — rebuild
cd /opt/demo-monitoring/frontend
npm run build

# 4. Nginx serves the new dist/ automatically — no reload needed
```

### Viewing logs

```bash
pm2 logs demo-backend          # backend logs (live)
pm2 logs demo-ai               # AI service logs (live)
pm2 logs demo-backend --lines 200   # last 200 lines
```

### Restarting services

```bash
pm2 restart demo-backend       # restart backend
pm2 restart demo-ai            # restart AI service
pm2 restart all                # restart everything
sudo systemctl restart nginx   # restart Nginx
sudo systemctl restart postgresql  # restart database
```

### Stopping and starting

```bash
pm2 stop demo-backend
pm2 start demo-backend
```

### Checking disk usage (uploads folder grows over time)

```bash
du -sh /opt/demo-monitoring/backend/uploads/
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| App not loading in browser | Nginx not running | `sudo systemctl status nginx` → `sudo systemctl start nginx` |
| "502 Bad Gateway" | Backend not running | `pm2 status` → `pm2 start demo-backend` |
| Login works but API calls fail | Wrong `VITE_BACKEND_URL` in frontend `.env` | Rebuild frontend after fixing `.env` |
| Teams connect button gives error | Azure redirect URI not updated | Add server IP to Azure App redirect URIs (Step 11) |
| Transcripts not loading | Admin consent not granted | Grant admin consent in Azure portal (Step 11) |
| AI analysis stuck / no score | AI service not running or API key wrong | `pm2 logs demo-ai` — check for key errors |
| Database connection error | PostgreSQL not running or wrong password | Check `DATABASE_URL` in backend `.env` |
| Logo not showing after upload | Nginx `/uploads/` alias wrong | Check `alias` path in Nginx config matches actual uploads folder |
| Port 80 blocked | Firewall rule missing | `sudo ufw allow 80/tcp` |

### Useful diagnostic commands

```bash
# Check which process is using port 5000 or 7000
sudo ss -tlnp | grep -E '5000|7000|80'

# Test database connection
sudo -u postgres psql -c "\l"

# Check backend environment is loaded correctly
pm2 env 0    # (0 is demo-backend's PM2 id)

# Watch all logs in real time
pm2 logs
```

---

## Network Access Summary

Once deployed, any device on your office network can access the app at:

```
http://<server-ip>
```

- **Managers** log in and can see all consultants' demos, run analysis, approve accounts
- **Consultants** log in, connect their Teams account, and their meetings are synced and analyzed automatically
- **Teams sync** runs on a schedule — transcripts appear ~5–15 minutes after a meeting ends
- **No VPN required** — as long as the device is on the same network as the server

---

*Generated for Demo Monitoring AI System v3.1.1 — 2026-05-11*
