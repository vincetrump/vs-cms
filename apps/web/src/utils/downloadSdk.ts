import JSZip from "jszip";

interface SdkParams {
  apiKey: string;
  hmacSecret: string;
  keyName: string;
  apiUrl: string;
}

const credentials = (p: SdkParams) =>
  `# VS-CMS API Credentials
# Generated: ${new Date().toISOString()}
# Key name: ${p.keyName}
#
# ⚠️  DO NOT commit this file to version control!

API_KEY=${p.apiKey}
HMAC_SECRET=${p.hmacSecret}
API_URL=${p.apiUrl}/api/v1
`;

const readme = (p: SdkParams) =>
  `# VS-CMS API Integration Kit

## Quick Start

### 1. Credentials

File \`credentials.txt\` chứa API Key và HMAC Secret. **Không commit file này vào git.**

### 2. Xác thực

Mỗi request cần 3 headers:

| Header | Mô tả |
|--------|-------|
| \`x-api-key\` | API key (bắt đầu bằng \`vscms_\`) |
| \`x-timestamp\` | Timestamp hiện tại (milliseconds) |
| \`x-signature\` | HMAC-SHA256 của \`body + timestamp\` dùng HMAC Secret |

- **POST** request: \`body\` là JSON string gửi đi
- **GET** request: \`body\` = \`{}\` (empty JSON object)
- Timestamp phải trong khoảng **±5 phút** so với server

### 3. Endpoints

| Method | Endpoint | Mô tả | Rate Limit |
|--------|----------|-------|------------|
| GET | \`/api/v1/websites\` | Danh sách websites hỗ trợ | 30 req/min |
| POST | \`/api/v1/text-links\` | Tạo text link mới | 10 req/min |
| GET | \`/api/v1/text-links/:id\` | Xem chi tiết text link | 30 req/min |

### 4. Tạo Text Link

\`\`\`json
POST /api/v1/text-links

{
  "title": "My Link",
  "anchorText": "Click here",
  "targetUrl": "https://example.com",
  "expiresAt": "2025-12-31T23:59:59Z",
  "websiteIds": ["id1", "id2"]
}
\`\`\`

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| \`title\` | ✅ | Tên nội bộ (max 500 ký tự) |
| \`anchorText\` | ✅ | Văn bản hiển thị trên website (max 500) |
| \`targetUrl\` | ✅ | URL đích, phải có http/https (max 2048) |
| \`expiresAt\` | ❌ | Ngày hết hạn ISO 8601. Hệ thống tự gỡ link khi hết hạn |
| \`websiteIds\` | ❌ | Mảng ID websites muốn deploy. Lấy từ \`GET /api/v1/websites\` |

Link tạo qua API luôn ở trạng thái **pending**. Admin duyệt → tự động deploy vào websites đã chọn.

### 5. Response

**Tạo thành công (201):**
\`\`\`json
{
  "id": "abc123",
  "status": "pending",
  "message": "Text link created. Awaiting admin approval."
}
\`\`\`

**Lỗi xác thực (401):**
\`\`\`json
{ "statusCode": 401, "message": ["Unauthorized"] }
\`\`\`

**Lỗi validation (400):**
\`\`\`json
{ "statusCode": 400, "message": ["title must be a string", ...] }
\`\`\`

**Rate limit (429):**
\`\`\`json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
\`\`\`

### 6. Chạy Examples

**cURL (Bash):**
\`\`\`bash
chmod +x example.sh
./example.sh
\`\`\`

**Node.js:**
\`\`\`bash
npm install   # (không cần dependencies ngoài)
node example.js
\`\`\`

**Python:**
\`\`\`bash
pip install requests
python example.py
\`\`\`

### 7. OpenAPI Spec

File \`api-specification.yaml\` chứa OpenAPI 3.0 spec. Import vào Postman, Insomnia, hoặc Swagger UI để test.

---

**API URL:** \`${p.apiUrl}/api/v1\`
`;

const curlExample = (p: SdkParams) =>
  `#!/bin/bash
# VS-CMS API — cURL Example
# Đọc credentials từ credentials.txt

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source <(grep -v '^#' "$SCRIPT_DIR/credentials.txt" | grep '=')

sign() {
  local body="$1" ts="$2"
  echo -n "\${body}\${ts}" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $NF}'
}

echo "========================================="
echo " 1. Lấy danh sách websites"
echo "========================================="
BODY="{}"
TS=$(date +%s%3N)
SIG=$(sign "$BODY" "$TS")

curl -s "$API_URL/websites" \\
  -H "x-api-key: $API_KEY" \\
  -H "x-timestamp: $TS" \\
  -H "x-signature: $SIG" | jq .

echo ""
echo "========================================="
echo " 2. Tạo text link"
echo "========================================="
BODY='{"title":"Example Link","anchorText":"Click here","targetUrl":"https://example.com"}'
TS=$(date +%s%3N)
SIG=$(sign "$BODY" "$TS")

curl -s -X POST "$API_URL/text-links" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -H "x-timestamp: $TS" \\
  -H "x-signature: $SIG" \\
  -d "$BODY" | jq .
`;

const nodeExample = (p: SdkParams) =>
  `// VS-CMS API — Node.js Example
// Đọc credentials từ credentials.txt

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load credentials
const creds = {};
fs.readFileSync(path.join(__dirname, 'credentials.txt'), 'utf8')
  .split('\\n')
  .filter(l => l && !l.startsWith('#'))
  .forEach(l => {
    const [k, ...v] = l.split('=');
    creds[k.trim()] = v.join('=').trim();
  });

const { API_KEY, HMAC_SECRET, API_URL } = creds;

function sign(body, timestamp) {
  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(body + timestamp)
    .digest('hex');
}

function headers(body, timestamp) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'x-timestamp': timestamp,
    'x-signature': sign(body, timestamp),
  };
}

async function listWebsites() {
  const body = '{}';
  const ts = Date.now().toString();
  const res = await fetch(\`\${API_URL}/websites\`, { headers: headers(body, ts) });
  return res.json();
}

async function createTextLink({ title, anchorText, targetUrl, expiresAt, websiteIds }) {
  const payload = { title, anchorText, targetUrl };
  if (expiresAt) payload.expiresAt = expiresAt;
  if (websiteIds) payload.websiteIds = websiteIds;
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  const res = await fetch(\`\${API_URL}/text-links\`, {
    method: 'POST',
    headers: headers(body, ts),
    body,
  });
  return res.json();
}

async function getTextLink(id) {
  const body = '{}';
  const ts = Date.now().toString();
  const res = await fetch(\`\${API_URL}/text-links/\${id}\`, { headers: headers(body, ts) });
  return res.json();
}

(async () => {
  console.log('--- List Websites ---');
  const websites = await listWebsites();
  console.log(JSON.stringify(websites, null, 2));

  console.log('\\n--- Create Text Link ---');
  const link = await createTextLink({
    title: 'Example Link',
    anchorText: 'Click here',
    targetUrl: 'https://example.com',
    websiteIds: websites.length ? [websites[0].id] : [],
  });
  console.log(JSON.stringify(link, null, 2));

  if (link.id) {
    console.log('\\n--- Get Text Link ---');
    const detail = await getTextLink(link.id);
    console.log(JSON.stringify(detail, null, 2));
  }
})();
`;

const pythonExample = (p: SdkParams) =>
  `# VS-CMS API — Python Example
# Đọc credentials từ credentials.txt

import hashlib
import hmac
import json
import os
import time
import requests

# Load credentials
creds = {}
creds_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'credentials.txt')
with open(creds_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            creds[k.strip()] = v.strip()

API_KEY = creds['API_KEY']
HMAC_SECRET = creds['HMAC_SECRET']
API_URL = creds['API_URL']


def sign(body, timestamp):
    return hmac.new(
        HMAC_SECRET.encode(),
        (body + timestamp).encode(),
        hashlib.sha256,
    ).hexdigest()


def api_headers(body, timestamp):
    return {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-timestamp': timestamp,
        'x-signature': sign(body, timestamp),
    }


def list_websites():
    body = '{}'
    ts = str(int(time.time() * 1000))
    res = requests.get(f'{API_URL}/websites', headers=api_headers(body, ts))
    return res.json()


def create_text_link(title, anchor_text, target_url,
                     expires_at=None, website_ids=None):
    payload = {'title': title, 'anchorText': anchor_text, 'targetUrl': target_url}
    if expires_at:
        payload['expiresAt'] = expires_at
    if website_ids:
        payload['websiteIds'] = website_ids
    body = json.dumps(payload, separators=(',', ':'))
    ts = str(int(time.time() * 1000))
    res = requests.post(
        f'{API_URL}/text-links',
        headers=api_headers(body, ts),
        data=body,
    )
    return res.json()


def get_text_link(link_id):
    body = '{}'
    ts = str(int(time.time() * 1000))
    res = requests.get(
        f'{API_URL}/text-links/{link_id}',
        headers=api_headers(body, ts),
    )
    return res.json()


if __name__ == '__main__':
    print('--- List Websites ---')
    websites = list_websites()
    print(json.dumps(websites, indent=2))

    print('\\n--- Create Text Link ---')
    result = create_text_link(
        title='Example Link',
        anchor_text='Click here',
        target_url='https://example.com',
        website_ids=[websites[0]['id']] if websites else [],
    )
    print(json.dumps(result, indent=2))

    if 'id' in result:
        print('\\n--- Get Text Link ---')
        detail = get_text_link(result['id'])
        print(json.dumps(detail, indent=2))
`;

const openApiSpec = (p: SdkParams) =>
  `openapi: "3.0.3"
info:
  title: VS-CMS External API
  version: "1.0"
  description: API cho bên thứ 3 tạo và quản lý text links trên hệ thống VS-CMS.
servers:
  - url: ${p.apiUrl}/api/v1
security:
  - apiKey: []
    hmacSignature: []
    hmacTimestamp: []

paths:
  /websites:
    get:
      summary: Danh sách websites
      description: Trả về danh sách websites đang active trong hệ thống.
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      example: "6a3b7c76e52f9a959e89eab8"
                    domain:
                      type: string
                      example: "example.com"
                    status:
                      type: string
                      example: "active"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "429":
          $ref: "#/components/responses/TooManyRequests"

  /text-links:
    post:
      summary: Tạo text link
      description: |
        Tạo text link mới. Link sẽ ở trạng thái \`pending\` chờ Admin duyệt.
        Khi Admin duyệt, link sẽ tự động deploy vào websiteIds đã chọn (nếu có).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title, anchorText, targetUrl]
              properties:
                title:
                  type: string
                  maxLength: 500
                  description: Tên nội bộ để nhận diện link
                  example: "Partner Link Q1"
                anchorText:
                  type: string
                  maxLength: 500
                  description: Văn bản hiển thị trên website
                  example: "Visit our partner"
                targetUrl:
                  type: string
                  format: uri
                  maxLength: 2048
                  description: URL đích (http hoặc https)
                  example: "https://partner.example.com"
                expiresAt:
                  type: string
                  format: date-time
                  description: Ngày hết hạn (ISO 8601). Hệ thống tự gỡ khi hết hạn.
                  example: "2025-12-31T23:59:59Z"
                websiteIds:
                  type: array
                  items:
                    type: string
                  description: Mảng ID websites muốn deploy. Lấy từ GET /websites.
                  example: ["6a3b7c76e52f9a959e89eab8"]
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    example: "6a3c1234abcd5678ef901234"
                  status:
                    type: string
                    example: "pending"
                  message:
                    type: string
                    example: "Text link created. Awaiting admin approval."
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "429":
          $ref: "#/components/responses/TooManyRequests"

  /text-links/{id}:
    get:
      summary: Xem chi tiết text link
      description: Chỉ xem được link do chính API key này tạo.
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  title:
                    type: string
                  anchorText:
                    type: string
                  targetUrl:
                    type: string
                  status:
                    type: string
                    enum: [pending, active, disabled, expired]
                  expiresAt:
                    type: string
                    format: date-time
                    nullable: true
                  createdAt:
                    type: string
                    format: date-time
        "401":
          $ref: "#/components/responses/Unauthorized"
        "404":
          description: Not found (hoặc không thuộc API key này)
        "429":
          $ref: "#/components/responses/TooManyRequests"

components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: x-api-key
      description: "API key (bắt đầu bằng vscms_)"
    hmacTimestamp:
      type: apiKey
      in: header
      name: x-timestamp
      description: "Timestamp hiện tại (milliseconds)"
    hmacSignature:
      type: apiKey
      in: header
      name: x-signature
      description: "HMAC-SHA256(body + timestamp, hmacSecret)"

  responses:
    Unauthorized:
      description: "API key không hợp lệ, signature sai, hoặc timestamp quá hạn"
      content:
        application/json:
          schema:
            type: object
            properties:
              statusCode:
                type: integer
                example: 401
              message:
                type: array
                items:
                  type: string
                example: ["Unauthorized"]
    ValidationError:
      description: "Dữ liệu đầu vào không hợp lệ"
      content:
        application/json:
          schema:
            type: object
            properties:
              statusCode:
                type: integer
                example: 400
              message:
                type: array
                items:
                  type: string
                example: ["title must be a string"]
    TooManyRequests:
      description: "Vượt quá giới hạn rate limit"
      content:
        application/json:
          schema:
            type: object
            properties:
              statusCode:
                type: integer
                example: 429
              message:
                type: string
                example: "ThrottlerException: Too Many Requests"
`;

export async function downloadSdkZip(params: SdkParams) {
  const zip = new JSZip();
  const folder = zip.folder("vs-cms-sdk")!;

  folder.file("credentials.txt", credentials(params));
  folder.file("readme.md", readme(params));
  folder.file("example.sh", curlExample(params));
  folder.file("example.js", nodeExample(params));
  folder.file("example.py", pythonExample(params));
  folder.file("api-specification.yaml", openApiSpec(params));
  folder.file(".gitignore", "credentials.txt\n");

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vs-cms-sdk-${params.keyName.toLowerCase().replace(/\s+/g, "-")}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
