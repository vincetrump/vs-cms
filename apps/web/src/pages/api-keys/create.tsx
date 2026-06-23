import { useState } from "react";
import { Create } from "@refinedev/antd";
import { Form, Input, InputNumber, Button, Typography, Space, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useNavigation } from "@refinedev/core";

const { Paragraph, Text } = Typography;

export const ApiKeyCreate = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { list } = useNavigation();

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.post(`${API_URL}/api-keys`, values);
      setResult(data);
    } catch {
      message.error("Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Copied!");
  };

  return (
    <Create
      saveButtonProps={{ onClick: () => form.submit(), loading }}
      footerButtons={result ? [
        <Button key="done" type="primary" onClick={() => list("api-keys")}>Done</Button>
      ] : undefined}
    >
      {!result ? (
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Partner XYZ" />
          </Form.Item>
          <Form.Item label="Rate Limit (req/min)" name="rateLimit" initialValue={60}>
            <InputNumber min={1} max={1000} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      ) : (
        <div>
          <Paragraph type="warning" strong>
            Save these credentials now. They will not be shown again!
          </Paragraph>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Text strong>API Key:</Text>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <Input value={result.rawKey} readOnly style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(result.rawKey)} />
              </div>
            </div>
            <div>
              <Text strong>HMAC Secret:</Text>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <Input value={result.rawHmacSecret} readOnly style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(result.rawHmacSecret)} />
              </div>
            </div>
          </Space>
        </div>
      )}
    </Create>
  );
};
