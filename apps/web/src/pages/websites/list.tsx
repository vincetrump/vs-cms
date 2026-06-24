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
  CloudOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useJobPolling } from "../../hooks/useJobPolling";

const { useBreakpoint } = Grid;

function parseSearchTerms(input: string): string[] {
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

interface SearchResult {
  data: any[];
  total: number;
}

export const WebsiteList = () => {
  const [searchText, setSearchText] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const { tableProps, tableQuery } = useTable({
    resource: "websites",
    syncWithLocation: true,
  });
  const screens = useBreakpoint();

  const { startPolling, isPolling } = useJobPolling({
    successMessage: "Website sync completed",
    failedMessage: "Website sync failed",
    onComplete: () => {
      tableQuery.refetch();
      if (searchResult) handleSearch();
    },
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

  const handleSearch = async () => {
    const domains = parseSearchTerms(searchText);
    if (!domains.length) {
      handleClear();
      return;
    }
    setSearching(true);
    try {
      const { data, headers } = await axiosInstance.get(`${API_URL}/websites`, {
        params: { _start: 0, _end: 200, domains: domains.join(",") },
      });
      setSearchResult({
        data,
        total: parseInt(headers["x-total-count"] || "0", 10),
      });
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSearchText("");
    setSearchResult(null);
  };

  const isFiltered = searchResult !== null;

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

  const dataSource = isFiltered ? searchResult.data : tableProps.dataSource;
  const pagination = isFiltered
    ? { total: searchResult.total, pageSize: searchResult.total, hideOnSinglePage: true }
    : tableProps.pagination;

  return (
    <List
      headerButtons={
        <Button type="primary" icon={<SyncOutlined />} onClick={handleSync} loading={isPolling}>
          {isPolling ? "Syncing..." : screens.sm ? "Sync" : "Sync"}
        </Button>
      }
    >
      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Input
          placeholder="Search domains (partial match, comma separated)"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={handleSearch}
          size={screens.sm ? "middle" : "small"}
          allowClear
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={searching}
          size={screens.sm ? "middle" : "small"}
        />
        {isFiltered && (
          <Button icon={<ClearOutlined />} onClick={handleClear} size={screens.sm ? "middle" : "small"} />
        )}
      </Space.Compact>

      <Table
        {...tableProps}
        dataSource={dataSource}
        pagination={pagination}
        loading={searching || tableProps.loading}
        rowKey="_id"
        scroll={{ x: screens.sm ? 600 : undefined }}
        size="small"
      >
        <Table.Column dataIndex="domain" title="Domain" sorter={!isFiltered} ellipsis />
        <Table.Column
          dataIndex="status"
          title="Status"
          width={screens.sm ? 110 : 70}
          render={(status: string) => {
            const tips: Record<string, string> = {
              active: "Homepage tồn tại trên server",
              not_configured: "Chưa tìm thấy homepage trên server hoặc chưa cấu hình document root",
              unreachable: "Không kết nối được server",
            };
            return (
              <Tooltip title={tips[status]}>
                <Tag color={statusColors[status] || "default"}>{status}</Tag>
              </Tooltip>
            );
          }}
        />
        {screens.sm && (
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
        )}
        {screens.md && (
          <Table.Column
            dataIndex="deployedLinkCount"
            title="Links"
            width={70}
            render={(count: number) => {
              const n = count || 0;
              return n ? <Tag color="blue">{n}</Tag> : <Tag>0</Tag>;
            }}
          />
        )}
        {screens.md && (
          <Table.Column
            dataIndex="externalLinks"
            title={<><LinkOutlined /> Ext.</>}
            width={70}
            render={(links: any[]) => {
              const count = links?.length || 0;
              return count ? <Tag color="orange">{count}</Tag> : <Tag>0</Tag>;
            }}
          />
        )}
        {screens.lg && (
          <Table.Column
            dataIndex="lastSyncedAt"
            title="Last Synced"
            render={(v) => (v ? new Date(v).toLocaleString() : "Never")}
          />
        )}
        <Table.Column
          title=""
          width={screens.sm ? 130 : 50}
          render={(_, record: any) => (
            <Space size={4}>
              {screens.sm && record.cloudflareZoneId && (
                <>
                  <Tooltip title="Cloudflare DNS">
                    <Button
                      size="small"
                      type="text"
                      icon={<CloudOutlined />}
                      href={`https://dash.cloudflare.com/${record.cloudflareAccountId || ""}/${record.domain}/dns/records`}
                      target="_blank"
                    />
                  </Tooltip>
                  <Tooltip title="Cloudflare Cache">
                    <Button
                      size="small"
                      type="text"
                      icon={<ThunderboltOutlined />}
                      href={`https://dash.cloudflare.com/${record.cloudflareAccountId || ""}/${record.domain}/caching/configuration`}
                      target="_blank"
                    />
                  </Tooltip>
                </>
              )}
              <ShowButton size="small" recordItemId={record._id} hideText />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
