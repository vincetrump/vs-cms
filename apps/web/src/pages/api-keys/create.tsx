import { useState } from "react";
import { Create } from "@refinedev/antd";
import { Form, Input, InputNumber, Button, Typography, Space, message, Select, Alert, Row, Col, Grid } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";
import { useNavigation } from "@refinedev/core";
import { downloadSdkZip } from "../../utils/downloadSdk";

const { Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

export const ApiKeyCreate = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { list, show } = useNavigation();
  const screens = useBreakpoint();
  const span = screens.md ? 12 : 24;

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        allowedIps: values.allowedIps?.length ? values.allowedIps : [],
      };
      const { data } = await axiosInstance.post(`${API_URL}/api-keys`, payload);
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
        <Button
          key="download"
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => downloadSdkZip({
            apiKey: result.rawKey,
            hmacSecret: result.rawHmacSecret,
            keyName: result.name,
            apiUrl: window.location.origin,
          })}
        >
          Download SDK (.zip)
        </Button>,
        <Button key="view" onClick={() => show("api-keys", result._id)}>View Details</Button>,
        <Button key="done" onClick={() => list("api-keys")}>Back to List</Button>,
      ] : undefined}
    >
      {!result ? (
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={span}>
              <Form.Item
                label="Name"
                name="name"
                rules={[{ required: true }]}
                tooltip="Tên để nhận diện API key (vd: Partner XYZ)"
              >
                <Input placeholder="e.g. Partner XYZ" />
              </Form.Item>
            </Col>
            <Col span={span}>
              <Form.Item
                label="Rate Limit (req/min)"
                name="rateLimit"
                initialValue={60}
                tooltip="Số request tối đa mỗi phút"
              >
                <InputNumber min={1} max={1000} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="Allowed IPs"
                name="allowedIps"
                tooltip="Chỉ cho phép các IP này sử dụng API key. Bỏ trống = cho phép tất cả IP."
              >
                <Select
                  mode="tags"
                  placeholder="Nhập IP rồi nhấn Enter (vd: 103.20.1.50)"
                  tokenSeparators={[",", " "]}
                  notFoundContent={null}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ) : (
        <div>
          <Alert
            message="Lưu thông tin bên dưới ngay! Chúng sẽ không hiển thị lại. Nhấn Download SDK để tải bộ tích hợp gồm credentials, examples và API spec."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
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
