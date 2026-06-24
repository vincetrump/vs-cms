import { useState } from "react";
import { Card, Form, Input, Button, Typography, Space, Alert } from "antd";
import { UserOutlined, LockOutlined, SafetyOutlined } from "@ant-design/icons";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const { Title } = Typography;

function getRedirectUrl(token: string, opts?: { requireTotpSetup?: boolean; requirePasswordChange?: boolean }): string {
  if (opts?.requirePasswordChange) return "/change-password";
  if (opts?.requireTotpSetup) return "/setup-totp";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.mustChangePassword) return "/change-password";
    if (payload.role === "sale") return "/text-links";
  } catch {}
  return "/";
}

export const LoginPage = () => {
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [partialToken, setPartialToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (values: { username: string; password: string }) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, values);
      if (data.requireTotp) {
        setPartialToken(data.partialToken);
        setStep("totp");
      } else {
        localStorage.setItem("token", data.accessToken);
        window.location.href = getRedirectUrl(data.accessToken, {
          requireTotpSetup: data.requireTotpSetup,
          requirePasswordChange: data.requirePasswordChange,
        });
      }
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (values: { totpCode: string }) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/auth/verify-totp`,
        { code: values.totpCode },
        { headers: { Authorization: `Bearer ${partialToken}` } },
      );
      localStorage.setItem("token", data.accessToken);
      window.location.href = getRedirectUrl(data.accessToken, {
        requirePasswordChange: data.requirePasswordChange,
      });
    } catch {
      setError("Invalid TOTP code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 400 }}>
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }} size="large">
          <Title level={3}>VS-CMS Admin</Title>

          {error && <Alert message={error} type="error" showIcon />}

          {step === "credentials" ? (
            <Form layout="vertical" onFinish={handleCredentials}>
              <Form.Item name="username" rules={[{ required: true, message: "Username is required" }]}>
                <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: "Password is required" }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  Sign In
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <Form layout="vertical" onFinish={handleTotp}>
              <Typography.Paragraph type="secondary">
                Enter the 6-digit code from your authenticator app
              </Typography.Paragraph>
              <Form.Item name="totpCode" rules={[{ required: true, len: 6, message: "Enter 6-digit code" }]}>
                <Input prefix={<SafetyOutlined />} placeholder="000000" size="large" maxLength={6} style={{ textAlign: "center", letterSpacing: 8, fontSize: 24 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  Verify
                </Button>
              </Form.Item>
              <Button type="link" onClick={() => { setStep("credentials"); setPartialToken(""); }}>
                Back to login
              </Button>
            </Form>
          )}
        </Space>
      </Card>
    </div>
  );
};
