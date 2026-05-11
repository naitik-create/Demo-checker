#!/bin/bash
# =============================================================================
#  Demo Monitoring AI System — Ubuntu 24.04 Server Setup Script
#  Version: 3.1.1
#  Usage: chmod +x deploy.sh && ./deploy.sh
# =============================================================================

set -e
export DEBIAN_FRONTEND=noninteractive

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${BLUE}${BOLD}▶  $1${NC}"; }
ok()    { echo -e "${GREEN}✔  $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
err()   { echo -e "${RED}✖  $1${NC}"; exit 1; }
ask()   { echo -e "${CYAN}$1${NC}"; }

INSTALL_DIR="/opt/demo-monitoring"

# ── Banner ─────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        Demo Monitoring AI System — Server Setup v3.1.1       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Installs everything needed to run the app on Ubuntu 24.04."
echo ""
warn "Run as a sudo-capable user — NOT as root."
echo ""
read -rp "Press ENTER to continue, or Ctrl+C to cancel..."

# =============================================================================
#  SECTION 1 — Collect configuration
# =============================================================================

echo ""
step "Configuration"
echo ""

# Server IP
ask "1. Server IP address on your network (e.g. 10.20.40.50):"
read -rp "   Server IP: " SERVER_IP
if [[ -z "$SERVER_IP" ]]; then
  err "Server IP is required."
fi

# DB password
ask ""
ask "2. Choose a PostgreSQL database password (min 8 characters):"
while true; do
  read -rsp "   DB Password: " DB_PASS; echo ""
  read -rsp "   Confirm    : " DB_PASS2; echo ""
  if [[ "$DB_PASS" != "$DB_PASS2" ]]; then
    warn "Passwords do not match. Try again."
  elif [[ ${#DB_PASS} -lt 8 ]]; then
    warn "Password must be at least 8 characters."
  else
    break
  fi
done

# Anthropic API key
ask ""
ask "3. Anthropic API key (from console.anthropic.com):"
read -rp "   Anthropic API Key: " ANTHROPIC_KEY
if [[ -z "$ANTHROPIC_KEY" ]]; then
  warn "No Anthropic key entered — AI analysis will not work until you add it."
fi

# torch/transformers
ask ""
ask "4. Install torch + transformers? (~2 GB, only for audio file transcription)"
ask "   Teams transcripts work WITHOUT it. Recommended: N"
read -rp "   Install torch/transformers? [y/N]: " INSTALL_TORCH
INSTALL_TORCH="${INSTALL_TORCH:-N}"

# Confirm
echo ""
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
echo -e "  Server IP     : ${GREEN}${SERVER_IP}${NC}"
echo -e "  DB Password   : ${GREEN}(set)${NC}"
echo -e "  Anthropic Key : ${GREEN}${ANTHROPIC_KEY:0:20}...${NC}"
echo -e "  Install torch : ${GREEN}${INSTALL_TORCH}${NC}"
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
echo ""
read -rp "Looks good? Press ENTER to start, or Ctrl+C to cancel..."

# =============================================================================
#  SECTION 2 — System packages
# =============================================================================

step "Updating system packages"
sudo apt-get update -y
# Use -o flag to prevent service-restart prompts during upgrade
sudo apt-get -o Dpkg::Options::="--force-confdef" \
             -o Dpkg::Options::="--force-confold" \
             upgrade -y
ok "System packages updated"

step "Installing system prerequisites"
sudo apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  build-essential \
  software-properties-common \
  python3-dev \
  git \
  ufw
ok "Prerequisites installed"

# --- Node.js 20 ---
step "Installing Node.js 20"
if node -v 2>/dev/null | grep -q "v20"; then
  ok "Node.js 20 already installed — $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "Node.js installed — $(node -v)"
fi
echo "  node $(node -v)  |  npm $(npm -v)"

# --- Python 3 ---
# Ubuntu 24.04 ships Python 3.12 as default.
# Use unversioned packages — python3-venv on 24.04 correctly includes ensurepip.
step "Installing Python 3"
sudo apt-get install -y python3 python3-full python3-venv python3-pip python3-dev
ok "Python installed — $(python3 --version)"

# --- PostgreSQL ---
step "Installing PostgreSQL"
if systemctl is-active --quiet postgresql 2>/dev/null; then
  ok "PostgreSQL already running"
else
  sudo apt-get install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
  ok "PostgreSQL installed and started"
fi

# --- Nginx ---
step "Installing Nginx"
if systemctl is-active --quiet nginx 2>/dev/null; then
  ok "Nginx already running"
else
  sudo apt-get install -y nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
  ok "Nginx installed and started"
fi

# --- PM2 ---
step "Installing PM2"
if command -v pm2 &>/dev/null; then
  ok "PM2 already installed — $(pm2 -v)"
else
  sudo npm install -g pm2
  ok "PM2 installed — $(pm2 -v)"
fi

# JWT secret — generated after Node.js confirmed installed
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# =============================================================================
#  SECTION 3 — PostgreSQL database
# =============================================================================

step "Setting up PostgreSQL database"

DB_USER_EXISTS=$(sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='demoapp'" 2>/dev/null || echo "")

if [[ "$DB_USER_EXISTS" == "1" ]]; then
  warn "DB user 'demoapp' already exists — updating password."
  sudo -u postgres psql -c "ALTER USER demoapp WITH PASSWORD '$DB_PASS';"
else
  sudo -u postgres psql -c "CREATE USER demoapp WITH PASSWORD '$DB_PASS';"
  ok "Database user 'demoapp' created"
fi

DB_EXISTS=$(sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='demo_monitoring'" 2>/dev/null || echo "")

if [[ "$DB_EXISTS" == "1" ]]; then
  warn "Database 'demo_monitoring' already exists — skipping creation."
else
  sudo -u postgres psql -c "CREATE DATABASE demo_monitoring OWNER demoapp;"
  ok "Database 'demo_monitoring' created"
fi

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE demo_monitoring TO demoapp;"
ok "PostgreSQL ready"

# =============================================================================
#  SECTION 4 — Clone / update repository
# =============================================================================

step "Fetching code (branch: dev / v3.1.1)"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "Repository already exists — pulling latest."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout dev
  git -C "$INSTALL_DIR" pull origin dev
else
  sudo git clone -b dev https://github.com/naitik-create/Demo-checker.git "$INSTALL_DIR"
  sudo chown -R "$USER:$USER" "$INSTALL_DIR"
fi
ok "Code ready at $INSTALL_DIR"

# =============================================================================
#  SECTION 5 — Environment files
# =============================================================================

step "Writing environment files"

cat > "$INSTALL_DIR/backend/.env" <<BACKENDENV
PORT=5000
DATABASE_URL=postgresql://demoapp:${DB_PASS}@localhost:5432/demo_monitoring

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

AZURE_TENANT_ID=fc4f4c2e-4ff3-4aaa-aa72-a8b487cfd5d6
AZURE_CLIENT_ID=cd99f740-f97d-4317-9d82-afcfc40ae08b
AZURE_CLIENT_SECRET=e6_8Q~ftPH3MCMcym61qnRoeOyoZifiQBCFaAaQP
AZURE_REDIRECT_URI=http://localhost/api/teams/oauth/callback
AZURE_SCOPE=offline_access User.Read Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All Chat.Read

GRAPH_SYNC_DAYS_PAST=30
GRAPH_SYNC_DAYS_FUTURE=30

AI_SERVICE_URL=http://localhost:7000
FRONTEND_URL=http://${SERVER_IP}
BACKENDENV
ok "backend/.env written"

cat > "$INSTALL_DIR/ai-service/.env" <<AIENV
ALLOW_CLAUDE_ANALYSIS=true
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
CLAUDE_MODEL=claude-sonnet-4-6
AIENV
ok "ai-service/.env written"

echo "VITE_BACKEND_URL=http://${SERVER_IP}" > "$INSTALL_DIR/frontend/.env"
ok "frontend/.env written"

# =============================================================================
#  SECTION 6 — Backend Node.js dependencies
# =============================================================================

step "Installing backend Node.js dependencies"
cd "$INSTALL_DIR/backend"
npm install
mkdir -p "$INSTALL_DIR/backend/uploads"
ok "Backend dependencies installed"

# =============================================================================
#  SECTION 7 — Python AI service virtual environment
# =============================================================================

step "Setting up Python virtual environment"
cd "$INSTALL_DIR/ai-service"

# Always remove and recreate to ensure a clean venv
if [[ -d "venv" ]]; then
  warn "Removing existing venv to ensure clean state."
  rm -rf venv
fi

python3 -m venv venv
ok "Virtual environment created"

# Verify activate script exists before sourcing
if [[ ! -f "venv/bin/activate" ]]; then
  err "venv/bin/activate not found — python3-venv may not be installed correctly."
fi

# shellcheck disable=SC1091
source venv/bin/activate

step "Installing Python packages"
if [[ "${INSTALL_TORCH,,}" != "y" ]]; then
  warn "Skipping torch + transformers — Teams transcripts still work fine"
  grep -v -E "^torch|^transformers" requirements.txt > /tmp/requirements_lite.txt
  pip install --upgrade pip
  pip install -r /tmp/requirements_lite.txt
else
  warn "Installing torch (~2 GB) — this may take 10+ minutes"
  pip install --upgrade pip
  pip install -r requirements.txt
fi

deactivate
ok "AI service Python environment ready"

# =============================================================================
#  SECTION 8 — Frontend build
# =============================================================================

step "Installing frontend dependencies"
cd "$INSTALL_DIR/frontend"
npm install
ok "Frontend dependencies installed"

step "Building React app (1–2 minutes)"
npm run build
ok "Frontend built → frontend/dist/"

# =============================================================================
#  SECTION 9 — Nginx
# =============================================================================

step "Configuring Nginx"
sudo tee /etc/nginx/sites-available/demo-monitoring > /dev/null <<NGINXCONF
server {
    listen 80;
    server_name ${SERVER_IP};

    root ${INSTALL_DIR}/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 20M;
    }

    location /uploads/ {
        alias ${INSTALL_DIR}/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
NGINXCONF

sudo ln -sf \
  /etc/nginx/sites-available/demo-monitoring \
  /etc/nginx/sites-enabled/demo-monitoring

sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
ok "Nginx configured and reloaded"

# =============================================================================
#  SECTION 10 — Firewall
# =============================================================================

step "Configuring UFW firewall"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
ok "Firewall active — port 22 (SSH) and 80 (HTTP) open"

# =============================================================================
#  SECTION 11 — PM2 process manager
# =============================================================================

step "Starting services with PM2"

# Stop any existing instances (safe — || true prevents set -e exit if not found)
pm2 delete demo-backend 2>/dev/null || true
pm2 delete demo-ai      2>/dev/null || true

# Start Node.js backend
pm2 start "$INSTALL_DIR/backend/server.js" \
  --name demo-backend \
  --cwd  "$INSTALL_DIR/backend"

# Start Python AI service — script is app.py, interpreter is venv python3
pm2 start "$INSTALL_DIR/ai-service/app.py" \
  --name demo-ai \
  --cwd  "$INSTALL_DIR/ai-service" \
  --interpreter "$INSTALL_DIR/ai-service/venv/bin/python3"

pm2 save
ok "Processes started and saved"

# Register PM2 to auto-start after server reboot
# Wrapped in || true so a non-critical failure doesn't stop the deploy
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" || \
  warn "PM2 auto-start setup failed — rerun manually: sudo env PATH=\$PATH pm2 startup systemd -u $USER --hp $HOME"

# =============================================================================
#  SECTION 12 — Health checks
# =============================================================================

step "Waiting 12 seconds for services to initialise..."
sleep 12

echo ""
PASS=0
FAIL=0

if curl -sf http://localhost:5000/api/health > /dev/null 2>&1; then
  ok "Backend        PASSED"
  PASS=$((PASS+1))
else
  warn "Backend        FAILED — check: pm2 logs demo-backend"
  FAIL=$((FAIL+1))
fi

if curl -sf http://localhost:7000/health > /dev/null 2>&1; then
  ok "AI service     PASSED"
  PASS=$((PASS+1))
else
  warn "AI service     FAILED — check: pm2 logs demo-ai"
  FAIL=$((FAIL+1))
fi

if curl -sf http://localhost > /dev/null 2>&1; then
  ok "Nginx/Frontend PASSED"
  PASS=$((PASS+1))
else
  warn "Nginx/Frontend FAILED — check: sudo nginx -t"
  FAIL=$((FAIL+1))
fi

# =============================================================================
#  DONE
# =============================================================================

echo ""
if [[ $PASS -eq 3 ]]; then
  echo -e "${GREEN}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║           ✔  All 3 services running. Setup complete!         ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
else
  echo -e "${YELLOW}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║     ⚠  Setup done but ${FAIL}/3 health check(s) failed.         ║"
  echo "║        Check the warnings above and review PM2 logs.         ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
fi

echo -e "  App URL  : ${BOLD}http://${SERVER_IP}${NC}"
echo -e "  Login    : username = ${BOLD}admin${NC}  |  password = ${BOLD}M@t@d@t@${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    ${CYAN}pm2 status${NC}                — check running services"
echo -e "    ${CYAN}pm2 logs demo-backend${NC}     — backend logs"
echo -e "    ${CYAN}pm2 logs demo-ai${NC}          — AI service logs"
echo -e "    ${CYAN}pm2 restart all${NC}           — restart everything"
echo ""
echo -e "${YELLOW}${BOLD}─── AZURE PORTAL — 2 manual steps required ─────────────────────${NC}"
echo ""
echo -e "  1. Add Redirect URI in App Registration → Authentication:"
echo -e "     ${BOLD}http://${SERVER_IP}/api/teams/oauth/callback${NC}"
echo ""
echo -e "  2. Grant admin consent in App Registration → API permissions"
echo ""
pm2 status
