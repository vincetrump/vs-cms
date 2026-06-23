import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, DatePicker } from "antd";
import { WebsiteSelector } from "../../components/WebsiteSelector";
import dayjs from "dayjs";

export const TextLinkEdit = () => {
  const { formProps, saveButtonProps, query } = useForm({
    resource: "text-links",
    action: "edit",
  });

  const record = query?.data?.data as any;
  const deployedWebsiteIds = record?.deployments
    ?.filter((d: any) => d.status === "deployed")
    ?.map((d: any) => d.websiteId?._id || d.websiteId) || [];

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Title" name="title" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Anchor Text" name="anchorText" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Target URL" name="targetUrl" rules={[{ required: true, type: "url" }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="Expiration Date"
          name="expiresAt"
          getValueProps={(value) => ({ value: value ? dayjs(value) : null })}
        >
          <DatePicker style={{ width: "100%" }} showTime />
        </Form.Item>
        <Form.Item label="Deploy to Websites" name="websiteIds" initialValue={deployedWebsiteIds}>
          <WebsiteSelector />
        </Form.Item>
      </Form>
    </Edit>
  );
};
