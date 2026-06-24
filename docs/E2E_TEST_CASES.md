# VS-CMS E2E Test Cases

**Total: 81 tests** | Last run: 79 pass / 2 fail (97.5%)

Script: [`docs/e2e-test.sh`](e2e-test.sh)

## Prerequisites

- Server `68.183.188.19` running Docker Compose (api, web, mongo)
- Two test websites configured:
  - `demo1.example.com` (ID: `6a3baf3ad94af5cbd99df8a3`)
  - `demo2.example.com` (ID: `6a3baf3ad94af5cbd99df8a4`)
- TOTP helper script at `/tmp/totp.js` on server
- Admin account: `admin` / `admin123` / TOTP secret `CE3GGI3OGVJWM2CU`
- Sale account: `sale` / `sale123` / TOTP secret `DYLHWUQ3HBOR6PSL`

## How tests work

- **API tests**: `curl` calls to `http://127.0.0.1:5174/api`, check HTTP status or JSON fields
- **SSH/HTML tests**: `grep` on server HTML files to verify link markers were inserted/removed
- **Job wait**: `sleep 20` after each deploy/undeploy to allow the worker (polls every 3s) to complete
- **Phase 0**: Cleans up any remnants from previous test runs before starting

---

## Phase 1: Authentication (5 tests)

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 1 | Admin login (password + TOTP) | POST /auth/login + /auth/verify-totp | accessToken returned | PASS |
| 2 | Sale login (password + TOTP) | POST /auth/login + /auth/verify-totp | accessToken returned | PASS |
| 3 | Admin /auth/me role check | GET /auth/me | role = "admin" | PASS |
| 4 | Sale /auth/me role check | GET /auth/me | role = "sale" | PASS |
| 5 | No token → 401 | GET /text-links (no auth header) | HTTP 401 | PASS |

## Phase 2: Admin CRUD + deploy (20 tests)

Full lifecycle: Create → Deploy → Edit → Disable → Re-enable → Delete

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 6 | Create link with websiteIds | POST /text-links | _id returned | PASS |
| 7 | Status = active (auto for admin) | — | status = "active" | PASS |
| 8 | demo1: link marker present | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 9 | demo1: anchor text correct | SSH grep | "Admin Anchor" in HTML | PASS |
| 10 | demo1: target URL correct | SSH grep | "admin-test.com" in HTML | PASS |
| 11 | demo1: rel attribute correct | SSH grep | `rel="sponsored"` in HTML | PASS |
| 12 | demo2: link marker present | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 13 | demo2: anchor text correct | SSH grep | "Admin Anchor" in HTML | PASS |
| 14 | Admin edit → stays active | PATCH /text-links/:id | status = "active" | PASS |
| 15 | demo1: updated anchor text | SSH grep | "Updated Admin" in HTML | PASS |
| 16 | demo1: updated rel attribute | SSH grep | `rel="nofollow"` in HTML | PASS |
| 17 | Toggle active → disabled | POST /text-links/:id/toggle | status = "disabled" | PASS |
| 18 | demo1: link removed after disable | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 19 | demo2: link removed after disable | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 20 | Toggle disabled → active | POST /text-links/:id/toggle | status = "active" | PASS |
| 21 | demo1: link re-deployed | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 22 | demo2: link re-deployed | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 23 | demo1: link gone after delete | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 24 | demo2: link gone after delete | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 25 | Delete + undeploy complete | DELETE /text-links/:id | success | PASS |

## Phase 3: Sale approval flow (24 tests)

Full flow: Sale creates (pending) → Admin approves → Sale edits (re-pending) → Admin re-approves → Cleanup

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 26 | Sale create link | POST /text-links (sale token) | _id returned | PASS |
| 27 | Status = pending (needs approval) | — | status = "pending" | PASS |
| 28 | demo1: NOT deployed before approval | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 29 | Sale can GET own link | GET /text-links/:id (sale token) | HTTP 200 | PASS |
| 30 | Sale cannot toggle (403) | POST /text-links/:id/toggle (sale token) | HTTP 403 | PASS |
| 31 | Sale cannot deploy (403) | POST /text-links/:id/deploy (sale token) | HTTP 403 | PASS |
| 32 | Admin approve pending → active | POST /text-links/:id/toggle (admin token) | status = "active" | PASS |
| 33 | demo1: deployed after approval | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 34 | demo1: sale anchor text | SSH grep | "Sale Anchor" in HTML | PASS |
| 35 | demo1: sale target URL | SSH grep | "sale-test.com" in HTML | PASS |
| 36 | demo2: deployed after approval | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 37 | Sale edit active → pending | PATCH /text-links/:id (sale, content change) | status = "pending" | PASS |
| 38 | demo1: OLD anchor preserved while pending | SSH grep | "Sale Anchor" still in HTML | PASS |
| 39 | demo1: NEW anchor NOT deployed yet | SSH grep | "New Sale Anchor" NOT in HTML | PASS |
| 40 | Title edit on pending → stays pending | PATCH /text-links/:id (title only) | status = "pending" | PASS |
| 41 | Admin re-approve → active | POST /text-links/:id/toggle (admin token) | status = "active" | PASS |
| 42 | demo1: NEW anchor after re-approve | SSH grep | "New Sale Anchor" in HTML | PASS |
| 43 | demo1: NEW URL after re-approve | SSH grep | "sale-v2.com" in HTML | PASS |
| 44 | demo2: NEW anchor after re-approve | SSH grep | "New Sale Anchor" in HTML | PASS |
| 45 | Title-only on active → stays active | PATCH /text-links/:id (title only) | status = "active" | PASS |
| 46 | Sale link disabled for cleanup | POST /text-links/:id/toggle | status = "disabled" | PASS |
| **47** | **demo1: sale link cleaned up** | **SSH grep** | **`vs-cms:{id}` NOT in HTML** | **FAIL** |
| **48** | **demo2: sale link cleaned up** | **SSH grep** | **`vs-cms:{id}` NOT in HTML** | **FAIL** |
| 49 | Sale link deleted | DELETE /text-links/:id | success | PASS |

### Root cause of failures (#47, #48)

When admin re-approves (test #41), `findByTextLink()` returns an empty array despite
deployment records existing from the first approval. This causes the system to create a
`deploy_links` job instead of `redeploy_link`, which inserts a **duplicate** link marker
in the HTML (same ID, new content appended without removing old). When undeploy runs,
`removeLink()` uses `String.replace()` (non-global) and only removes the first match.
The second copy remains in the HTML, causing the grep check to fail.

Phase 6 passes because the subsequent `DELETE` triggers a second `undeploy_all` that
removes the remaining duplicate.

## Phase 4: External API / HMAC (16 tests)

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 50 | Create API key | POST /api-keys | rawKey + hmacSecret returned | PASS |
| 51 | No API key → 401 | POST /v1/text-links (no headers) | HTTP 401 | PASS |
| 52 | Bad HMAC → 401 | POST /v1/text-links (bad signature) | HTTP 401 | PASS |
| 53 | Expired timestamp → 401 | POST /v1/text-links (ts - 10min) | HTTP 401 | PASS |
| 54 | API create link (valid HMAC) | POST /v1/text-links (valid sig) | _id returned | PASS |
| 55 | API link status = pending | — | status = "pending" | PASS |
| 56 | demo1: NOT deployed before approval | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 57 | Admin approve API link | POST /text-links/:id/toggle | status = "active" | PASS |
| 58 | demo1: API link deployed | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 59 | demo1: API anchor text | SSH grep | "API Anchor" in HTML | PASS |
| 60 | demo2: API link deployed | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 61 | API link disabled for cleanup | POST /text-links/:id/toggle | status = "disabled" | PASS |
| 62 | demo1: API link cleaned up | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 63 | demo2: API link cleaned up | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 64 | API link deleted | DELETE /text-links/:id | success | PASS |
| 65 | Test API key deleted | DELETE /api-keys/:id | success | PASS |

## Phase 5: Edge cases (7 tests)

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 66 | Sale cannot undeploy (403) | POST /text-links/:id/undeploy (sale token) | HTTP 403 | PASS |
| 67 | Create link with expiration | POST /text-links (expiresAt: 2030-12-31) | _id returned | PASS |
| 68 | expiresAt saved | — | expiresAt not empty | PASS |
| 69 | demo1: expiry link deployed | SSH grep | `vs-cms:{id}` in HTML | PASS |
| 70 | Expiry link disabled | POST /text-links/:id/toggle | status = "disabled" | PASS |
| 71 | demo1: expiry link cleaned up | SSH grep | `vs-cms:{id}` NOT in HTML | PASS |
| 72 | Expiry link deleted | DELETE /text-links/:id | success | PASS |

## Phase 6: No test remnants (9 tests)

Verifies all test data was fully cleaned up from both websites.

| # | Test | Method | Expected | Last result |
|---|------|--------|----------|-------------|
| 73 | demo1: no admin remnants | SSH grep | "admin-test" NOT in HTML | PASS |
| 74 | demo1: no sale remnants | SSH grep | "sale-test" NOT in HTML | PASS |
| 75 | demo1: no sale-v2 remnants | SSH grep | "sale-v2" NOT in HTML | PASS |
| 76 | demo1: no API remnants | SSH grep | "api-test" NOT in HTML | PASS |
| 77 | demo1: no expiry remnants | SSH grep | "expiry.com" NOT in HTML | PASS |
| 78 | demo2: no admin remnants | SSH grep | "admin-test" NOT in HTML | PASS |
| 79 | demo2: no sale remnants | SSH grep | "sale-test" NOT in HTML | PASS |
| 80 | demo2: no sale-v2 remnants | SSH grep | "sale-v2" NOT in HTML | PASS |
| 81 | demo2: no API remnants | SSH grep | "api-test" NOT in HTML | PASS |

---

## Summary by category

| Category | Count | Description |
|----------|-------|-------------|
| AUTH | 5 | Login, TOTP, JWT validation |
| CRUD | 10 | Create, update, delete text links and API keys |
| API | 9 | Toggle, approve, external API endpoints |
| RBAC | 5 | Role-based access control (sale restrictions) |
| SSH | 52 | HTML verification on server (deploy/undeploy/cleanup) |

## Running the tests

```bash
# From your local machine — run on server inside Docker
ssh root@68.183.188.19 "docker exec vs-cms-api-1 bash /tmp/vs-cms-test.sh"

# Or copy the script to server first
scp docs/e2e-test.sh root@68.183.188.19:/tmp/vs-cms-test.sh
ssh root@68.183.188.19 "chmod +x /tmp/vs-cms-test.sh && /tmp/vs-cms-test.sh"
```

The script runs entirely on the server. Total runtime is ~3-4 minutes (mostly `sleep 20` waits for worker jobs).
