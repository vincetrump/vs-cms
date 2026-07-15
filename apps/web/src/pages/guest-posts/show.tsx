import { useState, useEffect, useCallback } from "react";
import { useShow, useNavigation, useGetIdentity } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Table, Typography, Button, Space, Popconfirm, message, Grid, Tooltip, Tabs, Timeline, Pagination } from "antd";
import { EditOutlined, InfoCircleOutlined, HistoryOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const actionLabels: Record<string, string> = {
  created: "Tạo mới",
  updated: "Cập nhật",
  status_changed: "Đổi trạng thái",
  deployed: "Deploy",
  undeployed: "Undeploy",
  deploy_completed: "Deploy hoàn tất",
  deploy_failed: "Deploy lỗi",
  undeploy_completed: "Undeploy hoàn tất",
  redeployed: "Redeploy",
  expired: "Hết hạn",
  deleted: "Xoá",
};

const actionColors: Record<string, string> = {
  created: "blue",
  updated: "orange",
  status_changed: "purple",
  deployed: "cyan",
  undeployed: "volcano",
  deploy_completed: "green",
  deploy_failed: "red",
  undeploy_completed: "default",
  redeployed: "geekblue",
  expired: "default",
  deleted: "red",
};

const HistoryTab = ({ guestPostId }: { guestPostId: string }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`${API_URL}/guest-posts/${guestPostId}/history?page=${p}&limit=20`);
      setHistory(response.data);
      setTotal(Number(response.headers?.['x-total-count']) || 0);
    } catch {
      message.error("Không tải được lịch sử");
    } finally {
      setLoading(false);
    }
  }, [guestPostId]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  if (loading && !history.length) return <Text type="secondary">Đang tải...</Text>;
  if (!history.length) return <Text type="secondary">Chưa có lịch sử</Text>;

  return (
    <>
      <Timeline
        items={history.map((h: any) => ({
          color: actionColors[h.action] === "red" ? "red" : actionColors[h.action] === "green" ? "green" : "blue",
          children: (
            <div key={h._id}>
              <Space size={4} wrap>
                <Tag color={actionColors[h.action]}>{actionLabels[h.action] || h.action}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(h.createdAt).toLocaleString()}
                </Text>
                {h.performedBy?.username && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    bởi <strong>{h.performedBy.username}</strong>
                  </Text>
                )}
                {!h.performedBy && <Text type="secondary" style={{ fontSize: 12 }}>bởi hệ thống</Text>}
              </Space>
              {h.changes && Object.keys(h.changes).length > 0 && (
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  {Object.entries(h.changes).map(([key, val]: [string, any]) => (
                    <div key={key}>
                      <Text code>{key}</Text>: <Text delete type="danger">{String(val.old)}</Text> → <Text type="success">{String(val.new)}</Text>
                    </div>
                  ))}
                </div>
              )}
              {h.metadata && Object.keys(h.metadata).length > 0 && h.action !== "created" && (
                <div style={{ marginTop: 2, fontSize: 12, color: "#999" }}>
                  {h.metadata.success !== undefined && <span>Thành công: {h.metadata.success} </span>}
                  {h.metadata.failed !== undefined && h.metadata.failed > 0 && <span>Lỗi: {h.metadata.failed} </span>}
                  {h.metadata.removed !== undefined && <span>Đã gỡ: {h.metadata.removed} </span>}
                </div>
              )}
            </div>
          ),
        }))}
      />
      {total > 20 && (
        <Pagination
          current={page}
          total={total}
          pageSize={20}
          size="small"
          onChange={setPage}
          style={{ marginTop: 16 }}
        />
      )}
    </>
  );
};

export const GuestPostShow = () => {
  const { query } = useShow({ resource: "guest-posts" });
  const record = query?.data?.data as any;
  const { list, edit } = useNavigation();
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();

  const handleToggle = async () => {
    if (!record) return;
    try {
      await axiosInstance.post(`${API_URL}/guest-posts/${record._id}/toggle`);
      message.success("Status updated");
      query.refetch();
    } catch {
      message.error("Failed");
    }
  };

  const handleTogglePublic = async () => {
    if (!record) return;
    try {
      await axiosInstance.post(`${API_URL}/guest-posts/${record._id}/toggle-public`);
      message.success(record.realPublic ? "Đã chuyển về NoIndex" : "Đã chuyển sang Real Public");
      query.refetch();
    } catch {
      message.error("Failed");
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    try {
      await axiosInstance.delete(`${API_URL}/guest-posts/${record._id}`);
      message.success("Deleted");
      list("guest-posts");
    } catch {
      message.error("Failed to delete");
    }
  };

  // Generate lại bài AI mới cho 1 website, giữ nguyên URL
  const handleRegenerateSite = async (websiteId: string, domain: string) => {
    if (!record) return;
    try {
      await axiosInstance.post(`${API_URL}/guest-posts/${record._id}/regenerate`, { websiteIds: [websiteId] });
      message.success(`Đã tạo job viết lại bài cho ${domain} (~1-3 phút) — theo dõi ở trang Jobs`);
      query.refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(", ") : msg || "Không tạo được job regenerate");
    }
  };

  // Gỡ bài khỏi 1 website
  const handleUndeploySite = async (websiteId: string, domain: string) => {
    if (!record) return;
    try {
      await axiosInstance.post(`${API_URL}/guest-posts/${record._id}/undeploy`, { websiteIds: [websiteId] });
      message.success(`Đã tạo job gỡ bài khỏi ${domain} — theo dõi ở trang Jobs`);
      query.refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(", ") : msg || "Không tạo được job undeploy");
    }
  };

  const statusColors: Record<string, string> = {
    active: "green",
    pending: "gold",
    disabled: "red",
    expired: "default",
  };

  const statusLabels: Record<string, string> = {
    active: "Hoạt động",
    pending: "Chờ duyệt",
    disabled: "Đã tắt",
    expired: "Hết hạn",
  };

  const statusHints: Record<string, string> = {
    active: "Bài viết đang hoạt động và đã được deploy trên các websites.",
    pending: "Bài viết đang chờ admin duyệt.",
    disabled: "Bài viết đã bị tắt và đã được gỡ khỏi tất cả websites.",
    expired: "Bài viết đã hết hạn — backlink đã được gỡ khỏi bài, bài viết vẫn còn trên websites. Enable lại để khôi phục backlink.",
  };

  const deployments = record?.deployments || [];

  const handleExportCsv = () => {
    const deployed = deployments.filter((d: any) => d.status === "deployed");
    if (!deployed.length) {
      message.warning("Không có website nào đang deployed");
      return;
    }
    const anchorText = record?.anchorText || "";
    const rel = record?.rel || "dofollow";
    const targetUrl = record?.targetUrl || "";
    const expires = record?.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : "Never";
    const rows = [["Domain", "Article URL", "Category", "Anchor Text", "Rel", "Target URL", "Expires", "Deployed At"]];
    for (const d of deployed) {
      const domain = typeof d.websiteId === "object" ? d.websiteId.domain : d.websiteId;
      const pagePath = d.pagePath || "/";
      const fullUrl = `https://${domain}${pagePath}`;
      const deployedAt = d.deployedAt ? new Date(d.deployedAt).toLocaleString() : "";
      rows.push([domain, fullUrl, d.category || "", anchorText, rel, targetUrl, expires, deployedAt]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guest-post-${record?.title || record?._id}-websites.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabItems = [
    {
      key: "info",
      label: "Thông tin",
      children: (
        <>
          <Descriptions bordered column={screens.md ? 2 : 1} size={screens.sm ? "default" : "small"}>
            <Descriptions.Item label="Title">{record?.title}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tooltip title={statusHints[record?.status]}>
                <Tag color={statusColors[record?.status]}>{statusLabels[record?.status] || record?.status}</Tag>
                <InfoCircleOutlined style={{ color: "#999", fontSize: 12, marginLeft: 4 }} />
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label="SEO">
              <Tooltip title={record?.realPublic ? "Cho phép bot index, đã đưa vào sitemap" : "Chặn bot index (noindex, nofollow), không đưa vào sitemap"}>
                <Tag color={record?.realPublic ? "green" : "default"}>{record?.realPublic ? "Real Public" : "NoIndex"}</Tag>
                <InfoCircleOutlined style={{ color: "#999", fontSize: 12, marginLeft: 4 }} />
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label="Slug"><Text code>{record?.slug}</Text></Descriptions.Item>
            <Descriptions.Item label="Category"><Tag>{record?.category}</Tag></Descriptions.Item>
            <Descriptions.Item label="Anchor Text">{record?.anchorText}</Descriptions.Item>
            <Descriptions.Item label="Word Count">{record?.wordCount || 0} từ</Descriptions.Item>
            <Descriptions.Item label="Target URL" span={screens.md ? 2 : 1}>
              <a href={/^https?:\/\//i.test(record?.targetUrl) ? record?.targetUrl : "#"} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
                {record?.targetUrl}
              </a>
            </Descriptions.Item>
            <Descriptions.Item label="Meta Description" span={screens.md ? 2 : 1}>
              {record?.metaDescription}
            </Descriptions.Item>
            <Descriptions.Item label="Rel">
              {record?.rel ? <Tag>{record.rel}</Tag> : <Tag color="default">not set</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Backlink">
              <Tooltip title={record?.hideBacklink ? "Backlink được chèn nhưng ẩn bằng display:none" : "Backlink hiển thị bình thường"}>
                <Tag color={record?.hideBacklink ? "orange" : "green"}>{record?.hideBacklink ? "Đang ẩn (display:none)" : "Hiện"}</Tag>
              </Tooltip>
            </Descriptions.Item>
            {record?.extraBacklinks?.length > 0 && (
              <Descriptions.Item label={`Backlink phụ (${record.extraBacklinks.length})`} span={screens.md ? 2 : 1}>
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  {record.extraBacklinks.map((b: any, i: number) => (
                    <div key={i} style={{ wordBreak: "break-all" }}>
                      <a href={/^https?:\/\//i.test(b.targetUrl) ? b.targetUrl : "#"} target="_blank" rel="noopener noreferrer">{b.anchorText}</a>
                      {" → "}<Text type="secondary">{b.targetUrl}</Text>{" "}
                      {b.rel && <Tag>{b.rel}</Tag>}
                      <Tag color={b.hideBacklink ? "orange" : "green"}>{b.hideBacklink ? "ẩn" : "hiện"}</Tag>
                    </div>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Expires">
              {record?.expiresAt ? new Date(record.expiresAt).toLocaleString() : "Never"}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {record?.createdAt ? new Date(record.createdAt).toLocaleString() : "-"}
            </Descriptions.Item>
            {isAdmin && (
              <Descriptions.Item label="Created By">
                {record?.createdBy?.username || "-"}
              </Descriptions.Item>
            )}
          </Descriptions>

          {isAdmin && deployments.length > 0 && (
            <>
              <Title level={5} style={{ marginTop: 24 }}>Deployments</Title>
              <Table
                dataSource={deployments}
                rowKey="_id"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
              >
                <Table.Column
                  title="Website"
                  dataIndex="websiteId"
                  render={(w: any) => (typeof w === "object" ? w?.domain : w)}
                />
                <Table.Column
                  title="Article URL"
                  dataIndex="pagePath"
                  render={(v: string, d: any) => {
                    if (!v) return "-";
                    const domain = typeof d.websiteId === "object" ? d.websiteId?.domain : null;
                    return domain && d.status === "deployed" ? (
                      <a href={`https://${domain}${v}`} target="_blank" rel="noopener noreferrer">{v}</a>
                    ) : v;
                  }}
                />
                {screens.sm && (
                  <Table.Column
                    title="Bài viết (AI per site)"
                    dataIndex="title"
                    ellipsis
                    render={(v: string, d: any) =>
                      v ? (
                        <Tooltip title={`${v}${d.wordCount ? ` — ${d.wordCount} từ` : ""}`}>
                          <span>{v}</span>
                        </Tooltip>
                      ) : (
                        <Typography.Text type="secondary">(dùng content chung)</Typography.Text>
                      )
                    }
                  />
                )}
                <Table.Column
                  dataIndex="status"
                  title="Status"
                  width={120}
                  render={(s: string, d: any) => (
                    <>
                      <Tag color={s === "deployed" ? "green" : s === "failed" ? "red" : "default"}>
                        {s === "deployed" ? "Đã deploy" : s === "failed" ? "Lỗi" : s === "removed" ? "Đã gỡ" : s}
                      </Tag>
                      {d.backlinkRemoved && s === "deployed" && (
                        <Tooltip title="Post hết hạn — backlink đã gỡ khỏi bài, bài viết vẫn sống trên site">
                          <Tag color="orange">Link đã gỡ</Tag>
                        </Tooltip>
                      )}
                    </>
                  )}
                />
                {screens.sm && (
                  <Table.Column
                    dataIndex="category"
                    title="Category"
                    width={100}
                    render={(v: string) => v ? <Tag>{v}</Tag> : "-"}
                  />
                )}
                {screens.sm && (
                  <Table.Column
                    dataIndex="addedToSitemap"
                    title="Sitemap"
                    width={80}
                    render={(v: boolean) => (v ? <Tag color="green">Có</Tag> : <Tag color="default">Không</Tag>)}
                  />
                )}
                {screens.md && (
                  <Table.Column
                    dataIndex="deployedAt"
                    title="Deployed"
                    render={(v) => (v ? new Date(v).toLocaleString() : "-")}
                  />
                )}
                {screens.md && (
                  <Table.Column
                    dataIndex="errorMessage"
                    title="Error"
                    ellipsis
                    render={(v) => v || "-"}
                  />
                )}
                <Table.Column
                  title="Thao tác"
                  key="actions"
                  fixed="right"
                  width={record?.contentSource === "ai" ? 150 : 90}
                  render={(_: any, d: any) => {
                    const wid = typeof d.websiteId === "object" ? d.websiteId?._id : d.websiteId;
                    const domain = typeof d.websiteId === "object" ? d.websiteId?.domain : wid;
                    const isDeployed = d.status === "deployed";
                    return (
                      <Space size="small">
                        {record?.contentSource === "ai" && (
                          <Popconfirm
                            title="Viết lại bài cho website này?"
                            description="AI sẽ viết một bài MỚI thay thế bài hiện tại (giữ nguyên URL). Nội dung cũ sẽ mất."
                            onConfirm={() => handleRegenerateSite(wid, domain)}
                            okText="Viết lại"
                            disabled={!isDeployed}
                          >
                            <Tooltip title={isDeployed ? "Generate lại bài AI cho site này" : "Chỉ regenerate được bài đang deploy"}>
                              <Button size="small" icon={<ReloadOutlined />} disabled={!isDeployed} />
                            </Tooltip>
                          </Popconfirm>
                        )}
                        <Popconfirm
                          title="Gỡ bài khỏi website này?"
                          description="File bài viết sẽ bị xóa khỏi website (các website khác giữ nguyên)."
                          onConfirm={() => handleUndeploySite(wid, domain)}
                          okText="Gỡ"
                          okButtonProps={{ danger: true }}
                          disabled={!isDeployed}
                        >
                          <Tooltip title={isDeployed ? "Gỡ bài khỏi site này" : "Bài đã được gỡ"}>
                            <Button size="small" danger icon={<DeleteOutlined />} disabled={!isDeployed} />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    );
                  }}
                />
              </Table>
            </>
          )}
        </>
      ),
    },
    {
      key: "content",
      label: <span><EyeOutlined /> Nội dung</span>,
      children: record?.content ? (
        <iframe
          title="content-preview"
          srcDoc={`<meta charset="utf-8"><div style="max-width:800px;margin:0 auto;padding:20px;font-family:sans-serif;line-height:1.7">${record.content}</div>`}
          sandbox=""
          style={{ width: "100%", height: "60vh", border: "1px solid #eee", borderRadius: 4, background: "#fff" }}
        />
      ) : (
        <Text type="secondary">
          {record?.contentSource === "ai"
            ? "Bài AI — nội dung được sinh riêng cho từng website lúc deploy. Xem bài của từng site qua cột Article URL / \"Bài viết (AI per site)\" ở tab Thông tin."
            : "Chưa có nội dung"}
        </Text>
      ),
    },
    {
      key: "history",
      label: <span><HistoryOutlined /> Lịch sử</span>,
      children: record?._id ? <HistoryTab guestPostId={record._id} /> : null,
    },
  ];

  return (
    <Show
      isLoading={query?.isLoading}
      headerButtons={
        <Space wrap>
          <Button icon={<EditOutlined />} onClick={() => record?._id && edit("guest-posts", record._id)}>
            Edit
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
            Export CSV
          </Button>
          {isAdmin && !record?.realPublic && (
            <Popconfirm
              title="Chuyển sang Real Public?"
              description="Bài viết sẽ cho phép bot index (index, follow) và được đưa vào sitemap.xml trên các websites đã deploy."
              onConfirm={handleTogglePublic}
            >
              <Button type="primary" ghost>Go Public</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.realPublic && (
            <Popconfirm
              title="Chuyển về NoIndex?"
              description="Bài viết sẽ bị chặn index (noindex, nofollow) và gỡ khỏi sitemap.xml trên các websites đã deploy."
              onConfirm={handleTogglePublic}
            >
              <Button>Về NoIndex</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "pending" && (
            <Popconfirm
              title="Approve guest post này?"
              description="Bài viết sẽ chuyển sang Active và deploy lên các websites đã chọn."
              onConfirm={handleToggle}
            >
              <Button type="primary">Approve</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "active" && (
            <Popconfirm
              title="Disable guest post này?"
              description="Bài viết sẽ bị gỡ khỏi tất cả websites ngay lập tức."
              onConfirm={handleToggle}
            >
              <Button danger>Disable</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "disabled" && (
            <Popconfirm
              title="Enable guest post này?"
              description="Bài viết sẽ được deploy lại lên các websites trước đó."
              onConfirm={handleToggle}
            >
              <Button>Enable</Button>
            </Popconfirm>
          )}
          {isAdmin && record?.status === "expired" && (
            <Popconfirm
              title="Kích hoạt lại guest post đã hết hạn?"
              description="Backlink sẽ được chèn lại vào bài trên các websites (bài viết vẫn còn trên site). Ngày hết hạn cũ sẽ bị xóa — đặt hạn mới ở trang Edit nếu cần."
              onConfirm={handleToggle}
            >
              <Button>Kích hoạt lại</Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="Xoá guest post này vĩnh viễn?"
            description="Bài viết sẽ bị gỡ khỏi tất cả websites và không thể khôi phục."
            onConfirm={handleDelete}
          >
            <Button danger>Delete</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Tabs items={tabItems} defaultActiveKey="info" />
    </Show>
  );
};
