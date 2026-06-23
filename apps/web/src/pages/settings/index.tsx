import { useState } from "react";
import { Card, Form, Input, Button, Typography, Space, message, Alert } from "antd";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title } = Typography;

export const SettingsPage = () => {
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [settingUpTotp, setSettingUpTotp] = useState(false);

  const handleSetupTotp = async () => {
    try {
      const { data } = await axiosInstance.post(`${API_URL}/auth/setup-totp`);
      setTotpSetup(data);
    } catch {
      message.error("Failed to setup TOTP");
    }
  };

  const handleConfirmTotp = async (values: { code: string }) => {
    setSettingUpTotp(true);
    try {
      await axiosInstance.post(`${API_URL}/auth/confirm-totp`, { code: values.code });
      message.success("TOTP enabled successfully!");
      setTotpSetup(null);
    } catch {
      message.error("Invalid code");
    } finally {
      setSettingUpTotp(false);
    }
  };

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    try {
      const { data } = await axiosInstance.patch(`${API_URL}/users/change-password`, values);
      if (data.success) {
        message.success("Password changed");
      } else {
        message.error(data.message);
      }
    } catch {
      message.error("Failed to change password");
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Title level={4}>Settings</Title>

      <Card title="Two-Factor Authentication (TOTP)">
        {!totpSetup ? (
          <Button type="primary" onClick={handleSetupTotp}>
            Setup / Reset TOTP
          </Button>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert message="Scan this QR code with your authenticator app" type="info" />
            <div style={{ textAlign: "center" }}>
              <img src={totpSetup.qrCodeDataUrl} alt="TOTP QR Code" style={{ maxWidth: 200, width: "100%" }} />
            </div>
            <Alert
              message={<span style={{ wordBreak: "break-all" }}>{`Manual entry: ${totpSetup.secret}`}</span>}
              type="warning"
              style={{ fontFamily: "monospace" }}
            />
            <Form layout="vertical" onFinish={handleConfirmTotp}>
              <Form.Item name="code" rules={[{ required: true, len: 6, message: "6-digit code" }]}>
                <Input placeholder="Enter 6-digit code" maxLength={6} size="large" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={settingUpTotp} block>
                  Confirm & Enable
                </Button>
              </Form.Item>
            </Form>
          </Space>
        )}
      </Card>

      <Card title="Change Password">
        <Form layout="vertical" onFinish={handleChangePassword} style={{ maxWidth: 400 }}>
          <Form.Item label="Current Password" name="currentPassword" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="New Password" name="newPassword" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>Change Password</Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
};
