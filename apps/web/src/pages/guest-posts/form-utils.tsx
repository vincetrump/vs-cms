import { useState } from "react";
import { Form, Input, Button, AutoComplete, Modal, Space, Typography, message, Select, Switch, Card, Row, Col, Grid } from "antd";
import { LinkOutlined, EyeOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Text } = Typography;

// Danh sách backlink phụ (tùy chọn) — thêm/xóa động. Mỗi link: anchor + URL + rel + ẩn.
export const ExtraBacklinks = () => {
  const screens = Grid.useBreakpoint();
  const span = screens.md ? 12 : 24;
  return (
    <Form.List name="extraBacklinks">
      {(fields, { add, remove }) => (
        <div style={{ marginBottom: 16 }}>
          <Text strong>Backlink phụ (tùy chọn)</Text>
          <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Thêm link nếu muốn nhiều hơn 1 backlink. AI sẽ chèn tất cả tự nhiên vào bài. Chung ngày hết hạn với backlink chính.
          </Text>
          {fields.map(({ key, name, ...rest }) => (
            <Card key={key} size="small" style={{ marginBottom: 8 }}
              extra={<Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)}>Xóa</Button>}
            >
              <Row gutter={12}>
                <Col span={span}>
                  <Form.Item {...rest} name={[name, "anchorText"]} label="Anchor Text" rules={[{ required: true, message: "Nhập anchor" }]} style={{ marginBottom: 8 }}>
                    <Input placeholder="Visible link text" />
                  </Form.Item>
                </Col>
                <Col span={span}>
                  <Form.Item {...rest} name={[name, "targetUrl"]} label="Target URL" rules={[{ required: true, type: "url", message: "URL không hợp lệ" }]} style={{ marginBottom: 8 }}>
                    <Input placeholder="https://example.com" />
                  </Form.Item>
                </Col>
                <Col span={span}>
                  <Form.Item {...rest} name={[name, "rel"]} label="Rel" style={{ marginBottom: 0 }}>
                    <Select allowClear placeholder="Not set (dofollow)" options={REL_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={span}>
                  <Form.Item {...rest} name={[name, "hideBacklink"]} label="Ẩn backlink" valuePropName="checked" initialValue={true} style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="Ẩn" unCheckedChildren="Hiện" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}
          <Button type="dashed" onClick={() => add({ hideBacklink: true })} icon={<PlusOutlined />} block>
            Thêm backlink
          </Button>
        </div>
      )}
    </Form.List>
  );
};

export const COMMON_CATEGORIES = [
  "tong-hop",
  "suc-khoe",
  "lam-dep",
  "the-thao",
  "cong-nghe",
  "du-lich",
  "giai-tri",
  "kinh-doanh",
];

export const REL_OPTIONS = [
  { label: "dofollow (mặc định — không đặt rel)", value: "dofollow" },
  { label: "nofollow", value: "nofollow" },
  { label: "sponsored", value: "sponsored" },
  { label: "nofollow sponsored", value: "nofollow sponsored" },
  { label: "ugc", value: "ugc" },
  { label: "noopener", value: "noopener" },
  { label: "nofollow noopener", value: "nofollow noopener" },
];

export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

export const countWords = (html: string): number => {
  const text = (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
};

// HTML content editor with live word count + insert-backlink helper
export const ContentEditor = ({ form }: { form: any }) => {
  const content = Form.useWatch("content", form) || "";
  const wordCount = countWords(content);

  const insertBacklink = () => {
    const anchorText = form.getFieldValue("anchorText");
    const targetUrl = form.getFieldValue("targetUrl");
    const rel = form.getFieldValue("rel");
    if (!anchorText || !targetUrl) {
      message.warning("Nhập Anchor Text và Target URL trước khi chèn backlink");
      return;
    }
    const relAttr = rel ? ` rel="${rel}"` : "";
    const linkHtml = `<a href="${targetUrl}"${relAttr}>${anchorText}</a>`;
    const current = form.getFieldValue("content") || "";
    form.setFieldValue("content", current ? `${current}\n<p>${linkHtml}</p>` : `<p>${linkHtml}</p>`);
  };

  return (
    <>
      <Form.Item
        label={
          <Space>
            <span>Nội dung bài viết (HTML)</span>
            <Text type="secondary" style={{ fontWeight: "normal" }}>{wordCount} từ</Text>
          </Space>
        }
        name="content"
        rules={[{ required: true, message: "Vui lòng nhập nội dung bài viết" }]}
        tooltip="Nội dung HTML của bài viết. Backlink nên được chèn tự nhiên trong nội dung — nếu không, hệ thống tự thêm vào cuối bài khi deploy."
      >
        <Input.TextArea
          rows={14}
          placeholder="<p>Đoạn mở đầu...</p>&#10;<p>Nội dung có chứa <a href='https://...'>backlink</a> tự nhiên...</p>"
          style={{ fontFamily: "monospace", fontSize: 13 }}
        />
      </Form.Item>
      <Button size="small" icon={<LinkOutlined />} onClick={insertBacklink} style={{ marginTop: -16, marginBottom: 16 }}>
        Chèn backlink vào cuối nội dung
      </Button>
    </>
  );
};

// Preview the article rendered with a selected website's template
export const PreviewButton = ({ form }: { form: any }) => {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    const websiteIds: string[] = form.getFieldValue("websiteIds") || [];
    if (!websiteIds.length) {
      message.warning("Chọn ít nhất 1 website để preview theo template của site đó");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axiosInstance.get(`${API_URL}/website-metadata/${websiteIds[0]}`);
      const template: string = data.articleTemplate || "";
      if (!template) {
        message.warning("Website chưa có metadata — chạy scan trước (Settings → Scan metadata)");
        return;
      }
      const title = form.getFieldValue("title") || "Tiêu đề bài viết";
      const content = form.getFieldValue("content") || "<p>Nội dung bài viết...</p>";
      const metaDescription = form.getFieldValue("metaDescription") || "";
      const category = form.getFieldValue("category") || "tong-hop";
      const categoryName = category
        .split("-")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const escapeHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      let rendered = template;
      const replacements: Record<string, string> = {
        "{title}": escapeHtml(title),
        "{metaDescription}": escapeHtml(metaDescription),
        "{category}": category,
        "{categoryName}": escapeHtml(categoryName),
        "{content}": content,
      };
      for (const [k, v] of Object.entries(replacements)) {
        rendered = rendered.split(k).join(v);
      }
      setHtml(rendered);
      setOpen(true);
    } catch {
      message.error("Không tải được template — website có thể chưa được scan metadata");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<EyeOutlined />} loading={loading} onClick={handlePreview}>
        Preview bài viết
      </Button>
      <Modal
        title="Preview bài viết (theo template website đầu tiên đã chọn)"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width="90%"
        style={{ top: 20 }}
      >
        <iframe
          title="article-preview"
          srcDoc={html}
          sandbox=""
          style={{ width: "100%", height: "70vh", border: "1px solid #eee", borderRadius: 4, background: "#fff" }}
        />
      </Modal>
    </>
  );
};

// Cache trạng thái cấu hình AI (ANTHROPIC_API_KEY) — dùng cho trang create quyết định chế độ AI/manual.
// Chỉ cache kết quả thành công; request lỗi (mạng chập chờn) sẽ được thử lại lần sau.
let aiConfiguredPromise: Promise<boolean> | null = null;
export const fetchAiConfigured = (): Promise<boolean> => {
  if (!aiConfiguredPromise) {
    aiConfiguredPromise = axiosInstance
      .get(`${API_URL}/guest-posts/ai-status`)
      .then((res) => !!res.data?.configured)
      .catch(() => {
        aiConfiguredPromise = null;
        return false;
      });
  }
  return aiConfiguredPromise;
};

export const CategoryInput = () => (
  <AutoComplete
    placeholder="tong-hop"
    options={COMMON_CATEGORIES.map((c) => ({ label: c, value: c }))}
    filterOption={(input, option) => (option?.value as string).includes(input.toLowerCase())}
  />
);
