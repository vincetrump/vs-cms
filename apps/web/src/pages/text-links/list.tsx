import { useTable, ShowButton, EditButton, List } from "@refinedev/antd";
import { Table, Tag, Button, Space, Popconfirm, message, Grid, Dropdown, Tooltip } from "antd";
import { PlusOutlined, CheckOutlined, StopOutlined, MoreOutlined } from "@ant-design/icons";
import { useNavigation, useGetIdentity } from "@refinedev/core";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { useBreakpoint } = Grid;

export const TextLinkList = () => {
  const { tableProps, tableQuery } = useTable({ resource: "text-links", syncWithLocation: true });
  const { create, show, edit } = useNavigation();
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();

  const statusColors: Record<string, string> = {
    active: "green",
    pending: "gold",
    disabled: "red",
    expired: "default",
  };

  const statusHints: Record<string, string> = {
    active: "Đang deploy trên websites",
    pending: "Chờ admin duyệt",
    disabled: "Đã gỡ khỏi websites",
    expired: "Hết hạn, đã tự động gỡ",
  };

  const handleToggle = async (id: string) => {
    try {
      await axiosInstance.post(`${API_URL}/text-links/${id}/toggle`);
      message.success("Status updated");
      tableQuery.refetch();
    } catch {
      message.error("Failed to toggle status");
    }
  };

  const renderMobileActions = (record: any) => {
    const items: any[] = [
      { key: "show", label: "View", onClick: () => show("text-links", record._id) },
      { key: "edit", label: "Edit", onClick: () => edit("text-links", record._id) },
    ];
    if (isAdmin) {
      items.push({
        key: "toggle",
        label: record.status === "active" ? "Disable" : "Enable",
        danger: record.status === "active",
        onClick: () => handleToggle(record._id),
      });
    }
    return (
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  const renderDesktopActions = (record: any) => (
    <Space size={4}>
      <ShowButton size="small" recordItemId={record._id} hideText />
      <EditButton size="small" recordItemId={record._id} hideText />
      {isAdmin && (
        <Popconfirm
          title={record.status === "active" ? "Disable link này?" : record.status === "pending" ? "Approve link này?" : "Enable link này?"}
          description={
            record.status === "active" ? "Gỡ khỏi tất cả websites" :
            record.status === "pending" ? "Deploy/redeploy nội dung lên websites" :
            "Deploy lại lên websites trước đó"
          }
          onConfirm={() => handleToggle(record._id)}
        >
          <Button
            size="small"
            icon={record.status === "active" ? <StopOutlined /> : <CheckOutlined />}
            danger={record.status === "active"}
          />
        </Popconfirm>
      )}
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
      <Table
        {...tableProps}
        rowKey="_id"
        scroll={screens.sm ? { x: 500 } : undefined}
        size="small"
      >
        <Table.Column
          dataIndex="title"
          title="Title"
          sorter
          ellipsis={!!screens.sm}
          render={(title: string, record: any) =>
            screens.sm ? title : (
              <div>
                <div style={{ fontWeight: 500 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{(record as any).anchorText}</div>
              </div>
            )
          }
        />
        {screens.md && <Table.Column dataIndex="anchorText" title="Anchor" ellipsis />}
        {screens.lg && (
          <Table.Column
            dataIndex="targetUrl"
            title="Target URL"
            render={(url: string) => {
              const safeUrl = /^https?:\/\//i.test(url) ? url : "#";
              return (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {url}
                </a>
              );
            }}
          />
        )}
        <Table.Column
          dataIndex="status"
          title="Status"
          width={screens.sm ? 90 : 70}
          render={(status: string) => (
            <Tooltip title={statusHints[status]}>
              <Tag color={statusColors[status]}>{status}</Tag>
            </Tooltip>
          )}
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
        {isAdmin && screens.md && (
          <Table.Column
            dataIndex="createdBy"
            title="Created By"
            width={140}
            render={(user: any, record: any) =>
              user?.username
                ? user.username
                : record.apiKeyId?.name
                  ? <Tag color="blue">API: {record.apiKeyId.name}</Tag>
                  : "-"
            }
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
          title=""
          width={screens.sm ? 120 : 40}
          render={(_, record: any) =>
            screens.sm ? renderDesktopActions(record) : renderMobileActions(record)
          }
        />
      </Table>
    </List>
  );
};
