import { useState, useEffect, useCallback } from "react";
import { useShow, useNavigation } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Grid, Space, Table, Typography, Button, Tooltip, message, Modal } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, QuestionCircleOutlined, EyeOutlined, CopyOutlined, CloudOutlined, ThunderboltOutlined, ScanOutlined, ReloadOutlined, FileTextOutlined } from "@ant-design/icons";
import { axiosInstance, API_URL } from "../../providers/dataProvider";

const { useBreakpoint } = Grid;

const dnsStatusMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  ok: { color: "green", icon: <CheckCircleOutlined />, label: "DNS trỏ đúng server" },
  mismatch: { color: "red", icon: <CloseCircleOutlined />, label: "DNS không trỏ đúng server" },
  cname: { color: "blue", icon: <WarningOutlined />, label: "CNAME (không kiểm tra được IP)" },
  no_records: { color: "default", icon: <QuestionCircleOutlined />, label: "Không có bản ghi DNS" },
  error: { color: "red", icon: <CloseCircleOutlined />, label: "Lỗi kiểm tra DNS" },
};

const statusColors: Record<string, string> = {
  active: "green",
  pending: "gold",
  disabled: "red",
  expired: "default",
};

const CopyableText = ({ text }: { text: string }) => (
  <Space size={4}>
    <span style={{ wordBreak: "break-all" }}>{text}</span>
    <Tooltip title="Copy">
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={() => { navigator.clipboard.writeText(text); message.success("Copied"); }}
      />
    </Tooltip>
  </Space>
);

export const WebsiteShow = () => {
  const { query } = useShow({ resource: "websites" });
  const record = query?.data?.data as any;
  const screens = useBreakpoint();
  const { show } = useNavigation();
  const [pages, setPages] = useState<any[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [footerDeployments, setFooterDeployments] = useState<any[]>([]);
  const [footerLoading, setFooterLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [metadataScanning, setMetadataScanning] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPages = useCallback(async (id: string) => {
    setPagesLoading(true);
    try {
      const res = await axiosInstance.get(`${API_URL}/websites/${id}/pages`);
      setPages(res.data);
    } catch { /* ignore */ }
    finally { setPagesLoading(false); }
  }, []);

  const fetchFooterDeployments = useCallback(async (id: string) => {
    setFooterLoading(true);
    try {
      const res = await axiosInstance.get(`${API_URL}/websites/${id}/footer-deployments`);
      setFooterDeployments(res.data);
    } catch { /* ignore */ }
    finally { setFooterLoading(false); }
  }, []);

  const fetchMetadata = useCallback(async (id: string) => {
    try {
      const res = await axiosInstance.get(`${API_URL}/website-metadata/${id}`);
      setMetadata(res.data);
    } catch { setMetadata(null); }
  }, []);

  useEffect(() => {
    if (record?._id) {
      fetchPages(record._id);
      fetchFooterDeployments(record._id);
      fetchMetadata(record._id);
    }
  }, [record?._id, fetchPages, fetchFooterDeployments, fetchMetadata]);

  const handleScanMetadata = async () => {
    if (!record?._id) return;
    setMetadataScanning(true);
    try {
      await axiosInstance.post(`${API_URL}/website-metadata/scan`, { websiteIds: [record._id] });
      message.success("Metadata scan job queued — refresh sau vài giây");
    } catch {
      message.error("Failed to queue metadata scan");
    } finally {
      setMetadataScanning(false);
    }
  };

  const handlePreviewTemplate = async () => {
    if (!record?._id) return;
    setPreviewLoading(true);
    try {
      const res = await axiosInstance.get(`${API_URL}/website-metadata/${record._id}/preview`);
      setPreviewHtml(res.data.html);
      setPreviewOpen(true);
    } catch {
      message.error("Chưa có metadata — chạy Rescan trước");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleScanPages = async () => {
    if (!record?._id) return;
    setScanning(true);
    try {
      await axiosInstance.post(`${API_URL}/websites/${record._id}/scan-pages`);
      message.success("Scan job queued");
    } catch {
      message.error("Failed to queue scan");
    } finally {
      setScanning(false);
    }
  };

  const dns = dnsStatusMap[record?.dnsStatus] || { color: "default", icon: <QuestionCircleOutlined />, label: "Chưa kiểm tra" };

  const deployments = record?.deployments || [];

  return (
    <Show isLoading={query?.isLoading}>
      {record?.cloudflareZoneId && (
        <Space style={{ marginBottom: 16 }} wrap>
          <Button
            icon={<CloudOutlined />}
            href={`https://dash.cloudflare.com/${record.cloudflareAccountId || ""}/${record.domain}/dns/records`}
            target="_blank"
          >
            Cloudflare DNS
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            href={`https://dash.cloudflare.com/${record.cloudflareAccountId || ""}/${record.domain}/caching/configuration`}
            target="_blank"
          >
            Cloudflare Cache
          </Button>
        </Space>
      )}

      <Descriptions bordered column={screens.md ? 2 : 1} size={screens.sm ? "default" : "small"}>
        <Descriptions.Item label="Domain">
          {record?.domain ? <CopyableText text={record.domain} /> : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={record?.status === "active" ? "green" : "orange"}>{record?.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Server IP">
          {record?.serverIp ? <CopyableText text={record.serverIp} /> : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="DNS Status">
          <Tag color={dns.color} icon={dns.icon}>{dns.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="DNS IPs" span={screens.md ? 2 : 1}>
          {record?.dnsRecordIps?.length ? (
            <Space wrap>
              {record.dnsRecordIps.map((ip: string, i: number) => (
                <Tag key={`${ip}-${i}`} color={ip === record.serverIp ? "green" : "red"}>{ip}</Tag>
              ))}
              {record.dnsProxied && <Tag color="orange">Proxied</Tag>}
            </Space>
          ) : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Document Root" span={screens.md ? 2 : 1}>
          {record?.documentRoot ? <CopyableText text={record.documentRoot} /> : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Homepage Path" span={screens.md ? 2 : 1}>
          {record?.homepagePath ? <CopyableText text={record.homepagePath} /> : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Last Synced">
          {record?.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : "Never"}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        <Space>
          <FileTextOutlined /> Guest Post Metadata
          <Button size="small" icon={<ScanOutlined />} loading={metadataScanning} onClick={handleScanMetadata}>
            Rescan
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => record?._id && fetchMetadata(record._id)}>
            Refresh
          </Button>
          {metadata && (
            <Button size="small" icon={<EyeOutlined />} loading={previewLoading} onClick={handlePreviewTemplate}>
              Preview Template
            </Button>
          )}
        </Space>
      </Typography.Title>
      {metadata ? (
        <Descriptions bordered column={screens.md ? 2 : 1} size="small">
          <Descriptions.Item label="Site Name">{metadata.siteName || "-"}</Descriptions.Item>
          <Descriptions.Item label="Language"><Tag>{metadata.language}</Tag></Descriptions.Item>
          <Descriptions.Item label="Categories" span={screens.md ? 2 : 1}>
            {metadata.navCategories?.length ? (
              <Space wrap>
                {metadata.navCategories.map((c: string) => <Tag key={c} color="cyan">{c}</Tag>)}
              </Space>
            ) : <Typography.Text type="secondary">Không có category nào (sẽ dùng tong-hop khi deploy)</Typography.Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Sitemap">
            <Tag color={metadata.hasSitemap ? "green" : "default"}>{metadata.hasSitemap ? "Có" : "Không"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Last Scanned">
            {metadata.lastScannedAt ? new Date(metadata.lastScannedAt).toLocaleString() : "Never"}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">
          Chưa scan metadata. Click Rescan để extract header/footer/categories phục vụ Guest Post.
        </Typography.Text>
      )}
      <Modal
        title={`Preview Article Template — ${record?.domain || ""}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="90%"
        style={{ top: 20 }}
      >
        <iframe
          title="template-preview"
          srcDoc={previewHtml}
          sandbox=""
          style={{ width: "100%", height: "70vh", border: "1px solid #eee", borderRadius: 4, background: "#fff" }}
        />
      </Modal>

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Text Links ({deployments.length})
      </Typography.Title>
      {deployments.length > 0 ? (
        <Table
          dataSource={deployments}
          rowKey="_id"
          size="small"
          pagination={deployments.length > 10 ? { pageSize: 10 } : false}
        >
          <Table.Column
            title="Title"
            dataIndex="textLinkId"
            render={(link: any) => link?.title || "-"}
          />
          {screens.sm && (
            <Table.Column
              title="Anchor"
              dataIndex="textLinkId"
              key="anchor"
              ellipsis
              render={(link: any) => link?.anchorText || "-"}
            />
          )}
          <Table.Column
            title="Status"
            dataIndex="textLinkId"
            key="linkStatus"
            width={80}
            render={(link: any) => (
              <Tag color={statusColors[link?.status] || "default"}>{link?.status || "-"}</Tag>
            )}
          />
          {screens.md && (
            <Table.Column
              title="Deployed"
              dataIndex="deployedAt"
              render={(v) => (v ? new Date(v).toLocaleString() : "-")}
            />
          )}
          <Table.Column
            title=""
            width={50}
            dataIndex="textLinkId"
            key="action"
            render={(link: any) =>
              link?._id ? (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => show("text-links", link._id)}
                />
              ) : null
            }
          />
        </Table>
      ) : (
        <Typography.Text type="secondary">No text links deployed</Typography.Text>
      )}

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        <Space>
          Footer Link Deployments ({footerDeployments.length})
        </Space>
      </Typography.Title>
      {footerDeployments.length > 0 ? (
        <Table
          dataSource={footerDeployments}
          rowKey="_id"
          size="small"
          loading={footerLoading}
          pagination={footerDeployments.length > 10 ? { pageSize: 10 } : false}
        >
          <Table.Column
            title="Footer Link"
            dataIndex="footerLinkId"
            render={(link: any) => link?.title || "-"}
          />
          <Table.Column
            title="Page"
            dataIndex="pagePath"
            render={(v: string) => v || "-"}
          />
          <Table.Column
            title="Status"
            dataIndex="status"
            width={90}
            render={(s: string) => (
              <Tag color={s === "deployed" ? "green" : s === "failed" ? "red" : "default"}>
                {s === "deployed" ? "Đã deploy" : s === "failed" ? "Lỗi" : s === "removed" ? "Đã gỡ" : s}
              </Tag>
            )}
          />
          {screens.md && (
            <Table.Column
              title="Deployed"
              dataIndex="deployedAt"
              render={(v) => (v ? new Date(v).toLocaleString() : "-")}
            />
          )}
          <Table.Column
            title=""
            width={50}
            dataIndex="footerLinkId"
            key="action"
            render={(link: any) =>
              link?._id ? (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => show("footer-links", link._id)}
                />
              ) : null
            }
          />
        </Table>
      ) : (
        <Typography.Text type="secondary">No footer links deployed</Typography.Text>
      )}

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        <Space>
          Sub-Pages ({pages.length})
          <Button
            size="small"
            icon={<ScanOutlined />}
            loading={scanning}
            onClick={handleScanPages}
          >
            Scan
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={pagesLoading}
            onClick={() => record?._id && fetchPages(record._id)}
          >
            Refresh
          </Button>
        </Space>
      </Typography.Title>
      {pages.length > 0 ? (
        <Table
          dataSource={pages}
          rowKey="_id"
          size="small"
          loading={pagesLoading}
          pagination={pages.length > 20 ? { pageSize: 20 } : false}
        >
          <Table.Column title="Page Path" dataIndex="pagePath" />
          <Table.Column
            title="Has Footer"
            dataIndex="hasFooter"
            width={90}
            render={(v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "Yes" : "No"}</Tag>}
          />
          <Table.Column
            title="Footer Links"
            dataIndex="footerLinkCount"
            width={100}
            render={(v: number) => v || 0}
          />
          {screens.md && (
            <Table.Column
              title="Last Scanned"
              dataIndex="lastScannedAt"
              render={(v) => (v ? new Date(v).toLocaleString() : "-")}
            />
          )}
        </Table>
      ) : (
        <Typography.Text type="secondary">
          {record?.lastPageScanAt ? "No sub-pages found" : "Pages not scanned yet. Click Scan to discover sub-pages."}
        </Typography.Text>
      )}

      {record?.externalLinks?.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            External Links ({record.externalLinks.length})
          </Typography.Title>
          <Table
            dataSource={record.externalLinks}
            rowKey="url"
            size="small"
            pagination={record.externalLinks.length > 10 ? { pageSize: 10 } : false}
          >
            <Table.Column
              title="URL"
              dataIndex="url"
              render={(url: string) => {
                const safeUrl = /^https?:\/\//i.test(url) ? url : "#";
                return (
                  <Typography.Link href={safeUrl} target="_blank" rel="noopener noreferrer" ellipsis style={{ maxWidth: 500 }}>
                    {url}
                  </Typography.Link>
                );
              }}
            />
            {screens.sm && (
              <Table.Column title="Anchor Text" dataIndex="anchorText" ellipsis />
            )}
          </Table>
        </>
      )}
    </Show>
  );
};
