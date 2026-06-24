import { useShow, useNavigation, useGetIdentity } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Table, Typography, Button, Space, Popconfirm, message, Grid, Tooltip } from "antd";
import { EditOutlined, InfoCircleOutlined } from "@ant-design/icons";
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

  const statusLabels: Record<string, string> = {
    active: "Hoạt động",
    pending: "Chờ duyệt",
    disabled: "Đã tắt",
    expired: "Hết hạn",
  };

  const statusHints: Record<string, string> = {
    active: "Link đang hoạt động và đã được deploy trên websites.",
    pending: "Link đang chờ admin duyệt. Nội dung trên websites (nếu có) vẫn giữ nguyên phiên bản cũ cho đến khi được approve.",
    disabled: "Link đã bị tắt và đã được gỡ khỏi tất cả websites.",
    expired: "Link đã hết hạn và tự động được gỡ khỏi websites bởi hệ thống.",
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
            <Popconfirm
              title="Approve link này?"
              description="Link sẽ chuyển sang Active. Nội dung mới sẽ được deploy/redeploy lên các websites."
              onConfirm={handleToggle}
            >
              <Button type="primary">Approve</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "active" && (
            <Popconfirm
              title="Disable link này?"
              description="Link sẽ bị gỡ khỏi tất cả websites ngay lập tức."
              onConfirm={handleToggle}
            >
              <Button danger>Disable</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "disabled" && (
            <Popconfirm
              title="Enable link này?"
              description="Link sẽ được deploy lại lên các websites trước đó."
              onConfirm={handleToggle}
            >
              <Button>Enable</Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="Xoá link này vĩnh viễn?"
            description="Link sẽ bị gỡ khỏi websites (nếu đang deploy) và không thể khôi phục."
            onConfirm={handleDelete}
          >
            <Button danger>Delete</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Descriptions bordered column={screens.md ? 2 : 1} size={screens.sm ? "default" : "small"}>
        <Descriptions.Item label="Title">{record?.title}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tooltip title={statusHints[record?.status]}>
            <Tag color={statusColors[record?.status]}>{statusLabels[record?.status] || record?.status}</Tag>
            <InfoCircleOutlined style={{ color: "#999", fontSize: 12, marginLeft: 4 }} />
          </Tooltip>
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
            {record?.createdBy?.username
              ? record.createdBy.username
              : record?.apiKeyId?.name
                ? <Tag color="blue">API: {record.apiKeyId.name}</Tag>
                : "-"}
          </Descriptions.Item>
        )}
        {record?.requestedWebsites?.length > 0 && (
          <Descriptions.Item label="Requested Websites" span={screens.md ? 2 : 1}>
            <Space wrap>
              {record.requestedWebsites.map((w: any) => (
                <Tag key={w._id} color="cyan">{w.domain}</Tag>
              ))}
            </Space>
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
                <Tag color={s === "deployed" ? "green" : s === "failed" ? "red" : "default"}>
                  {s === "deployed" ? "Đã deploy" : s === "failed" ? "Lỗi" : s === "removed" ? "Đã gỡ" : s}
                </Tag>
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
