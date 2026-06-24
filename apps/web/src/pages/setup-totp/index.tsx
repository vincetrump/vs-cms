import { useState } from "react";
import { Card, Form, Input, Button, Typography, Space, Alert, message } from "antd";
import { SafetyOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { useNavigate } from "react-router";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title, Paragraph } = Typography;

export const SetupTotpPage = () => {
  const { data: identity, refetch } = useGetIdentity<{ totpEnabled: boolean }>();
  const navigate = useNavigate();
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (identity?.totpEnabled) {
    navigate("/", { replace: true });
    return null;
  }

  const handleSetup = async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.post(`${API_URL}/auth/setup-totp`);
      setTotpSetup(data);
    } catch {
      message.error("Failed to generate TOTP secret");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (values: { code: string }) => {
    setConfirming(true);
    try {
      const { data } = await axiosInstance.post(`${API_URL}/auth/confirm-totp`, { code: values.code });
      if (data.accessToken) {
        localStorage.setItem("token", data.accessToken);
      }
      message.success("2FA enabled!");
      await refetch();
      navigate("/", { replace: true });
    } catch {
      message.error("Invalid code, please try again");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 420 }}>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <div style={{ textAlign: "center" }}>
            <Title level={3}>Setup Two-Factor Authentication</Title>
            <Paragraph type="secondary">
              2FA is required for your account. Please set up an authenticator app to continue.
            </Paragraph>
          </div>

          {!totpSetup ? (
            <Button type="primary" onClick={handleSetup} loading={loading} block size="large">
              Generate QR Code
            </Button>
          ) : (
            <>
              <Alert message="Scan this QR code with Google Authenticator or a similar app" type="info" showIcon />
              <div style={{ textAlign: "center" }}>
                <img src={totpSetup.qrCodeDataUrl} alt="TOTP QR Code" style={{ maxWidth: 200, width: "100%" }} />
              </div>
              <Alert
                message={<span style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>{totpSetup.secret}</span>}
                description="Manual entry key (save this as backup)"
                type="warning"
                showIcon
              />
              <Form layout="vertical" onFinish={handleConfirm}>
                <Form.Item name="code" rules={[{ required: true, len: 6, message: "Enter 6-digit code" }]}>
                  <Input
                    prefix={<SafetyOutlined />}
                    placeholder="000000"
                    size="large"
                    maxLength={6}
                    style={{ textAlign: "center", letterSpacing: 8, fontSize: 24 }}
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={confirming} block size="large">
                    Verify & Enable 2FA
                  </Button>
                </Form.Item>
              </Form>
            </>
          )}
        </Space>
      </Card>
    </div>
  );
};
