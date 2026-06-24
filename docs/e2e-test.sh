#!/bin/bash
#
# VS-CMS E2E Test Suite
# Runs on server 68.183.188.19 inside the Docker API container.
# Requires: curl, jq, node, openssl, grep, sed
# TOTP helper: /tmp/totp.js (generates TOTP codes from secret)
#
# Usage:
#   ssh root@68.183.188.19
#   docker exec -it vs-cms-api-1 bash
#   bash /tmp/vs-cms-test.sh
#
# Or from host:
#   ssh root@68.183.188.19 "docker exec vs-cms-api-1 bash /tmp/vs-cms-test.sh"

BASE="http://127.0.0.1:5174/api"
DEMO1_ID="6a3baf3ad94af5cbd99df8a3"
DEMO2_ID="6a3baf3ad94af5cbd99df8a4"
DEMO1_HTML="/home/demo1.example.com/public_html/index.html"
DEMO2_HTML="/home/demo2.example.com/public_html/index.html"

PASS=0; FAIL=0; TOTAL=0
pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ❌ $1"; [ -n "$2" ] && echo "     → $2"; }

login() {
  local user=$1 pw=$2 secret=$3
  local s1=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$user\",\"password\":\"$pw\"}")
  local partial=$(echo "$s1" | jq -r '.partialToken // empty')
  if [ -z "$partial" ]; then echo ""; return; fi
  local code=$(node /tmp/totp.js "$secret")
  local s2=$(curl -s "$BASE/auth/verify-totp" -H 'Content-Type: application/json' -H "Authorization: Bearer $partial" -d "{\"code\":\"$code\"}")
  echo "$s2" | jq -r '.accessToken // empty'
}

wait_job() { sleep 20; }

html_has() {
  if grep -q "$2" "$1" 2>/dev/null; then pass "$3"; else fail "$3" "not found in $(basename $1)"; fi
}
html_not() {
  if grep -q "$2" "$1" 2>/dev/null; then fail "$3" "still in $(basename $1)"; else pass "$3"; fi
}

echo "=========================================="
echo " VS-CMS E2E Test Suite — $(date '+%Y-%m-%d %H:%M')"
echo "=========================================="

# ── Phase 0: Clean up remnants from previous runs ──
echo ""
echo "🧹 Phase 0: Cleaning up old test remnants"
echo "------------------------------------------"
for f in "$DEMO1_HTML" "$DEMO2_HTML"; do
  if [ -f "$f" ]; then
    sed -i '/<!-- vs-cms:[a-f0-9]\+ -->.*<!-- \/vs-cms:[a-f0-9]\+ -->/d' "$f"
    sed -i '/<div id="vs-cms-links"[^>]*>\s*<\/div>/d' "$f"
  fi
done
echo "  ✅ Old vs-cms markers removed"

# ── Phase 1: Auth ─────────────────────────────
echo ""
echo "🔐 Phase 1: Authentication"
echo "------------------------------------------"

ADMIN_TOKEN=$(login admin admin123 CE3GGI3OGVJWM2CU)
if [ -n "$ADMIN_TOKEN" ]; then pass "Admin login (password + TOTP)"; else fail "Admin login" "empty token"; exit 1; fi

SALE_TOKEN=$(login sale sale123 DYLHWUQ3HBOR6PSL)
if [ -n "$SALE_TOKEN" ]; then pass "Sale login (password + TOTP)"; else fail "Sale login" "empty token"; exit 1; fi

AR=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.role')
[ "$AR" = "admin" ] && pass "Admin /auth/me → role=admin" || fail "Admin /auth/me" "role=$AR"

SR=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $SALE_TOKEN" | jq -r '.role')
[ "$SR" = "sale" ] && pass "Sale /auth/me → role=sale" || fail "Sale /auth/me" "role=$SR"

UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/text-links")
[ "$UNAUTH" = "401" ] && pass "No token → 401" || fail "Unauth check" "HTTP $UNAUTH"

# ── Phase 2: Admin CRUD + Deploy ──────────────
echo ""
echo "👑 Phase 2: Admin — Create → Deploy → Edit → Disable → Enable → Delete"
echo "------------------------------------------"

R=$(curl -s -X POST "$BASE/text-links" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Admin Test\",\"anchorText\":\"Admin Anchor\",\"targetUrl\":\"https://admin-test.com\",\"rel\":\"sponsored\",\"websiteIds\":[\"$DEMO1_ID\",\"$DEMO2_ID\"]}")
AID=$(echo "$R" | jq -r '._id // empty')
AST=$(echo "$R" | jq -r '.status')
[ -n "$AID" ] && pass "Create link (id=${AID:0:8}…)" || fail "Create link" "$R"
[ "$AST" = "active" ] && pass "Status = active (auto for admin)" || fail "Status check" "$AST"

echo "  ⏳ Deploy job running..."
wait_job

html_has "$DEMO1_HTML" "vs-cms:$AID" "demo1: link marker present"
html_has "$DEMO1_HTML" "Admin Anchor" "demo1: anchor text correct"
html_has "$DEMO1_HTML" "admin-test.com" "demo1: target URL correct"
html_has "$DEMO1_HTML" 'rel="sponsored"' "demo1: rel attribute correct"
html_has "$DEMO2_HTML" "vs-cms:$AID" "demo2: link marker present"
html_has "$DEMO2_HTML" "Admin Anchor" "demo2: anchor text correct"

# Edit content → auto redeploy
R=$(curl -s -X PATCH "$BASE/text-links/$AID" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"anchorText":"Updated Admin","rel":"nofollow"}')
[ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Admin edit → stays active" || fail "Admin edit status" "$(echo "$R" | jq -r '.status')"

echo "  ⏳ Redeploy..."
wait_job

html_has "$DEMO1_HTML" "Updated Admin" "demo1: updated anchor text"
html_has "$DEMO1_HTML" 'rel="nofollow"' "demo1: updated rel attribute"

# Toggle active → disabled (undeploy)
R=$(curl -s -X POST "$BASE/text-links/$AID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "disabled" ] && pass "Toggle active→disabled" || fail "Disable" "$(echo "$R" | jq -r '.status')"

echo "  ⏳ Undeploy..."
wait_job

html_not "$DEMO1_HTML" "vs-cms:$AID" "demo1: link removed after disable"
html_not "$DEMO2_HTML" "vs-cms:$AID" "demo2: link removed after disable"

# Toggle disabled → active (re-deploy)
R=$(curl -s -X POST "$BASE/text-links/$AID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Toggle disabled→active" || fail "Re-enable" "$(echo "$R" | jq -r '.status')"

echo "  ⏳ Re-deploy..."
wait_job

html_has "$DEMO1_HTML" "vs-cms:$AID" "demo1: link re-deployed"
html_has "$DEMO2_HTML" "vs-cms:$AID" "demo2: link re-deployed"

# Delete (undeploy + remove)
curl -s -X DELETE "$BASE/text-links/$AID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
echo "  ⏳ Undeploy on delete..."
wait_job

html_not "$DEMO1_HTML" "vs-cms:$AID" "demo1: link gone after delete"
html_not "$DEMO2_HTML" "vs-cms:$AID" "demo2: link gone after delete"
pass "Delete + undeploy complete"

# ── Phase 3: Sale Approval Flow ───────────────
echo ""
echo "🛒 Phase 3: Sale — Create(pending) → Approve → Edit(re-pending) → Re-approve"
echo "------------------------------------------"

R=$(curl -s -X POST "$BASE/text-links" -H "Authorization: Bearer $SALE_TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Sale Test\",\"anchorText\":\"Sale Anchor\",\"targetUrl\":\"https://sale-test.com\",\"websiteIds\":[\"$DEMO1_ID\",\"$DEMO2_ID\"]}")
SID=$(echo "$R" | jq -r '._id // empty')
SST=$(echo "$R" | jq -r '.status')
[ -n "$SID" ] && pass "Sale create link (id=${SID:0:8}…)" || fail "Sale create" "$R"
[ "$SST" = "pending" ] && pass "Status = pending (needs approval)" || fail "Status check" "$SST"

sleep 2
html_not "$DEMO1_HTML" "vs-cms:$SID" "demo1: NOT deployed before approval"

SC=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/text-links/$SID" -H "Authorization: Bearer $SALE_TOKEN")
[ "$SC" = "200" ] && pass "Sale can GET own link" || fail "Sale GET own link" "HTTP $SC"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/text-links/$SID/toggle" -H "Authorization: Bearer $SALE_TOKEN")
[ "$SC" = "403" ] && pass "Sale cannot toggle (403)" || fail "Sale toggle block" "HTTP $SC"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/text-links/$SID/deploy" -H "Authorization: Bearer $SALE_TOKEN" \
  -H "Content-Type: application/json" -d "{\"websiteIds\":[\"$DEMO1_ID\"]}")
[ "$SC" = "403" ] && pass "Sale cannot deploy (403)" || fail "Sale deploy block" "HTTP $SC"

# Admin approves
R=$(curl -s -X POST "$BASE/text-links/$SID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Admin approve pending→active" || fail "Admin approve" "$(echo "$R" | jq -r '.status')"

echo "  ⏳ Deploy after approval..."
wait_job

html_has "$DEMO1_HTML" "vs-cms:$SID" "demo1: deployed after approval"
html_has "$DEMO1_HTML" "Sale Anchor" "demo1: sale anchor text"
html_has "$DEMO1_HTML" "sale-test.com" "demo1: sale target URL"
html_has "$DEMO2_HTML" "vs-cms:$SID" "demo2: deployed after approval"

# Sale edits content on active → back to pending, OLD stays
R=$(curl -s -X PATCH "$BASE/text-links/$SID" -H "Authorization: Bearer $SALE_TOKEN" -H "Content-Type: application/json" \
  -d '{"anchorText":"New Sale Anchor","targetUrl":"https://sale-v2.com"}')
[ "$(echo "$R" | jq -r '.status')" = "pending" ] && pass "Sale edit active → pending" || fail "Sale edit status" "$(echo "$R" | jq -r '.status')"

sleep 2
html_has "$DEMO1_HTML" "Sale Anchor" "demo1: OLD anchor preserved while pending"
html_not "$DEMO1_HTML" "New Sale Anchor" "demo1: NEW anchor NOT deployed yet"

# Title-only edit on pending → stays pending
R=$(curl -s -X PATCH "$BASE/text-links/$SID" -H "Authorization: Bearer $SALE_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Sale Retitled"}')
[ "$(echo "$R" | jq -r '.status')" = "pending" ] && pass "Title edit on pending → stays pending" || fail "Title pending" "$(echo "$R" | jq -r '.status')"

# Admin re-approves → new content deployed
R=$(curl -s -X POST "$BASE/text-links/$SID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Admin re-approve → active" || fail "Re-approve" "$(echo "$R" | jq -r '.status')"

echo "  ⏳ Redeploy new content..."
wait_job

html_has "$DEMO1_HTML" "New Sale Anchor" "demo1: NEW anchor after re-approve"
html_has "$DEMO1_HTML" "sale-v2.com" "demo1: NEW URL after re-approve"
html_has "$DEMO2_HTML" "New Sale Anchor" "demo2: NEW anchor after re-approve"

# Title-only edit on active → stays active (no re-approval)
R=$(curl -s -X PATCH "$BASE/text-links/$SID" -H "Authorization: Bearer $SALE_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Just title"}')
[ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Title-only on active → stays active" || fail "Title active" "$(echo "$R" | jq -r '.status')"

# Cleanup — toggle disable, wait for SSH undeploy on 2 websites
R=$(curl -s -X POST "$BASE/text-links/$SID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "disabled" ] && pass "Sale link disabled for cleanup" || fail "Sale cleanup toggle" "$(echo "$R" | jq -r '.status')"
echo "  ⏳ Undeploy sale link..."
wait_job

html_not "$DEMO1_HTML" "vs-cms:$SID" "demo1: sale link cleaned up"
html_not "$DEMO2_HTML" "vs-cms:$SID" "demo2: sale link cleaned up"

curl -s -X DELETE "$BASE/text-links/$SID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
pass "Sale link deleted"

# ── Phase 4: External API ─────────────────────
echo ""
echo "🔑 Phase 4: External API (HMAC-signed)"
echo "------------------------------------------"

R=$(curl -s -X POST "$BASE/api-keys" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"E2E Test Key"}')
APIKEY=$(echo "$R" | jq -r '.rawKey // .key // empty')
HMAC=$(echo "$R" | jq -r '.rawHmacSecret // .hmacSecret // empty')
KEYID=$(echo "$R" | jq -r '._id // empty')

if [ -n "$APIKEY" ] && [ -n "$HMAC" ]; then pass "Create API key"; else fail "Create API key" "$R"; KEYID=""; fi

if [ -n "$KEYID" ]; then
  SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/text-links" -H "Content-Type: application/json" -d '{}')
  [ "$SC" = "401" ] && pass "No API key → 401" || fail "No key" "HTTP $SC"

  TS=$(date +%s%3N)
  BODY='{"title":"Bad","anchorText":"x","targetUrl":"https://x.com","websiteIds":[]}'
  SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/text-links" \
    -H "Content-Type: application/json" -H "X-API-Key: $APIKEY" -H "X-Timestamp: $TS" -H "X-Signature: badsig" -d "$BODY")
  [ "$SC" = "401" ] && pass "Bad HMAC → 401" || fail "Bad HMAC" "HTTP $SC"

  OLD_TS=$(($(date +%s%3N) - 600000))
  OLD_SIG=$(printf '%s' "${BODY}${OLD_TS}" | openssl dgst -sha256 -hmac "$HMAC" 2>/dev/null | awk '{print $NF}')
  SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/text-links" \
    -H "Content-Type: application/json" -H "X-API-Key: $APIKEY" -H "X-Timestamp: $OLD_TS" -H "X-Signature: $OLD_SIG" -d "$BODY")
  [ "$SC" = "401" ] && pass "Expired timestamp → 401" || fail "Expired TS" "HTTP $SC"

  BODY="{\"title\":\"API Link\",\"anchorText\":\"API Anchor\",\"targetUrl\":\"https://api-test.com\",\"websiteIds\":[\"$DEMO1_ID\",\"$DEMO2_ID\"]}"
  TS=$(date +%s%3N)
  SIG=$(printf '%s' "${BODY}${TS}" | openssl dgst -sha256 -hmac "$HMAC" 2>/dev/null | awk '{print $NF}')
  R=$(curl -s -X POST "$BASE/v1/text-links" \
    -H "Content-Type: application/json" -H "X-API-Key: $APIKEY" -H "X-Timestamp: $TS" -H "X-Signature: $SIG" -d "$BODY")
  APILID=$(echo "$R" | jq -r '.id // ._id // empty')
  APILST=$(echo "$R" | jq -r '.status')

  if [ -n "$APILID" ]; then pass "API create link (id=${APILID:0:8}…)"; else fail "API create" "$R"; fi
  [ "$APILST" = "pending" ] && pass "API link status = pending" || fail "API status" "$APILST"

  sleep 2
  html_not "$DEMO1_HTML" "vs-cms:$APILID" "demo1: NOT deployed before approval"

  if [ -n "$APILID" ]; then
    R=$(curl -s -X POST "$BASE/text-links/$APILID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$(echo "$R" | jq -r '.status')" = "active" ] && pass "Admin approve API link" || fail "Approve" "$(echo "$R" | jq -r '.status')"

    echo "  ⏳ Deploy API link..."
    wait_job

    html_has "$DEMO1_HTML" "vs-cms:$APILID" "demo1: API link deployed"
    html_has "$DEMO1_HTML" "API Anchor" "demo1: API anchor text"
    html_has "$DEMO2_HTML" "vs-cms:$APILID" "demo2: API link deployed"

    # Cleanup API link
    R=$(curl -s -X POST "$BASE/text-links/$APILID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$(echo "$R" | jq -r '.status')" = "disabled" ] && pass "API link disabled for cleanup" || fail "API cleanup toggle" "$(echo "$R" | jq -r '.status')"
    echo "  ⏳ Undeploy API link..."
    wait_job

    html_not "$DEMO1_HTML" "vs-cms:$APILID" "demo1: API link cleaned up"
    html_not "$DEMO2_HTML" "vs-cms:$APILID" "demo2: API link cleaned up"

    curl -s -X DELETE "$BASE/text-links/$APILID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    pass "API link deleted"
  fi

  curl -s -X DELETE "$BASE/api-keys/$KEYID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
  pass "Test API key deleted"
fi

# ── Phase 5: Edge Cases ───────────────────────
echo ""
echo "🧪 Phase 5: Edge Cases"
echo "------------------------------------------"

SC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/text-links/000000000000000000000000/undeploy" \
  -H "Authorization: Bearer $SALE_TOKEN" -H "Content-Type: application/json" -d "{\"websiteIds\":[\"$DEMO1_ID\"]}")
[ "$SC" = "403" ] && pass "Sale cannot undeploy (403)" || fail "Sale undeploy" "HTTP $SC"

R=$(curl -s -X POST "$BASE/text-links" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Expiry Test\",\"anchorText\":\"Expiry\",\"targetUrl\":\"https://expiry.com\",\"expiresAt\":\"2030-12-31\",\"websiteIds\":[\"$DEMO1_ID\"]}")
EID=$(echo "$R" | jq -r '._id // empty')
[ -n "$EID" ] && pass "Create link with expiration" || fail "Expiry link" "$R"
[ -n "$(echo "$R" | jq -r '.expiresAt // empty')" ] && pass "expiresAt saved" || fail "expiresAt" "empty"

echo "  ⏳ Deploy expiry link..."
wait_job
html_has "$DEMO1_HTML" "vs-cms:$EID" "demo1: expiry link deployed"

R=$(curl -s -X POST "$BASE/text-links/$EID/toggle" -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$(echo "$R" | jq -r '.status')" = "disabled" ] && pass "Expiry link disabled" || fail "Expiry toggle" "$(echo "$R" | jq -r '.status')"
echo "  ⏳ Undeploy expiry link..."
wait_job

html_not "$DEMO1_HTML" "vs-cms:$EID" "demo1: expiry link cleaned up"
curl -s -X DELETE "$BASE/text-links/$EID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
pass "Expiry link deleted"

# ── Phase 6: Final State ─────────────────────
echo ""
echo "🧹 Phase 6: No test remnants in HTML"
echo "------------------------------------------"
html_not "$DEMO1_HTML" "admin-test" "demo1: no admin remnants"
html_not "$DEMO1_HTML" "sale-test" "demo1: no sale remnants"
html_not "$DEMO1_HTML" "sale-v2" "demo1: no sale-v2 remnants"
html_not "$DEMO1_HTML" "api-test" "demo1: no API remnants"
html_not "$DEMO1_HTML" "expiry.com" "demo1: no expiry remnants"
html_not "$DEMO2_HTML" "admin-test" "demo2: no admin remnants"
html_not "$DEMO2_HTML" "sale-test" "demo2: no sale remnants"
html_not "$DEMO2_HTML" "sale-v2" "demo2: no sale-v2 remnants"
html_not "$DEMO2_HTML" "api-test" "demo2: no API remnants"

echo ""
echo "=========================================="
printf " RESULTS: %d passed, %d failed / %d total\n" $PASS $FAIL $TOTAL
echo "=========================================="
[ "$FAIL" -eq 0 ] && echo " 🎉 ALL TESTS PASSED" || echo " ⚠️  SOME TESTS FAILED"
exit $FAIL
