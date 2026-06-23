import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Grid } from "antd";

const { useBreakpoint } = Grid;

export const WebsiteShow = () => {
  const { query } = useShow({ resource: "websites" });
  const record = query?.data?.data as any;
  const screens = useBreakpoint();

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions bordered column={1} size={screens.sm ? "default" : "small"}>
        <Descriptions.Item label="Domain">{record?.domain}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={record?.status === "active" ? "green" : "orange"}>{record?.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Server IP">{record?.serverIp}</Descriptions.Item>
        <Descriptions.Item label="Document Root">
          <span style={{ wordBreak: "break-all" }}>{record?.documentRoot || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Homepage Path">
          <span style={{ wordBreak: "break-all" }}>{record?.homepagePath || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Cloudflare Zone ID">
          <span style={{ wordBreak: "break-all" }}>{record?.cloudflareZoneId || "-"}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Last Synced">
          {record?.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : "Never"}
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
};
