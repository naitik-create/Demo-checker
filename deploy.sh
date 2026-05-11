#!/bin/bash
# =============================================================================
#  Demo Monitoring AI System — Ubuntu 24.04 Server Setup Script
#  Version: 3.1.1
#  Run this once on a fresh Ubuntu 24.04 LTS server as a sudo-capable user.
#  Usage:  chmod +x deploy.sh && ./deploy.sh
# =============================================================================

set -e   # exit immediately if any command fails

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

# ── Helpers ───────────────────────────────────────────────────────────────────
step()  { echo -e "\n${BLUE}${BOLD}▶  $1${NC}"; }
ok()    { echo -e "${GREEN}✔  $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
error() { echo -e "${RED}✖  $1${NC}"; exit 1; }
ask()   { echo -e "${CYAN}$1${NC}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        Demo Monitoring AI System — Server Setup v3.1.1       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "This script will install and configure everything needed to run"
echo "the Demo Monitoring AI System on this Ubuntu 24.04 server."
echo ""
warn "Run this as a user with sudo privileges (NOT as root)."
echo ""
read -rp "Press ENTER to continue, or Ctrl+C to cancel..."

# =============================================================================
#  SECTION 1 — Collect configuration from the user
# =============================================================================

echo ""
step "Configuration — please answer the following questions"
echo ""

# --- Server IP ---
ask "1. What is this server's IP address on your network?"
ask "   (e.g. 10.20.40.50 — this is what team members will type in their browser)"
read -rp "   Server IP: " SERVER_IP
[[ -z "$SERVER_IP" ]] && error "Server IP is required."

# --- DB Password ---
ask ""
ask "2. Choose a PostgreSQL database password for the app:"
ask "   (min 8 characters — save this somewhere safe)"
while true; do
  read -rsp "   DB Password: " DB_PASS
  echo ""
  read -rsp "   Confirm Password: " DB_PASS2
  echo ""
  if [[ "$DB_PASS" != "$DB_PASS2" ]]; then
    warn "Passwords do not match. Try again."
  elif [[ ${#DB_PASS} -lt 8 ]]; then
    warn "Password must be at least 8 characters."
  else
    break
  fi
done

# --- Anthropic API Key ---
ask ""
ask "3. Anthropic API key (for Claude AI analysis):"
ask "   Get it from https://console.anthropic.com"
read -rp "   Anthropic API Key: " ANTHROPIC_KEY
[[ -z "$ANTHROPIC_KEY" ]] && warn "Skipping Anthropic key — AI analysis will not work until you add it."

# --- Skip torch/transformers? ---
ask ""
ask "4. Install torch + transformers? (large ~2GB download, only needed"
ask "   for local audio transcription — Teams transcripts work WITHOUT it)"
ask "   Recommended: N (skip) unless you plan to upload audio files."
read -rp "   Install torch/transformers? [y/N]: " INSTALL_TORCH
INSTALL_TORCH=${INSTALL_TORCH:-N}

# --- Confirm ---
echo ""
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
echo -e "  Server IP     : ${GREEN}$SERVER_IP${NC}"
echo -e "  DB Password   : ${GREEN}(set)${NC}"
echo -e "  Anthropic Key : ${GREEN}${ANTHROPIC_KEY:0:20}...${NC}"
echo -e "  Install torch : ${GREEN}$INSTALL_TORCH${NC}"
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
echo ""
read -rp "Looks good? Press ENTER to start installation, or Ctrl+C to cancel..."

# =============================================================================
#  SECTION 2 — System dependencies
# =============================================================================

step "Updating system packages"
sudo apt-get update -qq && sudo apt-get upgrade -y -qq
ok "System packages updated"

# --- Prerequisites ---
step "Installing prerequisites (curl, ca-certificates)"
sudo apt-get install -y -qq curl ca-certificates
ok "Prerequisites installed"

# --- Node.js 20 ---
step "Installing Node.js 20"
if node -v 2>/dev/null | grep -q "v20"; then
  ok "Node.js 20 already installed ($(node -v))"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  sudo apt-get install -y -qq nodejs
  ok "Node.js installed: $(node -v)"
fi

# --- Python 3.11 ---
# Ubuntu 24.04 ships Python 3.12 as default but 3.11 is in the default repos.
step "Installing Python 3.11"
if python3.11 --version 2>/dev/null | grep -q "3.11"; then
  ok "Python 3.11 already installed ($(python3.11 --version))"
else
  sudo apt-get install -y -qq python3.11 python3.11-venv
  ok "Python 3.11 installed: $(python3.11 --version)"
fi

# --- PostgreSQL ---
step "Installing PostgreSQL"
if systemctl is-active --quiet postgresql; then
  ok "PostgreSQL already running"
else
  sudo apt-get install -y -qq postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
  ok "PostgreSQL installed and started"
fi

# --- Nginx ---
step "Installing Nginx"
if nginx -v 2>/dev/null; then
  ok "Nginx already installed"
else
  sudo apt-get install -y -qq nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
  ok "Nginx installed"
fi

# --- Git ---
step "Installing Git"
sudo apt-get install -y -qq git
ok "Git installed: $(git --version)"

# --- PM2 ---
step "Installing PM2 (process manager)"
if pm2 -v 2>/dev/null; then
  ok "PM2 already installed ($(pm2 -v))"
else
  sudo npm install -g pm2 --silent
  ok "PM2 installed: $(pm2 -v)"
fi

# Generate a secure JWT secret now that Node.js is guaranteed installed
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null \
             || openssl rand -hex 64)

# =============================================================================
#  SECTION 3 — PostgreSQL database setup
# =============================================================================

step "Setting up PostgreSQL database"

# Check if user/db already exists
DB_USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='demoapp'" 2>/dev/null || echo "")
if [[ "$DB_USER_EXISTS" == "1" ]]; then
  warn "Database user 'demoapp' already exists — updating password."
  sudo -u postgres psql -c "ALTER USER demoapp WITH PASSWORD '$DB_PASS';" > /dev/null
else
  sudo -u postgres psql -c "CREATE USER demoapp WITH PASSWORD '$DB_PASS';" > /dev/null
  ok "Database user 'demoapp' created"
fi

DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='demo_monitoring'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" == "1" ]]; then
  warn "Database 'demo_monitoring' already exists — skipping creation."
else
  sudo -u postgres psql -c "CREATE DATABASE demo_monitoring OWNER demoapp;" > /dev/null
  ok "Database 'demo_monitoring' created"
fi

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE demo_monitoring TO demoapp;" > /dev/null
ok "PostgreSQL ready"

# =============================================================================
#  SECTION 4 — Clone repository
# =============================================================================

INSTALL_DIR="/opt/demo-monitoring"

step "Cloning repository to $INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "Repository already exists at $INSTALL_DIR — pulling latest changes."
  cd "$INSTALL_DIR"
  git fetch origin
  git checkout dev
  git pull origin dev
else
  sudo git clone https://github.com/naitik-create/Demo-checker.git "$INSTALL_DIR"
  sudo chown -R "$USER:$USER" "$INSTALL_DIR"
fi
ok "Code at $INSTALL_DIR on branch: $(cd $INSTALL_DIR && git branch --show-current)"

# =============================================================================
#  SECTION 5 — Write environment files
# =============================================================================

step "Writing backend .env"
cat > "$INSTALL_DIR/backend/.env" <<EOF
PORT=5000
DATABASE_URL=postgresql://demoapp:${DB_PASS}@localhost:5432/demo_monitoring

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Microsoft Azure / Teams
AZURE_TENANT_ID=fc4f4c2e-4ff3-4aaa-aa72-a8b487cfd5d6
AZURE_CLIENT_ID=cd99f740-f97d-4317-9d82-afcfc40ae08b
AZURE_CLIENT_SECRET=e6_8Q~ftPH3MCMcym61qnRoeOyoZifiQBCFaAaQP
AZURE_REDIRECT_URI=http://${SERVER_IP}/api/teams/oauth/callback
AZURE_SCOPE=offline_access User.Read Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All Chat.Read

GRAPH_SYNC_DAYS_PAST=30
GRAPH_SYNC_DAYS_FUTURE=30

AI_SERVICE_URL=http://localhost:7000
FRONTEND_URL=http://${SERVER_IP}
EOF
ok "backend/.env written"

step "Writing AI service .env"
cat > "$INSTALL_DIR/ai-service/.env" <<EOF
ALLOW_CLAUDE_ANALYSIS=true
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
CLAUDE_MODEL=claude-sonnet-4-6
EOF
ok "ai-service/.env written"

step "Writing frontend .env"
cat > "$INSTALL_DIR/frontend/.env" <<EOF
VITE_BACKEND_URL=http://${SERVER_IP}
EOF
ok "frontend/.env written"

# =============================================================================
#  SECTION 6 — Node.js backend dependencies
# =============================================================================

step "Installing backend Node.js dependencies"
cd "$INSTALL_DIR/backend"
npm install --silent
ok "Backend dependencies installed"

# Create uploads directory
mkdir -p "$INSTALL_DIR/backend/uploads"
ok "uploads/ directory ready"

# =============================================================================
#  SECTION 7 — Python AI service
# =============================================================================

step "Setting up Python virtual environment for AI service"
cd "$INSTALL_DIR/ai-service"

if [[ ! -d "venv" ]]; then
  python3.11 -m venv venv
  ok "Virtual environment created"
else
  ok "Virtual environment already exists"
fi

source venv/bin/activate

# Optionally remove torch/transformers to speed up install
if [[ "${INSTALL_TORCH,,}" != "y" ]]; then
  warn "Skipping torch + transformers (faster install, Teams transcripts still work)"
  # Install everything except torch and transformers
  grep -v -E "^torch|^transformers" requirements.txt > /tmp/requirements_lite.txt
  pip install -q -r /tmp/requirements_lite.txt
else
  step "Installing Python packages including torch (~2 GB, this may take 10+ minutes)"
  pip install -q -r requirements.txt
fi

deactivate
ok "AI service Python environment ready"

# =============================================================================
#  SECTION 8 — Build React frontend
# =============================================================================

step "Installing frontend dependencies and building React app"
cd "$INSTALL_DIR/frontend"
npm install --silent
npm run build
ok "Frontend built → frontend/dist/"

# =============================================================================
#  SECTION 9 — Nginx configuration
# =============================================================================

step "Configuring Nginx"
sudo tee /etc/nginx/sites-available/demo-monitoring > /dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_IP};

    root ${INSTALL_DIR}/frontend/dist;
    index index.html;

    # React Router — all unknown paths return index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API requests to Node.js backend
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

    # Serve uploaded logos
    location /uploads/ {
        alias ${INSTALL_DIR}/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
EOF

# Enable site, disable default placeholder
sudo ln -sf /etc/nginx/sites-available/demo-monitoring /etc/nginx/sites-enabled/demo-monitoring
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
ok "Nginx configured and reloaded"

# =============================================================================
#  SECTION 10 — Firewall
# =============================================================================

step "Configuring UFW firewall"
sudo ufw allow 22/tcp   > /dev/null 2>&1
sudo ufw allow 80/tcp   > /dev/null 2>&1
sudo ufw --force enable > /dev/null 2>&1
ok "Firewall enabled (ports 22 and 80 open)"

# =============================================================================
#  SECTION 11 — PM2 process setup
# =============================================================================

step "Starting services with PM2"

# Stop existing processes if running (for re-runs)
pm2 delete demo-backend 2>/dev/null || true
pm2 delete demo-ai      2>/dev/null || true

# Start Node.js backend
pm2 start "$INSTALL_DIR/backend/server.js" \
  --name demo-backend \
  --cwd "$INSTALL_DIR/backend"

# Start Python AI service
pm2 start "$INSTALL_DIR/ai-service/venv/bin/python app.py" \
  --name demo-ai \
  --cwd "$INSTALL_DIR/ai-service"

# Save PM2 process list
pm2 save

# Register PM2 to start on system boot
PM2_STARTUP=$(pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1)
eval "$PM2_STARTUP" 2>/dev/null || sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"

ok "PM2 processes started and registered for auto-start on reboot"

# =============================================================================
#  SECTION 12 — Health checks
# =============================================================================

step "Running health checks (waiting 5 seconds for services to start)"
sleep 5

echo ""
# Backend check
if curl -sf http://localhost:5000/api/health > /dev/null 2>&1; then
  ok "Backend health check PASSED  → http://localhost:5000/api/health"
else
  warn "Backend health check FAILED — check logs with: pm2 logs demo-backend"
fi

# AI service check
if curl -sf http://localhost:7000/health > /dev/null 2>&1; then
  ok "AI service health check PASSED → http://localhost:7000/health"
else
  warn "AI service health check FAILED — check logs with: pm2 logs demo-ai"
fi

# Nginx check
if curl -sf http://localhost > /dev/null 2>&1; then
  ok "Nginx PASSED → serving frontend at http://${SERVER_IP}"
else
  warn "Nginx check FAILED — run: sudo nginx -t"
fi

# =============================================================================
#  DONE
# =============================================================================

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  ✔  Setup Complete!                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  App URL      : ${BOLD}http://${SERVER_IP}${NC}"
echo -e "  PM2 status   : ${CYAN}pm2 status${NC}"
echo -e "  Backend logs : ${CYAN}pm2 logs demo-backend${NC}"
echo -e "  AI logs      : ${CYAN}pm2 logs demo-ai${NC}"
echo ""
echo -e "${YELLOW}${BOLD}IMPORTANT — Action required in Azure Portal:${NC}"
echo "  Add this Redirect URI to your Azure App Registration:"
echo -e "  ${BOLD}http://${SERVER_IP}/api/teams/oauth/callback${NC}"
echo "  Azure Portal → Azure AD → App Registrations → your app → Authentication"
echo ""
echo -e "${YELLOW}${BOLD}IMPORTANT — Admin consent required (once):${NC}"
echo "  In Azure Portal → App Registrations → API Permissions"
echo "  Click 'Grant admin consent' so Teams transcripts can be read."
echo ""
pm2 status
