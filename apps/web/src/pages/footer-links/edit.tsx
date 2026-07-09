import { Edit, useForm } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import { Form, Input, InputNumber, DatePicker, Select, Row, Col, Grid, Alert, Checkbox } from "antd";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import dayjs from "dayjs";

const { useBreakpoint } = Grid;

export const FooterLinkEdit = () => {
  const { formProps, saveButtonProps, query } = useForm({
    resource: "footer-links",
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
    <Edit saveButtonProps={saveButtonProps}>
      {!isAdmin && record?.status === "active" && (
        <Alert
          message="Thay đổi nội dung (anchor text, URL, rel) sẽ cần admin duyệt trước khi cập nhật trên websites."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
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
              label="Số trang con mỗi website"
              name="pageCount"
              rules={[{ required: true, message: "Vui lòng nhập số trang con" }]}
              tooltip="Số trang con mỗi website sẽ được chèn footer link"
            >
              <InputNumber min={1} max={50} style={{ width: "100%" }} />
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
            <Form.Item name="includeHomepage" valuePropName="checked" tooltip="Nếu bật, link sẽ được chèn thêm vào footer của trang chủ (ngoài các trang con)">
              <Checkbox>Chèn vào footer trang chủ</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={isAdmin ? "Deploy to Websites" : "Websites để deploy (sau khi admin duyệt)"} name="websiteIds" initialValue={initialWebsiteIds}>
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Edit>
  );
};
