import { useState } from "react";
import { Card, Form, Input, Button, Typography, Space, Alert, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { useNavigate } from "react-router";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title, Paragraph } = Typography;

export const ChangePasswordPage = () => {
  const { data: identity, refetch } = useGetIdentity<{ mustChangePassword: boolean }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (identity && !identity.mustChangePassword) {
    navigate("/", { replace: true });
    return null;
  }

  const handleSubmit = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axiosInstance.patch(`${API_URL}/users/change-password`, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (!data.success) {
        message.error(data.message);
        return;
      }
      if (data.accessToken) {
        localStorage.setItem("token", data.accessToken);
      }
      message.success("Password changed successfully!");
      await refetch();
      navigate("/", { replace: true });
    } catch {
      message.error("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 420 }}>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <div style={{ textAlign: "center" }}>
            <Title level={3}>Change Your Password</Title>
            <Paragraph type="secondary">
              You must change your password before continuing. Please choose a new password.
            </Paragraph>
          </div>

          <Alert message="This is required for first-time login. Your current password was set by an administrator." type="info" showIcon />

          <Form layout="vertical" onFinish={handleSubmit}>
            <Form.Item label="Current Password" name="currentPassword" rules={[{ required: true, message: "Enter your current password" }]}>
              <Input.Password prefix={<LockOutlined />} size="large" />
            </Form.Item>
            <Form.Item label="New Password" name="newPassword" rules={[{ required: true, min: 6, message: "At least 6 characters" }]}>
              <Input.Password prefix={<LockOutlined />} size="large" />
            </Form.Item>
            <Form.Item
              label="Confirm New Password"
              name="confirmPassword"
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: "Confirm your new password" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                    return Promise.reject(new Error("Passwords do not match"));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                Change Password & Continue
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
};
