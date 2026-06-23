import { useTable, ShowButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Grid } from "antd";
import { SyncOutlined } from "@ant-design/icons";
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
