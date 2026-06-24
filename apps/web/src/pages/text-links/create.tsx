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
          message="Link sẽ được tạo ở trạng thái Pending và cần Admin duyệt trước khi deploy lên websites."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tên nội bộ để nhận diện link (không hiển thị trên website)">
              <Input placeholder="e.g. Partner A Campaign" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]} tooltip="Văn bản hiển thị trên website, click vào sẽ mở Target URL">
              <Input placeholder="Visible link text" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]} tooltip="URL đích khi người dùng click vào link (bắt buộc http/https)">
              <Input placeholder="https://example.com" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="Thuộc tính rel của thẻ <a>. Bỏ trống = dofollow (tốt cho SEO). Chọn nofollow hoặc sponsored nếu là link trả phí.">
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
            <Form.Item label="Expiration Date" name="expiresAt" tooltip="Hệ thống tự gỡ link khỏi tất cả websites khi hết hạn (chạy lúc 02:00 hàng ngày)">
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
