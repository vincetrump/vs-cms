# Guest Post Feature — Technical Documentation

> **Status**: Implemented (Phase 1–6, gồm Internal Links 6.5 + realPublic SEO gating) — tài liệu đã đồng bộ với code (as-built)  
> **Version**: 1.4  
> **Date**: 2026-07-13
>
> **Implementation notes**:
> - `realPublic` flag (v1.2): mặc định noindex + không vào sitemap; `POST /guest-posts/:id/toggle-public` để bật index + sitemap
> - Internal links (6.5): chèn tối đa 2 link từ bài cùng category, track `internalLinkSourceFiles` trên deployment record, tự gỡ khi undeploy, tự preserve khi redeploy/overwrite
> - Phase 6 AI: module `content-generation` dùng `@anthropic-ai/sdk` (env `ANTHROPIC_API_KEY`, `AI_MODEL`), endpoint `POST /guest-posts/generate-content` + `GET /guest-posts/ai-status`, panel Generate trong trang create
> - Website Metadata UI (12.4): section trong Website detail — Rescan / Refresh / Preview Template

## Table of Contents

- [1. Overview & Concept](#1-overview--concept)
- [2. Module Architecture](#2-module-architecture)
- [3. Database Schemas](#3-database-schemas)
- [4. API Endpoints](#4-api-endpoints)
- [5. Status Flow & Business Logic](#5-status-flow--business-logic)
- [6. Deploy / Undeploy Mechanism](#6-deploy--undeploy-mechanism)
- [7. Article Template Engine](#7-article-template-engine)
- [8. Website Metadata Scan](#8-website-metadata-scan)
- [9. Job Types & Worker](#9-job-types--worker)
- [10. Cron Schedules](#10-cron-schedules)
- [11. Discord Notifications](#11-discord-notifications)
- [12. Frontend Pages](#12-frontend-pages)
- [13. Reuse Analysis — Kế thừa từ Text Link & Footer Link](#13-reuse-analysis--kế-thừa-từ-text-link--footer-link)
- [14. Constraints & Rules](#14-constraints--rules)
- [15. Implementation Phases](#15-implementation-phases)
- [16. Environment Variables](#16-environment-variables)

---

## 1. Overview & Concept

Guest Post là chức năng tạo bài viết (article) trên các website tĩnh, chứa backlink tự nhiên trong nội dung. Đây là feature riêng biệt, song song với Text Link và Footer Link.

**Điểm khác biệt chính**: Text Link chèn snippet vào homepage. Footer Link chèn snippet vào footer N pages. Guest Post **tạo file HTML mới** — một bài viết hoàn chỉnh tại `/{category}/{slug}/index.html`.

### So sánh ba features

| Tiêu chí | Text Link | Footer Link | Guest Post |
|----------|-----------|-------------|------------|
| Loại thao tác | Chèn snippet vào page có sẵn | Chèn snippet vào footer N pages | Tạo page mới (article) |
| Vị trí trên site | Homepage (`<div id="vs-cms-links">`) | Trước `</footer>` trên N pages | `/{category}/{slug}/index.html` |
| Deployment scope | 1 vị trí / website | N pages / website | 1 article / website |
| Nội dung | Chỉ anchor text + URL | Chỉ anchor text + URL | Full article HTML + backlink bên trong |
| Cần template | Không | Không | Có — header/footer/CSS per site |
| Tạo directory mới | Không | Không | Có — `/{cat}/{slug}/` |
| Ảnh hưởng sitemap | Không | Không | Có — thêm/xóa entry |

---

## 2. Module Architecture

### Modules mới (đã triển khai)

| Module | Path | Chức năng |
|--------|------|-----------|
| `guest-posts` | `apps/api/src/modules/guest-posts/` | Schema, DTO, Controller, Service — CRUD + toggle + toggle-public + sanitize HTML + wordCount + slugify |
| `guest-post-deployments` | `apps/api/src/modules/guest-post-deployments/` | SSH deploy/undeploy article, template rendering, sitemap update, internal links |
| `guest-post-history` | `apps/api/src/modules/guest-post-history/` | Audit log — mọi thay đổi status, content, deployment |
| `website-metadata` | `apps/api/src/modules/website-metadata/` | Lưu header/footer/CSS/nav categories per website. Scan từ homepage via SSH, build article template |
| `content-generation` | `apps/api/src/modules/content-generation/` | Phase 6 — AI viết bài qua Anthropic API (`@anthropic-ai/sdk`), structured JSON output |

### Modules có sẵn (reuse)

| Module | Vai trò trong Guest Post |
|--------|--------------------------|
| `jobs` | Job queue — thêm 5 job types mới cho guest post |
| `ssh` | Read/write files, create directories, execute commands |
| `websites` | Domain, documentRoot, serverIp — base data cho deploy |
| `website-pages` | Page inventory — dùng cho internal linking |
| `discord` | Webhook notifications — thêm channel riêng cho guest post |
| `cron` | Scheduled tasks — check expired, scan metadata |

---

## 3. Database Schemas

### 3.1 GuestPost

**Collection**: `guestposts`

#### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Tiêu đề bài viết (required) |
| `slug` | String | URL slug — auto từ title hoặc nhập tay (required) |
| `content` | String | Nội dung HTML body bài viết (required) |
| `metaDescription` | String | SEO meta description (required) |
| `category` | String | Category path, e.g. "tong-hop", "suc-khoe" (required) |

#### Backlink Fields

| Field | Type | Description |
|-------|------|-------------|
| `anchorText` | String | Anchor text của backlink chính (required) |
| `targetUrl` | String | URL đích — backlink (required) |
| `rel` | String \| null | Link rel attribute: nofollow, sponsored, etc. |

#### Status & Ownership

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | `pending` \| `active` \| `disabled` \| `expired` (default: pending) |
| `realPublic` | Boolean | SEO visibility (default: false). `false` = render với `<meta name="robots" content="noindex, nofollow">` + KHÔNG đưa vào sitemap. `true` = `index, follow` + đưa vào sitemap. Toggle qua `POST /guest-posts/:id/toggle-public` (admin) → tạo `redeploy_guest_post` job để re-render + đồng bộ sitemap trên các websites đã deploy |
| `source` | String | `admin` \| `sale` (default: admin) |
| `createdBy` | ObjectId \| null | Ref → User |
| `expiresAt` | Date \| null | Thời điểm hết hạn — null = vĩnh viễn |

#### Deployment Config

| Field | Type | Description |
|-------|------|-------------|
| `requestedWebsiteIds` | String[] | Danh sách website IDs để deploy |
| `wordCount` | Number | Auto-calculated khi save content |
| `contentSource` | String | `manual` \| `ai` — nguồn nội dung |

#### Indexes

```
{ status: 1 }                    — Filter by status
{ expiresAt: 1 }                 — Expired check query
{ createdBy: 1 }                 — Sale filter own posts
{ slug: 1 }                      — Slug lookup
```

### 3.2 GuestPostDeployment

**Collection**: `guestpostdeployments`

#### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `guestPostId` | ObjectId | Ref → GuestPost (required) |
| `websiteId` | ObjectId | Ref → Website (required) |
| `filePath` | String | `/home/{domain}/public_html/{cat}/{slug}/index.html` |
| `pagePath` | String | `/{cat}/{slug}/` |
| `category` | String | Category thực tế dùng trên website này |

#### Status & Tracking

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | `deployed` \| `failed` \| `removed` |
| `deployedAt` | Date \| null | Thời điểm deploy thành công |
| `removedAt` | Date \| null | Thời điểm undeploy |
| `lastVerifiedAt` | Date \| null | Lần verify cuối |
| `errorMessage` | String \| null | Error message nếu failed |

#### SEO Tracking

| Field | Type | Description |
|-------|------|-------------|
| `addedToSitemap` | Boolean | Đã thêm vào sitemap.xml chưa (default: false). Chỉ true khi post đang `realPublic` |
| `internalLinksCount` | Number | Số internal links đã chèn từ pages khác (default: 0) |
| `internalLinkSourceFiles` | String[] | File paths trên website này nơi đã chèn internal link trỏ đến bài viết — dùng để gỡ markers khi undeploy |

#### Indexes

```
{ guestPostId: 1, websiteId: 1 }     — Unique: mỗi post chỉ deploy 1 lần / website
{ guestPostId: 1 }                     — Find deployments by post
{ websiteId: 1, status: 1 }           — Find deployed articles per site
```

### 3.3 WebsiteMetadata

**Collection**: `websitemetadata`

#### Identity

| Field | Type | Description |
|-------|------|-------------|
| `websiteId` | ObjectId | Ref → Website (unique, required) |
| `siteName` | String | Tên website, extract từ `<title>` |
| `siteDescription` | String | Meta description homepage |
| `language` | String | "vi" \| "en" — detect từ html lang hoặc content |

#### Template Components

| Field | Type | Description |
|-------|------|-------------|
| `headerHtml` | String | `<header>...</header>` raw HTML |
| `footerHtml` | String | `<footer>...</footer>` raw HTML |
| `navCategories` | String[] | `["suc-khoe", "lam-dep", "tong-hop", ...]` |
| `inlineStyles` | String | Full `<style>` block từ homepage |
| `cssVariables` | Object | Parsed CSS custom properties `{ --primary: "#xxx" }` |

#### Assets & SEO

| Field | Type | Description |
|-------|------|-------------|
| `logoUrl` | String \| null | Relative path to logo image |
| `faviconUrl` | String \| null | Relative path to favicon |
| `gscVerificationKey` | String \| null | Google Search Console verification meta content |
| `hasSitemap` | Boolean | Website có sitemap.xml hay không |
| `sitemapPath` | String \| null | Path tới sitemap file (default: /sitemap.xml) |

#### Template & Scan

| Field | Type | Description |
|-------|------|-------------|
| `articleTemplate` | String | Compiled full-page HTML template with placeholders |
| `lastScannedAt` | Date | Lần scan cuối cùng |

#### Indexes

```
{ websiteId: 1 }     — Unique: mỗi website chỉ có 1 metadata record
```

### 3.4 GuestPostHistory

**Collection**: `guestposthistories`

Cấu trúc giống `textlinkhistories` và `footerlinkhistories`.

| Field | Type | Description |
|-------|------|-------------|
| `guestPostId` | ObjectId | Ref → GuestPost |
| `action` | String | Enum (xem bảng dưới) |
| `performedBy` | ObjectId \| null | Ref → User (null = system) |
| `changes` | Object \| null | `{ field: { old, new } }` |
| `metadata` | Object \| null | Additional context (jobId, websiteIds, etc.) |

**Action values**: `created`, `updated`, `deleted`, `status_changed`, `deployed`, `deploy_completed`, `deploy_failed`, `undeployed`, `undeploy_completed`, `redeployed`, `expired`

---

## 4. API Endpoints

### Guest Post Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/guest-posts` | All | List — sale chỉ thấy của mình |
| `GET` | `/guest-posts/:id` | All | Detail + deployments (admin), detail only (sale) |
| `POST` | `/guest-posts` | All | Create — sale→pending, admin→active+auto deploy |
| `PATCH` | `/guest-posts/:id` | All | Update — sale edit active→pending |
| `DELETE` | `/guest-posts/:id` | All | Delete + undeploy job (block nếu có active jobs) |
| `POST` | `/guest-posts/:id/deploy` | Admin | Deploy to specified websiteIds |
| `POST` | `/guest-posts/:id/undeploy` | Admin | Undeploy from specified websiteIds |
| `POST` | `/guest-posts/:id/toggle` | Admin | Toggle status: active↔disabled, pending→active |
| `POST` | `/guest-posts/:id/toggle-public` | Admin | Toggle realPublic: noindex↔index + thêm/gỡ sitemap (redeploy job) |
| `GET` | `/guest-posts/:id/history` | All | Audit log |
| `GET` | `/guest-posts/:id/deployments` | Admin | Deployment records per website |
| `POST` | `/guest-posts/generate-content` | All | Phase 6 — AI generate draft `{title, slug, metaDescription, category, content, wordCount}` từ topic + backlink info. Chưa lưu DB |
| `GET` | `/guest-posts/ai-status` | All | `{ configured: boolean }` — server có ANTHROPIC_API_KEY hay không (UI dùng để ẩn/hiện panel AI) |

### Website Metadata Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/website-metadata/:websiteId` | Admin | Get metadata for a website |
| `POST` | `/website-metadata/scan` | Admin | Trigger scan for specific websiteIds (or all) |
| `GET` | `/website-metadata/:websiteId/preview` | Admin | Preview article template với dummy content |

---

## 5. Status Flow & Business Logic

### Status Machine

```
Sale tạo       → pending → admin approve (toggle) → active → deploy
Admin tạo      → active  → auto deploy

active   → toggle → disabled  (undeploy all)
disabled → toggle → active    (redeploy to previous websites)

active   → hết hạn → expired  (undeploy all)
```

### SEO Visibility (trục độc lập với status)

`realPublic` là flag riêng, không trộn vào status machine — một bài `active` (đã deploy) vẫn có thể đang noindex chờ nội dung "chín" rồi mới public:

```
Mới tạo        → realPublic = false → render <meta robots noindex, nofollow> + KHÔNG vào sitemap
Toggle Public  → realPublic = true  → redeploy job: re-render <meta robots index, follow> + thêm sitemap entry
Toggle NoIndex → realPublic = false → redeploy job: re-render noindex + gỡ sitemap entry
```

- Endpoint: `POST /guest-posts/:id/toggle-public` (admin) — flip flag, tạo `redeploy_guest_post` job nếu có deployment đang deployed, ghi history (`noindex` ↔ `real-public`) + Discord notification
- Redeploy luôn **đồng bộ** trạng thái sitemap với flag hiện tại (public mà thiếu entry → thêm; noindex mà còn entry → gỡ) nên mọi thao tác hội tụ về đúng trạng thái
- Undeploy/delete/expired gỡ sitemap entry dựa trên `addedToSitemap` như bình thường

### Business Rules

- **Sale edit active post** → status chuyển về `pending`, content trên websites giữ nguyên cho đến khi admin approve lại
- **Sale edit pending post** → giữ nguyên pending
- **Admin edit active post** → giữ active + tạo `redeploy_guest_post` job để update content trên websites
- **Admin thay đổi websiteIds** → tính diff: thêm website mới → deploy, bớt website → undeploy
- **Delete khi có active jobs** → block (trả 400)
- **Toggle pending → active** → deploy to requestedWebsiteIds (chưa deploy) + redeploy existing (nếu content đã thay đổi)

---

## 6. Deploy / Undeploy Mechanism

### 6.1 Deploy Flow

Khi job `deploy_guest_post` được xử lý, với mỗi website:

| Step | Action | Detail |
|------|--------|--------|
| 1 | Load metadata | `getOrScan()` — lấy `WebsiteMetadata`, tự scan nếu chưa có hoặc stale (>7 ngày) |
| 2 | Resolve category | Kiểm tra `guest_post.category` có trong `metadata.navCategories`. Nếu không → fallback `"tong-hop"` → fallback category đầu tiên |
| 3 | Resolve path | Nếu đã từng deploy lên website này (record cũ, kể cả `removed`) → **reuse filePath/pagePath cũ** (URL ổn định khi re-enable). Nếu chưa → generate unique slug: check dir tồn tại, append suffix `-2`, `-3`... (tối đa 20 lần) |
| 4 | Ensure backlink | Nếu content chưa chứa `targetUrl` → append đoạn `<p>Tham khảo thêm: <a ...>` cuối bài |
| 5 | Render HTML | Load `metadata.articleTemplate` → replace placeholders `{title}`, `{content}`, `{metaDescription}`, `{category}`, `{categoryName}`, `{robotsMeta}` (noindex nếu `!realPublic`). Title/meta được escape HTML |
| 6 | Preserve internal links | Nếu overwrite file cũ: đọc file hiện tại, extract các block `vs-cms-ilink` mà bài khác đã chèn → re-insert vào render mới trước `</article>` |
| 7 | Create directory + write | `mkdir -p /home/{domain}/public_html/{cat}/{slug}/` → SSH write `index.html` |
| 8 | Update sitemap | **Chỉ khi `post.realPublic`** và website có `sitemap.xml`: backup → xóa entry trùng (nếu có) → thêm `<url>` entry trước `</urlset>` |
| 9 | Internal links | Tìm tối đa 2 bài cùng category + cùng website đang `deployed` → backup source file → chèn block `vs-cms-ilink:{id}` trước `</article>` → track file paths vào `internalLinkSourceFiles` |
| 10 | Save deployment | Upsert `GuestPostDeployment` record: status `deployed`, category, filePath, pagePath, addedToSitemap, internalLinksCount, internalLinkSourceFiles |

Fail 1 website → mark deployment `failed` với errorMessage, tiếp tục website tiếp theo.

> **CONSTRAINT**: Deploy chỉ TẠO directory/file mới. Không rename, move, hoặc restructure bất kỳ folder nào đã tồn tại trên website.

### 6.2 Undeploy Flow

| Step | Action | Detail |
|------|--------|--------|
| 1 | Delete article file | `rm -f /home/{domain}/public_html/{cat}/{slug}/index.html` |
| 2 | Remove empty directory | `rmdir` nếu directory rỗng (chỉ xóa dir slug, KHÔNG xóa dir category) |
| 3 | Update sitemap | Nếu `addedToSitemap`: backup → xóa entry tương ứng → ghi lại |
| 4 | Remove internal links | Với mỗi file trong `internalLinkSourceFiles`: backup → gỡ block `vs-cms-ilink:{id}` (global regex) → ghi lại |
| 5 | Update deployment record | Set status = `removed`, removedAt = now, addedToSitemap = false, internalLinksCount = 0, internalLinkSourceFiles = [] |

### 6.3 Redeploy Flow

Khi content được update (admin edit active post) hoặc toggle realPublic:

1. Lấy tất cả deployments có status `deployed`
2. Với mỗi deployment: re-render template với content + robots meta hiện tại (`noindex` nếu `!realPublic`) → đọc file cũ để **preserve các ilink blocks** bài khác đã chèn → overwrite file (URL giữ nguyên, dùng category đã lưu trên record)
3. **Đồng bộ sitemap** với flag `realPublic`: public mà chưa có entry → thêm; noindex mà còn entry → gỡ. Cập nhật `addedToSitemap` tương ứng
4. Internal links trỏ đến bài này ở các bài khác giữ nguyên (URL không đổi)

### 6.4 Sitemap Update Logic

```xml
<!-- Thêm entry vào sitemap.xml -->
<url>
  <loc>https://{domain}/{category}/{slug}/</loc>
  <lastmod>{deployedAt ISO date}</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.6</priority>
</url>
```

### 6.5 Internal Links Logic (đã triển khai)

Sau khi deploy bài mới, hệ thống tự chèn link từ bài cùng category:

- Query `GuestPostDeployment`: cùng `websiteId` + cùng `category` + status `deployed` + khác `guestPostId`, sort mới nhất, limit 2
- Với mỗi bài nguồn: backup file → gỡ marker cũ của post này (idempotent) → chèn trước `</article>` (bỏ qua file không có `</article>`):
  ```html
  <!-- vs-cms-ilink:{guestPostId} --><p>Xem thêm: <a href="/{cat}/{slug}/">{title}</a></p><!-- /vs-cms-ilink:{guestPostId} -->
  ```
- File paths chèn thành công được lưu vào `internalLinkSourceFiles` trên deployment record của bài mới
- Undeploy: đọc `internalLinkSourceFiles` → gỡ tất cả markers `vs-cms-ilink:{id}` (global regex) khỏi từng file
- **Preserve khi overwrite**: mọi chỗ ghi đè một article file (redeploy, re-deploy lại path cũ) đều extract các block `vs-cms-ilink` từ file cũ và re-insert vào bản render mới — tránh mất link của bài khác

---

## 7. Article Template Engine

### 7.1 Template Structure

```html
<!DOCTYPE html>
<html lang="{language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - {siteName}</title>
  <meta name="description" content="{metaDescription}">
  {robotsMeta}
  <link rel="icon" href="{faviconUrl}">
  {gscVerificationTag}
  <style>{inlineStyles}</style>
</head>
<body>
  {headerHtml}

  <main class="article-content">
    <nav class="breadcrumb">
      <a href="/">Trang chủ</a> ›
      <a href="/{category}/">{categoryName}</a> ›
      <span>{title}</span>
    </nav>
    <article>
      <h1>{title}</h1>
      <div class="article-body">
        {content}
      </div>
    </article>
  </main>

  {footerHtml}
</body>
</html>
```

### 7.2 Placeholders

| Placeholder | Source | Fallback |
|-------------|--------|----------|
| `{title}` | GuestPost.title | — |
| `{content}` | GuestPost.content | — |
| `{metaDescription}` | GuestPost.metaDescription | First 160 chars of content |
| `{category}` | Resolved category slug | "tong-hop" |
| `{categoryName}` | Capitalize category slug | — |
| `{language}` | WebsiteMetadata.language | "vi" |
| `{siteName}` | WebsiteMetadata.siteName | Domain name |
| `{headerHtml}` | WebsiteMetadata.headerHtml | Empty |
| `{footerHtml}` | WebsiteMetadata.footerHtml | Empty |
| `{inlineStyles}` | WebsiteMetadata.inlineStyles | Minimal default CSS |
| `{faviconUrl}` | WebsiteMetadata.faviconUrl | "/favicon.ico" |
| `{gscVerificationTag}` | WebsiteMetadata.gscVerificationKey | Empty (omit tag) |
| `{robotsMeta}` | Theo `guestPost.realPublic` khi render: `noindex, nofollow` (false) hoặc `index, follow` (true) | Template scan trước khi có placeholder → tự inject vào `<head>` khi render |

> Lưu ý implementation: `{language}`, `{siteName}`, `{headerHtml}`, `{footerHtml}`, `{inlineStyles}`, `{faviconUrl}`, `{gscVerificationTag}` được "bake" vào `articleTemplate` tại thời điểm **scan** (build template). Chỉ `{title}`, `{content}`, `{metaDescription}`, `{category}`, `{categoryName}`, `{robotsMeta}` được replace tại thời điểm **render/deploy**.

### 7.3 Article CSS

Bổ sung CSS cho `.article-content` vào template — style article body mà KHÔNG conflict với CSS existing của site:

```css
.article-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.article-content h1 {
  margin-bottom: 16px;
}
.article-body p {
  margin-bottom: 1em;
  line-height: 1.7;
}
.article-body img {
  max-width: 100%;
  height: auto;
}
.breadcrumb {
  font-size: 14px;
  margin-bottom: 20px;
  color: var(--text-secondary, #666);
}
.breadcrumb a {
  color: inherit;
  text-decoration: none;
}
.breadcrumb a:hover {
  text-decoration: underline;
}
```

---

## 8. Website Metadata Scan

### 8.1 Scan Process

Service `WebsiteMetadataService.scanAndUpsert(websiteId)`:

1. **SSH đọc homepage** — `cat /home/{domain}/public_html/index.html`
2. **Extract header** — nội dung giữa `<header>` và `</header>` (bao gồm tag)
3. **Extract footer** — nội dung giữa `<footer>` và `</footer>` (bao gồm tag)
4. **Extract styles** — tất cả `<style>` blocks → merge thành 1 string
5. **Parse CSS variables** — regex extract `--name: value;` patterns
6. **Detect language** — `<html lang="...">` hoặc heuristic từ content
7. **Extract site name** — từ `<title>` hoặc `og:site_name`
8. **Extract meta description** — `<meta name="description">`
9. **Extract favicon** — `<link rel="icon">` hoặc `<link rel="shortcut icon">`
10. **Extract logo** — `<img>` trong header có class/alt chứa "logo"
11. **Extract GSC key** — `<meta name="google-site-verification">`
12. **Check sitemap** — `test -f /home/{domain}/public_html/sitemap.xml`
13. **Scan categories** — `ls -d /home/{domain}/public_html/*/` → filter có `index.html`
14. **Build template** — assemble `articleTemplate` từ extracted components + default article CSS

### 8.2 Scan Freshness

- Metadata được cache — `lastScannedAt` field
- Stale sau 7 ngày (configurable)
- Daily cron rescan tất cả websites lúc 05:00
- Manual trigger qua API endpoint `POST /website-metadata/scan`
- Auto-scan khi deploy mà metadata chưa có hoặc stale

### 8.3 Category Resolution

```typescript
function resolveCategory(requestedCategory: string, availableCategories: string[]): string {
  // 1. Exact match
  if (availableCategories.includes(requestedCategory)) {
    return requestedCategory;
  }
  // 2. Fallback to "tong-hop" (available on 107/128 sites)
  if (availableCategories.includes('tong-hop')) {
    return 'tong-hop';
  }
  // 3. Fallback to first available category
  return availableCategories[0] || 'tong-hop';
}
```

---

## 9. Job Types & Worker

### New Job Types

| Job Type | Params | Action |
|----------|--------|--------|
| `deploy_guest_post` | `{ guestPostId, websiteIds }` | Tạo article trên mỗi website: resolve category → render → write file → sitemap → internal links |
| `undeploy_guest_post` | `{ guestPostId, websiteIds? }` | Xóa article: delete file → remove dir → update sitemap → remove internal links. Nếu không có websiteIds → undeploy all |
| `redeploy_guest_post` | `{ guestPostId }` | Re-render và overwrite file cho tất cả deployed websites (content update) |
| `scan_website_metadata` | `{ websiteIds? }` | Quét homepage: extract header/footer/CSS/nav. Nếu không có websiteIds → scan all active |
| `check_expired_guest_posts` | `{}` | Tìm guest posts hết hạn → undeploy all → set status expired |

### Worker Integration

Thêm 5 case mới vào `worker.service.ts` switch block, xử lý tuần tự giống các job types hiện có. Mỗi handler:

- Log progress per website
- Update job progress (`updateProgress`)
- Write history records
- Send Discord notifications khi hoàn thành

---

## 10. Cron Schedules

### New Crons

| Schedule | Job Type | Mô tả |
|----------|----------|-------|
| `0 2 * * *` | `check_expired_guest_posts` | Check và xử lý guest posts hết hạn |
| `0 5 * * *` | `scan_website_metadata` | Rescan metadata tất cả websites |

### Full Cron Schedule (sau khi thêm guest post)

| Time | Jobs |
|------|------|
| 02:00 | `check_expired` + `check_expired_footer_links` + `check_expired_guest_posts` |
| 03:00 | `verify_deployments` |
| 04:00 | `sync_websites` |
| 05:00 | `scan_website_pages` + `scan_website_metadata` |
| 07:00 & 19:00 | `remindPendingLinks` (Discord notification) |

---

## 11. Discord Notifications

Webhook riêng: `discord.guestPostWebhookUrl` (env `DISCORD_GUEST_POST_WEBHOOK_URL`). Nếu chưa cấu hình → fallback về webhook chính (`DISCORD_WEBHOOK_URL`).

| Event | Notification | Trigger |
|-------|-------------|---------|
| Created | New Guest Post — title, target URL, word count, status | `POST /guest-posts` |
| Updated | Guest Post Updated — changed fields diff | `PATCH /guest-posts/:id` |
| Pending Review | Sale edit active → pending — cần admin approve | PATCH (sale edit active) |
| Status Change | Status Changed — old → new | Toggle endpoint |
| Deploy Result | Deployed — success/failed counts + article URLs per website | Job completion |
| Undeploy Result | Undeployed — removed count | Job completion |
| Expired | Guest Posts Expired — list of expired posts | Cron check |
| Deleted | Guest Post Deleted — title, category, target URL | DELETE endpoint |
| SEO Toggle | Status Changed — `noindex` ↔ `real-public` | Toggle-public endpoint |

---

## 12. Frontend Pages

Refine v4 + Ant Design v5. Các pages mới tại `apps/web/src/pages/guest-posts/`.

### 12.1 List Page (`list.tsx`)

| Column | Sortable | Filter | Ghi chú |
|--------|----------|--------|---------|
| Title | Yes | — | Mobile: hiển thị kèm anchorText |
| Target URL | No | — | Chỉ hiện ≥ lg |
| Category | Yes | — | Tag, hiện ≥ md |
| Status | No | Select (pending/active/disabled/expired) | Tag màu + tooltip |
| SEO | No | Select (Public/NoIndex) | Tag `Public`/`NoIndex` theo `realPublic` |
| Sites | No | — | Số requestedWebsiteIds |
| Words | Yes | — | wordCount |
| Expires / Created By / Created | Yes | — | Responsive theo breakpoint |
| Actions | — | — | View, Edit, Toggle (admin, Popconfirm) |

### 12.2 Create / Edit Page (`create.tsx`, `edit.tsx`, `form-utils.tsx`)

- **AI panel** (chỉ trang create, chỉ hiện khi server có ANTHROPIC_API_KEY): nhập topic + số từ → gọi `generate-content` → tự điền title/slug/metaDescription/category/content, set `contentSource: 'ai'`
- **Form fields**: title, slug (auto-generate từ title khi chưa touched + manual override, validate `^[a-z0-9-]+$`), category (AutoComplete với 8 category phổ biến + free text), metaDescription (max 300, showCount), anchorText, targetUrl, rel (select 6 options), expiresAt (date picker), websiteIds (`WebsiteSelector`)
- **Content editor**: `Input.TextArea` HTML (monospace) + đếm từ realtime + nút "Chèn backlink vào cuối nội dung" (build `<a>` từ anchorText/targetUrl/rel)
- **Preview**: nút "Preview bài viết" — load `articleTemplate` của website đầu tiên đã chọn, replace placeholders client-side, render trong modal iframe sandbox
- **Edit**: `initialWebsiteIds` = deployed → requestedWebsiteIds → empty (copy pattern footer link); Alert cảnh báo slug/category chỉ áp dụng cho deploy mới khi đã có deployment

### 12.3 Show Page (`show.tsx`)

- 3 tabs: **Thông tin** (Descriptions + bảng deployments per-website: article URL clickable, status, category, sitemap, deployed at, error), **Nội dung** (iframe sandbox preview content), **Lịch sử** (timeline audit log + pagination)
- Header actions: Edit, Export CSV, **Go Public / Về NoIndex** (admin, Popconfirm giải thích hậu quả SEO), Approve (pending), Disable/Enable, Delete
- Tag **SEO** (`Real Public`/`NoIndex`) trong Descriptions

### 12.4 Website Metadata (section trong Website detail — `websites/show.tsx`)

- Section "Guest Post Metadata": siteName, language, categories (tags), hasSitemap, lastScannedAt
- Buttons: **Rescan** (queue `scan_website_metadata` job cho site này), **Refresh**, **Preview Template** (modal iframe từ `GET /website-metadata/:id/preview`)

---

## 13. Reuse Analysis — Kế thừa từ Text Link & Footer Link

> **Kết luận**: Guest Post kế thừa ~70% code từ Footer Link (bản thân Footer Link đã được fork từ Text Link). Phần viết mới chủ yếu nằm ở deployment layer (template engine, metadata scan), không ảnh hưởng đến CRUD/UI pattern. **Nên fork từ Footer Link** vì nó là bản evolved hơn — có website sync logic tốt hơn trong controller update, có CSV export, và deployment grouping pattern.

### 13.1 Tổng quan mức độ kế thừa

| Mức độ | Tỷ lệ | Mô tả |
|--------|--------|-------|
| **Copy trực tiếp** | ~70% | CRUD service, history service, controller structure, DTO shared fields, status flow, worker handlers, Discord notifications, cron patterns |
| **Adapt / Modify** | ~20% | Deployment service (tạo file thay vì chèn snippet), show page deployments tab, edit page initialWebsiteIds, CSV export, toggle logic |
| **Viết mới** | ~10% | Content editor, article template engine, website metadata scan, sitemap update, category resolution, article preview |

### 13.2 Backend — Chi tiết kế thừa

#### Service Layer

| Component | Nguồn kế thừa | Thay đổi cần thiết |
|-----------|---------------|---------------------|
| `GuestPostsService` | Copy từ `FooterLinksService` | Bỏ `apiKeyId` populate, thêm `wordCount` auto-calc khi save |
| `GuestPostsController` | Copy từ `FooterLinksController` | Thêm content validation, slug generation. Toggle logic copy ~100% |
| `GuestPostHistoryService` | Copy từ `FooterLinkHistoryService` | Chỉ đổi `footerLinkId` → `guestPostId` |
| `GuestPostDeploymentsService` | Tham khảo `FooterLinkDeploymentsService` | Thay `insertFooterLink()` → render full article HTML. Thay `removeFooterLink()` → delete file + dir |
| Worker handlers (5 jobs) | Copy từ footer-link handlers | Đổi service calls, thêm sitemap + internal links logic |
| Discord methods | Copy footer-link notification set | Đổi embed fields (thêm wordCount, category) |

#### Shared Service Methods (giống hệt giữa TextLinksService và FooterLinksService)

Các methods sau tồn tại trong cả 2 service với logic 100% giống nhau, copy trực tiếp cho `GuestPostsService`:

- `findAll(query: ParsedQuery)` — chỉ khác populated fields
- `findById(id: string)` — tương tự
- `create(data: Partial<T>)` — giống hệt
- `update(id: string, data: Partial<T>)` — `findByIdAndUpdate` with `$set`, `{new: true}`
- `delete(id: string)` — `findByIdAndDelete`
- `findExpired()` — `{status: 'active', expiresAt: {$lte: new Date()}}`
- `countByStatus(status: string)` — giống hệt
- `countExpiringWithinDays(days: number)` — giống hệt

#### DTO Fields

**6 fields copy trực tiếp** từ `CreateFooterLinkDto` (cùng validation decorators):

| Field | Validation | Ghi chú |
|-------|-----------|---------|
| `title` | `@IsString() @MaxLength(500)` | Giữ nguyên |
| `anchorText` | `@IsString() @MaxLength(500)` | Giữ nguyên |
| `targetUrl` | `@IsUrl({protocols:['http','https'], require_protocol:true}) @MaxLength(2048)` | Giữ nguyên |
| `rel` | `@IsString() @Matches(regex whitelist)` | Giữ nguyên |
| `expiresAt` | `@IsDateString()` | Giữ nguyên |
| `websiteIds` | `@IsArray() @IsString({each:true})` | Giữ nguyên |

**Bỏ** (chỉ có ở Footer Link): `pageCount`, `includeHomepage`

**Thêm mới** cho Guest Post:

| Field | Validation | Ghi chú |
|-------|-----------|---------|
| `content` | `@IsString()` | Nội dung HTML body bài viết |
| `slug` | `@IsString() @Matches(/^[a-z0-9-]+$/)` | URL slug |
| `category` | `@IsString()` | Category path |
| `metaDescription` | `@IsString() @MaxLength(300)` | SEO meta description |
| `contentSource` | `@IsString() @IsIn(['manual', 'ai'])` | Nguồn nội dung |

#### Controller — Toggle Logic (copy ~100%)

Logic toggle trong `FooterLinksController` (lines 284-357) áp dụng gần như nguyên cho guest post:

```
active   → toggle → disabled  : tạo undeploy_guest_post job + update status
disabled → toggle → active    : tìm previous deployments → tạo deploy_guest_post job
pending  → toggle → active    : redeploy existing + deploy to new websiteIds
```

Logic admin edit websiteIds (lines 162-183 trong `FooterLinksController`) — tính diff `toAdd`/`toRemove` rồi tạo jobs tương ứng — cũng copy nguyên.

#### History Service (copy 100%)

Hai history services (`TextLinkHistoryService` và `FooterLinkHistoryService`) chỉ khác nhau đúng 1 field name. Guest post copy rồi đổi:

```typescript
// FooterLinkHistoryService            →  GuestPostHistoryService
footerLinkId: string                   →  guestPostId: string
findByFooterLink(id, page, limit)      →  findByGuestPost(id, page, limit)
```

### 13.3 Frontend — Chi tiết kế thừa

#### File-by-file analysis

| Page | Nguồn fork | Reuse % | Thay đổi |
|------|-----------|---------|----------|
| `list.tsx` (~201 lines) | Footer Link `list.tsx` | ~85% | Đổi columns: bỏ Sites/Pages, thêm Category + Word Count. Toggle + responsive actions + status filters giữ nguyên |
| `create.tsx` (~91 lines) | Footer Link `create.tsx` | ~60% | Giữ: title, anchorText, targetUrl, rel, expiresAt, websiteIds, role-based Alert. Bỏ: pageCount, includeHomepage. Thêm: slug, category select, content editor, metaDescription |
| `edit.tsx` (~103 lines) | Footer Link `edit.tsx` | ~60% | Tương tự create. Logic `initialWebsiteIds` copy 100% (deployed → requestedWebsiteIds → empty) |
| `show.tsx` (~366 lines) | Footer Link `show.tsx` | ~70% | Descriptions fields giữ phần lớn. Deployment table đơn giản hơn (1 row/site thay vì grouped by domain). Thêm content preview. HistoryTab copy 100% |

#### UI Components dùng nguyên (không cần sửa)

| Component | Source file | Ghi chú |
|-----------|-----------|---------|
| `WebsiteSelector` | `components/WebsiteSelector.tsx` (183 lines) | Checkbox grid, Select All/Deselect All, filter, shift-click range select, multi-column responsive layout — **dùng nguyên 100%** |
| `HistoryTab` | Inline component trong `show.tsx` (78 lines) | Timeline + action labels + old→new diffs + pagination — chỉ đổi API path |
| Status color map | Inline object trong `list.tsx` + `show.tsx` | `{active: 'green', pending: 'gold', disabled: 'red', expired: 'default'}` — **giống hệt** |
| Rel Select options | Inline trong `create.tsx` + `edit.tsx` | 6 options: nofollow, sponsored, nofollow sponsored, ugc, noopener, nofollow noopener — **giống hệt** |

#### UI Patterns dùng nguyên

| Pattern | Mô tả | Áp dụng |
|---------|-------|---------|
| Responsive form layout | `Row/Col` với `span = screens.md ? 12 : 24` | create.tsx, edit.tsx |
| Role-based Alert | Sale thấy warning "pending until admin approves" | create.tsx, edit.tsx |
| Status Tag + Tooltip | Color-coded Tag + hover hint (InfoCircleOutlined) | list.tsx, show.tsx |
| Toggle Popconfirm | Context-dependent title/description per status | list.tsx, show.tsx |
| Responsive column visibility | `Grid.useBreakpoint()` → show/hide columns per breakpoint | list.tsx |
| Mobile Dropdown actions | View / Edit / Toggle menu thay cho inline buttons | list.tsx |
| Header action buttons | Edit / Approve / Disable / Enable / Delete with Popconfirm | show.tsx |
| CSV Export | Build CSV blob with BOM, download as file | show.tsx |
| Direct API calls | `axiosInstance.post/delete()` cho toggle/delete (không qua Refine data provider) | list.tsx, show.tsx |

### 13.4 Phần viết mới (không có trong Text Link / Footer Link)

| Component | Lý do không thể reuse | Estimate |
|-----------|----------------------|----------|
| Content editor (WYSIWYG / HTML) | Text link/footer link chỉ có `anchorText`, không có body content | Medium |
| Article template engine | Render full HTML page từ metadata + content — hoàn toàn mới | Medium |
| `WebsiteMetadataService` | Scan homepage via SSH, extract header/footer/CSS/nav — mới | Large |
| `WebsiteMetadata` schema | Mới — không có tương đương trong hệ thống | Small |
| Sitemap update logic | Read/write sitemap.xml — text link/footer link không touch sitemap | Small |
| Category resolution | Match category với available dirs trên website — mới | Small |
| Article preview panel | Render template + content real-time trong frontend — mới | Medium |
| Slug generation + uniqueness check | Auto-generate từ title, check dir exists via SSH — mới | Small |

---

## 14. Constraints & Rules

### 14.1 File System Rules

> **CRITICAL**: Không thay đổi cấu trúc thư mục existing. Chỉ được TẠO thư mục mới cho bài viết (`/{cat}/{slug}/`). Tuyệt đối KHÔNG rename, move, merge, hoặc restructure bất kỳ directory/file nào đã có trên website.

- Chỉ tạo directory/file mới, không modify structure existing
- URL pattern phải khớp existing: `/{category}/{slug}/index.html`
- Dùng CSS/template của từng site — không inject external CSS
- Backup `sitemap.xml` trước khi modify (`.bak.{timestamp}`)
- Backup pages trước khi chèn internal links
- Khi undeploy: chỉ xóa slug directory, KHÔNG xóa category directory

### 14.2 Content Rules

- Content phải là valid HTML (sanitize XSS trước khi save)
- Backlink URL chỉ chấp nhận `http://` hoặc `https://`
- Slug chỉ chấp nhận: lowercase alphanumeric + hyphens (`/^[a-z0-9-]+$/`)
- Slug unique per category per website (check trước khi deploy)
- Rel attribute whitelist: `nofollow`, `noopener`, `noreferrer`, `sponsored`, `ugc`, `external`

### 14.3 Processing Rules

- Serial job processing — 1 job tại 1 thời điểm (giống text-link/footer-link)
- Metadata scan timeout: 30s per website
- Deploy timeout: 60s per website
- Nếu deploy fail 1 website → continue to next, log error, mark deployment as `failed`

### 14.4 Security

- Path validation: chỉ cho phép paths bắt đầu bằng `/home/`, `/usr/local/lsws/`, `/var/www/`, `/tmp/`
- HTML content sanitize: strip `<script>`, `on*` attributes, `javascript:` URLs
- Escape tất cả user input khi insert vào template
- File path traversal prevention: reject paths chứa `..`

---

## 15. Implementation Phases

| Phase | Scope | Status | Deliverables (as-built) |
|-------|-------|--------|-------------------------|
| **Phase 1** | Website Metadata | ✅ Done | `website-metadata` schema + service, scan logic (extract header/footer/CSS/categories/sitemap/GSC/favicon/logo), API endpoints (get, scan, preview), job `scan_website_metadata`, cron 05:00. **Chưa chạy initial scan** — cần trigger sau khi deploy (`POST /website-metadata/scan` hoặc đợi cron) |
| **Phase 2** | Guest Post CRUD | ✅ Done | `guest-posts` schema + DTOs + service (sanitize XSS, wordCount, slugify) + controller đầy đủ endpoints, `guest-post-history` module, status flow + realPublic flag |
| **Phase 3** | Deployment Engine | ✅ Done | `guest-post-deployments` schema + service, template rendering, deploy (mkdir/write/sitemap gated theo realPublic), undeploy (delete/rmdir/sitemap/ilink cleanup), redeploy (re-render + preserve ilinks + sync sitemap) |
| **Phase 4** | Jobs + Worker + Discord | ✅ Done | 5 job handlers trong worker, Discord notifications (webhook riêng, fallback webhook chính), cron 02:00 check expired, **internal linking đã implement** (không defer) |
| **Phase 5** | Frontend | ✅ Done | List + filters (status/SEO), create/edit + HTML editor + preview per-site, show 3 tabs + CSV export + SEO toggle, website metadata section trong Website detail |
| **Phase 6** | AI Content | ✅ Done | `content-generation` module — API integration qua `@anthropic-ai/sdk` (không làm CLI), structured JSON output (title/metaDescription/category/content), auto slug + sanitize + word count. Endpoint `generate-content` + `ai-status`, AI panel trong create page |

### Chưa làm / cân nhắc tương lai

- E2E automation cho guest post (hiện chỉ có manual checklist GP-01→GP-14 trong `E2E_TEST_CASES.md`)
- `verify_deployments` job chưa cover guest post articles (mới verify text links)
- Content quality check nâng cao cho AI output (hiện chỉ sanitize + word count)
- Dashboard stats cho guest posts

---

## 16. Environment Variables

Các biến môi trường mới cho Guest Post (đã khai báo trong `docker-compose.yml` và `.env.example`):

| Biến | Bắt buộc | Default | Mô tả |
|------|----------|---------|-------|
| `DISCORD_GUEST_POST_WEBHOOK_URL` | Không | rỗng | Webhook Discord riêng cho guest post. Rỗng → fallback về `DISCORD_WEBHOOK_URL` |
| `ANTHROPIC_API_KEY` | Không | rỗng | API key cho Phase 6 AI generation. Rỗng → panel AI tự ẩn, endpoint trả 400 với message rõ ràng, mọi tính năng khác hoạt động bình thường |
| `AI_MODEL` | Không | `claude-opus-4-8` | Model Claude dùng để viết bài |

## Checklist sau khi deploy lần đầu

1. `git pull` + `docker compose up -d --build api web` trên server
2. Thêm env vars ở trên vào `/opt/vs-cms/.env` (nếu dùng)
3. Chạy scan metadata toàn bộ websites: `POST /website-metadata/scan` (không body) hoặc đợi cron 05:00
4. Test theo checklist **GP-01 → GP-14** trong `docs/E2E_TEST_CASES.md`
