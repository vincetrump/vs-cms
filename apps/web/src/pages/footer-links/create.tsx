import { Create, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, InputNumber, DatePicker, Select, Alert, Row, Col, Grid, Checkbox } from "antd";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";

const { useBreakpoint } = Grid;

export const FooterLinkCreate = () => {
  const { formProps, saveButtonProps } = useForm({
    resource: "footer-links",
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
          message="Footer link sẽ được tạo ở trạng thái Pending và cần Admin duyệt trước khi deploy lên websites."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tên nội bộ để nhận diện link (không hiển thị trên website)">
              <Input placeholder="e.g. Footer Partner A" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]} tooltip="Văn bản hiển thị ở footer của trang con">
              <Input placeholder="Visible link text" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]} tooltip="URL đích khi người dùng click vào link (bắt buộc http/https)">
              <Input placeholder="https://example.com" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="Thuộc tính rel của thẻ <a>. Bỏ trống = dofollow (tốt cho SEO).">
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
            <Form.Item
              label="Số trang con mỗi website"
              name="pageCount"
              rules={[{ required: true, message: "Vui lòng nhập số trang con" }]}
              tooltip="Hệ thống tự chọn các trang con có ít footer link nhất để cân đối phân bổ"
              initialValue={3}
            >
              <InputNumber min={1} max={50} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Expiration Date" name="expiresAt" tooltip="Hệ thống tự gỡ link khỏi tất cả websites khi hết hạn (chạy lúc 02:00 hàng ngày)">
              <DatePicker style={{ width: "100%" }} disabledDate={(current) => current && current < dayjs().startOf("day")} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item name="includeHomepage" valuePropName="checked" initialValue={false} tooltip="Nếu bật, link sẽ được chèn thêm vào footer của trang chủ (ngoài các trang con)">
              <Checkbox>Chèn vào footer trang chủ</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Chọn websites để deploy (sau khi admin duyệt)"} name="websiteIds">
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Create>
  );
};
