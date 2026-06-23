import { useTable, ShowButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Grid } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useState } from "react";

const { useBreakpoint } = Grid;

export const WebsiteList = () => {
  const { tableProps } = useTable({ resource: "websites", syncWithLocation: true });
  const [syncing, setSyncing] = useState(false);
  const screens = useBreakpoint();

  const handleSync = async () => {
    setSyncing(true);
    try {
      await axiosInstance.post(`${API_URL}/websites/sync`);
      window.location.reload();
    } finally {
      setSyncing(false);
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
        <Button type="primary" icon={<SyncOutlined />} onClick={handleSync} loading={syncing}>
          {screens.sm ? "Sync from Cloudflare" : "Sync"}
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
