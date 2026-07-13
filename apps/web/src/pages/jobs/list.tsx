import { useTable, List, ShowButton } from "@refinedev/antd";
import { Table, Tag, Progress, Grid, Space } from "antd";

const { useBreakpoint } = Grid;

const statusColors: Record<string, string> = {
  pending: "default",
  running: "processing",
  completed: "success",
  failed: "error",
  cancelled: "warning",
};

const typeLabels: Record<string, string> = {
  sync_websites: "Sync Websites",
  deploy_links: "Deploy Links",
  undeploy_links: "Undeploy Links",
  undeploy_all: "Undeploy All",
  redeploy_link: "Redeploy Link",
  sync_link_websites: "Sync Link Sites",
  verify_deployments: "Verify Deployments",
  check_expired: "Check Expired",
};

export const JobList = () => {
  const { tableProps } = useTable({
    resource: "jobs",
    syncWithLocation: true,
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });
  const screens = useBreakpoint();

  return (
    <List>
      <Table {...tableProps} rowKey="_id" scroll={{ x: 400 }} size={screens.sm ? "middle" : "small"}>
        <Table.Column
          dataIndex="type"
          title="Type"
          ellipsis
          render={(type: string) => typeLabels[type] || type}
        />
        <Table.Column
          dataIndex="status"
          title="Status"
          width={110}
          render={(status: string) => (
            <Tag color={statusColors[status] || "default"}>{status}</Tag>
          )}
        />
        {screens.md && (
          <Table.Column
            title="Progress"
            width={150}
            render={(_, record: any) =>
              record.progressTotal > 0 ? (
                <Progress
                  percent={Math.round((record.progressCurrent / record.progressTotal) * 100)}
                  size="small"
                  status={record.status === "failed" ? "exception" : undefined}
                />
              ) : (
                "-"
              )
            }
          />
        )}
        {screens.lg && (
          <Table.Column
            dataIndex="createdAt"
            title="Created"
            render={(v: string) => new Date(v).toLocaleString()}
          />
        )}
        {screens.sm && (
          <Table.Column
            title="Duration"
            width={100}
            render={(_, record: any) => {
              if (!record.startedAt) return "-";
              const end = record.completedAt ? new Date(record.completedAt) : new Date();
              const start = new Date(record.startedAt);
              const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
              if (seconds < 60) return `${seconds}s`;
              return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
            }}
          />
        )}
        <Table.Column
          title=""
          width={80}
          fixed="right"
          render={(_, record: any) => (
            <Space>
              <ShowButton resource="jobs" recordItemId={record._id} size="small" hideText={!screens.sm} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
