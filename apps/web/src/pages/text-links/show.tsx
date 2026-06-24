import { useShow, useNavigation, useGetIdentity } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Table, Typography, Button, Space, Popconfirm, message, Grid } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title } = Typography;
const { useBreakpoint } = Grid;

export const TextLinkShow = () => {
  const { query } = useShow({ resource: "text-links" });
  const record = query?.data?.data as any;
  const { list, edit } = useNavigation();
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();

  const handleToggle = async () => {
    if (!record) return;
    try {
      await axiosInstance.post(`${API_URL}/text-links/${record._id}/toggle`);
      message.success("Status updated");
      query.refetch();
    } catch {
      message.error("Failed");
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    try {
      await axiosInstance.delete(`${API_URL}/text-links/${record._id}`);
      message.success("Deleted");
      list("text-links");
    } catch {
      message.error("Failed to delete");
    }
  };

  const statusColors: Record<string, string> = {
    active: "green",
    pending: "gold",
    disabled: "red",
    expired: "default",
  };

  const deployments = record?.deployments || [];

  return (
    <Show
      isLoading={query?.isLoading}
      headerButtons={
        <Space wrap>
          <Button icon={<EditOutlined />} onClick={() => record?._id && edit("text-links", record._id)}>
            Edit
          </Button>
          {isAdmin && record?.status === "pending" && (
            <Button type="primary" onClick={handleToggle}>Approve</Button>
          )}
          {isAdmin && record?.status === "active" && (
            <Popconfirm title="Disable this link?" onConfirm={handleToggle}>
              <Button danger>Disable</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "disabled" && (
            <Button onClick={handleToggle}>Enable</Button>
          )}
          <Popconfirm title="Delete this link permanently?" onConfirm={handleDelete}>
            <Button danger>Delete</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Descriptions bordered column={screens.md ? 2 : 1} size={screens.sm ? "default" : "small"}>
        <Descriptions.Item label="Title">{record?.title}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={statusColors[record?.status]}>{record?.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Anchor Text">{record?.anchorText}</Descriptions.Item>
        <Descriptions.Item label="Source">
          <Tag>{record?.source}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Target URL" span={screens.md ? 2 : 1}>
          <a href={/^https?:\/\//i.test(record?.targetUrl) ? record?.targetUrl : "#"} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
            {record?.targetUrl}
          </a>
        </Descriptions.Item>
        <Descriptions.Item label="Rel">
          {record?.rel ? <Tag>{record.rel}</Tag> : <Tag color="default">not set</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Expires">
          {record?.expiresAt ? new Date(record.expiresAt).toLocaleString() : "Never"}
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {record?.createdAt ? new Date(record.createdAt).toLocaleString() : "-"}
        </Descriptions.Item>
        {isAdmin && (
          <Descriptions.Item label="Created By">
            {record?.createdBy?.username || "-"}
          </Descriptions.Item>
        )}
      </Descriptions>

      {isAdmin && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>Deployments</Title>
          <Table
            dataSource={deployments}
            rowKey="_id"
            size="small"
            pagination={false}
            scroll={{ x: 400 }}
          >
            <Table.Column
              title="Website"
              dataIndex="websiteId"
              ellipsis
              render={(w: any) => (typeof w === "object" ? w.domain : w)}
            />
            <Table.Column
              dataIndex="status"
              title="Status"
              width={90}
              render={(s: string) => (
                <Tag color={s === "deployed" ? "green" : s === "failed" ? "red" : "default"}>{s}</Tag>
              )}
            />
            {screens.sm && (
              <Table.Column
                dataIndex="deployedAt"
                title="Deployed"
                render={(v) => (v ? new Date(v).toLocaleString() : "-")}
              />
            )}
            {screens.md && (
              <Table.Column
                dataIndex="lastVerifiedAt"
                title="Last Verified"
                render={(v) => (v ? new Date(v).toLocaleString() : "-")}
              />
            )}
            {screens.md && (
              <Table.Column
                dataIndex="errorMessage"
                title="Error"
                ellipsis
                render={(v) => v || "-"}
              />
            )}
          </Table>
        </>
      )}
    </Show>
  );
};
