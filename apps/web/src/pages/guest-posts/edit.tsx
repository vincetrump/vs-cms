import { Edit, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, DatePicker, Select, Row, Col, Grid, Alert, Space } from "antd";
import dayjs from "dayjs";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import { ContentEditor, PreviewButton, CategoryInput, REL_OPTIONS } from "./form-utils";

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
          {form && <PreviewButton form={form} />}
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
          message="Bài viết đã deploy — thay đổi slug/category chỉ áp dụng cho lần deploy tới website mới; URL trên các websites đã deploy giữ nguyên."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form {...formProps} layout="vertical">
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tiêu đề bài viết">
              <Input />
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
              tooltip="URL slug — chỉ áp dụng cho website deploy mới"
            >
              <Input />
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
              tooltip="Category trên website — fallback về tong-hop nếu site không có"
            >
              <CategoryInput />
            </Form.Item>
          </Col>
          <Col span={span}>
            <Form.Item
              label="Meta Description"
              name="metaDescription"
              rules={[{ required: true, message: "Vui lòng nhập meta description" }, { max: 300 }]}
            >
              <Input.TextArea rows={2} maxLength={300} showCount />
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
        </Row>
        {form && <ContentEditor form={form} />}
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Websites để deploy (sau khi admin duyệt)"} name="websiteIds" initialValue={initialWebsiteIds}>
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Edit>
  );
};
