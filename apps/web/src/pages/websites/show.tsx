import { useShow, useNavigation } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Grid, Space, Table, Typography, Button } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, QuestionCircleOutlined, LinkOutlined, EyeOutlined } from "@ant-design/icons";

const { useBreakpoint } = Grid;

const dnsStatusMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  ok: { color: "green", icon: <CheckCircleOutlined />, label: "DNS trỏ đúng server" },
  mismatch: { color: "red", icon: <CloseCircleOutlined />, label: "DNS không trỏ đúng server" },
  cname: { color: "blue", icon: <WarningOutlined />, label: "CNAME (không kiểm tra được IP)" },
  no_records: { color: "default", icon: <QuestionCircleOutlined />, label: "Không có bản ghi DNS" },
  error: { color: "red", icon: <CloseCircleOutlined />, label: "Lỗi kiểm tra DNS" },
};

const statusColors: Record<string, string> = {
  active: "green",
  pending: "gold",
  disabled: "red",
  expired: "default",
};

export const WebsiteShow = () => {
  const { query } = useShow({ resource: "websites" });
  const record = query?.data?.data as any;
  const screens = useBreakpoint();
  const { show } = useNavigation();

  const dns = dnsStatusMap[record?.dnsStatus] || { color: "default", icon: <QuestionCircleOutlined />, label: "Chưa kiểm tra" };

  const deployments = record?.deployments || [];

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
              {record.dnsRecordIps.map((ip: string, i: number) => (
                <Tag key={`${ip}-${i}`} color={ip === record.serverIp ? "green" : "red"}>{ip}</Tag>
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
        <Descriptions.Item label="Last Synced">
          {record?.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : "Never"}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Text Links ({deployments.length})
      </Typography.Title>
      {deployments.length > 0 ? (
        <Table
          dataSource={deployments}
          rowKey="_id"
          size="small"
          pagination={deployments.length > 10 ? { pageSize: 10 } : false}
        >
          <Table.Column
            title="Title"
            dataIndex="textLinkId"
            render={(link: any) => link?.title || "-"}
          />
          {screens.sm && (
            <Table.Column
              title="Anchor"
              dataIndex="textLinkId"
              key="anchor"
              ellipsis
              render={(link: any) => link?.anchorText || "-"}
            />
          )}
          <Table.Column
            title="Status"
            dataIndex="textLinkId"
            key="linkStatus"
            width={80}
            render={(link: any) => (
              <Tag color={statusColors[link?.status] || "default"}>{link?.status || "-"}</Tag>
            )}
          />
          {screens.md && (
            <Table.Column
              title="Deployed"
              dataIndex="deployedAt"
              render={(v) => (v ? new Date(v).toLocaleString() : "-")}
            />
          )}
          <Table.Column
            title=""
            width={50}
            dataIndex="textLinkId"
            key="action"
            render={(link: any) =>
              link?._id ? (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => show("text-links", link._id)}
                />
              ) : null
            }
          />
        </Table>
      ) : (
        <Typography.Text type="secondary">No text links deployed</Typography.Text>
      )}

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
              render={(url: string) => {
                const safeUrl = /^https?:\/\//i.test(url) ? url : "#";
                return (
                  <Typography.Link href={safeUrl} target="_blank" rel="noopener noreferrer" ellipsis style={{ maxWidth: 500 }}>
                    {url}
                  </Typography.Link>
                );
              }}
            />
            {screens.sm && (
              <Table.Column title="Anchor Text" dataIndex="anchorText" ellipsis />
            )}
          </Table>
        </>
      )}
    </Show>
  );
};
