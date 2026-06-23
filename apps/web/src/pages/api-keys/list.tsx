import { useTable, List } from "@refinedev/antd";
import { Table, Tag, Button, Space, Popconfirm, message, Grid, Dropdown } from "antd";
import { PlusOutlined, MoreOutlined } from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { useBreakpoint } = Grid;

export const ApiKeyList = () => {
  const { tableProps, tableQuery } = useTable({ resource: "api-keys", syncWithLocation: true });
  const { create } = useNavigation();
  const screens = useBreakpoint();

  const handleDeactivate = async (id: string) => {
    try {
      await axiosInstance.patch(`${API_URL}/api-keys/${id}/deactivate`);
      message.success("API key deactivated");
      tableQuery.refetch();
    } catch {
      message.error("Failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axiosInstance.delete(`${API_URL}/api-keys/${id}`);
      message.success("API key deleted");
      tableQuery.refetch();
    } catch {
      message.error("Failed");
    }
  };

  const renderMobileActions = (record: any) => (
    <Dropdown
      menu={{
        items: [
          ...(record.isActive ? [{
            key: "deactivate",
            label: "Deactivate",
            danger: true,
            onClick: () => handleDeactivate(record._id),
          }] : []),
          {
            key: "delete",
            label: "Delete",
            danger: true,
            onClick: () => handleDelete(record._id),
          },
        ],
      }}
      trigger={["click"]}
    >
      <Button size="small" icon={<MoreOutlined />} />
    </Dropdown>
  );

  return (
    <List
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => create("api-keys")}>
          {screens.sm ? "New API Key" : "New"}
        </Button>
      }
    >
      <Table {...tableProps} rowKey="_id" scroll={{ x: 400 }} size={screens.sm ? "middle" : "small"}>
        <Table.Column dataIndex="name" title="Name" ellipsis />
        {screens.md && (
          <Table.Column dataIndex="keyPrefix" title="Key Prefix" render={(v) => `vscms_${v}...`} />
        )}
        <Table.Column
          dataIndex="isActive"
          title="Status"
          width={90}
          render={(active: boolean) => (
            <Tag color={active ? "green" : "red"}>{active ? "Active" : "Inactive"}</Tag>
          )}
        />
        {screens.sm && (
          <Table.Column dataIndex="rateLimit" title="Rate Limit" width={100} render={(v) => `${v}/min`} />
        )}
        {screens.md && (
          <Table.Column
            dataIndex="lastUsedAt"
            title="Last Used"
            render={(v) => (v ? new Date(v).toLocaleString() : "Never")}
          />
        )}
        {screens.lg && (
          <Table.Column
            dataIndex="createdAt"
            title="Created"
            render={(v) => new Date(v).toLocaleDateString()}
          />
        )}
        <Table.Column
          title="Actions"
          width={screens.sm ? 180 : 50}
          fixed="right"
          render={(_, record: any) =>
            screens.sm ? (
              <Space size={4}>
                {record.isActive && (
                  <Popconfirm title="Deactivate?" onConfirm={() => handleDeactivate(record._id)}>
                    <Button size="small" danger>Deactivate</Button>
                  </Popconfirm>
                )}
                <Popconfirm title="Delete permanently?" onConfirm={() => handleDelete(record._id)}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              </Space>
            ) : renderMobileActions(record)
          }
        />
      </Table>
    </List>
  );
};
