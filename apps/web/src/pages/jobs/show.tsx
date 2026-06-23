import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Typography, Tag, Descriptions, Progress, Timeline, Grid, Card } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";

const { useBreakpoint } = Grid;

const statusColors: Record<string, string> = {
  pending: "default",
  running: "processing",
  completed: "success",
  failed: "error",
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

const logIcons: Record<string, React.ReactNode> = {
  info: <InfoCircleOutlined style={{ color: "#1890ff" }} />,
  error: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
  warn: <InfoCircleOutlined style={{ color: "#faad14" }} />,
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <SyncOutlined spin />,
  completed: <CheckCircleOutlined />,
  failed: <CloseCircleOutlined />,
};

export const JobShow = () => {
  const { query } = useShow({ resource: "jobs" });
  const { data, isLoading } = query;
  const record = data?.data as any;
  const screens = useBreakpoint();

  return (
    <Show isLoading={isLoading}>
      {record && (
        <>
          <Descriptions
            bordered
            column={screens.md ? 2 : 1}
            size={screens.sm ? "default" : "small"}
          >
            <Descriptions.Item label="Type">
              {typeLabels[record.type] || record.type}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag icon={statusIcons[record.status]} color={statusColors[record.status]}>
                {record.status}
              </Tag>
            </Descriptions.Item>
            {record.progressTotal > 0 && (
              <Descriptions.Item label="Progress" span={screens.md ? 2 : 1}>
                <Progress
                  percent={Math.round((record.progressCurrent / record.progressTotal) * 100)}
                  status={record.status === "failed" ? "exception" : undefined}
                  format={() => `${record.progressCurrent}/${record.progressTotal}`}
                />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Created">
              {new Date(record.createdAt).toLocaleString()}
            </Descriptions.Item>
            {record.startedAt && (
              <Descriptions.Item label="Started">
                {new Date(record.startedAt).toLocaleString()}
              </Descriptions.Item>
            )}
            {record.completedAt && (
              <Descriptions.Item label="Completed">
                {new Date(record.completedAt).toLocaleString()}
              </Descriptions.Item>
            )}
            {record.startedAt && (
              <Descriptions.Item label="Duration">
                {(() => {
                  const end = record.completedAt ? new Date(record.completedAt) : new Date();
                  const seconds = Math.round((end.getTime() - new Date(record.startedAt).getTime()) / 1000);
                  if (seconds < 60) return `${seconds}s`;
                  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
                })()}
              </Descriptions.Item>
            )}
            {record.error && (
              <Descriptions.Item label="Error" span={screens.md ? 2 : 1}>
                <Typography.Text type="danger">{record.error}</Typography.Text>
              </Descriptions.Item>
            )}
            {record.params && Object.keys(record.params).length > 0 && (
              <Descriptions.Item label="Params" span={screens.md ? 2 : 1}>
                <Typography.Text code style={{ wordBreak: "break-all" }}>
                  {JSON.stringify(record.params)}
                </Typography.Text>
              </Descriptions.Item>
            )}
            {record.result && Object.keys(record.result).length > 0 && (
              <Descriptions.Item label="Result" span={screens.md ? 2 : 1}>
                <Typography.Text code style={{ wordBreak: "break-all" }}>
                  {JSON.stringify(record.result)}
                </Typography.Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Card title="Logs" style={{ marginTop: 16 }} size={screens.sm ? "default" : "small"}>
            {record.logs?.length > 0 ? (
              <Timeline
                items={record.logs.map((log: any) => ({
                  dot: logIcons[log.level] || logIcons.info,
                  children: (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </Typography.Text>
                      <br />
                      <Typography.Text type={log.level === "error" ? "danger" : undefined}>
                        {log.message}
                      </Typography.Text>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Typography.Text type="secondary">No logs yet</Typography.Text>
            )}
          </Card>
        </>
      )}
    </Show>
  );
};
