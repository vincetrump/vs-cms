import { Edit, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, InputNumber, DatePicker, Select, Row, Col, Grid, Alert, Space, Switch } from "antd";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import { ContentEditor, PreviewButton, REL_OPTIONS } from "./form-utils";

const { useBreakpoint } = Grid;

export const GuestPostEdit = () => {
  const { formProps, saveButtonProps, query, form } = useForm({
    resource: "guest-posts",
    action: "edit",
  });
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();
  const span = screens.md ? 12 : 24;

  const record = query?.data?.data as any;
  const deployedWebsiteIds = record?.deployments
    ?.filter((d: any) => d.status === "deployed")
    ?.map((d: any) => d.websiteId?._id || d.websiteId) || [];
  const uniqueDeployedWebsiteIds = [...new Set(deployedWebsiteIds)] as string[];
  const initialWebsiteIds = uniqueDeployedWebsiteIds.length > 0
    ? uniqueDeployedWebsiteIds
    : record?.requestedWebsiteIds || [];

  return (
    <Edit
      saveButtonProps={saveButtonProps}
      headerButtons={({ defaultButtons }) => (
        <Space>
          {defaultButtons}
          {form && record?.contentSource !== "ai" && <PreviewButton form={form} />}
        </Space>
      )}
    >
      {!isAdmin && record?.status === "active" && (
        <Alert
          message="Thay đổi nội dung (title, content, anchor text, URL, rel) sẽ cần admin duyệt trước khi cập nhật trên websites."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {record?.deployments?.some((d: any) => d.status === "deployed") && (
        <Alert
          message={
            record?.contentSource === "ai"
              ? "Bài AI per-site: sửa Title/Content ở đây KHÔNG cập nhật các bài đã deploy (mỗi site có bài riêng do AI viết). Anchor Text / Target URL / Rel sẽ được cập nhật vào backlink trên mọi site qua redeploy. URL bài giữ nguyên."
              : "Bài viết đã deploy — sửa nội dung sẽ cập nhật qua redeploy; URL bài trên các websites đã deploy giữ nguyên."
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        {/* Slug/category/meta ẩn — quản lý tự động, giữ nguyên giá trị khi update */}
        <Form.Item name="slug" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="category" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="metaDescription" hidden>
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tiêu đề bài viết">
              <Input />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]} tooltip="Thay đổi anchor text sẽ cần redeploy để cập nhật trên websites">
              <Input />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]} tooltip="Thay đổi URL sẽ cần redeploy để cập nhật trên websites">
              <Input />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item label="Rel Attribute" name="rel" tooltip="Thuộc tính rel. Bỏ trống = dofollow. Thay đổi cần redeploy.">
              <Select allowClear placeholder="Not set (dofollow)" options={REL_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Expiration Date"
              name="expiresAt"
              getValueProps={(value) => ({ value: value ? dayjs(value) : null })}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Ẩn backlink"
              name="hideBacklink"
              valuePropName="checked"
              tooltip="Bật: backlink vẫn được chèn vào bài nhưng ẩn bằng CSS display:none. Đổi trạng thái này sẽ redeploy để cập nhật các bài đã deploy."
            >
              <Switch checkedChildren="Ẩn" unCheckedChildren="Hiện" />
            </Form.Item>
          </Col>
        </Row>
        {record?.contentSource === "ai" ? (
          // Bài AI per-site: không sửa content ở đây (mỗi site có bài riêng) —
          // chỉ chỉnh tham số generate cho các lần deploy tới website mới
          <Row gutter={16}>
            <Col span={span}>
              <Form.Item
                label="Chủ đề AI (tùy chọn)"
                name="aiTopic"
                tooltip="Áp dụng cho lần deploy tới website MỚI; bài đã deploy giữ nguyên. Bỏ trống = AI tự chọn theo từng site."
              >
                <Input placeholder="Bỏ trống để AI tự chọn chủ đề theo từng website" />
              </Form.Item>
            </Col>
            <Col span={span}>
              <Form.Item label="Độ dài bài viết" name="aiWordCount" tooltip="Áp dụng cho lần deploy tới website mới">
                <InputNumber min={300} max={2000} step={100} addonAfter="từ" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        ) : (
          form && <ContentEditor form={form} />
        )}
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Websites để deploy (sau khi admin duyệt)"} name="websiteIds" initialValue={initialWebsiteIds}>
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Edit>
  );
};
