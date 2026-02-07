#!/usr/bin/env bash
set -euo pipefail

# Deploy verification script for RSS Feed Generator
# Usage: scripts/verify-deploy.sh [base_url]
#
# Reads BASE_URL and API_KEY from .env file or environment variables.
# Optionally pass base_url as first argument to override.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env"
  set +a
fi

BASE_URL="${1:-${BASE_URL:-}}"
API_KEY="${API_KEY:-}"

if [ -z "$BASE_URL" ]; then
  echo "[ERROR] BASE_URL not set. Pass as argument or set in .env"
  echo "Usage: $0 <base_url>"
  exit 1
fi

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS + 1)); echo "[PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "[FAIL] $1"; }
warn() { WARN=$((WARN + 1)); echo "[WARN] $1"; }

echo "=== RSS Feed Generator Deploy Verification ==="
echo "Target: $BASE_URL"
echo ""

# --- Step 1: Health check ---
echo "--- Step 1: Health Check ---"
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null) || true
if [ -z "$HEALTH" ]; then
  fail "GET /health - no response (is the service running?)"
  echo ""
  echo "=== ABORT: Service not reachable ==="
  exit 1
fi

HEALTH_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
if [ "$HEALTH_STATUS" = "ok" ]; then
  pass "GET /health - status: ok"
else
  fail "GET /health - unexpected status: $HEALTH_STATUS"
fi

# --- Step 2: Service info ---
echo ""
echo "--- Step 2: Service Info ---"
INFO=$(curl -sf "$BASE_URL/" 2>/dev/null) || true
SERVICE=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service',''))" 2>/dev/null)
if [ "$SERVICE" = "RSS Feed Generator" ]; then
  pass "GET / - service identified"
else
  fail "GET / - unexpected service: $SERVICE"
fi

FEED_COUNT=$(echo "$INFO" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('allowed_feeds',[])))" 2>/dev/null)
echo "  Configured feeds: $FEED_COUNT"

EXAMPLE_COUNT=$(echo "$INFO" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('examples',{})))" 2>/dev/null)
if [ "$EXAMPLE_COUNT" = "$FEED_COUNT" ]; then
  pass "GET / - examples match feed count ($EXAMPLE_COUNT)"
else
  warn "GET / - examples ($EXAMPLE_COUNT) != feeds ($FEED_COUNT)"
fi

# --- Step 3: Pre-refresh status ---
echo ""
echo "--- Step 3: Pre-Refresh Status ---"
STATUS=$(curl -sf "$BASE_URL/status" 2>/dev/null) || true
PRE_STATUS=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
echo "  Overall: $PRE_STATUS"

echo "$STATUS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for f in data.get('feeds', []):
    cached = 'cached' if f['cached'] else 'NOT cached'
    print(f\"  {f['label']}: {cached}\")
" 2>/dev/null

# --- Step 4: Refresh feeds ---
echo ""
echo "--- Step 4: Refresh Feeds ---"
if [ -z "$API_KEY" ]; then
  warn "API_KEY not set, skipping refresh"
  echo "  Set API_KEY in .env or environment to enable refresh testing"
else
  echo "  Triggering refresh (this may take a minute)..."
  REFRESH=$(curl -sf -X POST "$BASE_URL/refresh" \
    -H "api_key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null) || true

  if [ -z "$REFRESH" ]; then
    fail "POST /refresh - no response"
  else
    REFRESH_STATUS=$(echo "$REFRESH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    if [ "$REFRESH_STATUS" = "success" ]; then
      pass "POST /refresh - status: success"
      echo "$REFRESH" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('results', []):
    status = r['status']
    url = r['url']
    count = r.get('articles_count', 0)
    msg = r.get('message', '')
    if status == 'success':
        print(f'  [OK] {url} ({count} articles)')
    else:
        print(f'  [!!] {url}: {msg}')
" 2>/dev/null
    else
      fail "POST /refresh - status: $REFRESH_STATUS"
      echo "  Response: $REFRESH"
    fi
  fi
fi

# --- Step 5: Post-refresh status ---
echo ""
echo "--- Step 5: Post-Refresh Status ---"
STATUS=$(curl -sf "$BASE_URL/status" 2>/dev/null) || true
POST_STATUS=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
echo "  Overall: $POST_STATUS"

echo "$STATUS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for f in data.get('feeds', []):
    cached = 'cached' if f['cached'] else 'NOT cached'
    print(f\"  {f['label']}: {cached}\")
" 2>/dev/null

if [ "$POST_STATUS" = "healthy" ]; then
  pass "All feeds cached after refresh"
else
  fail "Some feeds not cached after refresh"
fi

# --- Step 6: Test individual feed endpoints ---
echo ""
echo "--- Step 6: Feed Endpoint Checks ---"
FEED_URLS=$(echo "$INFO" | python3 -c "
import sys, json
for url in json.load(sys.stdin).get('allowed_feeds', []):
    print(url)
" 2>/dev/null)

while IFS= read -r feed_url; do
  [ -z "$feed_url" ] && continue
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$feed_url', safe=''))")
  RESP=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/feed?url=$ENCODED" 2>/dev/null) || RESP="000"
  if [ "$RESP" = "200" ]; then
    pass "GET /feed - $feed_url (HTTP $RESP)"
  elif [ "$RESP" = "404" ]; then
    warn "GET /feed - $feed_url (HTTP 404 - no articles cached)"
  else
    fail "GET /feed - $feed_url (HTTP $RESP)"
  fi
done <<< "$FEED_URLS"

# --- Step 7: Railway CLI info (optional) ---
echo ""
echo "--- Step 7: Railway CLI ---"
if command -v railway &>/dev/null; then
  RAILWAY_STATUS=$(railway status 2>&1) || true
  if echo "$RAILWAY_STATUS" | grep -qi "unauthorized\|login"; then
    warn "Railway CLI installed but not logged in (run: railway login)"
  else
    pass "Railway CLI available"
    echo "  $RAILWAY_STATUS" | head -5
  fi
else
  echo "  Railway CLI not installed (optional: brew install railway)"
fi

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  WARN: $WARN"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Deploy verification FAILED"
  exit 1
else
  echo ""
  echo "Deploy verification PASSED"
  exit 0
fi
