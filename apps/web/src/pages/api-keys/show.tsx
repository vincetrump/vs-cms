import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Typography, Card, Tabs, Button, message, Space, Grid } from "antd";
import { CopyOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const API_BASE_URL = window.location.origin.replace(/:\d+$/, ":3003");

const getNodeExample = (apiUrl: string) => `const crypto = require('crypto');

const API_KEY = 'vscms_YOUR_API_KEY';
const HMAC_SECRET = 'YOUR_HMAC_SECRET';
const API_URL = '${apiUrl}/api/v1';

async function createTextLink({ title, anchorText, targetUrl, expiresAt }) {
  const body = JSON.stringify({ title, anchorText, targetUrl, expiresAt });
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(body + timestamp)
    .digest('hex');

  const res = await fetch(\`\${API_URL}/text-links\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
    body,
  });

  return res.json();
}

async function getTextLink(id) {
  const body = JSON.stringify({});
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(body + timestamp)
    .digest('hex');

  const res = await fetch(\`\${API_URL}/text-links/\${id}\`, {
    headers: {
      'x-api-key': API_KEY,
      'x-timestamp': timestamp,
      'x-signature': signature,
    },
  });

  return res.json();
}

// Usage
createTextLink({
  title: 'My Link',
  anchorText: 'Click here',
  targetUrl: 'https://example.com',
}).then(console.log);`;

const getPythonExample = (apiUrl: string) => `import hashlib
import hmac
import json
import time
import requests

API_KEY = 'vscms_YOUR_API_KEY'
HMAC_SECRET = 'YOUR_HMAC_SECRET'
API_URL = '${apiUrl}/api/v1'


def create_text_link(title, anchor_text, target_url, expires_at=None):
    body_dict = {
        'title': title,
        'anchorText': anchor_text,
        'targetUrl': target_url,
    }
    if expires_at:
        body_dict['expiresAt'] = expires_at

    body = json.dumps(body_dict, separators=(',', ':'))
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        HMAC_SECRET.encode(),
        (body + timestamp).encode(),
        hashlib.sha256,
    ).hexdigest()

    res = requests.post(
        f'{API_URL}/text-links',
        headers={
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'x-timestamp': timestamp,
            'x-signature': signature,
        },
        data=body,
    )
    return res.json()


def get_text_link(link_id):
    body = json.dumps({}, separators=(',', ':'))
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        HMAC_SECRET.encode(),
        (body + timestamp).encode(),
        hashlib.sha256,
    ).hexdigest()

    res = requests.get(
        f'{API_URL}/text-links/{link_id}',
        headers={
            'x-api-key': API_KEY,
            'x-timestamp': timestamp,
            'x-signature': signature,
        },
    )
    return res.json()


# Usage
result = create_text_link(
    title='My Link',
    anchor_text='Click here',
    target_url='https://example.com',
)
print(result)`;

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
