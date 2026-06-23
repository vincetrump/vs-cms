import { useTable, ShowButton, EditButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Space, Popconfirm, message, Grid, Dropdown } from "antd";
import { PlusOutlined, CheckOutlined, StopOutlined, MoreOutlined } from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { useBreakpoint } = Grid;

export const TextLinkList = () => {
  const { tableProps } = useTable({ resource: "text-links", syncWithLocation: true });
  const { create, show, edit } = useNavigation();
  const screens = useBreakpoint();

  const statusColors: Record<string, string> = {
    active: "green",
    pending: "gold",
    disabled: "red",
    expired: "default",
  };

  const handleToggle = async (id: string) => {
    try {
      await axiosInstance.post(`${API_URL}/text-links/${id}/toggle`);
      message.success("Status updated");
      window.location.reload();
    } catch {
      message.error("Failed to toggle status");
    }
  };

  const renderMobileActions = (record: any) => (
    <Dropdown
      menu={{
        items: [
          { key: "show", label: "View", onClick: () => show("text-links", record._id) },
          { key: "edit", label: "Edit", onClick: () => edit("text-links", record._id) },
          {
            key: "toggle",
            label: record.status === "active" ? "Disable" : "Enable",
            danger: record.status === "active",
            onClick: () => handleToggle(record._id),
          },
        ],
      }}
      trigger={["click"]}
    >
      <Button size="small" icon={<MoreOutlined />} />
    </Dropdown>
  );

  const renderDesktopActions = (record: any) => (
    <Space size={4}>
      <ShowButton size="small" recordItemId={record._id} hideText />
      <EditButton size="small" recordItemId={record._id} hideText />
      <Popconfirm
        title={record.status === "active" ? "Disable this link?" : "Enable this link?"}
        onConfirm={() => handleToggle(record._id)}
      >
        <Button
          size="small"
          icon={record.status === "active" ? <StopOutlined /> : <CheckOutlined />}
          danger={record.status === "active"}
        />
      </Popconfirm>
    </Space>
  );

  return (
    <List
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => create("text-links")}>
          {screens.sm ? "New Text Link" : "New"}
        </Button>
      }
    >
      <Table {...tableProps} rowKey="_id" scroll={{ x: 500 }} size={screens.sm ? "middle" : "small"}>
        <Table.Column dataIndex="title" title="Title" sorter ellipsis />
        {screens.md && <Table.Column dataIndex="anchorText" title="Anchor" ellipsis />}
        {screens.lg && (
          <Table.Column
            dataIndex="targetUrl"
            title="Target URL"
            render={(url: string) => (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {url}
              </a>
            )}
          />
        )}
        <Table.Column
          dataIndex="status"
          title="Status"
          width={90}
          render={(status: string) => <Tag color={statusColors[status]}>{status}</Tag>}
          filters={[
            { text: "Active", value: "active" },
            { text: "Pending", value: "pending" },
            { text: "Disabled", value: "disabled" },
            { text: "Expired", value: "expired" },
          ]}
        />
        {screens.sm && (
          <Table.Column
            dataIndex="source"
            title="Source"
            width={80}
            render={(source: string) => <Tag>{source}</Tag>}
          />
        )}
        {screens.md && (
          <Table.Column
            dataIndex="expiresAt"
            title="Expires"
            render={(v) => (v ? new Date(v).toLocaleDateString() : "Never")}
            sorter
          />
        )}
        {screens.lg && (
          <Table.Column
            dataIndex="createdAt"
            title="Created"
            render={(v) => new Date(v).toLocaleDateString()}
            sorter
          />
        )}
        <Table.Column
          title="Actions"
          width={screens.sm ? 120 : 50}
          fixed="right"
          render={(_, record: any) =>
            screens.sm ? renderDesktopActions(record) : renderMobileActions(record)
          }
        />
      </Table>
    </List>
  );
};
