import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Typography, Card, Tabs, Button, message, Space, Grid } from "antd";
import { CopyOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const API_BASE_URL = window.location.origin;

const getCurlExample = (apiUrl: string) => `#!/bin/bash
API_KEY="vscms_YOUR_API_KEY"
HMAC_SECRET="YOUR_HMAC_SECRET"
API_URL="${apiUrl}/api/v1"

# --- Helper: tạo signature ---
sign() {
  local body="$1" ts="$2"
  echo -n "\${body}\${ts}" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $NF}'
}

# ========================================
# 1. Lấy danh sách websites
# ========================================
BODY="{}"
TS=$(date +%s%3N)
SIG=$(sign "$BODY" "$TS")

echo "=== List Websites ==="
curl -s "$API_URL/websites" \\
  -H "x-api-key: $API_KEY" \\
  -H "x-timestamp: $TS" \\
  -H "x-signature: $SIG" | jq .

# ========================================
# 2. Tạo text link (với websiteIds)
# ========================================
BODY='{"title":"My Link","anchorText":"Click here","targetUrl":"https://example.com","websiteIds":["WEBSITE_ID_1","WEBSITE_ID_2"]}'
TS=$(date +%s%3N)
SIG=$(sign "$BODY" "$TS")

echo "=== Create Text Link ==="
curl -s -X POST "$API_URL/text-links" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -H "x-timestamp: $TS" \\
  -H "x-signature: $SIG" \\
  -d "$BODY" | jq .

# ========================================
# 3. Xem chi tiết text link
# ========================================
LINK_ID="YOUR_LINK_ID"
BODY="{}"
TS=$(date +%s%3N)
SIG=$(sign "$BODY" "$TS")

echo "=== Get Text Link ==="
curl -s "$API_URL/text-links/$LINK_ID" \\
  -H "x-api-key: $API_KEY" \\
  -H "x-timestamp: $TS" \\
  -H "x-signature: $SIG" | jq .`;

const getNodeExample = (apiUrl: string) => `const crypto = require('crypto');

const API_KEY = 'vscms_YOUR_API_KEY';
const HMAC_SECRET = 'YOUR_HMAC_SECRET';
const API_URL = '${apiUrl}/api/v1';

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

// 1. Lấy danh sách websites
async function listWebsites() {
  const body = '{}';
  const ts = Date.now().toString();
  const res = await fetch(\`\${API_URL}/websites\`, {
    headers: headers(body, ts),
  });
  return res.json();
}

// 2. Tạo text link (với websiteIds tùy chọn)
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

// 3. Xem chi tiết text link
async function getTextLink(id) {
  const body = '{}';
  const ts = Date.now().toString();
  const res = await fetch(\`\${API_URL}/text-links/\${id}\`, {
    headers: headers(body, ts),
  });
  return res.json();
}

// Usage
(async () => {
  // Lấy danh sách websites
  const websites = await listWebsites();
  console.log('Websites:', websites);

  // Tạo link và chọn websites
  const link = await createTextLink({
    title: 'My Link',
    anchorText: 'Click here',
    targetUrl: 'https://example.com',
    websiteIds: [websites[0]?.id], // deploy vào website đầu tiên
  });
  console.log('Created:', link);
})();`;

const getPythonExample = (apiUrl: string) => `import hashlib
import hmac
import json
import time
import requests

API_KEY = 'vscms_YOUR_API_KEY'
HMAC_SECRET = 'YOUR_HMAC_SECRET'
API_URL = '${apiUrl}/api/v1'


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


# 1. Lấy danh sách websites
def list_websites():
    body = '{}'
    ts = str(int(time.time() * 1000))
    res = requests.get(
        f'{API_URL}/websites',
        headers=api_headers(body, ts),
    )
    return res.json()


# 2. Tạo text link (với websiteIds tùy chọn)
def create_text_link(title, anchor_text, target_url,
                     expires_at=None, website_ids=None):
    payload = {
        'title': title,
        'anchorText': anchor_text,
        'targetUrl': target_url,
    }
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


# 3. Xem chi tiết text link
def get_text_link(link_id):
    body = '{}'
    ts = str(int(time.time() * 1000))
    res = requests.get(
        f'{API_URL}/text-links/{link_id}',
        headers=api_headers(body, ts),
    )
    return res.json()


# Usage
websites = list_websites()
print('Websites:', websites)

result = create_text_link(
    title='My Link',
    anchor_text='Click here',
    target_url='https://example.com',
    website_ids=[websites[0]['id']],  # deploy vào website đầu tiên
)
print('Created:', result)`;

export const ApiKeyShow = () => {
  const { query } = useShow({ resource: "api-keys" });
  const { data, isLoading } = query;
  const record = data?.data as any;
  const screens = useBreakpoint();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Copied!");
  };

  const codeStyle: React.CSSProperties = {
    background: "#1e1e1e",
    color: "#d4d4d4",
    padding: 16,
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "'Fira Code', 'Consolas', monospace",
    whiteSpace: "pre",
    overflow: "auto",
    maxHeight: 500,
    lineHeight: 1.5,
  };

  return (
    <Show isLoading={isLoading}>
      {record && (
        <>
          <Descriptions
            bordered
            column={screens.md ? 2 : 1}
            size={screens.sm ? "default" : "small"}
          >
            <Descriptions.Item label="Name">{record.name}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={record.isActive ? "green" : "red"}>
                {record.isActive ? "Active" : "Inactive"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Key Prefix">
              <Text code>vscms_{record.keyPrefix}...</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Rate Limit">
              {record.rateLimit} req/min
            </Descriptions.Item>
            <Descriptions.Item label="Allowed IPs" span={screens.md ? 2 : 1}>
              {record.allowedIps?.length ? (
                <Space wrap>
                  {record.allowedIps.map((ip: string) => (
                    <Tag key={ip}>{ip}</Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">All IPs allowed</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Last Used">
              {record.lastUsedAt
                ? new Date(record.lastUsedAt).toLocaleString()
                : "Never"}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {new Date(record.createdAt).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>

          <Card
            title="Integration Example Code"
            style={{ marginTop: 24 }}
            size={screens.sm ? "default" : "small"}
          >
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Thay <Text code>YOUR_API_KEY</Text> và <Text code>YOUR_HMAC_SECRET</Text> bằng
              credentials thực tế. Link tạo qua API sẽ ở trạng thái <Tag color="gold">pending</Tag>
              và cần Admin duyệt.
            </Paragraph>
            <Tabs
              items={[
                {
                  key: "curl",
                  label: "cURL",
                  children: (
                    <>
                      <div style={{ textAlign: "right", marginBottom: 8 }}>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(getCurlExample(API_BASE_URL))}
                        >
                          Copy
                        </Button>
                      </div>
                      <div style={codeStyle}>{getCurlExample(API_BASE_URL)}</div>
                    </>
                  ),
                },
                {
                  key: "node",
                  label: "Node.js",
                  children: (
                    <>
                      <div style={{ textAlign: "right", marginBottom: 8 }}>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(getNodeExample(API_BASE_URL))}
                        >
                          Copy
                        </Button>
                      </div>
                      <div style={codeStyle}>{getNodeExample(API_BASE_URL)}</div>
                    </>
                  ),
                },
                {
                  key: "python",
                  label: "Python",
                  children: (
                    <>
                      <div style={{ textAlign: "right", marginBottom: 8 }}>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(getPythonExample(API_BASE_URL))}
                        >
                          Copy
                        </Button>
                      </div>
                      <div style={codeStyle}>{getPythonExample(API_BASE_URL)}</div>
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </Show>
  );
};
