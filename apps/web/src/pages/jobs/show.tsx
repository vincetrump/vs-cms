import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Typography, Tag, Descriptions, Progress, Grid, Card } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useEffect, useRef } from "react";

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

const statusIcons: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <SyncOutlined spin />,
  completed: <CheckCircleOutlined />,
  failed: <CloseCircleOutlined />,
};

const levelColors: Record<string, string> = {
  info: "#1890ff",
  error: "#ff4d4f",
  warn: "#faad14",
};

export const JobShow = () => {
  const { query } = useShow({ resource: "jobs" });
  const { data, isLoading } = query;
  const record = data?.data as any;
  const screens = useBreakpoint();
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [record?.logs]);

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
          </Descriptions>

          {record.params && Object.keys(record.params).length > 0 && (
            <Card title="Params" size="small" style={{ marginTop: 16 }}>
              <pre style={{
                margin: 0,
                fontSize: 12,
                fontFamily: "'Fira Code', Consolas, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}>
                {JSON.stringify(record.params, null, 2)}
              </pre>
            </Card>
          )}

          {record.result && Object.keys(record.result).length > 0 && (
            <Card title="Result" size="small" style={{ marginTop: 16 }}>
              <pre style={{
                margin: 0,
                fontSize: 12,
                fontFamily: "'Fira Code', Consolas, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}>
                {JSON.stringify(record.result, null, 2)}
              </pre>
            </Card>
          )}

          <Card
            title={`Console (${record.logs?.length || 0} entries)`}
            style={{ marginTop: 16 }}
            size={screens.sm ? "default" : "small"}
          >
            <div
              ref={consoleRef}
              style={{
                background: "#1e1e1e",
                borderRadius: 6,
                padding: 12,
                maxHeight: 600,
                overflow: "auto",
                fontFamily: "'Fira Code', Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.8,
              }}
            >
              {record.logs?.length > 0 ? (
                record.logs.map((log: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#666", flexShrink: 0, userSelect: "none" }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      style={{
                        color: levelColors[log.level] || "#d4d4d4",
                        fontWeight: log.level === "error" ? 600 : 400,
                        flexShrink: 0,
                        width: 40,
                        textTransform: "uppercase",
                        userSelect: "none",
                      }}
                    >
                      {log.level}
                    </span>
                    <span style={{ color: log.level === "error" ? "#ff6b6b" : "#d4d4d4", wordBreak: "break-word" }}>
                      {log.message}
                    </span>
                  </div>
                ))
              ) : (
                <span style={{ color: "#666" }}>No logs yet</span>
              )}
            </div>
          </Card>
        </>
      )}
    </Show>
  );
};
