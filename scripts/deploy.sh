#!/bin/bash
# =============================================================================
# counterguy-bot deploy script
# =============================================================================
# Usage:  bash scripts/deploy.sh
# Prereq: Edit the VPS_* variables below to match your server
# =============================================================================

set -e

# ===== CONFIGURATION =====
# Load from deploy.env (gitignored) — copy from deploy.env.example and fill in
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
  source "$SCRIPT_DIR/deploy.env"
else
  echo "[!] Missing $SCRIPT_DIR/deploy.env"
  echo "    Copy from deploy.env.example and fill in your VPS details:"
  echo "    cp scripts/deploy.env.example scripts/deploy.env"
  exit 1
fi
# ==========================

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

step()   { echo -e "${BOLD}${GREEN}[+]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
fail()   { echo -e "${RED}[X]${NC} $1"; exit 1; }

# --- Sanity checks ---
command -v node >/dev/null 2>&1 || fail "node is required"
command -v npm  >/dev/null 2>&1 || fail "npm is required"
command -v tar  >/dev/null 2>&1 || fail "tar is required"
command -v scp  >/dev/null 2>&1 || fail "scp (openssh-client) is required"
command -v ssh  >/dev/null 2>&1 || fail "ssh (openssh-client) is required"

if [ ! -f "$SSH_KEY" ]; then
  fail "SSH key not found at $SSH_KEY. Generate one: ssh-keygen -t ed25519"
fi

# --- Step 1: Verify tests ---
step "Running tests..."
npm test 2>&1 || fail "Tests failed. Fix them before deploying."

# --- Step 2: Build ---
step "Building TypeScript..."
npm run build 2>&1 || fail "Build failed."

# --- Step 3: Prune devDependencies ---
step "Removing dev dependencies (slimmer package)..."
npm prune --production 2>&1 || warn "npm prune failed, continuing..."

# --- Step 4: Pack ---
PACKAGE="counterguy-alpine.tgz"
step "Creating $PACKAGE..."
tar -czf "$PACKAGE" \
  dist/ \
  node_modules/ \
  package.json \
  package-lock.json \
  .env.example

# --- Step 5: Reinstall devDependencies ---
step "Restoring dev dependencies..."
npm install 2>&1 || warn "npm install failed, continuing..."

# --- Step 6: Upload ---
step "Uploading to $VPS_USER@$VPS_HOST:$VPS_PATH ..."
scp -i "$SSH_KEY" -P "$VPS_PORT" -q -C "$PACKAGE" "$VPS_USER@$VPS_HOST:$VPS_PATH/" \
  || fail "Upload failed. Check VPS_HOST, VPS_USER, SSH_KEY."

# --- Step 7: Deploy on VPS ---
step "Deploying on VPS and restarting..."
ssh -i "$SSH_KEY" -p "$VPS_PORT" "$VPS_USER@$VPS_HOST" bash -s << 'REMOTE'
  set -e
  cd "$VPS_PATH"

  # Backup database
  if [ -f voice_data.db ]; then
    cp voice_data.db "voice_data.db.backup.$(date -I)"
    echo "  >> Database backed up"
  fi

  # Extract new build
  tar -xzf counterguy-alpine.tgz
  echo "  >> Build extracted"

  # Restart
  if command -v pm2 &>/dev/null; then
    pm2 restart counterguy 2>/dev/null || pm2 start dist/index.js --name counterguy
    pm2 save
    echo "  >> Bot restarted with pm2"
  else
    # Fallback: kill old, start new
    kill "$(cat /tmp/counterguy.pid 2>/dev/null)" 2>/dev/null || true
    nohup node dist/index.js > /tmp/counterguy.log 2>&1 &
    echo $! > /tmp/counterguy.pid
    echo "  >> Bot restarted with nohup"
  fi

  # Cleanup
  rm -f counterguy-alpine.tgz
  echo "  >> Cleanup done"
REMOTE

rm -f "$PACKAGE"

step "========================================"
step "Deploy complete!"
step "Check logs: ssh $VPS_USER@$VPS_HOST 'pm2 logs counterguy --lines 20'"
step "========================================"