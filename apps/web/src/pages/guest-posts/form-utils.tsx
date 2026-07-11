import { useState, useEffect } from "react";
import { Form, Input, Button, AutoComplete, Modal, Space, Typography, message, Card, InputNumber, Row, Col, Grid } from "antd";
import { LinkOutlined, EyeOutlined, RobotOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Text } = Typography;

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

// Phase 6: AI content generation panel — điền form từ topic + backlink info
export const AiGeneratePanel = ({ form }: { form: any }) => {
  const [topic, setTopic] = useState("");
  const [wordCount, setWordCount] = useState<number>(800);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    axiosInstance
      .get(`${API_URL}/guest-posts/ai-status`)
      .then((res) => setConfigured(!!res.data?.configured))
      .catch(() => setConfigured(false));
  }, []);

  if (configured === false || configured === null) return null;

  const handleGenerate = async () => {
    const anchorText = form.getFieldValue("anchorText");
    const targetUrl = form.getFieldValue("targetUrl");
    if (!topic.trim()) {
      message.warning("Nhập chủ đề bài viết trước");
      return;
    }
    if (!anchorText || !targetUrl) {
      message.warning("Nhập Anchor Text và Target URL trước khi generate (backlink sẽ được chèn tự nhiên vào bài)");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axiosInstance.post(`${API_URL}/guest-posts/generate-content`, {
        topic: topic.trim(),
        anchorText,
        targetUrl,
        wordCount,
      });
      form.setFieldsValue({
        title: data.title,
        slug: data.slug,
        metaDescription: data.metaDescription,
        category: data.category,
        content: data.content,
        contentSource: "ai",
      });
      message.success(`Đã tạo bài viết "${data.title}" (${data.wordCount} từ) — kiểm tra lại nội dung trước khi lưu`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(", ") : msg || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      size="small"
      title={<Space><RobotOutlined /> Tạo nội dung bằng AI</Space>}
      style={{ marginBottom: 16 }}
    >
      <Row gutter={8}>
        <Col span={screens.md ? 14 : 24}>
          <Input
            placeholder="Chủ đề bài viết, e.g. 5 cách chăm sóc sức khỏe mùa hè"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onPressEnter={handleGenerate}
            disabled={loading}
          />
        </Col>
        <Col span={screens.md ? 5 : 12} style={{ marginTop: screens.md ? 0 : 8 }}>
          <InputNumber
            min={300}
            max={2000}
            step={100}
            value={wordCount}
            onChange={(v) => setWordCount(v || 800)}
            addonAfter="từ"
            style={{ width: "100%" }}
            disabled={loading}
          />
        </Col>
        <Col span={screens.md ? 5 : 12} style={{ marginTop: screens.md ? 0 : 8 }}>
          <Button type="primary" ghost block loading={loading} onClick={handleGenerate}>
            {loading ? "Đang viết..." : "Generate"}
          </Button>
        </Col>
      </Row>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
        Nhập Anchor Text + Target URL bên dưới trước — AI sẽ chèn backlink tự nhiên vào bài. Quá trình có thể mất 1-3 phút.
      </Typography.Text>
    </Card>
  );
};

export const CategoryInput = () => (
  <AutoComplete
    placeholder="tong-hop"
    options={COMMON_CATEGORIES.map((c) => ({ label: c, value: c }))}
    filterOption={(input, option) => (option?.value as string).includes(input.toLowerCase())}
  />
);
