# Guest Post Feature — VS-CMS

Tài liệu chi tiết tính năng **Guest Post**: tạo bài viết HTML hoàn chỉnh trên ~122 website tĩnh, kèm backlink, deploy qua SSH. Nội dung phản ánh đúng hiện trạng source (`apps/api/src/modules/guest-posts`, `guest-post-deployments`, `content-generation`, `website-metadata`, `jobs/worker.service.ts`, `apps/web/src/pages/guest-posts`).

---

## 1. Tổng quan & khác biệt với text/footer link

| | Text link | Footer link | **Guest post** |
|---|---|---|---|
| Cơ chế | Chèn `<a>` vào `<div id="vs-cms-links">` của **homepage** có sẵn | Chèn `<a>` vào footer của **nhiều trang** có sẵn | **Tạo FILE HTML MỚI** tại `/home/{domain}/public_html/{category}/{slug}/index.html` |
| Nội dung | Chỉ 1 anchor | Chỉ 1 anchor | Cả bài viết (500–2000 từ) + 1..N backlink trong bài |
| Sinh nội dung | — | — | AI viết **mỗi website một bài riêng** lúc deploy |
| Template | — | — | Khung HTML per-site (giữ nguyên header/footer/CSS của site) |
| Khi hết hạn | Gỡ hẳn link | Gỡ hẳn link | **Chỉ gỡ backlink, GIỮ bài viết** trên site |

Điểm cốt lõi: guest post trông như **bài "chính chủ"** của từng site (đúng khung giao diện, đúng chuyên mục, có SEO tags, có internal link), backlink được nhúng tự nhiên trong thân bài và có thể gỡ riêng khi hết hạn mà không xóa bài.

Tài liệu module tổng quan: `CLAUDE.md`. Đây là tài liệu con chuyên sâu về guest post.

---

## 2. Data model

### 2.1 `guestposts` (schema: `guest-posts/schemas/guest-post.schema.ts`)

| Field | Kiểu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `title` | string | (required) | Tiêu đề. Bài AI: title **tạm** (từ `aiTopic` hoặc `AI: {anchorText}`); title thật do AI sinh per-site lúc deploy |
| `slug` | string | (required) | Slug master (bài AI ít dùng vì slug thật sinh per-site) |
| `content` | string | `''` | HTML đã sanitize. **Rỗng với bài AI** — content thật sinh riêng từng site |
| `metaDescription` | string | `''` | Meta description master |
| `category` | string | (required) | Category slug (backend đặt `tong-hop` nếu trống) |
| `anchorText` | string | (required) | Anchor của **backlink chính** |
| `targetUrl` | string | (required) | URL đích backlink chính |
| `rel` | string \| null | `null` | rel của backlink chính (token hợp lệ: nofollow/noopener/noreferrer/sponsored/ugc/external) |
| `status` | string | `pending` | `pending` \| `active` \| `disabled` \| `expired` |
| `realPublic` | boolean | `false` | `false` = noindex + không sitemap; `true` = index,follow + vào sitemap |
| `hideBacklink` | boolean | **`true`** | Backlink chính vẫn chèn nhưng bọc `display:none` (ẩn tạm khi lên prod) |
| `extraBacklinks` | `Backlink[]` | `[]` | Backlink phụ (tối đa 9), sub-schema `{anchorText, targetUrl, rel, hideBacklink}` |
| `source` | string | `admin` | `admin` \| `sale` |
| `createdBy` | ObjectId(User) | `null` | Người tạo |
| `expiresAt` | Date \| null | `null` | Hạn (áp cho **toàn bộ** backlink chính + phụ) |
| `requestedWebsiteIds` | string[] | `[]` | Danh sách site người dùng chọn (dùng khi approve/enable) |
| `wordCount` | number | `0` | Số từ content master |
| `contentSource` | string | `manual` | `ai` \| `manual`. UI luôn tạo `ai` |
| `aiTopic` | string \| null | `null` | Chủ đề AI (trống = AI tự chọn theo metadata site) |
| `aiWordCount` | number \| null | `null` | Số từ mong muốn cho AI |

Index: `status`, `expiresAt`, `createdBy`, `slug`.

Sub-schema `Backlink` (`_id: false`): `anchorText` (required), `targetUrl` (required), `rel` (default `null`), `hideBacklink` (default `true`). Backlink phụ **không có `expiresAt` riêng** — chung hạn với post.

`create()`/`update()` sanitize HTML (`sanitizeHtml`: strip `<script>/<style>/<iframe>/<object>/<embed>`, gỡ `on*` handler, vô hiệu `javascript:/data:/vbscript:` URL) + đếm `wordCount` khi có content.

### 2.2 `guestpostdeployments` (schema: `guest-post-deployments/schemas/guest-post-deployment.schema.ts`)

Một record per (guestPost × website). Unique index `(guestPostId, websiteId)`.

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `guestPostId` / `websiteId` | ObjectId | Ref |
| `filePath` | string | Đường dẫn file trên site: `{documentRoot}/{category}/{slug}/index.html` |
| `pagePath` | string | URL path: `/{category}/{slug}/` |
| `category` | string | Category đã resolve trên site này |
| `status` | string | `deployed` \| `failed` \| `removed` |
| `deployedAt` | Date | Lần deploy gần nhất |
| `firstDeployedAt` | Date | Lần deploy ĐẦU TIÊN — dùng làm `datePublished` (SEO), không đổi khi redeploy |
| `removedAt` | Date | Thời điểm undeploy |
| `title` / `content` / `metaDescription` | string \| null | **Nội dung AI riêng cho site này** (null = dùng content chung của post). `content` lưu bản ĐÃ bọc marker gplink |
| `wordCount` | number | Số từ bài per-site |
| `lastVerifiedAt` | Date | (cho verify sau này) |
| `errorMessage` | string \| null | Lỗi deploy gần nhất |
| `addedToSitemap` | boolean | Đã thêm URL vào sitemap.xml chưa |
| `backlinkRemoved` | boolean | `true` = backlink đã gỡ (post expired) nhưng bài vẫn sống trên site |
| `internalLinksCount` | number | Số file khác đang trỏ internal link đến bài này |
| `internalLinkSourceFiles` | string[] | Đường dẫn các file đã chèn internal link "Xem thêm" trỏ đến bài này |

Index thêm: `guestPostId`, `(websiteId, status)`.

### 2.3 `websitemetadata` (schema: `website-metadata/schemas/website-metadata.schema.ts`)

Một record per website (unique `websiteId`). Là **khung template** để render bài.

| Field | Ý nghĩa |
|---|---|
| `siteName` / `siteDescription` / `language` | Metadata cơ bản (language: `vi`/`en`, detect từ `<html lang>` hoặc dấu tiếng Việt) |
| `headerHtml` / `footerHtml` | Header/footer đã **strip marker VS-CMS + external links** |
| `navCategories` | Danh sách category dir có `index.html` (từ `listCategoryDirs`) |
| `inlineStyles` | Gộp nội dung các `<style>` của homepage |
| `stylesheetLinks` | Các `<link rel="stylesheet">` (+ `preconnect`) của homepage — nhúng CSS ngoài vào template; href tương đối → root-absolute |
| `templateSource` | `detail-page` (khung từ trang bài thật) \| `homepage` (fallback dựng từ header/footer) |
| `templateSamplePath` | Đường dẫn trang detail mẫu đã dùng làm khung (khi `detail-page`) |
| `cssVariables` | Parse `--var: value` từ inline styles |
| `logoUrl` / `faviconUrl` | Trích từ header / `<link rel=icon>` |
| `gscVerificationKey` | `google-site-verification` meta |
| `hasSitemap` / `sitemapPath` | Site có `sitemap.xml` ở docRoot không |
| `articleTemplate` | **Template HTML** với placeholder `{title}`, `{metaDescription}`, `{category}`, `{categoryName}`, `{content}`, `{robotsMeta}`, `{seoMeta}`, `{publishedDate}` |
| `lastScannedAt` | Scan lần cuối (fresh trong 7 ngày → không scan lại) |

Prod đã scan 119/119 sites; 117 có wrapper `detail-page`.

---

## 3. Template engine (2 chiến lược)

`WebsiteMetadataService.scanAndUpsert()` đọc homepage của site (`homepagePath` hoặc `{docRoot}/index.html`), trích header/footer/CSS/categories/sitemap, rồi build `articleTemplate` theo thứ tự ưu tiên:

### 3.1 Chiến lược 1 — `detail-page` (ưu tiên, chuẩn nhất)

`SshService.findDetailPages()` tìm tối đa 3 trang `/{cat}/{slug}/index.html` (`find -mindepth 3 -maxdepth 3 -name index.html`). Với mỗi trang, `buildTemplateFromDetailPage()`:

1. **Validate**: phải có `<html>`, `<head>`, `<title>` — thiếu → trả `null`, thử trang tiếp theo.
2. **Strip**: gỡ toàn bộ marker VS-CMS (`vs-cms*:{id}`) + link external (khác domain site) khỏi khung — bài mẫu có thể chứa backlink gplink/ilink/footer của khách khác.
3. **HEAD**: thay `<title>` → `{title} - {siteName}`, thay/chèn `<meta name="description" content="{metaDescription}">`; **gỡ SEO tags cũ** của bài mẫu (robots, canonical, `og:*`, `article:*`, `twitter:*`, JSON-LD); chèn placeholder `{robotsMeta}` + `{seoMeta}` ngay sau `<head>`.
4. **BODY — tái tạo wrapper căn giữa**: nhiều site đặt `<div class="container ...-inner">` ngay bên trong `<article>`. `firstChildWrapper()` lấy thẻ mở của wrapper đó; `replaceBalancedInner()` thay **toàn bộ ruột** `<article>` (hoặc `<main>` nếu không có article) bằng khối chuẩn — nhưng **giữ nguyên wrapper** để không tràn viền:
   ```html
   <wrapper mở của site>
     <h1>{title}</h1>
     {publishedDate}
     <div class="article-body">{content}</div>
   </wrapper>
   ```
   Cách này **loại meta-bar tác giả/ngày cứng** của bài mẫu (bị thay sạch). Không tìm được article/main để thay → trả `null` → fallback.
5. **BREADCRUMB**: nếu site có `.breadcrumb` (nav/div/ol/ul) → thay ruột bằng breadcrumb chuẩn (giữ thẻ + class của site); không có → chèn breadcrumb inline-style trước `<h1>`.
6. **CSS tối thiểu**: chèn `<style>` cho `.article-body` (không đè style site).
7. **Validate placeholder**: phải đủ `{title}`, `{metaDescription}`, `{content}`, `{robotsMeta}`, `{seoMeta}`, `<h1>{title}</h1>` — thiếu → `null` → fallback.

Kết quả: giữ nguyên **100% head/CSS/header/footer/sidebar/scripts** của site, chỉ thay title/meta/content/breadcrumb. `templateSource='detail-page'`, `templateSamplePath` lưu trang mẫu.

### 3.2 Chiến lược 2 — `homepage` (fallback)

Không có trang detail hợp lệ → `buildArticleTemplate()` dựng khung tối thiểu từ metadata: `<head>` (charset, viewport, title, description, robots/seo placeholder, favicon, **stylesheetLinks**, gsc tag, inline styles + `ARTICLE_CSS`) + `headerHtml` + `<main class="article-content">` (breadcrumb + article + `{publishedDate}`) + `footerHtml`. `templateSource='homepage'`.

### 3.3 Làm sạch header/footer (`stripManagedAndExternalLinks`)

Áp cho cả header/footer homepage lẫn khung detail-page:
1. Gỡ block link do VS-CMS quản lý: `<!-- vs-cms*:{24hex} -->...<!-- /... -->` (footer/text link trả phí **không được "đi ké" miễn phí** vào guest post; và khi hết hạn bản copy sẽ không được track để gỡ).
2. Gỡ mọi `<a>` external (href khác domain site) — chỉ giữ link nội bộ (nav, logo…).

Header lấy phần tử `<header>`/`class~=header` **đầu tiên**; footer lấy phần tử **cuối cùng** (tránh nhầm `card-footer` giữa trang). `extractRegion` ưu tiên thẻ semantic, fallback `extractBalancedByClass` (div/section/nav có class/id chứa keyword) + `findBalancedClose()` đếm thẻ mở/đóng cân bằng (regex non-greedy sẽ đứt ở thẻ con đầu tiên).

---

## 4. SEO rendering (`renderArticle`)

`renderArticle(template, {title, content, metaDescription}, category, options)` thay placeholder **một lượt duy nhất** (`replaceAll` gộp regex — giá trị đã thay không bị quét lại, nên content chứa chuỗi `{content}` không phá được head/body). Template cũ thiếu placeholder được **inject backward-compat** lúc render (`{robotsMeta}`, `{seoMeta}`, `{publishedDate}`).

Các tag SEO sinh ra (`buildSeoMeta`):
- `robotsMeta`: `noindex, nofollow` khi `!realPublic`, ngược lại `index, follow`.
- `<link rel="canonical">` = `https://{domain}{pagePath}`.
- Open Graph: `og:type=article`, `og:title`, `og:description`, `og:url`, `og:site_name`, `og:locale` (`vi_VN`/`en_US`).
- `article:published_time` = `firstDeployedAt`; `article:modified_time` = now.
- `twitter:card=summary`.
- JSON-LD `Article`: headline, description, mainEntityOfPage, `datePublished` (= `firstDeployedAt`), `dateModified`, publisher/author (Organization = siteName). Escape `<` → `<` để tránh `</script>` trong data phá thẻ.
- **Ngày đăng hiển thị** dưới `<h1>` (`buildPublishedDateHtml`): `Ngày đăng: dd/mm/yyyy` (vi) / `Published: ...` (en), inline-style.

`renderPreview(websiteId)`: render template với bài mẫu (dùng cho preview UI / endpoint `/website-metadata/:id/preview`).

---

## 5. Status flow & realPublic

### 5.1 Status (giống text/footer link)

```
Sale tạo   → pending → (admin Approve/toggle) → active → (Disable) → disabled → (Enable) → active
Admin tạo  → active (skip pending), auto deploy nếu chọn websiteIds
Sale sửa nội dung bài active → về pending (cần duyệt lại)
active + hết hạn (cron 02:00) → expired (gỡ backlink, giữ bài) → (Kích hoạt lại) → active
```

`toggle` (admin, `POST /:id/toggle`) xử lý theo status hiện tại:
- **active → disabled**: hủy pending deploy/redeploy/regenerate, tạo `undeploy_guest_post`.
- **disabled → active**: hủy pending undeploy, tạo `deploy_guest_post` cho **tất cả** site từng deploy (mọi status) ∪ `requestedWebsiteIds`.
- **pending → active** (Approve): tạo `redeploy_guest_post` cho site đã `deployed` + `deploy_guest_post` cho `requestedWebsiteIds` chưa track.
- **expired → active** (Kích hoạt lại): xóa `expiresAt` **chỉ khi đã qua** (hạn tương lai admin vừa đặt thì giữ), tạo `redeploy_guest_post` → chèn lại backlink.

### 5.2 `realPublic` (SEO gating, độc lập status)

Mặc định `false` = **noindex + không sitemap**. `POST /:id/toggle-public` đảo cờ, tạo `redeploy_guest_post` để re-render meta robots + đồng bộ sitemap trên site đã deploy. **Chặn toggle khi post `expired`** (phải kích hoạt lại trước).

---

## 6. Backlink & marker

### 6.1 Cấu trúc

Mỗi post có **backlink chính** (`anchorText`/`targetUrl`/`rel`/`hideBacklink`) + mảng **`extraBacklinks[]`** (tối đa 9, chung `expiresAt`). `getAllBacklinks(post)` gộp thành danh sách:
- Backlink chính: `markerId = postId` (giữ format cũ để tương thích ngược).
- Backlink phụ thứ `i`: `markerId = {postId}:{i}` (i bắt đầu từ 1).

### 6.2 Marker (format giống footer link)

```html
<!-- vs-cms-gplink:{markerId} --><a href="..." rel="...">anchor</a><!-- /vs-cms-gplink:{markerId} -->
```

### 6.3 `ensureBacklinks(content, post)` — idempotent

1. `stripOrphanBacklinks()`: gỡ marker của backlink phụ đã bị **xóa/giảm** (redeploy content cũ còn marker thừa) — unlink giữ text nếu là link trong câu, xóa hẳn nếu là đoạn `<p>` hoặc block `display:none`.
2. Với mỗi backlink còn hiệu lực gọi `ensureBacklink()`:
   - **Đã có marker** → refresh block theo anchor/target/rel/hidden **hiện tại** (admin sửa URL/anchor/toggle ẩn → redeploy cập nhật đúng chỗ, không tạo link trùng/stale).
   - **Có `<a>` trỏ đúng `targetUrl` mà chưa bọc marker** (AI chèn hoặc user viết) → bọc marker quanh **MỌI** link khớp (match cả URL thô lẫn dạng entity `&amp;`), bỏ qua link đã nằm trong marker khác (`isInsideGplinkMarker`).
   - **Không có `<a>` nào** → thêm đoạn `<p>Tham khảo thêm: <a ...>anchor</a></p>` cuối bài, bọc marker cả đoạn.
   - `hidden=true` (mặc định): link trong câu bọc `<span style="display:none">`; đoạn "Tham khảo thêm" đặt `style="display:none"` trên `<p>`.

Chỉ chấp nhận URL `http/https` (`ensureBacklink` throw nếu khác); `rel` được `sanitizeRel` (lọc token hợp lệ).

### 6.4 hideBacklink (mặc định **ẩn**)

Backlink **vẫn được chèn** nhưng ẩn bằng `display:none` — dùng để lên prod an toàn rồi bật hiện sau. Đổi cờ (post hoặc từng extra) → tính là content change → redeploy để áp dụng. AI được yêu cầu chèn link với **dấu nháy đơn** `<a href='...'>` (xem §9).

---

## 7. Expire = gỡ backlink, GIỮ bài viết

Cron `check_expired_guest_posts` (02:00) → `handleCheckExpiredGuestPosts` gọi `removeBacklinkFromDeployedFiles(postId)` cho từng post `active` có `expiresAt <= now`.

`removeBacklinkFromHtml(html, postId, targetUrl)` xử lý theo `blockRegex` match marker chính (`postId`) **lẫn** phụ (`postId:{i}`) qua backreference `\1` (đảm bảo thẻ đóng khớp thẻ mở):
- **Đoạn "Tham khảo thêm"** (`inner` bắt đầu bằng `<p>`) → **xóa cả block**.
- **Backlink ẩn** (`<span/p/div style="display:none">`) → **xóa hẳn cả block** (tránh lộ anchor text thành chữ thường khi unlink).
- **Link trong câu (đang hiện)** → **unlink giữ anchor text** (bỏ thẻ `<a>`, giữ text), giữ newline trước marker để chữ không dính từ trước.
- **Fallback** cho file cũ chưa có marker: chỉ strip trong vùng `<article>` (tránh gỡ nhầm link cùng URL ở header/footer, ví dụ footer link cùng khách).

Sau khi gỡ: deployment `backlinkRemoved=true`; **bài viết + sitemap + internal link GIỮ NGUYÊN**.

Nhánh xử lý trong `handleCheckExpiredGuestPosts`:
- **Có site gỡ thất bại** → **GIỮ post `active`** để cron đêm sau retry (site đã gỡ rồi thì no-op). Chỉ khi tất cả site OK mới set `status='expired'` + log history + Discord. Kết quả trả `{expired, retryNextRun}`.
- Re-activate (toggle expired→active) → `redeploy_guest_post` render lại từ content gốc → backlink được chèn lại; xóa `expiresAt` đã qua.
- Lưu ý: `redeployPost` khi `post.status === 'expired'` (ví dụ admin edit bài expired) **KHÔNG khôi phục** backlink — gọi `removeBacklinkFromHtml` sau khi render để giữ trạng thái đã gỡ.

---

## 8. Per-site AI generation khi deploy (`deployToWebsites`)

Post `contentSource='ai'` → `deployToWebsites()` sinh **MỘT BÀI RIÊNG cho từng website** (chống duplicate content):

1. Với mỗi `websiteId`: `getOrScan(websiteId)` lấy metadata; nếu AI configured → `generateArticle()` với `siteContext` (domain, siteName, siteDescription, categories) + `aiTopic`/`aiWordCount` + tất cả backlink (chính + phụ) + language site.
2. Kết quả sanitize, `slugBase` = slugify(title AI). Nếu AI **không** configured nhưng post có `content` dự phòng → dùng content chung (cảnh báo). Không có cả hai → **throw** (deploy site đó fail).
3. **Resolve category** theo site (`resolveCategory`: category trong navCategories → giữ; else `tong-hop`; else category đầu tiên). Validate path segment (`^[a-z0-9-]+$`, no `..`).
4. **Reuse path cũ**: nếu deployment cũ tồn tại → giữ `filePath`/`pagePath`/`category` (URL ổn định khi redeploy/regenerate). Lần đầu → `generateUniqueSlug` (slug trùng → `-2`, `-3`… tối đa 20).
5. `ensureBacklinks()` bọc backlink → `renderArticle()` với `firstDeployedAt` (giữ nguyên nếu đã deploy), noindex theo `realPublic`, canonical, siteName, language.
6. **Preserve internal-link blocks** của bài khác đã chèn vào file (khi overwrite): đọc file cũ, `preserveInternalLinkBlocks(oldHtml, newHtml)`.
7. `createDirectory` + `writeFile`. Sitemap: chỉ thêm nếu `realPublic && hasSitemap && sitemapPath`.
8. Chèn internal links (§10). Upsert deployment: lưu **content per-site đã bọc marker** vào `title`/`content`/`metaDescription`/`wordCount` (chỉ khi `generatedPerSite`), reset `backlinkRemoved=false`.

**Redeploy / toggle-public / regenerate-single KHÔNG regenerate** — dùng content per-site đã lưu (`redeployPost`: `title = deployment.title || post.title`, `content = deployment.content || post.content`). Muốn bài mới: job `regenerate_guest_post`.

**`regenerate_guest_post`** (nút Regenerate per-site, `POST /:id/regenerate`): = `deployToWebsites()` cho site đó → AI viết bài MỚI, **giữ nguyên URL** (reuse path). Chỉ áp dụng post AI + AI configured.

---

## 9. Content generation (`content-generation.service.ts`)

Dùng `@anthropic-ai/sdk`. `isConfigured()` = có `ANTHROPIC_API_KEY`.

`generateArticle(params)`:
- **Model**: `AI_MODEL` env (code default `claude-opus-4-8`; **prod + local hiện đặt `claude-sonnet-5`**).
- **`output_config.format = json_schema`** (`buildArticleSchema`): ép output `{title, metaDescription, category, content}`; `category` là **enum theo categories của site** (nếu có, đã lọc `^[a-z0-9-]+$`), else danh sách default.
- **KHÔNG bật extended thinking**: viết bài là tác vụ generative; thinking (nhất là Sonnet) ngốn phần lớn `max_tokens` → output bị cắt. `max_tokens: 16000`.
- **Prompt**: yêu cầu bài ~N từ, chèn `đủ K backlink` mỗi cái một vị trí khác nhau; **HTML dùng dấu nháy đơn** `<a href='...'>` (dấu `"` va chạm với JSON constrained-decoding gây cắt output); content chỉ `<p>/<h2>/<h3>/<ul>/<ol>/<li>/<strong>/<em>`, không `<h1>/<script>/<style>`, không markdown. `topic` trống + có `siteContext` → AI tự chọn chủ đề hợp site.
- **RETRY tối đa 3 lần** khi:
  - `stop_reason === 'max_tokens'` (TruncatedError),
  - content kết thúc giữa thẻ mở (`/<[a-z][^>]*$/` hoặc `<a...$`),
  - content quá ngắn (`< min(200, target*0.4)` từ),
  - JSON parse lỗi (SyntaxError).
- `stop_reason === 'refusal'` → `BadRequestException` (không retry). `Anthropic.APIError` → `ServiceUnavailableException`. Hết 3 lần → `ServiceUnavailableException`.

Endpoint `POST /guest-posts/generate-content` (trả draft, không lưu DB) vẫn tồn tại nhưng **UI không dùng** (tạo bài 100% AI, sinh lúc deploy). Có `websiteId` → AI đọc metadata site tự chọn chủ đề/category.

---

## 10. Internal links ("Xem thêm")

Khi deploy bài mới, `insertInternalLinks()` tìm tối đa **2 bài cùng category** (đã `deployed`, khác post hiện tại) trên cùng site (sort deployedAt desc), chèn vào cuối `<article>` của các bài đó:

```html
<!-- vs-cms-ilink:{postId} --><p>Xem thêm: <a href="{pagePath}">{title}</a></p><!-- /vs-cms-ilink:{postId} -->
```

- Track file nguồn ở `internalLinkSourceFiles` (+`internalLinksCount`).
- **Undeploy** bài → gỡ ilink markers trỏ đến nó khỏi các file nguồn (`removeInternalLinkMarkers`).
- **Overwrite/redeploy** → `preserveInternalLinkBlocks` giữ lại các ilink block mà bài khác đã chèn vào file (match `vs-cms-ilink:{24hex}` với backreference).

---

## 11. Undeploy / Delete

**Undeploy** (`undeployFromWebsites` — dùng khi disable/undeploy site/xóa): xóa file + `rmdir` slug dir nếu rỗng (**KHÔNG đụng category dir**) + gỡ sitemap entry (nếu `addedToSitemap`) + gỡ ilink markers khỏi file nguồn. Deployment → `status='removed'`, reset internal link fields. `undeployFromAll` gom mọi site `deployed`.

**Delete** (`DELETE /:id`):
1. `cancelPendingJobsFor('guestPostId', id)` — hủy job pending dư thừa.
2. **Chặn nếu có job đang RUNNING** (`hasRunningJobFor`) — đợi xong rồi xóa lại.
3. Log history + Discord.
4. **Luôn tạo `undeploy_guest_post`** trước khi xóa DB — **kể cả Sale xóa bài của chính mình** (tránh bài + backlink mồ côi vĩnh viễn trên site). Sale chỉ xóa được bài do mình tạo (`getCreatorId` check).

---

## 12. Job types & console

19 job types toàn hệ thống; **6 job guest post**:

| Job | Handler | Việc |
|---|---|---|
| `deploy_guest_post` | `handleDeployGuestPost` | `deployToWebsites` (AI generate per-site) + Discord + history |
| `undeploy_guest_post` | `handleUndeployGuestPost` | `undeployFromWebsites` / `undeployFromAll` |
| `redeploy_guest_post` | `handleRedeployGuestPost` | `redeployPost` — re-render, refresh backlink/sitemap, KHÔNG regenerate |
| `regenerate_guest_post` | `handleRegenerateGuestPost` | `deployToWebsites` cho site chỉ định — AI viết lại, giữ URL |
| `scan_website_metadata` | `handleScanWebsiteMetadata` | `scanAndUpsert` build template per-site |
| `check_expired_guest_posts` | `handleCheckExpiredGuestPosts` | Gỡ backlink giữ bài (§7) |

Worker single-threaded, poll 3s, xử lý **1 job/lần** (`onModuleInit` reset job running dở khi restart). Job status có thêm `cancelled` (toggle/delete hủy pending dư thừa qua `cancelPendingJobsFor`).

**JobConsoleLogger** (`common/logging/job-console.logger.ts`, đăng ký ở `main.ts`): custom `ConsoleLogger` — khi worker gọi `startCapture`, **forward mọi dòng log của mọi service** (AI generate, SSH, per-site…) vào `job.logs`, batch flush mỗi **800ms** (tránh ghi Mongo từng dòng); trang Show Job poll 2s khi running để thấy console live. Giới hạn `MAX_CAPTURED=3000` dòng (loại các context bootstrap như InstanceLoader/NestFactory). AI mode log thêm "mỗi website generate một bài riêng (~1-3 phút/site)".

---

## 13. UI (frontend `apps/web/src/pages/guest-posts`)

### Create (`create.tsx`) — 100% AI
Chỉ nhập: **Anchor Text + Target URL** (bắt buộc) + Rel + Expiration + toggle **Ẩn backlink** (mặc định Ẩn) + **Backlink phụ** (nút "Thêm backlink", component `ExtraBacklinks`) + chọn Websites + Chủ đề (tùy chọn) + Độ dài (mặc định 800 từ). `contentSource='ai'` hidden. **Không** có bước generate nháp, **không** chế độ tự viết. title/content master để trống → backend đặt title tạm. Chặn Save nếu AI chưa cấu hình (`fetchAiConfigured`). Sale → Alert bài sẽ ở Pending.

### Edit (`edit.tsx`)
Bài AI: **không sửa content** (mỗi site bài riêng); chỉ chỉnh Title/Anchor/URL/Rel/Expiration/Ẩn backlink/Backlink phụ + tham số AI (aiTopic/aiWordCount cho lần deploy site MỚI). Anchor/URL/Rel/hideBacklink/extraBacklinks đổi → redeploy cập nhật backlink mọi site (URL bài giữ nguyên). Bài manual cũ: có `ContentEditor` (word count live + chèn backlink) + `PreviewButton`. Sale sửa bài active → về pending. Slug/category/meta ẩn (quản lý tự động).

### Show (`show.tsx`)
3 tab: **Thông tin** (Descriptions + bảng Deployments), **Nội dung** (iframe; bài AI báo xem per-site), **Lịch sử** (timeline, poll history endpoint).
- Descriptions gồm cả **Backlink** (Đang ẩn/Hiện) + **Backlink phụ** (list anchor→url + rel + ẩn/hiện).
- Bảng Deployments (admin): cột Website, Article URL, **"Bài viết (AI per site)"** (title per-site), Status (+ tag **"Link đã gỡ"** khi `backlinkRemoved`), Category, Sitemap, Deployed, Error, **Thao tác**: nút **Regenerate** (post AI, per-site, Popconfirm) + **Gỡ** (undeploy per-site). Cả hai disable khi không `deployed`.
- Header buttons: Edit, Export CSV, **Go Public / Về NoIndex** (toggle-public), **Approve** (pending), **Disable** (active), **Enable** (disabled), **Kích hoạt lại** (expired), **Delete**.

### List (`list.tsx`)
Bảng: Title (+anchor mobile), Target URL, Category, Status (filter), **SEO** (Public/NoIndex, filter), Sites (số requestedWebsiteIds), Words, Expires, Created By, Created. Action: Show/Edit + toggle (admin). Nút "New Guest Post".

`form-utils.tsx`: `ExtraBacklinks`, `REL_OPTIONS`, `ContentEditor`, `PreviewButton` (render template site đầu tiên), `fetchAiConfigured` (cache `/guest-posts/ai-status`), `CategoryInput`, `slugify`/`countWords`.

---

## 14. API endpoints (`guest-posts.controller.ts`)

Tất cả sau `JwtAuthGuard + RolesGuard`.

| Method | Path | Role | Ghi chú |
|---|---|---|---|
| GET | `/guest-posts` | any | List (ParseQueryPipe) |
| GET | `/guest-posts/ai-status` | any | `{configured}` |
| GET | `/guest-posts/:id` | any | Kèm `deployments` |
| GET | `/guest-posts/:id/history` | any | Paginate (x-total-count) |
| GET | `/guest-posts/:id/deployments` | admin | |
| POST | `/guest-posts/generate-content` | any | Draft AI (UI không dùng) |
| POST | `/guest-posts` | any | Create. Sale→pending, admin→active (+auto deploy nếu có websiteIds) |
| PATCH | `/guest-posts/:id` | any (sale chỉ bài mình) | Diff → history; sale sửa active→pending; admin active → deploy/undeploy/redeploy theo thay đổi |
| DELETE | `/guest-posts/:id` | any (sale chỉ bài mình) | Hủy pending, chặn nếu running, luôn undeploy |
| POST | `/guest-posts/:id/deploy` | admin | Cần active + websiteIds |
| POST | `/guest-posts/:id/undeploy` | admin | websiteIds |
| POST | `/guest-posts/:id/regenerate` | admin | Post AI + AI configured |
| POST | `/guest-posts/:id/toggle-public` | admin | Chặn khi expired |
| POST | `/guest-posts/:id/toggle` | admin | active↔disabled, pending→active, expired→active |

Website metadata (`website-metadata.controller.ts`, admin): `POST /website-metadata/scan` (tạo job), `GET /website-metadata/:websiteId`, `GET /website-metadata/:websiteId/preview`.

---

## 15. Cron (giờ UTC, `cron.service.ts`)

| Giờ | Job |
|---|---|
| 02:00 | `check_expired` + `check_expired_footer_links` + **`check_expired_guest_posts`** |
| 03:00 | `verify_deployments` |
| 04:00 | `sync_websites` |
| 05:00 | `scan_website_pages` + **`scan_website_metadata`** |
| 07:00 & 19:00 | `remindPendingLinks` (text link) |

Guest post KHÔNG có verify riêng; metadata re-scan hằng đêm (template tự cập nhật theo site).

---

## 16. Env vars

| Env | Ý nghĩa | Ghi chú |
|---|---|---|
| `ANTHROPIC_API_KEY` | Key AI content generation | Thiếu → không tạo/deploy bài AI |
| `AI_MODEL` | Model Claude | Code default `claude-opus-4-8`; **prod + local đặt `claude-sonnet-5`** |
| `DISCORD_GUEST_POST_WEBHOOK_URL` | Webhook riêng cho thông báo guest post | **KHÔNG fallback** về webhook chính — thiếu thì bỏ qua thông báo (log warn) |

Discord guest post notifications (`discord.service.ts` → `sendGuestPostWebhook`): created / updated / pending-review / status-change / deploy / undeploy / delete / expiration.

---

## 17. Manual E2E checklist

Xem `docs/E2E_TEST_CASES.md` (GP-01 → GP-14) — chưa automate. `docs/e2e-test.sh` chỉ cover text link + footer link.

---

## 18. Deploy

```bash
git push origin main
ssh -i ~/.ssh/id_ed_vince_trump root@187.77.140.45 \
  "cd /opt/vs-cms && git pull && docker compose up -d --build api web"
```

Luôn dùng git pull, không upload file. Sau khi thêm site mới hoặc đổi template: chạy `scan_website_metadata` (Settings → Scan metadata hoặc đợi cron 05:00) trước khi deploy guest post.
