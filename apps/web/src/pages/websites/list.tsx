import { useState } from "react";
import { useTable, ShowButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Grid, Tooltip, Input, Space } from "antd";
import {
  SyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
  SearchOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useJobPolling } from "../../hooks/useJobPolling";

const { useBreakpoint } = Grid;

function parseDomains(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),
    )
    .filter(Boolean);
}

export const WebsiteList = () => {
  const [searchText, setSearchText] = useState("");

  const { tableProps, tableQuery, setFilters, filters } = useTable({
    resource: "websites",
    syncWithLocation: true,
  });
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

  const handleSearch = () => {
    const domains = parseDomains(searchText);
    if (domains.length) {
      setFilters([{ field: "domains", operator: "eq", value: domains.join(",") }], "replace");
    } else {
      handleClear();
    }
  };

  const handleClear = () => {
    setSearchText("");
    setFilters([], "replace");
  };

  const hasFilter = filters?.some((f: any) => f.field === "domains");

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
      <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
        <Input.TextArea
          placeholder={"Search domains (comma or newline separated)\ne.g. example.com, https://test.com"}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleSearch();
            }
          }}
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{ flex: 1 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          {screens.sm ? "Search" : ""}
        </Button>
        {hasFilter && (
          <Button icon={<ClearOutlined />} onClick={handleClear}>
            {screens.sm ? "Clear" : ""}
          </Button>
        )}
      </Space.Compact>

      <Table {...tableProps} rowKey="_id" scroll={{ x: 600 }} size={screens.sm ? "middle" : "small"}>
        <Table.Column dataIndex="domain" title="Domain" sorter ellipsis />
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
        <Table.Column
          dataIndex="deployedLinkCount"
          title="Text Links"
          width={90}
          render={(count: number) => {
            const n = count || 0;
            return n ? <Tag color="blue">{n}</Tag> : <Tag>0</Tag>;
          }}
        />
        <Table.Column
          dataIndex="externalLinks"
          title={<><LinkOutlined /> Ext. Links</>}
          width={95}
          render={(links: any[]) => {
            const count = links?.length || 0;
            return count ? <Tag color="orange">{count}</Tag> : <Tag>0</Tag>;
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
