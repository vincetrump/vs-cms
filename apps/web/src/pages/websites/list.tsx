import { useTable, ShowButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Grid, Tooltip } from "antd";
import { SyncOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useJobPolling } from "../../hooks/useJobPolling";

const { useBreakpoint } = Grid;

export const WebsiteList = () => {
  const { tableProps, tableQuery } = useTable({ resource: "websites", syncWithLocation: true });
  const screens = useBreakpoint();

  const { startPolling, isPolling } = useJobPolling({
    successMessage: "Website sync completed",
    failedMessage: "Website sync failed",
    onComplete: () => tableQuery.refetch(),
    onFailed: () => tableQuery.refetch(),
  });

  const handleSync = async () => {
    try {
      const { data } = await axiosInstance.post(`${API_URL}/websites/sync`);
      startPolling(data.jobId);
    } catch {
      // error handled by axios interceptor
    }
  };

  const statusColors: Record<string, string> = {
    active: "green",
    unreachable: "red",
    not_configured: "orange",
  };

  const dnsConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    ok: { color: "green", icon: <CheckCircleOutlined />, label: "OK" },
    mismatch: { color: "red", icon: <CloseCircleOutlined />, label: "Mismatch" },
    cname: { color: "blue", icon: <WarningOutlined />, label: "CNAME" },
    no_records: { color: "default", icon: <QuestionCircleOutlined />, label: "No records" },
    error: { color: "red", icon: <CloseCircleOutlined />, label: "Error" },
  };

  return (
    <List
      headerButtons={
        <Button type="primary" icon={<SyncOutlined />} onClick={handleSync} loading={isPolling}>
          {isPolling ? (screens.sm ? "Syncing..." : "...") : screens.sm ? "Sync from Cloudflare" : "Sync"}
        </Button>
      }
    >
      <Table {...tableProps} rowKey="_id" scroll={{ x: 600 }} size={screens.sm ? "middle" : "small"}>
        <Table.Column dataIndex="domain" title="Domain" sorter ellipsis />
        {screens.md && (
          <Table.Column dataIndex="documentRoot" title="Document Root" render={(v) => v || "-"} ellipsis />
        )}
        {screens.lg && (
          <Table.Column dataIndex="homepagePath" title="Homepage" render={(v) => v || "-"} ellipsis />
        )}
        <Table.Column
          dataIndex="status"
          title="Status"
          width={110}
          render={(status: string) => <Tag color={statusColors[status] || "default"}>{status}</Tag>}
        />
        <Table.Column
          dataIndex="dnsStatus"
          title="DNS"
          width={110}
          render={(dnsStatus: string, record: any) => {
            const cfg = dnsConfig[dnsStatus] || { color: "default", icon: <QuestionCircleOutlined />, label: dnsStatus || "-" };
            const ips = record.dnsRecordIps?.join(", ") || "";
            const tip = ips ? `${cfg.label} — ${ips}${record.dnsProxied ? " (proxied)" : ""}` : cfg.label;
            return (
              <Tooltip title={tip}>
                <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
              </Tooltip>
            );
          }}
        />
        {screens.sm && (
          <Table.Column
            dataIndex="lastSyncedAt"
            title="Last Synced"
            render={(v) => (v ? new Date(v).toLocaleString() : "Never")}
          />
        )}
        <Table.Column
          title="Actions"
          width={80}
          render={(_, record: any) => (
            <ShowButton size="small" recordItemId={record._id} hideText={!screens.sm} />
          )}
        />
      </Table>
    </List>
  );
};
