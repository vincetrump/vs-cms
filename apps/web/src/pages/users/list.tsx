import { useState, useEffect } from "react";
import { Typography, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title } = Typography;

interface UserRecord {
  id: string;
  username: string;
  role: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export const UserList = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get(`${API_URL}/users`);
      setUsers(data);
    } catch {
      message.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (values: { username: string; password: string; role: string }) => {
    setCreating(true);
    try {
      await axiosInstance.post(`${API_URL}/users`, values);
      message.success(`User "${values.username}" created`);
      form.resetFields();
      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to create user";
      message.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axiosInstance.delete(`${API_URL}/users/${id}`);
      message.success("User deleted");
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to delete user";
      message.error(msg);
    }
  };

  const columns = [
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "blue" : "green"}>{role.toUpperCase()}</Tag>
      ),
    },
    {
      title: "2FA",
      dataIndex: "totpEnabled",
      key: "totpEnabled",
      render: (v: boolean) => (
        <Tag color={v ? "green" : "orange"}>{v ? "Enabled" : "Not set"}</Tag>
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_: any, record: UserRecord) => (
        record.mustChangePassword
          ? <Tag color="red">Must change password</Tag>
          : <Tag color="green">Active</Tag>
      ),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "",
      key: "actions",
      render: (_: any, record: UserRecord) => (
        <Popconfirm title={`Delete user "${record.username}"?`} onConfirm={() => handleDelete(record.id)} okText="Delete" okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Create User
        </Button>
      </Space>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title="Create User"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="Username" name="username" rules={[{ required: true, min: 3, message: "At least 3 characters" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Password" name="password" rules={[{ required: true, min: 6, message: "At least 6 characters" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]} initialValue="sale">
            <Select options={[{ value: "admin", label: "Admin" }, { value: "sale", label: "Sale" }]} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={creating}>Create</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
