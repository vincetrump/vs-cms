# VS-CMS

Hệ thống quản lý tập trung các website HTML tĩnh và text links. Hỗ trợ chèn/gỡ text link vào homepage websites qua SSH, đồng bộ domain từ Cloudflare, cung cấp API cho bên thứ 3, và thông báo qua Discord.

## Tech Stack

- **Backend**: NestJS 11 + Mongoose + MongoDB
- **Frontend**: Refine v4 + Ant Design v5 + Vite + React
- **Monorepo**: npm workspaces (`packages/shared`, `apps/api`, `apps/web`)
- **Deploy**: Docker Compose (MongoDB, API, Web, Seed)

## Yêu cầu

- Node.js >= 20
- Docker & Docker Compose
- SSH private key có quyền truy cập server websites
- Cloudflare API token (để sync domains)
- Discord webhook URL (tuỳ chọn, để gửi thông báo)

## Cài đặt nhanh với Docker

### 1. Clone repo

```bash
git clone git@github-vince:vincetrump/vs-cms.git
cd vs-cms
```

### 2. Tạo file .env

```bash
cp .env.example .env
```

Chỉnh sửa `.env` với các giá trị thực:

```env
# MongoDB (không cần thay đổi nếu dùng Docker)
MONGODB_URI=mongodb://localhost:27017/vs-cms

# JWT - thay bằng chuỗi random 64 ký tự
JWT_SECRET=your-random-64-char-string-here
JWT_EXPIRATION=24h

# TOTP - thay bằng chuỗi 32 ký tự cho mã hoá AES
TOTP_ENCRYPTION_KEY=your-32-byte-hex-key-for-aes256

# SSH - đường dẫn tới private key trên máy host
SSH_PRIVATE_KEY_PATH=/path/to/id_rsa
SSH_DEFAULT_SERVER=68.183.188.19
SSH_DEFAULT_USER=root

# Cloudflare
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Discord (tuỳ chọn - để trống nếu không cần)
DISCORD_WEBHOOK_URL=

# App
API_PORT=3001
ADMIN_URL=http://localhost:5173
```

### 3. Chạy Docker Compose

```bash
# Build và khởi động tất cả services
docker compose up -d

# Seed dữ liệu ban đầu (tạo tài khoản admin)
docker compose run --rm seed
```

### 4. Truy cập

- **Admin Panel**: http://localhost:5173
- **API**: http://localhost:3001

### Đăng nhập mặc định

```
Username: admin
Password: admin123
```

> Sau khi đăng nhập, vào **Settings** để bật TOTP 2FA và đổi mật khẩu.

## Phát triển local (không Docker)

### 1. Cài dependencies

```bash
nvm use 20       # hoặc đảm bảo Node >= 20
npm install
```

### 2. Khởi động MongoDB

```bash
# Dùng Docker chỉ cho MongoDB
docker compose up -d mongo

# Hoặc dùng MongoDB local
mongod --dbname vs-cms
```

### 3. Cấu hình environment

```bash
cp .env.example .env
# Chỉnh sửa .env với các giá trị phù hợp
```

### 4. Seed dữ liệu

```bash
npm run seed
```

### 5. Chạy dev servers

```bash
# Terminal 1 - API (NestJS, port 3001)
npm run dev:api

# Terminal 2 - Web (Vite, port 5173)
npm run dev:web
```

## Cấu trúc thư mục

```
vs-cms/
├── docker-compose.yml
├── .env.example
├── package.json                # npm workspaces root
├── packages/
│   └── shared/                 # @vs-cms/shared - types & constants
├── apps/
│   ├── api/                    # @vs-cms/api - NestJS backend
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── config/         # Env validation
│   │       ├── common/         # Guards, pipes, filters
│   │       ├── database/       # MongooseModule setup
│   │       └── modules/
│   │           ├── auth/           # Login + TOTP 2FA
│   │           ├── users/          # Quản lý user
│   │           ├── websites/       # Website CRUD
│   │           ├── text-links/     # Text link CRUD
│   │           ├── link-deployments/ # SSH chèn/gỡ link
│   │           ├── jobs/           # Worker queue + log
│   │           ├── ssh/            # SSH wrapper (ssh2)
│   │           ├── cloudflare/     # Cloudflare zones API
│   │           ├── sync/           # Sync websites + verify
│   │           ├── cron/           # Scheduled jobs
│   │           ├── discord/        # Webhook notifications
│   │           ├── api-keys/       # Quản lý API key
│   │           ├── external-api/   # API cho bên thứ 3
│   │           └── dashboard/      # Thống kê tổng quan
│   └── web/                    # @vs-cms/web - Refine admin panel
│       ├── Dockerfile
│       ├── nginx.conf
│       └── src/
│           ├── pages/
│           │   ├── login/          # 2 bước: password → TOTP
│           │   ├── dashboard/      # Thống kê
│           │   ├── websites/       # List + Show
│           │   ├── text-links/     # List + Create + Edit + Show
│           │   ├── api-keys/       # List + Create
│           │   ├── jobs/           # List + Show (log viewer)
│           │   └── settings/       # TOTP setup, đổi password
│           ├── components/
│           │   └── WebsiteSelector.tsx
│           └── providers/          # authProvider, dataProvider
```

## Tính năng

### Quản lý Websites
- Đồng bộ tự động từ Cloudflare (lấy danh sách domain)
- Phát hiện document root qua SSH (LiteSpeed)
- Trạng thái: active / unreachable / not_configured

### Text Links
- CRUD với giao diện admin
- Deploy/undeploy link vào homepage websites qua SSH
- Hỗ trợ hàng loạt (chọn nhiều websites)
- Tự động gỡ link hết hạn
- Redeploy khi thay đổi nội dung link

### Worker Queue (Background Jobs)
- Tất cả thao tác SSH chạy nền qua worker
- Jobs chạy tuần tự (không song song)
- Log chi tiết từng bước trong database
- Xem trạng thái + log qua giao diện Jobs
- Job types: sync_websites, deploy_links, undeploy_links, undeploy_all, redeploy_link, sync_link_websites, verify_deployments, check_expired

### Bảo mật
- **Auth 2 lớp**: Password + TOTP (Google Authenticator)
- **API bên thứ 3**: API key + HMAC-SHA256 request signing + rate limiting
- **SSH**: Private key authentication, không string interpolation
- **Backup**: Tạo backup file trước mỗi lần ghi

### External API
- Bên thứ 3 tạo text link (trạng thái pending, cần admin duyệt)
- Xác thực bằng API key + HMAC signature + timestamp

### Cron Jobs
- **02:00**: Quét và gỡ text links hết hạn
- **03:00**: Verify deployments (kiểm tra link còn trên website)
- **04:00**: Sync websites từ Cloudflare

### Discord Notifications
- Thông báo khi tạo/deploy/gỡ/hết hạn text link
- Embed với chi tiết thay đổi

### UI Responsive
- Admin panel hỗ trợ mobile, tablet, desktop
- Tự động ẩn/hiện cột bảng theo kích thước màn hình

## Docker Services

| Service | Port | Mô tả |
|---------|------|-------|
| `mongo` | 27017 | MongoDB 7 |
| `api` | 3001 | NestJS API server |
| `web` | 5173 | Nginx serving React SPA |
| `seed` | - | Seed data (chạy 1 lần) |

### Lệnh Docker thường dùng

```bash
# Build lại sau khi thay đổi code
docker compose build api web

# Xem logs
docker compose logs -f api
docker compose logs -f web

# Restart
docker compose restart api web

# Dừng tất cả
docker compose down

# Dừng + xoá data MongoDB
docker compose down -v
```

## Environment Variables

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `MONGODB_URI` | Có | MongoDB connection string |
| `JWT_SECRET` | Có | Secret key cho JWT (64 ký tự random) |
| `JWT_EXPIRATION` | Không | Thời gian hết hạn JWT (mặc định: 24h) |
| `TOTP_ENCRYPTION_KEY` | Có | Key mã hoá TOTP secret (32 ký tự) |
| `SSH_PRIVATE_KEY_PATH` | Có | Đường dẫn SSH private key |
| `SSH_DEFAULT_SERVER` | Có | IP server mặc định |
| `SSH_DEFAULT_USER` | Có | SSH user mặc định |
| `CLOUDFLARE_API_TOKEN` | Không | Token Cloudflare API |
| `DISCORD_WEBHOOK_URL` | Không | Discord webhook URL |
| `API_PORT` | Không | Port API (mặc định: 3001) |
| `ADMIN_URL` | Không | URL admin panel (mặc định: http://localhost:5173) |

Khi dùng Docker, các biến `MONGODB_URI`, `SSH_PRIVATE_KEY_PATH` được cấu hình sẵn trong `docker-compose.yml`. Chỉ cần set các biến còn lại trong `.env` hoặc truyền qua environment.

## Cách text link được chèn vào website

1. SSH đọc file homepage
2. Tìm `<div id="vs-cms-links">` (tạo mới nếu chưa có, chèn trước `</body>`)
3. Thêm link với comment marker để theo dõi:

```html
<div id="vs-cms-links">
<!-- vs-cms:64a1b2c3... --><a href="https://target.com" title="Title">Anchor</a><!-- /vs-cms:64a1b2c3... -->
</div>
```

4. Khi gỡ: regex tìm marker → xóa → nếu div trống thì xóa luôn div
5. Trước mỗi lần ghi, backup file gốc thành `.bak.{timestamp}`

## API Endpoints chính

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/auth/login` | Đăng nhập (bước 1: password) |
| POST | `/auth/verify-totp` | Đăng nhập (bước 2: TOTP) |
| GET | `/websites` | Danh sách websites |
| POST | `/websites/sync` | Sync từ Cloudflare (tạo job) |
| GET/POST/PATCH/DELETE | `/text-links` | CRUD text links |
| POST | `/text-links/:id/deploy` | Deploy link (tạo job) |
| POST | `/text-links/:id/undeploy` | Undeploy link (tạo job) |
| POST | `/text-links/:id/toggle` | Enable/Disable link |
| GET | `/jobs` | Danh sách jobs |
| GET | `/jobs/:id` | Chi tiết job + logs |
| GET/POST/DELETE | `/api-keys` | Quản lý API keys |
| POST | `/api/v1/text-links` | External API tạo link |
| GET | `/dashboard/stats` | Thống kê tổng quan |
