import { useState, useEffect } from "react";
import { Create, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, InputNumber, DatePicker, Select, Alert, Row, Col, Grid, Switch } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import { REL_OPTIONS, fetchAiConfigured } from "./form-utils";

const { useBreakpoint } = Grid;

// Create = 100% AI: chỉ nhập Anchor + URL + websites (+ chủ đề/số từ tùy chọn) rồi Save.
// Không có bước generate nháp, không có chế độ tự viết — toàn bộ nội dung do AI sinh
// LÚC DEPLOY, mỗi website một bài riêng (chống duplicate content).
export const GuestPostCreate = () => {
  const { formProps, saveButtonProps, form } = useForm({
    resource: "guest-posts",
    action: "create",
  });
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();
  const span = screens.md ? 12 : 24;

  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    fetchAiConfigured().then(setAiAvailable);
  }, []);

  const websiteCount = (Form.useWatch("websiteIds", { form, preserve: true }) || []).length;

  return (
    <Create saveButtonProps={{ ...saveButtonProps, disabled: saveButtonProps?.disabled || aiAvailable === false }}>
      {aiAvailable === false && (
        <Alert
          message="AI chưa được cấu hình trên server (thiếu ANTHROPIC_API_KEY) — không thể tạo guest post."
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {!isAdmin && (
        <Alert
          message="Guest post sẽ được tạo ở trạng thái Pending và cần Admin duyệt trước khi deploy lên websites."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        {/* Mọi guest post đều là bài AI — worker generate riêng cho từng website lúc deploy */}
        <Form.Item name="contentSource" initialValue="ai" hidden>
          <Input />
        </Form.Item>

        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true, message: "Vui lòng nhập anchor text" }]} tooltip="Anchor text của backlink chính trong bài viết">
              <Input placeholder="Visible link text" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url", message: "URL không hợp lệ (cần http/https)" }]} tooltip="URL đích của backlink (bắt buộc http/https)">
              <Input placeholder="https://example.com" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="Thuộc tính rel của backlink. Bỏ trống = dofollow (tốt cho SEO).">
              <Select allowClear placeholder="Not set (dofollow)" options={REL_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Expiration Date" name="expiresAt" tooltip="Hết hạn: hệ thống tự GỠ BACKLINK khỏi bài (bài viết vẫn giữ trên site), chạy lúc 02:00 hàng ngày">
              <DatePicker style={{ width: "100%" }} disabledDate={(current) => current && current < dayjs().startOf("day")} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Ẩn backlink"
              name="hideBacklink"
              valuePropName="checked"
              initialValue={true}
              tooltip="Mặc định ẩn: backlink vẫn được chèn vào bài nhưng ẩn bằng CSS display:none (ẩn tạm khi lên prod). Tắt để hiện lại — cần redeploy để áp dụng."
            >
              <Switch checkedChildren="Ẩn" unCheckedChildren="Hiện" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Chọn websites để deploy (sau khi admin duyệt)"} name="websiteIds">
          <WebsiteSelector />
        </Form.Item>

        <Alert
          type="info"
          showIcon
          icon={<RobotOutlined />}
          style={{ marginBottom: 16 }}
          message={
            websiteCount > 0
              ? `Khi deploy, AI sẽ tự viết ${websiteCount} bài KHÁC NHAU — mỗi website một bài theo đúng chủ đề của site đó (chống duplicate content). Không cần viết gì, bấm Save là xong.`
              : "Khi deploy, AI sẽ tự viết mỗi website một bài riêng theo chủ đề của site đó. Chọn websites ở trên, hoặc Save rồi deploy sau từ trang chi tiết."
          }
        />
        <Row gutter={16}>
          <Col span={screens.md ? 16 : 24}>
            <Form.Item
              label="Chủ đề (tùy chọn)"
              name="aiTopic"
              tooltip="Bỏ trống — AI đọc metadata từng website (tên site, mô tả, chuyên mục) và tự chọn chủ đề phù hợp (khuyên dùng)"
            >
              <Input placeholder="Bỏ trống để AI tự chọn chủ đề theo từng website" />
            </Form.Item>
          </Col>
          <Col span={screens.md ? 8 : 24}>
            <Form.Item label="Độ dài bài viết" name="aiWordCount" initialValue={800}>
              <InputNumber min={300} max={2000} step={100} addonAfter="từ" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Create>
  );
};
