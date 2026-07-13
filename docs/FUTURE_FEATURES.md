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
