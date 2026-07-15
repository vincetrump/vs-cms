# VS-CMS E2E Test Cases

**Automated: 81 tests** (text link + footer link) | Last run: 79 pass / 2 fail (97.5%)
**Manual: 24 cases** (Guest Post GP-01 → GP-24, xem section cuối — chưa automate)

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

## Guest Post — manual test checklist (chưa có trong e2e-test.sh)

Guest post tạo **file HTML mới** tại `/{category}/{slug}/index.html` (khác text/footer link chèn snippet vào page có sẵn). UI create là **100% AI** — chỉ nhập anchor + URL (+ rel, expiration, chủ đề tùy chọn, số từ, toggle Ẩn backlink, nút Thêm backlink) rồi Save; toàn bộ bài sinh **lúc deploy**, mỗi website một bài riêng. Các case dưới cần test tay sau khi deploy tính năng.

### Metadata & Template

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-01 | Scan metadata 1 website | Website detail → Guest Post Metadata → Rescan, đợi job `scan_website_metadata` xong → Refresh | siteName/navCategories/hasSitemap hiển thị đúng; `templateSource` = `detail-page` (site có trang chi tiết thật, kèm `templateSamplePath`) hoặc `homepage` (fallback từ header/footer homepage); `stylesheetLinks` lưu CSS ngoài của site |
| GP-02 | Preview template render giống site | Metadata → Preview Template | Layout render giống site thật (head/CSS/header/footer nguyên vẹn); header/footer đã strip marker VS-CMS + external links; placeholder cho title/meta/content/breadcrumb |
| GP-03 | Template wrapper căn giữa (không tràn viền) | Deploy 1 bài lên site có wrapper → mở URL bài trên trình duyệt | Nội dung nằm trong wrapper căn giữa (vd `<div class="container ...-inner">` bên trong `<article>`), KHÔNG tràn sát viền; meta-bar tác giả/ngày cứng của bài mẫu đã bị bỏ, chỉ còn ngày đăng do VS-CMS chèn |

### Deploy & SEO

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-04 | Tạo guest post AI + deploy | Create page → nhập anchor + URL + chọn 1-2 websites (chủ đề bỏ trống = AI tự chọn theo site) → Save → deploy | Post tạo với title tạm + content master trống; KHÔNG có nút Generate nháp; job `deploy_guest_post` chạy; file `/{category}/{slug}/index.html` tồn tại trên server; HTML chứa header/footer của site |
| GP-05 | Mặc định noindex + không sitemap | View source bài vừa deploy + xem sitemap.xml | `<meta name="robots" content="noindex, nofollow">`; sitemap.xml KHÔNG có entry bài (`realPublic=false`) |
| GP-06 | Toggle Real Public | Show page → Go Public, đợi redeploy job | robots đổi `index, follow`; sitemap.xml có entry bài viết |
| GP-07 | Toggle về NoIndex | Show page → Về NoIndex, đợi redeploy | robots về `noindex, nofollow`; entry sitemap bị gỡ |
| GP-08 | Chặn toggle-public khi expired | Post đang expired → bấm Go Public | API chặn (lỗi), `realPublic` không đổi |
| GP-09 | SEO tags đầy đủ | View source bài đã deploy | Có canonical đúng URL; og:type=article + og:title/description/url/site_name/locale; twitter:card; JSON-LD Article với `datePublished` = `firstDeployedAt`; article:published_time/modified_time; ngày đăng hiển thị dưới `<h1>` |
| GP-10 | Slug trùng + category fallback | Deploy 2 post cùng slug/category lên 1 site; deploy post có category không tồn tại trên site | Post thứ 2 → `{slug}-2` (rồi `-3`...); category thiếu → fallback `tong-hop` |

### Backlink (chính + phụ)

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-11 | Backlink chính có marker | View source bài deploy | Backlink chính bọc `<!-- vs-cms-gplink:{postId} -->...<!-- /vs-cms-gplink:{postId} -->`; anchor + href + rel đúng (trong câu hoặc đoạn "Tham khảo thêm" cuối bài) |
| GP-12 | Multi-backlink (link phụ) | Create page → nút "Thêm backlink" thêm 1-2 extraBacklinks (mỗi cái anchor + URL + rel) → deploy → view source | Mỗi link phụ bọc marker `<!-- vs-cms-gplink:{postId}:{i} -->...`; TẤT CẢ link (chính + phụ) đều xuất hiện đúng anchor/URL/rel; không bọc chồng marker |
| GP-13 | hideBacklink mặc định ẩn + toggle hiện | Tạo post giữ mặc định "Ẩn backlink" → view source; sau đó tắt Ẩn → redeploy → view source | Mặc định (hideBacklink=true): backlink VẪN chèn nhưng bọc `style="display:none"`; sau khi tắt Ẩn + redeploy: backlink hiển thị bình thường (không còn display:none) |

### Expire & Re-activate

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-14 | Expired = gỡ backlink, giữ bài (chính + phụ) | Set `expiresAt` quá khứ (có cả link chính + phụ), chạy job `check_expired_guest_posts` | Post → expired; file bài viết VẪN CÒN, `wordCount` giữ nguyên; TẤT CẢ backlink biến mất (marker chính + `:{i}` gỡ sạch): đoạn "Tham khảo thêm" tự thêm → xóa cả đoạn, link trong câu → unlink giữ anchor text, backlink ẩn (display:none) → xóa hẳn block (tránh lộ anchor); deployment flag `backlinkRemoved=true`, tag "Link đã gỡ"; sitemap + internal links GIỮ NGUYÊN |
| GP-15 | 1 site gỡ backlink lỗi → giữ active | Mô phỏng 1 site lỗi (vd file không ghi được) khi expire | Post GIỮ `active` (KHÔNG chuyển expired) để cron đêm sau retry gỡ; site gỡ thành công vẫn `backlinkRemoved=true` |
| GP-16 | Re-activate expired → chèn lại backlink | Post expired → bấm "Kích hoạt lại" (toggle) | Redeploy chèn lại toàn bộ backlink (chính + phụ); xóa `expiresAt` cũ (đã qua); post về `active`; `backlinkRemoved` clear |

### Per-site AI generation

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-17 | Per-site AI generation | Tạo post AI, deploy lên 2+ websites | Job log hiện "AI mode: mỗi website..."; mỗi site MỘT bài KHÁC NHAU (title/slug/content/metaDescription/wordCount riêng — cột "Bài viết (AI per site)" trong Deployments); content + marker gplink lưu trên deployment record; redeploy/toggle-public KHÔNG regenerate |
| GP-18 | Content retry khi truncation | Deploy post AI với số từ lớn → xem job console | Nếu output bị cắt (kết thúc giữa thẻ) hoặc quá ngắn (<40% số từ yêu cầu) → service retry tối đa 3 lần; bài cuối đầy đủ; link trong bài dùng `<a href='...'>` single-quote (tránh va chạm JSON constrained-decoding) |
| GP-19 | Regenerate per-site | Show page → Deployments → nút Regenerate 1 site | Job `regenerate_guest_post`: AI viết bài MỚI cho site đó, GIỮ URL/filePath/pagePath cũ; site khác KHÔNG đổi |
| GP-20 | Undeploy per-site | Show page → Deployments → nút Gỡ 1 site | Chỉ site đó bị undeploy (xóa file, gỡ sitemap + ilink); site khác giữ nguyên |

### Sale flow, Internal links, Cleanup

| # | Case | Cách test | Expected |
|---|------|-----------|----------|
| GP-21 | Sale tạo → pending → approve | Sale tạo post, admin approve | Post `pending` KHÔNG deploy; sau approve mới chạy `deploy_guest_post` |
| GP-22 | Sale edit + Sale xóa | Sale sửa content bài active (bài manual qua API) → về pending; Sale xóa bài của mình | Edit: status về `pending`, nội dung site giữ nguyên đến khi admin approve. Delete: bài được undeploy (không mồ côi file) |
| GP-23 | Internal links | Deploy 2-3 bài cùng category lên cùng website | Bài cũ có block `vs-cms-ilink:{id}` "Xem thêm" trỏ bài mới (tối đa 2 nguồn); track `internalLinkSourceFiles`; overwrite bài giữ nguyên ilink của bài khác |
| GP-24 | Undeploy/delete + job console | Disable/xóa post; mở trang Show Job khi job chạy | Undeploy: xóa file + rmdir slug dir nếu rỗng (KHÔNG đụng category dir) + gỡ sitemap + gỡ ilink markers. Job console poll 2s, hiện full Logger output mọi service (JobConsoleLogger); status có pending/processing/completed/failed/cancelled; toggle/delete hủy pending job dư thừa (→ cancelled); delete chỉ bị chặn khi có job đang RUNNING |

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
