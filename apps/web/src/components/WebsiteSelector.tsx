import { useList } from "@refinedev/core";
import { Table, Button, Space, Grid, Tag } from "antd";
import { useState, useEffect } from "react";

const { useBreakpoint } = Grid;

interface Props {
  value?: string[];
  onChange?: (ids: string[]) => void;
}

export const WebsiteSelector = ({ value = [], onChange }: Props) => {
  const { data, isLoading } = useList({
    resource: "websites",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    pagination: { pageSize: 100 },
  });
  const screens = useBreakpoint();

  const [selectedKeys, setSelectedKeys] = useState<string[]>(value);

  useEffect(() => {
    setSelectedKeys(value);
  }, [value]);

  const websites = data?.data ?? [];

  const handleChange = (keys: React.Key[]) => {
    const ids = keys.map(String);
    setSelectedKeys(ids);
    onChange?.(ids);
  };

  const selectAll = () => {
    const all = websites.map((w: any) => w._id);
    setSelectedKeys(all);
    onChange?.(all);
  };

  const deselectAll = () => {
    setSelectedKeys([]);
    onChange?.([]);
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button size="small" onClick={selectAll}>Select All</Button>
        <Button size="small" onClick={deselectAll}>Deselect All</Button>
        <Tag>{selectedKeys.length} / {websites.length} selected</Tag>
      </Space>
      <Table
        dataSource={websites}
        rowKey="_id"
        loading={isLoading}
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: handleChange,
        }}
      >
        <Table.Column dataIndex="domain" title="Domain" ellipsis />
        {screens.sm && (
          <Table.Column dataIndex="documentRoot" title="Path" ellipsis render={(v) => v || "-"} />
        )}
      </Table>
    </div>
  );
};
