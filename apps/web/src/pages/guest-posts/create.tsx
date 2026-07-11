import { Create, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, DatePicker, Select, Alert, Row, Col, Grid, Space } from "antd";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import { ContentEditor, PreviewButton, CategoryInput, AiGeneratePanel, REL_OPTIONS, slugify } from "./form-utils";

const { useBreakpoint } = Grid;

export const GuestPostCreate = () => {
  const { formProps, saveButtonProps, form } = useForm({
    resource: "guest-posts",
    action: "create",
  });
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();
  const span = screens.md ? 12 : 24;

  const handleValuesChange = (changed: any) => {
    if (changed.title !== undefined && !form?.isFieldTouched("slug")) {
      form?.setFieldValue("slug", slugify(changed.title || ""));
    }
  };

  return (
    <Create
      saveButtonProps={saveButtonProps}
      headerButtons={({ defaultButtons }) => (
        <Space>
          {defaultButtons}
          {form && <PreviewButton form={form} />}
        </Space>
      )}
    >
      {!isAdmin && (
        <Alert
          message="Guest post sẽ được tạo ở trạng thái Pending và cần Admin duyệt trước khi deploy lên websites."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {form && <AiGeneratePanel form={form} />}
      <Form {...formProps} layout="vertical" onValuesChange={handleValuesChange}>
        <Form.Item name="contentSource" initialValue="manual" hidden>
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tiêu đề bài viết — hiển thị làm <h1> và <title> trên website">
              <Input placeholder="e.g. 5 cách chăm sóc sức khỏe mùa hè" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Slug"
              name="slug"
              rules={[
                { required: true, message: "Vui lòng nhập slug" },
                { pattern: /^[a-z0-9-]+$/, message: "Chỉ chấp nhận chữ thường, số và dấu gạch ngang" },
              ]}
              tooltip="URL slug của bài viết: /{category}/{slug}/. Tự sinh từ title, có thể sửa tay."
            >
              <Input placeholder="5-cach-cham-soc-suc-khoe-mua-he" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Category"
              name="category"
              rules={[
                { required: true, message: "Vui lòng chọn category" },
                { pattern: /^[a-z0-9-]+$/, message: "Chỉ chấp nhận chữ thường, số và dấu gạch ngang" },
              ]}
              initialValue="tong-hop"
              tooltip="Category trên website. Nếu website không có category này, hệ thống fallback về tong-hop."
            >
              <CategoryInput />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Meta Description"
              name="metaDescription"
              rules={[{ required: true, message: "Vui lòng nhập meta description" }, { max: 300 }]}
              tooltip="SEO meta description (tối đa 300 ký tự)"
            >
              <Input.TextArea rows={2} maxLength={300} showCount placeholder="Mô tả ngắn gọn bài viết cho SEO..." />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]} tooltip="Anchor text của backlink chính trong bài viết">
              <Input placeholder="Visible link text" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]} tooltip="URL đích của backlink (bắt buộc http/https)">
              <Input placeholder="https://example.com" />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="Thuộc tính rel của backlink. Bỏ trống = dofollow (tốt cho SEO).">
              <Select allowClear placeholder="Not set (dofollow)" options={REL_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Expiration Date" name="expiresAt" tooltip="Hệ thống tự gỡ bài viết khỏi tất cả websites khi hết hạn (chạy lúc 02:00 hàng ngày)">
              <DatePicker style={{ width: "100%" }} disabledDate={(current) => current && current < dayjs().startOf("day")} />
            </Form.Item>
          </Col>
        </Row>
        {form && <ContentEditor form={form} />}
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Chọn websites để deploy (sau khi admin duyệt)"} name="websiteIds">
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Create>
  );
};
