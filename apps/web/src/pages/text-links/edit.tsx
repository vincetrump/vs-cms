import { Edit, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, DatePicker, Select, Row, Col, Grid } from "antd";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import dayjs from "dayjs";

const { useBreakpoint } = Grid;

export const TextLinkEdit = () => {
  const { formProps, saveButtonProps, query } = useForm({
    resource: "text-links",
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
  const initialWebsiteIds = deployedWebsiteIds.length > 0
    ? deployedWebsiteIds
    : record?.requestedWebsiteIds || [];

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Row gutter={16}>
          <Col span={span}>
            <Form.Item label="Title" name="title" rules={[{ required: true }]} tooltip="Tên nội bộ để nhận diện link">
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
              label="Expiration Date"
              name="expiresAt"
              getValueProps={(value) => ({ value: value ? dayjs(value) : null })}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        {isAdmin && (
          <Form.Item label="Deploy to Websites" name="websiteIds" initialValue={initialWebsiteIds}>
            <WebsiteSelector />
          </Form.Item>
        )}
      </Form>
    </Edit>
  );
};
