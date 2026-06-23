import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Grid, Space, Table, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, QuestionCircleOutlined, LinkOutlined } from "@ant-design/icons";

const { useBreakpoint } = Grid;

const dnsStatusMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  ok: { color: "green", icon: <CheckCircleOutlined />, label: "DNS trỏ đúng server" },
  mismatch: { color: "red", icon: <CloseCircleOutlined />, label: "DNS không trỏ đúng server" },
  cname: { color: "blue", icon: <WarningOutlined />, label: "CNAME (không kiểm tra được IP)" },
  no_records: { color: "default", icon: <QuestionCircleOutlined />, label: "Không có bản ghi DNS" },
  error: { color: "red", icon: <CloseCircleOutlined />, label: "Lỗi kiểm tra DNS" },
};

export const WebsiteShow = () => {
  const { query } = useShow({ resource: "websites" });
  const record = query?.data?.data as any;
  const screens = useBreakpoint();

  const dns = dnsStatusMap[record?.dnsStatus] || { color: "default", icon: <QuestionCircleOutlined />, label: "Chưa kiểm tra" };

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions bordered column={screens.md ? 2 : 1} size={screens.sm ? "default" : "small"}>
        <Descriptions.Item label="Domain">{record?.domain}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={record?.status === "active" ? "green" : "orange"}>{record?.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Server IP">{record?.serverIp}</Descriptions.Item>
        <Descriptions.Item label="DNS Status">
          <Tag color={dns.color} icon={dns.icon}>{dns.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="DNS IPs" span={screens.md ? 2 : 1}>
          {record?.dnsRecordIps?.length ? (
            <Space wrap>
              {record.dnsRecordIps.map((ip: string) => (
                <Tag key={ip} color={ip === record.serverIp ? "green" : "red"}>{ip}</Tag>
              ))}
              {record.dnsProxied && <Tag color="orange">Proxied</Tag>}
            </Space>
          ) : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Document Root" span={screens.md ? 2 : 1}>
          <span style={{ wordBreak: "break-all" }}>{record?.documentRoot || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Homepage Path" span={screens.md ? 2 : 1}>
          <span style={{ wordBreak: "break-all" }}>{record?.homepagePath || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Cloudflare Zone ID" span={screens.md ? 2 : 1}>
          <span style={{ wordBreak: "break-all" }}>{record?.cloudflareZoneId || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="External Links">
          <Tag color={record?.externalLinks?.length ? "orange" : "green"} icon={<LinkOutlined />}>
            {record?.externalLinks?.length || 0}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Last Synced">
          {record?.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : "Never"}
        </Descriptions.Item>
      </Descriptions>

      {record?.externalLinks?.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            External Links ({record.externalLinks.length})
          </Typography.Title>
          <Table
            dataSource={record.externalLinks}
            rowKey="url"
            size="small"
            pagination={record.externalLinks.length > 10 ? { pageSize: 10 } : false}
          >
            <Table.Column
              title="URL"
              dataIndex="url"
              render={(url: string) => (
                <Typography.Link href={url} target="_blank" rel="noopener noreferrer" ellipsis style={{ maxWidth: 500 }}>
                  {url}
                </Typography.Link>
              )}
            />
            <Table.Column title="Anchor Text" dataIndex="anchorText" ellipsis />
          </Table>
        </>
      )}
    </Show>
  );
};
