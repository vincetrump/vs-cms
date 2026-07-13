# VS-CMS

Hệ thống quản lý text links trên nhiều website HTML tĩnh, deploy qua SSH.

## Tech Stack

- **Backend**: NestJS 11, Mongoose 8, MongoDB 7
- **Frontend**: Refine v4 + Ant Design v5, Vite, React
- **Monorepo**: npm workspaces (`packages/shared`, `apps/api`, `apps/web`)
- **Deploy**: Docker Compose on server `187.77.140.45` (Hostinger), project at `/opt/vs-cms`

## Architecture

```
Nginx (host:80/443) → nginx (Docker:5174) → API (Docker:3001) → MongoDB (Docker:27017)
                                                   ↓
                                              SSH to websites (localhost)
```

Nginx trên host reverse-proxy `vs-cms.sonkemmiracleapo.com` đến `127.0.0.1:5174`. Nginx container phục vụ frontend SPA và proxy `/api/*` đến NestJS. VS-CMS SSH đến chính server host để deploy links vào các website tĩnh tại `/home/{domain}/public_html/`.

## Server Infrastructure

**Server**: Hostinger VPS `187.77.140.45` (Ubuntu 24.04)
**SSH key**: `~/.ssh/id_ed_vince_trump` (từ local machine)
**Cloudflare**: Account `Sunny.temp26@gmail.com`, API token trong `.env`

### Services trên server

| Service | Runtime | Port | Path |
|---------|---------|------|------|
| vs-cms web | Docker (nginx) | 5174 | `/opt/vs-cms` |
| vs-cms api | Docker (node) | 3001 | `/opt/vs-cms` |
| vs-cms mongo | Docker | 27017 | `/opt/vs-cms` |
| keodinh-ssr | PM2 (Astro SSR) | 4321 | `/var/www/keodinh-astro` |
| videobongda | PM2 (Astro SSR) | 4322 | `/var/www/videobongda` |
| estate-reels | PM2 (Node.js) | 3001 | `/opt/estate-reels` |
| crawler | PM2 (tsx) | — | `/var/www/keodinh-astro` |

Ngoài ra: Nginx, MariaDB, Redis, PHP 8.3-FPM, PM2 7 (startup enabled).

### SSL

Self-signed origin cert tại `/etc/nginx/ssl/origin.crt` + `origin.key`, dùng với Cloudflare SSL mode "Full" (không phải "Strict").

### Static websites

~122 websites HTML tĩnh, document root tại `/home/{domain}/public_html/`. Nginx config mỗi site tại `/etc/nginx/sites-available/{domain}.conf`.

### Crontabs (server)

```
*/30 * * * * /var/www/keodinh-astro/sync-images.sh
0 2 * * *    cd /var/www/keodinh-astro && npx tsx scripts/sync-bzzoiro-matches.ts
0 6,18 * * * /var/www/keodinh-astro/backup-db.sh
0 */2 * * *  curl -s http://localhost:4321/api/warm-odds > /dev/null 2>&1
```

## Deployment

**Luôn dùng git pull, KHÔNG upload file lên server.**

```bash
git push origin main
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 "cd /opt/vs-cms && git pull && docker compose up -d --build api web"
```

Nếu cần rebuild mongo: thêm `mongo` vào lệnh `docker compose up`.

## Logging

Tất cả log được persist trên host tại `/opt/vs-cms/logs/`, không bị mất khi container recreate.

| Service | Log path on host | Rotation |
|---------|-----------------|----------|
| API | `logs/api/api.log` | entrypoint.sh: >10MB → rotate, giữ 2 bản cũ |
| Nginx | `logs/web/access.log`, `error.log` | entrypoint.sh: >10MB → rotate, giữ 2 bản cũ |
| MongoDB | `logs/mongo/mongod.log` | mongod `--logappend`, file grows until restart |

Docker json-file logs cũng được cấu hình `max-size: 10m, max-file: 3` cho mỗi service.

Xem log:
```bash
# Realtime
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 "docker logs -f vs-cms-api-1"
# Persistent file
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 "tail -100 /opt/vs-cms/logs/api/api.log"
```

## Database

MongoDB collections (database: `vs-cms`):

| Collection | Key fields |
|-----------|------------|
| `users` | username, passwordHash (bcrypt), totpSecret (AES), role (admin\|sale) |
| `websites` | domain (unique), serverIp, documentRoot, homepagePath, status |
| `textlinks` | title, anchorText, targetUrl, status, source (admin\|api), websiteIds[], expiresAt |
| `linkdeployments` | textLinkId, websiteId, status (deployed\|failed\|removed) — unique(textLinkId, websiteId) |
| `apikeys` | name, keyHash (SHA256), keyPrefix, hmacSecret, isActive |
| `jobs` | type, status (pending\|processing\|completed\|failed), logs[] |
| `guestposts` | title, slug, content (HTML, sanitized), metaDescription, category, anchorText, targetUrl, status, realPublic (false=noindex+no sitemap), wordCount, expiresAt |
| `guestpostdeployments` | guestPostId, websiteId, filePath, pagePath, category, addedToSitemap — unique(guestPostId, websiteId) |
| `websitemetadata` | websiteId (unique), siteName, headerHtml, footerHtml, navCategories[], articleTemplate, hasSitemap, lastScannedAt |

Truy cập mongo shell:
```bash
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 "docker exec -it vs-cms-mongo-1 mongosh vs-cms"
```

## Key Flows

### Text Link Status
```
Sale tạo → pending → (admin approve/toggle) → active → (admin disable/toggle) → disabled
Admin tạo → active (skip pending)
Sale edit link active → pending (cần admin duyệt lại)
Sale edit link pending → stays pending
```

### Deploy/Undeploy qua SSH
- VS-CMS SSH đến localhost (`187.77.140.45`) để deploy links
- Document roots: `/home/{domain}/public_html/` (fallback từ `/home/*/public_html/` scan)
- Chèn link: tìm `<div id="vs-cms-links">` trong homepage, thêm `<!-- vs-cms:{id} --><a ...><!-- /vs-cms:{id} -->`
- Gỡ link: regex remove marker, nếu div trống thì xóa luôn div
- Trước khi ghi file, tạo backup `.bak.{timestamp}`

### Guest Post (docs chi tiết: `docs/GUEST_POST_FEATURE.md`)
- Tạo **file HTML mới** tại `/home/{domain}/public_html/{cat}/{slug}/index.html` (khác text/footer link vốn chèn snippet vào page có sẵn)
- Render từ `articleTemplate` per-site, build khi scan metadata theo 2 chiến lược: **ưu tiên lấy 1 trang detail thật của site làm khung** (`templateSource='detail-page'` — giữ nguyên 100% head/CSS/header/footer, chỉ thay title/meta/content bằng placeholder, sample path lưu ở `templateSamplePath`); site không có trang detail → fallback dựng từ header/footer homepage (`templateSource='homepage'`). Header/footer đều được strip marker VS-CMS + external links trước khi vào template
- SEO tags khi render: canonical, Open Graph, twitter:card, JSON-LD Article (datePublished = `firstDeployedAt`), ngày đăng hiển thị dưới h1 — template cũ được inject backward-compat lúc render
- Status flow giống text link (pending/active/disabled/expired) + flag `realPublic` riêng: mặc định **noindex + không vào sitemap**; `POST /guest-posts/:id/toggle-public` bật `index, follow` + thêm sitemap entry (qua redeploy job)
- Backlink trong bài được bọc marker theo format footer link: `<!-- vs-cms-gplink:{postId} --><a ...>anchor</a><!-- /vs-cms-gplink:{postId} -->` (bọc lúc render qua `ensureBacklink()`, idempotent)
- **Expire = gỡ riêng backlink, GIỮ bài viết** (`removeBacklinkFromDeployedFiles`): đoạn "Tham khảo thêm" tự thêm → xóa cả đoạn; link trong câu → unlink giữ anchor text; deployment flag `backlinkRemoved=true`, bài + sitemap + internal links giữ nguyên. Re-activate expired (toggle) → redeploy chèn lại backlink + xóa expiresAt cũ
- Internal links: deploy chèn tối đa 2 link "Xem thêm" từ bài cùng category (marker `<!-- vs-cms-ilink:{id} -->`), track source files, tự gỡ khi undeploy, preserve khi overwrite
- Category không có trên site → fallback `tong-hop`; slug trùng → append `-2`, `-3`...
- Undeploy (disable/delete): xóa file + rmdir slug dir nếu rỗng (KHÔNG đụng category dir) + gỡ sitemap + gỡ ilink markers
- AI generation (Phase 6): `POST /guest-posts/generate-content` — cần `ANTHROPIC_API_KEY`, model config qua `AI_MODEL` (default `claude-opus-4-8`); có `websiteId` → AI đọc metadata site và tự chọn chủ đề/category theo site
- **Per-site AI generation khi deploy**: post có `contentSource='ai'` → `deployToWebsites()` generate MỘT BÀI RIÊNG cho từng website (chống duplicate content; tham số lưu ở `aiTopic`/`aiWordCount`, content riêng lưu trên deployment record kèm marker gplink). Redeploy/toggle-public KHÔNG regenerate — dùng content per-site đã lưu; muốn bài mới: undeploy → deploy lại. UI create là 100% AI, KHÔNG có bước generate nháp và KHÔNG có chế độ tự viết: chỉ nhập anchor + URL + websites (+ chủ đề/số từ tùy chọn) rồi Save — title/content master để trống (backend đặt title tạm từ aiTopic/anchor), toàn bộ bài sinh lúc deploy. Bài manual chỉ còn tạo được qua API; edit page vẫn sửa được content bài manual cũ. `POST /guest-posts/generate-content` vẫn tồn tại nhưng UI không dùng

### Job Processing
Worker (`worker.service.ts`) poll mỗi 3 giây, xử lý **1 job tại 1 thời điểm**.

Job types: `deploy_links`, `undeploy_links`, `undeploy_all`, `redeploy_link`, `sync_link_websites`, `verify_deployments`, `check_expired`, `deploy_footer_links`, `undeploy_footer_links`, `redeploy_footer_link`, `scan_website_pages`, `check_expired_footer_links`, `deploy_guest_post`, `undeploy_guest_post`, `redeploy_guest_post`, `regenerate_guest_post`, `scan_website_metadata`, `check_expired_guest_posts`

### Auth
Login 2 bước: POST `/auth/login` (password → partialToken) → POST `/auth/verify-totp` (TOTP → accessToken)

### External API
HMAC-SHA256: `createHmac('sha256', secret).update(body + timestamp)`. Timestamp trong header, chống replay 5 phút.

## API Modules

| Module | Mô tả |
|--------|-------|
| `auth` | Login + TOTP 2FA, JWT |
| `users` | User CRUD, mustChangePassword |
| `websites` | Website CRUD |
| `text-links` | Text link CRUD + toggle/deploy/undeploy |
| `link-deployments` | SSH insert/remove link trên website, tracking |
| `jobs` | Job queue + worker (single-threaded). `JobConsoleLogger` (custom Nest logger, đăng ký ở main.ts) capture toàn bộ Logger output của mọi service trong lúc job chạy → gom vào `job.logs` (batch flush 800ms) để trang Show Job hiển thị full console. Regenerate per-site: `regenerate_guest_post` = deployToWebsites cho site đó (bài AI viết lại, giữ URL) |
| `ssh` | SSH wrapper (ssh2 library) |
| `cloudflare` | Cloudflare zones API |
| `sync` | Sync websites + verify deployments |
| `cron` | Scheduled: check_expired + footer + guest posts (02:00), verify (03:00), sync (04:00), scan pages + metadata (05:00) |
| `discord` | Webhook notifications |
| `api-keys` | API key management |
| `external-api` | Third-party API endpoints |
| `text-link-history` | Audit log cho text link changes |
| `guest-posts` | Guest post CRUD + toggle/deploy/undeploy (bài viết đầy đủ tại `/{category}/{slug}/index.html`) |
| `guest-post-deployments` | SSH tạo/xóa article file, render template per site, cập nhật sitemap.xml |
| `guest-post-history` | Audit log cho guest post changes |
| `website-metadata` | Scan homepage extract header/footer/CSS/categories, build article template per site |
| `content-generation` | AI viết bài guest post qua Anthropic API (env ANTHROPIC_API_KEY, AI_MODEL) |
| `dashboard` | Stats aggregation |

## Known Issues

**Duplicate link marker on re-approve (E2E #47, #48)**: Khi admin re-approve (pending→active) một link đã từng deployed, `findByTextLink()` trả về mảng rỗng → hệ thống tạo `deploy_links` thay vì `redeploy_link` → `insertLink()` chèn marker mới mà không xóa cái cũ → undeploy chỉ xóa 1 copy (String.replace non-global). Fix cần 1 trong 3:
1. Sửa `findByTextLink()` để trả đúng deployment records
2. `deployToWebsites()` xóa marker cũ trước khi chèn mới
3. `removeLink()` dùng global regex

## Dev Setup

```bash
nvm use 20
npm install
# API
npm run dev:api     # http://localhost:3001
# Web
npm run dev:web     # http://localhost:5173
```

## Tests

E2E test script: `docs/e2e-test.sh` (81 tests, 79 pass / 2 fail — chỉ cover text link + footer link)
Test case docs: `docs/E2E_TEST_CASES.md` (kèm manual checklist Guest Post GP-01 → GP-14, chưa automate)
