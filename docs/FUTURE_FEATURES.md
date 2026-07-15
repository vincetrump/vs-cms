# Future Features

## 1. Text Link History Tracking

> **Status: ✅ ĐÃ TRIỂN KHAI (core)** — module `text-link-history` (và các bản fork `footer-link-history`, `guest-post-history`) đã có trong codebase: schema + `log()` service, tích hợp controller/worker, endpoint `GET /text-links/:id/history`, tab "Lịch sử" (Timeline) trong trang show.
>
> Phần thiết kế dưới đây giữ lại làm tham khảo. Các hạng mục **chưa làm** (Phase 3 — Nâng cao):
> - `GET /text-links/:id/history/summary` (status timeline aggregation)
> - Filter history theo action/from/to (hiện chỉ có pagination)
> - Status timeline visualization trên UI
> - Export history CSV, bulk history view theo website
> - `metadata.ipAddress` không được ghi

### Mục tiêu

Xây dựng hệ thống audit log toàn diện cho text link, ghi lại mọi thay đổi về status, nội dung và deployment. Hiện tại, thông tin thay đổi chỉ được gửi qua Discord notification và không lưu trữ trong database — khi cần tra cứu lịch sử một link, không có cách nào xem lại.

### Vấn đề hiện tại

| Dữ liệu | Hiện trạng |
|----------|------------|
| Status changes (pending → active → disabled) | Chỉ lưu status hiện tại, không có lịch sử |
| Field changes (title, anchorText, targetUrl, rel) | Tính toán tại thời điểm update, gửi Discord rồi mất |
| Ai thay đổi, khi nào | Chỉ có `createdBy`, không có `updatedBy` |
| Deploy/undeploy events | Có `LinkDeployment` record nhưng chỉ lưu trạng thái cuối cùng |
| Job results (deploy thành công/thất bại) | Có trong `Job` schema nhưng không liên kết trực quan với link |

### Thiết kế

#### 1.1 Schema: `TextLinkHistory`

```
Collection: text_link_histories

{
  textLinkId:    ObjectId        // ref → TextLink
  action:        String          // enum: xem bảng bên dưới
  performedBy:   ObjectId | null // ref → User (null nếu là system action)
  performedAt:   Date            // thời điểm thực hiện
  
  // Chi tiết thay đổi
  changes: {
    [field: string]: {
      old: any
      new: any
    }
  }
  
  // Context bổ sung tùy theo action type
  metadata: {
    websiteIds?:   String[]     // websites liên quan (deploy/undeploy)
    jobId?:        ObjectId     // ref → Job (nếu là deploy action)
    reason?:       String       // lý do thay đổi (nếu có)
    source?:       String       // 'admin' | 'sale' | 'api' | 'system'
    ipAddress?:    String       // IP người thực hiện
  }
}

Indexes:
  { textLinkId: 1, performedAt: -1 }   // query history theo link, mới nhất trước
  { performedBy: 1, performedAt: -1 }   // query theo user
  { action: 1 }                          // filter theo loại action
```

#### 1.2 Action Types

| Action | Trigger | Changes ghi lại |
|--------|---------|-----------------|
| `created` | POST /text-links | Toàn bộ initial data |
| `updated` | PATCH /text-links/:id | Các field thay đổi (old → new) |
| `status_changed` | Toggle, auto-expire, sale edit revert | `{ status: { old, new } }` |
| `deployed` | POST /text-links/:id/deploy | `metadata.websiteIds`, `metadata.jobId` |
| `undeployed` | POST /text-links/:id/undeploy | `metadata.websiteIds`, `metadata.jobId` |
| `deploy_failed` | Worker job thất bại | `metadata.jobId`, `metadata.reason` |
| `deploy_verified` | Verify deployment job | `metadata.websiteIds` |
| `redeployed` | Admin edit active link | `metadata.websiteIds`, `metadata.jobId` |
| `deleted` | DELETE /text-links/:id | Snapshot toàn bộ data trước khi xóa |

#### 1.3 Điểm tích hợp trong code hiện tại

**TextLinksController** (`text-links.controller.ts`):
- `create()` → ghi `created` event
- `update()` → ghi `updated` event + `status_changed` nếu status bị revert
- `remove()` → ghi `deleted` event với full snapshot
- `toggleStatus()` → ghi `status_changed` event
- `deploy()` → ghi `deployed` event
- `undeploy()` → ghi `undeployed` event

**WorkerService** (`worker.service.ts`):
- Sau khi job hoàn thành → ghi `deployed`/`deploy_failed`/`redeployed` event
- `checkExpired` job → ghi `status_changed` cho mỗi link hết hạn

**ExternalApiController** (`external-api.controller.ts`):
- `createTextLink()` → ghi `created` event với `source: 'api'`

#### 1.4 API Endpoints mới

```
GET /text-links/:id/history
  Query params:
    - action?:  filter theo action type
    - from?:    filter từ ngày
    - to?:      filter đến ngày
    - page:     pagination (default: 1)
    - limit:    số record/trang (default: 20)
  
  Response: {
    items: TextLinkHistory[]
    total: number
    page: number
    pages: number
  }

GET /text-links/:id/history/summary
  Response: {
    totalChanges: number
    lastUpdatedAt: Date
    lastUpdatedBy: { id, name, email }
    statusTimeline: [
      { status: 'pending', from: Date, to: Date, duration: string },
      { status: 'active', from: Date, to: null, duration: string }
    ]
    deploymentCount: number
    lastDeployedAt: Date
  }
```

#### 1.5 Giao diện (Frontend)

Thêm tab **"History"** trong trang chi tiết text link (`/text-links/:id`):

```
┌─────────────────────────────────────────────────────────┐
│  Text Link Detail                                       │
│  ┌──────────┬──────────┬───────────┐                    │
│  │ Details  │ Deploy   │ History   │                    │
│  └──────────┴──────────┴───────────┘                    │
│                                                         │
│  ── Status Timeline ──────────────────────────────────  │
│  pending ●────── active ●────── disabled ●── active ●   │
│  Jun 1        Jun 2           Jun 10       Jun 12       │
│                                                         │
│  ── Change Log ───────────────────────────────────────  │
│                                                         │
│  🟢 Jun 12 14:30  Status changed: disabled → active    │
│     by Admin User                                       │
│                                                         │
│  🔴 Jun 10 09:15  Status changed: active → disabled    │
│     by Admin User                                       │
│                                                         │
│  🔵 Jun 5 11:00   Deployed to 3 websites               │
│     by Admin User  [site-a.com, site-b.com, site-c.com]│
│                                                         │
│  🟡 Jun 3 16:45   Updated                              │
│     by Sale User   anchorText: "old text" → "new text" │
│                    Status auto-reverted to pending      │
│                                                         │
│  🟢 Jun 2 10:00   Status changed: pending → active     │
│     by Admin User                                       │
│                                                         │
│  ⚪ Jun 1 08:30   Created                              │
│     by Sale User   source: sale                         │
│                                                         │
│  ────────────────────────── Load more ────────────────  │
└─────────────────────────────────────────────────────────┘
```

### Kế hoạch triển khai

#### Phase 1: Backend Core
1. Tạo `TextLinkHistory` schema + module
2. Tạo `TextLinkHistoryService` với method `log(event)` 
3. Tích hợp vào `TextLinksController` — ghi log tại mỗi endpoint
4. Tích hợp vào `WorkerService` — ghi log khi job hoàn thành/thất bại
5. API endpoint `GET /text-links/:id/history`

#### Phase 2: Frontend
6. Tạo component `TextLinkHistoryTab`
7. Status timeline visualization
8. Change log list với pagination và filter

#### Phase 3: Nâng cao
9. API endpoint `GET /text-links/:id/history/summary`
10. Export history (CSV)
11. Bulk history view — xem history của nhiều link theo website

### Lưu ý kỹ thuật

- **Không sửa đổi schema hiện tại** — history là collection riêng, không ảnh hưởng performance của text link queries
- **Write-only pattern** — history records chỉ tạo mới, không update hay xóa
- **Giữ Discord notifications** — history tracking bổ sung, không thay thế Discord alerts
- **TTL index (tùy chọn)** — có thể thêm TTL index để tự động xóa records cũ hơn N tháng nếu data quá lớn

## 2. Batch Mode cho AI Guest Post Generation

> **Status: 💡 ĐỀ XUẤT** — chưa triển khai. Tối ưu chi phí AI khi deploy guest post lên nhiều site.

### Bối cảnh

Hiện tại guest post AI dùng **per-site generation**: post `contentSource='ai'` khi deploy sẽ gọi `deployToWebsites()` generate **một bài riêng cho từng website** (chống duplicate content). Nghĩa là deploy 1 post lên 30 site = 30 lần gọi Anthropic API real-time, tuần tự qua worker single-threaded. Chi phí token nhân theo số site và job chạy lâu.

### Message Batches API (Anthropic)

| Thuộc tính | Chi tiết |
|-----------|----------|
| Giá | **Giảm 50%** input + output token so với real-time (giảm giá, KHÔNG phải tiết kiệm token) |
| Bất đồng bộ | Đa số batch xong **< 1 giờ**, SLA tối đa **24 giờ**; quá 24h request bị hủy |
| Giới hạn | Tối đa **100.000 request** hoặc **256 MB** mỗi batch |
| Định danh | Mỗi request gắn `custom_id` → map kết quả về đúng site (dùng `custom_id = websiteId`) |
| Kết quả | Giữ **29 ngày**, poll status để lấy |
| Prompt caching | **Vẫn hoạt động** trong batch — nên dùng cache 1h cho prefix chung |

### Lý do áp dụng

- Deploy guest post lên nhiều site = nhiều lần generate riêng biệt → khối lượng token lớn, đây là điểm tốn chi phí AI nhất của hệ thống.
- Gom N request vào 1 batch (mỗi request = 1 site, `custom_id = websiteId`) → **tiết kiệm ~50% chi phí AI** cho các đợt deploy lớn.

### Đánh đổi

- **Mất UX per-site incremental**: hiện worker generate + deploy từng site tuần tự, trang Show Job hiện log real-time từng bài. Batch trả kết quả một cục sau khi cả batch xong → không còn tiến độ từng site.
- **Refactor job engine sang non-blocking**: worker hiện single-threaded, poll 3s, chạy 1 job/lần. Nếu job đứng chờ batch (tối đa 24h) sẽ **khóa cả hàng đợi**. Cần tách bộ **poll batch riêng** (hoặc cron) để không chiếm worker; job deploy chỉ *submit* batch rồi nhả worker, một cơ chế khác theo dõi batch xong → ghi content per-site vào deployment record → chèn file.
- **Retry truncation phải resubmit batch**: cơ chế retry hiện tại (tối đa 3 lần khi output bị cắt giữa thẻ hoặc < 40% word count) là đồng bộ. Với batch, request lỗi/cắt phải **gom lại và submit batch bù**, thêm một vòng chờ.
- **Xử lý lỗi từng phần**: một batch có thể xong một phần — phải duyệt kết quả theo `custom_id`, site nào lỗi thì đánh dấu để retry/deploy lại, site thành công vẫn deploy bình thường.

### Khuyến nghị: Hybrid

- **Real-time** cho deploy nhỏ (**1–5 site**): giữ nguyên UX incremental, độ trễ thấp, không cần refactor.
- **Batch** khi **≥ 10 site**: chấp nhận mất incremental để đổi lấy ~50% chi phí; số site càng nhiều lợi ích càng rõ.
- Vùng 6–9 site: tùy cấu hình ngưỡng, cân nhắc theo độ ưu tiên chi phí vs. tốc độ.

### Đòn bẩy rẻ hơn (không cần refactor)

Trước khi làm batch (tốn công refactor job engine), có thể lấy phần lớn lợi ích chi phí bằng **prompt caching prefix chung** ngay trong real-time mode — xem mục 3.

## 3. Prompt Caching (real-time)

> **Status: 💡 ĐỀ XUẤT** — chưa triển khai. Đòn bẩy chi phí AI **không đổi UX/kiến trúc**, nên làm trước Batch Mode.

### Ý tưởng

Phần prompt guest post generation có một khối **instruction chung lặp lại y hệt** ở mọi lần gọi (quy tắc viết bài, yêu cầu chèn link `<a href='...'>` single-quote, ràng buộc format/JSON schema, hướng dẫn SEO...). Khi generate per-site cho N site, khối này được gửi lại N lần.

Đặt khối instruction chung này làm **prefix có `cache_control`** → Anthropic cache prefix, các lần gọi sau chỉ tính **giá cache-read (rẻ hơn nhiều)** cho phần prefix, chỉ phần khác nhau (metadata site, chủ đề, số từ) tính giá đầy đủ.

### Vì sao nên làm trước

- **Không đổi UX**: vẫn real-time, per-site incremental, log từng bài trên Show Job như hiện tại.
- **Không đổi kiến trúc**: worker single-threaded giữ nguyên, không cần bộ poll batch, không cần xử lý lỗi từng phần bất đồng bộ.
- **Thay đổi nhỏ, khu trú**: chỉ cần cấu trúc lại prompt trong `content-generation.service.ts` — tách phần prefix cố định ra, gắn `cache_control` (nên dùng TTL 1h khi deploy nhiều site liên tiếp trong một đợt).

### Lưu ý

- Prompt caching có ngưỡng token tối thiểu cho prefix mới được cache — cần đảm bảo khối instruction chung đủ dài (thường đạt vì prompt guest post đã dài).
- Sắp xếp prompt: **phần tĩnh (cache) đứng trước, phần động (site/chủ đề) đứng sau** để prefix ổn định qua các lần gọi.
- Kết hợp tốt với Batch Mode sau này: caching vẫn hoạt động trong batch, hai tối ưu cộng dồn.
