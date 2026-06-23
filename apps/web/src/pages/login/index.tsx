import { useState } from "react";
import { useLogin } from "@refinedev/core";
import { Card, Form, Input, Button, Typography, Space, Alert } from "antd";
import { UserOutlined, LockOutlined, SafetyOutlined } from "@ant-design/icons";

const { Title } = Typography;

export const LoginPage = () => {
  const { mutate: login, isLoading } = useLogin();
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [partialToken, setPartialToken] = useState("");
  const [error, setError] = useState("");

  const handleCredentials = (values: { username: string; password: string }) => {
    setError("");
    login(
      { ...values },
      {
        onError: (err: any) => {
          if (err?.name === "TotpRequired") {
            setPartialToken(err.message);
            setStep("totp");
          } else {
            setError(err?.message || "Login failed");
          }
        },
      },
    );
  };

  const handleTotp = (values: { totpCode: string }) => {
    setError("");
    login(
      { totpCode: values.totpCode, partialToken },
      {
        onError: (err: any) => {
          setError(err?.message || "Invalid TOTP code");
        },
      },
    );
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
                <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
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
                <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
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
