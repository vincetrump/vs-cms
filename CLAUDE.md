# VS-CMS

Hệ thống quản lý text link / footer link / guest post trên ~122 website HTML tĩnh, deploy qua SSH.

## Tech Stack

- **Backend**: NestJS 11, Mongoose 8, MongoDB 7
- **Frontend**: Refine v4 + Ant Design v5, Vite, React
- **Monorepo**: npm workspaces (`packages/shared`, `apps/api`, `apps/web`)
- **AI**: `@anthropic-ai/sdk` (viết bài guest post)
- **Deploy**: Docker Compose on server `187.77.140.45` (Hostinger), project at `/opt/vs-cms`

## Architecture

```
Nginx (host:80/443) → nginx (Docker:5174) → API (Docker:3001) → MongoDB (Docker:27017)
                                                   ↓
                                              SSH to websites (localhost)
```

Nginx trên host reverse-proxy `vs-cms.sonkemmiracleapo.com` đến `127.0.0.1:5174`. Nginx container phục vụ frontend SPA và proxy `/api/*` đến NestJS. VS-CMS SSH đến chính server host để deploy links vào các website tĩnh tại `/home/{domain}/public_html/`.

SSH connection pool theo IP: tất cả ~122 site cùng `serverIp` `187.77.140.45` → dùng chung 1 SSH connection, tự reconnect khi channel fail.

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
| `users` | username, passwordHash (bcrypt), totpSecret (AES), role (admin\|sale), mustChangePassword |
| `websites` | domain (unique), serverIp, documentRoot, homepagePath, status |
| `textlinks` | title, anchorText, targetUrl, status, source (admin\|api), websiteIds[], expiresAt |
| `linkdeployments` | textLinkId, websiteId, status (deployed\|failed\|removed) — unique(textLinkId, websiteId) |
| `footerlinks` | title, anchorText, targetUrl, status, source, rel, pageCount (1–50), includeHomepage, requestedWebsiteIds[], expiresAt |
| `footerlinkdeployments` | footerLinkId, websiteId, status, danh sách page đã chèn — unique(footerLinkId, websiteId) |
| `textlinkhistory` | textLinkId, action, actor, before/after — audit log |
| `footerlinkhistory` | footerLinkId, action, actor — audit log |
| `apikeys` | name, keyHash (SHA256), keyPrefix, hmacSecret, isActive |
| `jobs` | type, status (pending\|processing\|completed\|failed\|cancelled), params, progressCurrent/Total, logs[], result, error |
| `guestposts` | title, slug, content (rỗng với bài AI), metaDescription, category, anchorText/targetUrl/rel, status, realPublic (false=noindex+no sitemap), hideBacklink (mặc định true=ẩn), extraBacklinks[] (≤9), source, contentSource (manual\|ai), aiTopic, aiWordCount, wordCount, expiresAt, requestedWebsiteIds[] |
| `guestpostdeployments` | guestPostId, websiteId, filePath, pagePath, category, status, firstDeployedAt (=datePublished), title/content/metaDescription per-site (AI), addedToSitemap, backlinkRemoved, internalLinksCount, internalLinkSourceFiles[] — unique(guestPostId, websiteId) |
| `guestposthistory` | guestPostId, action, actor — audit log |
| `websitemetadata` | websiteId (unique), siteName, headerHtml, footerHtml, navCategories[], stylesheetLinks[], articleTemplate, templateSource (detail-page\|homepage), templateSamplePath, hasSitemap, lastScannedAt |
| `websitepages` | websiteId, pagePath, filePath, hasFooter, footerLinkCount, lastScannedAt |

Truy cập mongo shell:
```bash
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 "docker exec -it vs-cms-mongo-1 mongosh vs-cms"
```

## Key Flows

### Text Link / Footer Link Status
```
Sale tạo → pending → (admin approve/toggle) → active → (admin disable/toggle) → disabled
Admin tạo → active (skip pending)
Sale edit link active → pending (cần admin duyệt lại)
Sale edit link pending → stays pending
Hết hạn (expiresAt) → cron gỡ link
```

### Text Link — Deploy/Undeploy qua SSH
- VS-CMS SSH đến localhost (`187.77.140.45`) để deploy links
- Document roots: `/home/{domain}/public_html/` (fallback từ `/home/*/public_html/` scan)
- Chèn link: tìm `<div id="vs-cms-links">` trong homepage, thêm `<!-- vs-cms:{id} --><a ...><!-- /vs-cms:{id} -->`
- Gỡ link: regex remove marker, nếu div trống thì xóa luôn div
- Trước khi ghi file, tạo backup `.bak.{timestamp}`

### Footer Link — Deploy/Undeploy
- Chèn snippet vào footer của nhiều trang (không chỉ homepage): worker chọn tối đa `pageCount` trang có footer từ `websitepages` (scan qua `scan_website_pages`), `includeHomepage` ưu tiên chèn homepage
- Marker riêng cho footer link, bọc `<a>` với `rel` tùy chọn; undeploy gỡ marker toàn bộ page đã chèn
- Discord notify qua webhook riêng `DISCORD_FOOTER_WEBHOOK_URL`

### Guest Post — as-built (docs chi tiết: `docs/GUEST_POST_FEATURE.md`)

Guest post tạo **file HTML MỚI** tại `/home/{domain}/public_html/{category}/{slug}/index.html` (khác text/footer link vốn chèn snippet vào page có sẵn).

**Template engine** (`website-metadata`): scan mỗi site theo 2 chiến lược.
1. Ưu tiên lấy 1 trang **detail thật** của site làm khung (`templateSource='detail-page'`, sample lưu ở `templateSamplePath`) — giữ nguyên 100% head/CSS/header/footer + tái tạo wrapper căn giữa (nhiều site đặt `<div class="container ...-inner">` bên trong `<article>`; tái tạo wrapper quanh content sạch, bỏ meta-bar tác giả/ngày cứng của bài mẫu), chỉ thay title/meta/content/breadcrumb bằng placeholder.
2. Site không có trang detail → fallback dựng từ header/footer homepage (`templateSource='homepage'`).

Header/footer đều strip marker VS-CMS + external links trước khi vào template. Metadata lưu `stylesheetLinks` để nhúng CSS ngoài của site.

**SEO khi render**: canonical, Open Graph (og:type=article, og:title/description/url/site_name/locale), twitter:card, JSON-LD Article (datePublished = `firstDeployedAt` trên deployment record), article:published_time/modified_time, ngày đăng hiển thị dưới h1. Template cũ được inject backward-compat lúc render.

**Status flow** giống text link (pending/active/disabled/expired) + flag `realPublic` riêng: mặc định **noindex + không sitemap**; `POST /guest-posts/:id/toggle-public` bật `index, follow` + thêm sitemap entry (qua redeploy job). Chặn toggle-public khi post expired.

**Backlink (multi)**: mỗi post có backlink CHÍNH (`anchorText/targetUrl/rel/hideBacklink`) + mảng `extraBacklinks[]` (tối đa 9, chung `expiresAt` cấp post). Bọc marker format footer link: `<!-- vs-cms-gplink:{postId} --><a ...>anchor</a><!-- /vs-cms-gplink:{postId} -->` cho link chính, marker `:{i}` cho link phụ. `ensureBacklinks()` bọc/refresh tất cả (idempotent, match cả URL thô lẫn entity `&amp;`, tránh bọc chồng marker), strip marker mồ côi khi xóa bớt link. `hideBacklink` (MẶC ĐỊNH `true` = ẩn): backlink vẫn chèn nhưng bọc `style="display:none"`; tắt để hiện, cần redeploy. AI được yêu cầu chèn mọi link tự nhiên với dấu nháy đơn `<a href='...'>`.

**Expire = gỡ RIÊNG backlink, GIỮ bài viết** (`removeBacklinkFromDeployedFiles`): đoạn "Tham khảo thêm" tự thêm → xóa cả đoạn; link trong câu → unlink giữ anchor text; backlink ẩn (display:none) → xóa hẳn cả block (tránh lộ anchor text). Deployment flag `backlinkRemoved=true`, bài + sitemap + internal links GIỮ NGUYÊN. Nếu 1 site gỡ thất bại → post GIỮ active để cron đêm sau retry. Re-activate expired (toggle) → redeploy chèn lại backlink + xóa expiresAt cũ. Marker removal dùng regex backreference match cả marker chính lẫn `:{i}`.

**Per-site AI generation khi deploy**: post `contentSource='ai'` → `deployToWebsites()` generate MỘT BÀI RIÊNG cho từng website (chống duplicate content; tham số lưu ở `aiTopic`/`aiWordCount`; content per-site + title + metaDescription + wordCount lưu trên deployment record kèm marker gplink). Redeploy/toggle-public/regenerate-single KHÔNG regenerate — trừ `regenerate_guest_post` job (viết bài mới cho site đó, giữ URL). `deployToWebsites` reuse `filePath`/`pagePath` cũ nếu đã từng deploy (URL ổn định); slug trùng → `-2`/`-3`; category không có trên site → fallback `tong-hop`.

**Content generation** (`content-generation.service.ts`): dùng `output_config.format` json_schema (title/metaDescription/category enum theo site). KHÔNG bật extended thinking (Sonnet thinking ngốn max_tokens → cắt output). RETRY tối đa 3 lần khi output bị cắt (kết thúc giữa thẻ) hoặc quá ngắn (<40% word count yêu cầu). Prompt yêu cầu `<a href='...'>` single-quote (dấu `"` va chạm JSON constrained-decoding gây cắt). `generate-content` có `websiteId` → AI đọc metadata site tự chọn chủ đề/category.

**Internal links**: deploy chèn tối đa 2 link "Xem thêm" từ bài cùng category (marker `<!-- vs-cms-ilink:{id} -->`), track `internalLinkSourceFiles`, tự gỡ khi undeploy, preserve khi overwrite.

**Undeploy** (disable/delete): xóa file + rmdir slug dir nếu rỗng (KHÔNG đụng category dir) + gỡ sitemap + gỡ ilink markers. Sale xóa bài mình cũng undeploy (không mồ côi). Delete: hủy pending job trước, chỉ chặn khi có job đang RUNNING.

**UI create là 100% AI**, KHÔNG bước generate nháp, KHÔNG chế độ tự viết: chỉ nhập anchor + URL (+ rel, expiration, chủ đề tùy chọn, số từ, toggle Ẩn backlink mặc định Ẩn) + chọn websites + nút Thêm backlink (multi) rồi Save — title/content master để trống, backend đặt title tạm từ aiTopic/anchor, toàn bộ bài sinh lúc deploy. Bài manual chỉ tạo được qua API; edit page vẫn sửa được content bài manual cũ. Trang show: cột "Bài viết (AI per site)", tag "Link đã gỡ", nút Regenerate/Gỡ per-deployment, nút Kích hoạt lại cho expired. `POST /guest-posts/generate-content` vẫn tồn tại nhưng UI không dùng.

**Routes**: `GET /guest-posts`, `GET /guest-posts/ai-status`, `GET /guest-posts/:id`, `GET /guest-posts/:id/history`, `GET /guest-posts/:id/deployments`, `POST /guest-posts/generate-content`, `POST /guest-posts`, `PATCH /guest-posts/:id`, `DELETE /guest-posts/:id`, `POST /guest-posts/:id/{deploy,undeploy,regenerate,toggle-public,toggle}`.

### Job Processing
Worker (`worker.service.ts`) poll mỗi 3 giây, xử lý **1 job tại 1 thời điểm**.

19 job types: `sync_websites`, `deploy_links`, `undeploy_links`, `undeploy_all`, `redeploy_link`, `sync_link_websites`, `verify_deployments`, `check_expired`, `deploy_footer_links`, `undeploy_footer_links`, `redeploy_footer_link`, `scan_website_pages`, `check_expired_footer_links`, `deploy_guest_post`, `undeploy_guest_post`, `redeploy_guest_post`, `regenerate_guest_post`, `scan_website_metadata`, `check_expired_guest_posts`.

`JobConsoleLogger` (custom Nest logger đăng ký ở `main.ts`) capture toàn bộ Logger output của mọi service trong lúc job chạy → gom vào `job.logs` (batch flush 800ms) để trang Show Job hiển thị full console (poll 2s khi running). Job status thêm `cancelled` (toggle/delete hủy pending job dư thừa). `jobsService`: `cancelPendingJobsFor`, `hasRunningJobFor`. `regenerate_guest_post` = `deployToWebsites` cho site đó (bài AI viết lại, giữ URL).

### Cron (giờ UTC)
- `02:00` `check_expired` (text link) + `check_expired_footer_links` + `check_expired_guest_posts`
- `03:00` `verify_deployments`
- `04:00` `sync_websites`
- `05:00` `scan_website_pages` + `scan_website_metadata`
- `07:00` & `19:00` `remindPendingLinks` (Discord reminder link pending)

### Auth
Login 2 bước: POST `/auth/login` (password → partialToken) → POST `/auth/verify-totp` (TOTP → accessToken). Guard: `PasswordChangeGuard` (mustChangePassword) + `TotpSetupGuard`. ThrottlerGuard toàn cục (200 req/60s).

### External API
HMAC-SHA256: `createHmac('sha256', secret).update(body + timestamp)`. Timestamp trong header, chống replay 5 phút.

## API Modules (24)

| Module | Mô tả |
|--------|-------|
| `auth` | Login + TOTP 2FA, JWT |
| `users` | User CRUD, mustChangePassword |
| `websites` | Website CRUD |
| `text-links` | Text link CRUD + toggle/deploy/undeploy |
| `link-deployments` | SSH insert/remove text link trên homepage, tracking |
| `footer-links` | Footer link CRUD + toggle/deploy/undeploy (chèn footer nhiều trang) |
| `footer-link-deployments` | SSH insert/remove footer link theo page, tracking |
| `footer-link-history` | Audit log cho footer link changes |
| `text-link-history` | Audit log cho text link changes |
| `jobs` | Job queue + worker single-threaded. `JobConsoleLogger` capture console vào `job.logs`. cancelPendingJobsFor / hasRunningJobFor |
| `ssh` | SSH wrapper (ssh2 library), connection pool theo IP |
| `cloudflare` | Cloudflare zones API |
| `sync` | Sync websites + verify deployments |
| `cron` | Scheduled jobs (xem mục Cron) |
| `discord` | Webhook notifications (text / footer / guest post webhook riêng) |
| `api-keys` | API key management |
| `external-api` | Third-party API endpoints (HMAC) |
| `guest-posts` | Guest post CRUD + toggle/deploy/undeploy/regenerate/toggle-public (bài đầy đủ tại `/{category}/{slug}/index.html`) |
| `guest-post-deployments` | SSH tạo/xóa article file, render template per site, sitemap.xml, backlink + internal link |
| `guest-post-history` | Audit log cho guest post changes |
| `website-metadata` | Scan header/footer/CSS/categories, build article template per site (detail-page \| homepage) |
| `content-generation` | AI viết bài guest post qua Anthropic API (`ANTHROPIC_API_KEY`, `AI_MODEL`) |
| `website-pages` | Scan các trang có footer trên site (phục vụ footer link) |
| `dashboard` | Stats aggregation (chỉ có controller) |

## AI Config

- `content-generation` dùng `@anthropic-ai/sdk`. Env: `ANTHROPIC_API_KEY`, `AI_MODEL` (code default `claude-opus-4-8` NHƯNG `.env` prod + local hiện đặt `claude-sonnet-5`).
- Discord webhooks: `DISCORD_WEBHOOK_URL` (text link), `DISCORD_FOOTER_WEBHOOK_URL`, `DISCORD_GUEST_POST_WEBHOOK_URL` (guest post — KHÔNG fallback về webhook chính, chưa cấu hình thì skip).

## Known Issues

**Duplicate link marker on re-approve (E2E #47, #48)**: Khi admin re-approve (pending→active) một link đã từng deployed, `findByTextLink()` trả về mảng rỗng → hệ thống tạo `deploy_links` thay vì `redeploy_link` → `insertLink()` chèn marker mới mà không xóa cái cũ → undeploy chỉ xóa 1 copy (String.replace non-global). Fix cần 1 trong 3:
1. Sửa `findByTextLink()` để trả đúng deployment records
2. `deployToWebsites()` xóa marker cũ trước khi chèn mới
3. `removeLink()` dùng global regex

## Batch Mode (cân nhắc tương lai)

Anthropic Message Batches API: giảm 50% giá token (không phải tiết kiệm token), bất đồng bộ (đa số <1h, SLA tối đa 24h, quá 24h bị hủy), tối đa 100k request hoặc 256MB/batch, poll status + map `custom_id`, kết quả giữ 29 ngày, prompt caching hoạt động. Áp dụng cho deploy guest post nhiều site: gom N request/batch (`custom_id=websiteId`), tiết kiệm ~50% chi phí AI. Đánh đổi: mất UX per-site incremental; worker single-threaded sẽ bị khóa nếu chờ batch → cần bộ poll riêng/cron; retry truncation phải resubmit; xử lý lỗi từng phần theo `custom_id`. Khuyến nghị hybrid: real-time cho deploy nhỏ (1–5 site), batch khi ≥10 site. Đòn bẩy rẻ không refactor: prompt caching prefix chung trong real-time mode.

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
