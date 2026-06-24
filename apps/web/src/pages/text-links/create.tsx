import { Create, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, DatePicker, Select, Alert, Row, Col, Grid } from "antd";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";

const { useBreakpoint } = Grid;

export const TextLinkCreate = () => {
  const { formProps, saveButtonProps } = useForm({
    resource: "text-links",
    action: "create",
  });
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();
  const span = screens.md ? 12 : 24;

  return (
    <Create saveButtonProps={saveButtonProps}>
      {!isAdmin && (
        <Alert
          message="Link sẽ được tạo ở trạng thái Disabled và cần Admin phê duyệt để kích hoạt."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]}>
              <Input placeholder="e.g. Partner A Campaign" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]}>
              <Input placeholder="Visible link text" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]}>
              <Input placeholder="https://example.com" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="e.g. nofollow, sponsored, ugc — leave empty for dofollow">
              <Select
                allowClear
                placeholder="Not set (dofollow)"
                options={[
                  { label: "nofollow", value: "nofollow" },
                  { label: "sponsored", value: "sponsored" },
                  { label: "nofollow sponsored", value: "nofollow sponsored" },
                  { label: "ugc", value: "ugc" },
                  { label: "noopener", value: "noopener" },
                  { label: "nofollow noopener", value: "nofollow noopener" },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Expiration Date" name="expiresAt">
              <DatePicker style={{ width: "100%" }} disabledDate={(current) => current && current < dayjs().startOf("day")} />
            </Form.Item>
          </Col>
        </Row>
        {isAdmin && (
          <Form.Item label="Deploy to Websites" name="websiteIds">
            <WebsiteSelector />
          </Form.Item>
        )}
      </Form>
    </Create>
  );
};
