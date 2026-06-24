import { useGetIdentity } from "@refinedev/core";
import { List } from "@refinedev/antd";
import { Card, Typography, Collapse, Tag, Space, Alert, Grid, Divider } from "antd";
import {
  GlobalOutlined,
  LinkOutlined,
  KeyOutlined,
  HistoryOutlined,
  DashboardOutlined,
  UserOutlined,
  ApiOutlined,
  SafetyOutlined,
  RocketOutlined,
  TeamOutlined,
} from "@ant-design/icons";

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

interface GuideSection {
  key: string;
  title: string;
  icon: React.ReactNode;
  role: "all" | "admin";
  content: React.ReactNode;
}

const guides: GuideSection[] = [
  {
    key: "overview",
    title: "Tổng quan hệ thống",
    icon: <RocketOutlined />,
    role: "all",
    content: (
      <>
        <Paragraph>
          <Text strong>VS-CMS</Text> là hệ thống quản lý text links trên nhiều websites.
          Hệ thống cho phép chèn, gỡ, và theo dõi text links trên homepage
          của các website HTML tĩnh thông qua SSH.
        </Paragraph>
        <Title level={5}>Luồng hoạt động chính</Title>
        <ol>
          <li><Text strong>Sync Websites</Text> — Đồng bộ danh sách websites từ Cloudflare</li>
          <li><Text strong>Tạo Text Link</Text> — Tạo link mới với anchor text, URL đích, thuộc tính rel</li>
          <li><Text strong>Chọn Websites</Text> — Chọn websites muốn deploy khi tạo link</li>
          <li><Text strong>Duyệt</Text> — Admin duyệt link từ Sale/API (pending → active)</li>
          <li><Text strong>Deploy</Text> — Hệ thống tự động chèn link vào homepage qua SSH</li>
          <li><Text strong>Quản lý</Text> — Theo dõi trạng thái, enable/disable, gỡ link</li>
        </ol>
        <Alert
          message="Mỗi thao tác deploy/undeploy đều tạo backup file trước khi ghi, đảm bảo có thể khôi phục."
          type="info"
          showIcon
          style={{ marginTop: 12 }}
        />
      </>
    ),
  },
  {
    key: "text-links",
    title: "Quản lý Text Links",
    icon: <LinkOutlined />,
    role: "all",
    content: (
      <>
        <Title level={5}>Tạo Text Link</Title>
        <Paragraph>
          Vào <Text code>Text Links → Create</Text>. Các trường bắt buộc:
        </Paragraph>
        <ul>
          <li><Text strong>Title</Text> — Tên nội bộ để nhận diện link</li>
          <li><Text strong>Anchor Text</Text> — Văn bản hiển thị trên website</li>
          <li><Text strong>Target URL</Text> — URL đích (bắt buộc http/https)</li>
        </ul>
        <Paragraph>Các trường tùy chọn:</Paragraph>
        <ul>
          <li><Text strong>Rel Attribute</Text> — Thuộc tính rel (<Text code>nofollow</Text>, <Text code>sponsored</Text>, v.v.). Bỏ trống = dofollow</li>
          <li><Text strong>Expiration Date</Text> — Ngày hết hạn, hệ thống tự gỡ link khi hết hạn</li>
          <li><Text strong>Deploy to Websites</Text> — Chọn websites để deploy. Admin: deploy ngay khi tạo. Sale: deploy sau khi Admin duyệt</li>
        </ul>
        <Divider />
        <Title level={5}>Trạng thái Text Link</Title>
        <Space wrap>
          <Tag color="gold">pending</Tag><Text>Đợi Admin duyệt (link từ Sale hoặc API, hoặc Sale sửa link active)</Text>
        </Space>
        <br />
        <Space wrap style={{ marginTop: 4 }}>
          <Tag color="green">active</Tag><Text>Đang hoạt động, đã hoặc đang deploy</Text>
        </Space>
        <br />
        <Space wrap style={{ marginTop: 4 }}>
          <Tag color="red">disabled</Tag><Text>Đã tắt, link bị gỡ khỏi tất cả sites</Text>
        </Space>
        <br />
        <Space wrap style={{ marginTop: 4 }}>
          <Tag color="default">expired</Tag><Text>Đã hết hạn, tự động gỡ bởi cron</Text>
        </Space>
        <Divider />
        <Title level={5}>Deploy / Undeploy</Title>
        <Paragraph>
          Trên trang chi tiết Text Link, Admin có thể:
        </Paragraph>
        <ul>
          <li><Text strong>Approve</Text> — Duyệt link pending → active, tự động deploy vào websites đã chọn</li>
          <li><Text strong>Disable</Text> — Tắt link active → disabled, gỡ khỏi tất cả websites</li>
          <li><Text strong>Enable</Text> — Bật lại link disabled → active, deploy lại vào các websites trước đó</li>
          <li><Text strong>Deploy thêm</Text> — Chọn thêm websites để deploy</li>
          <li><Text strong>Undeploy</Text> — Gỡ link khỏi từng website cụ thể</li>
        </ul>
        <Divider />
        <Title level={5}>Sửa Text Link</Title>
        <Paragraph>
          Admin sửa link active → hệ thống tự động redeploy nội dung mới lên tất cả websites đang deploy.
        </Paragraph>
        <Alert
          message="Sale sửa nội dung (anchor text, URL, rel) của link active → link quay về trạng thái pending và cần Admin duyệt lại. Nội dung cũ vẫn giữ nguyên trên websites cho đến khi Admin duyệt."
          type="warning"
          showIcon
        />
      </>
    ),
  },
  {
    key: "websites",
    title: "Quản lý Websites",
    icon: <GlobalOutlined />,
    role: "admin",
    content: (
      <>
        <Title level={5}>Sync Websites</Title>
        <Paragraph>
          Nhấn nút <Text strong>Sync</Text> để đồng bộ danh sách websites từ Cloudflare.
          Hệ thống sẽ:
        </Paragraph>
        <ol>
          <li>Lấy tất cả zones từ tài khoản Cloudflare</li>
          <li>Kiểm tra document root trên server qua SSH</li>
          <li>Kiểm tra DNS có trỏ đúng server không</li>
          <li>Đếm số text links đã deploy và external links trên homepage</li>
        </ol>
        <Divider />
        <Title level={5}>Cột trên bảng Websites</Title>
        <ul>
          <li><Text strong>Status</Text> — <Tag color="green">active</Tag> = homepage tồn tại, <Tag color="orange">not_configured</Tag> = không tìm thấy homepage</li>
          <li><Text strong>DNS</Text> — <Tag color="green">OK</Tag> = DNS trỏ đúng server</li>
          <li><Text strong>Links</Text> — Số text links VS-CMS đã deploy trên website</li>
          <li><Text strong>Ext.</Text> — Số external links tìm thấy trên homepage (không phải VS-CMS)</li>
        </ul>
        <Divider />
        <Title level={5}>Tìm kiếm</Title>
        <Paragraph>
          Nhập domain (nhiều domain cách nhau bởi dấu phẩy) để lọc. Hệ thống tự loại bỏ
          http://, www. và trailing slash.
        </Paragraph>
        <Alert
          message="Website status 'not_configured' nghĩa là domain có trên Cloudflare nhưng chưa có homepage trên server, hoặc chưa cấu hình document root."
          type="info"
          showIcon
        />
      </>
    ),
  },
  {
    key: "dashboard",
    title: "Dashboard",
    icon: <DashboardOutlined />,
    role: "all",
    content: (
      <>
        <Paragraph>
          Dashboard hiển thị thống kê tổng quan:
        </Paragraph>
        <ul>
          <li>Tổng số websites (active / not configured)</li>
          <li>Tổng số text links theo trạng thái</li>
          <li>Số links đang pending cần duyệt</li>
        </ul>
      </>
    ),
  },
  {
    key: "users",
    title: "Quản lý Users",
    icon: <TeamOutlined />,
    role: "admin",
    content: (
      <>
        <Title level={5}>Danh sách Users</Title>
        <Paragraph>
          Vào <Text code>Users</Text> để xem danh sách tài khoản. Bảng hiển thị:
          username, role (Admin/Sale), trạng thái 2FA, trạng thái đổi mật khẩu.
        </Paragraph>
        <Divider />
        <Title level={5}>Tạo User mới</Title>
        <Paragraph>
          Nhấn <Text strong>Create User</Text>, điền username, password, và chọn role.
          User mới tạo sẽ bắt buộc đổi mật khẩu khi đăng nhập lần đầu.
        </Paragraph>
        <Divider />
        <Title level={5}>Đăng nhập lần đầu</Title>
        <Paragraph>
          Khi user mới đăng nhập:
        </Paragraph>
        <ol>
          <li>Nhập username + password → hệ thống yêu cầu đổi mật khẩu</li>
          <li>Đặt mật khẩu mới (tối thiểu 6 ký tự)</li>
          <li>Thiết lập Google Authenticator (quét QR code)</li>
          <li>Xác nhận mã 6 số → hoàn tất đăng ký</li>
        </ol>
        <Alert
          message="Admin không thể xóa chính tài khoản của mình."
          type="info"
          showIcon
        />
      </>
    ),
  },
  {
    key: "api-keys",
    title: "API Keys & Tích hợp",
    icon: <KeyOutlined />,
    role: "admin",
    content: (
      <>
        <Title level={5}>Tạo API Key</Title>
        <Paragraph>
          Vào <Text code>API Keys → New API Key</Text>. Sau khi tạo, hệ thống sẽ hiển thị:
        </Paragraph>
        <ul>
          <li><Text strong>API Key</Text> — Dùng trong header <Text code>x-api-key</Text></li>
          <li><Text strong>HMAC Secret</Text> — Dùng để ký request</li>
        </ul>
        <Alert
          message="Credentials chỉ hiển thị 1 lần duy nhất! Hãy lưu lại ngay."
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
        />
        <Divider />
        <Title level={5}>IP Whitelist</Title>
        <Paragraph>
          Khi tạo API key, có thể chỉ định danh sách IP được phép sử dụng.
          Bỏ trống = cho phép tất cả IP. Request từ IP không nằm trong danh sách
          sẽ bị từ chối.
        </Paragraph>
        <Divider />
        <Title level={5}>Xác thực API</Title>
        <Paragraph>Mỗi request cần 3 headers:</Paragraph>
        <ul>
          <li><Text code>x-api-key</Text> — API key</li>
          <li><Text code>x-timestamp</Text> — Timestamp (milliseconds) hiện tại</li>
          <li><Text code>x-signature</Text> — HMAC-SHA256 của (body + timestamp) dùng HMAC Secret</li>
        </ul>
        <Paragraph>
          Timestamp phải trong khoảng ±5 phút so với server. Xem trang chi tiết API key
          để lấy example code Node.js / Python.
        </Paragraph>
        <Divider />
        <Title level={5}>Endpoints</Title>
        <ul>
          <li><Text code>GET /api/v1/websites</Text> — Lấy danh sách websites hỗ trợ (id, domain, status)</li>
          <li><Text code>POST /api/v1/text-links</Text> — Tạo text link mới (status: pending)</li>
          <li><Text code>GET /api/v1/text-links/:id</Text> — Xem chi tiết text link đã tạo</li>
        </ul>
        <Divider />
        <Title level={5}>Tạo Text Link qua API</Title>
        <Paragraph>Body JSON gồm:</Paragraph>
        <ul>
          <li><Text code>title</Text> (bắt buộc) — Tên nội bộ</li>
          <li><Text code>anchorText</Text> (bắt buộc) — Văn bản hiển thị</li>
          <li><Text code>targetUrl</Text> (bắt buộc) — URL đích (http/https)</li>
          <li><Text code>expiresAt</Text> (tuỳ chọn) — Ngày hết hạn (ISO 8601)</li>
          <li><Text code>websiteIds</Text> (tuỳ chọn) — Mảng ID websites muốn deploy. Dùng <Text code>GET /api/v1/websites</Text> để lấy danh sách ID. Khi Admin duyệt, link sẽ tự động deploy vào các websites đã chọn.</li>
        </ul>
      </>
    ),
  },
  {
    key: "jobs",
    title: "Jobs & Background Tasks",
    icon: <HistoryOutlined />,
    role: "admin",
    content: (
      <>
        <Paragraph>
          Mọi thao tác nặng (sync, deploy, undeploy) chạy dưới dạng background job.
          Vào <Text code>Jobs</Text> để xem danh sách và chi tiết.
        </Paragraph>
        <Title level={5}>Loại Job</Title>
        <ul>
          <li><Text strong>Sync Websites</Text> — Đồng bộ websites từ Cloudflare</li>
          <li><Text strong>Deploy Links</Text> — Chèn text link vào websites</li>
          <li><Text strong>Undeploy Links</Text> — Gỡ text link khỏi websites</li>
          <li><Text strong>Redeploy Link</Text> — Cập nhật nội dung link đã deploy (khi Admin sửa)</li>
          <li><Text strong>Sync Link Websites</Text> — Đồng bộ danh sách websites của link (thêm/gỡ)</li>
          <li><Text strong>Verify Deployments</Text> — Kiểm tra links còn tồn tại trên website</li>
          <li><Text strong>Check Expired</Text> — Tìm và gỡ links hết hạn</li>
        </ul>
        <Title level={5}>Console Log</Title>
        <Paragraph>
          Trang chi tiết Job hiển thị toàn bộ log console theo thời gian thực,
          bao gồm kết quả từng website (thành công/thất bại).
        </Paragraph>
      </>
    ),
  },
  {
    key: "cron",
    title: "Cron Jobs Tự Động",
    icon: <HistoryOutlined />,
    role: "admin",
    content: (
      <>
        <Paragraph>Hệ thống chạy các tác vụ tự động hàng ngày:</Paragraph>
        <ul>
          <li><Text strong>02:00</Text> — Quét text links hết hạn → gỡ khỏi websites → đánh dấu expired → thông báo Discord</li>
          <li><Text strong>03:00</Text> — Verify deployments (kiểm tra links còn trên website)</li>
          <li><Text strong>04:00</Text> — Sync websites từ Cloudflare</li>
        </ul>
      </>
    ),
  },
  {
    key: "security",
    title: "Bảo mật",
    icon: <SafetyOutlined />,
    role: "admin",
    content: (
      <>
        <Paragraph>Hệ thống áp dụng bảo mật nhiều lớp:</Paragraph>
        <ul>
          <li><Text strong>2FA (TOTP)</Text> — Đăng nhập yêu cầu Google Authenticator</li>
          <li><Text strong>Đổi mật khẩu bắt buộc</Text> — User mới phải đổi mật khẩu khi đăng nhập lần đầu</li>
          <li><Text strong>HMAC Signing</Text> — API requests phải ký bằng HMAC-SHA256</li>
          <li><Text strong>Rate Limiting</Text> — Giới hạn request/phút cho mỗi API key</li>
          <li><Text strong>IP Whitelist</Text> — Tùy chọn giới hạn IP cho API key</li>
          <li><Text strong>SSH Key Auth</Text> — Kết nối server qua SSH key, không password</li>
          <li><Text strong>File Backup</Text> — Backup homepage trước mỗi lần ghi</li>
        </ul>
      </>
    ),
  },
  {
    key: "roles",
    title: "Phân quyền (RBAC)",
    icon: <UserOutlined />,
    role: "admin",
    content: (
      <>
        <Title level={5}>Admin</Title>
        <ul>
          <li>Toàn quyền: websites, text links, API keys, jobs, users, settings, guides</li>
          <li>Deploy/undeploy links lên websites</li>
          <li>Duyệt links pending → active (từ Sale hoặc API)</li>
          <li>Enable/disable links</li>
          <li>Tạo và quản lý user accounts</li>
          <li>Sửa link active → tự động redeploy nội dung mới</li>
        </ul>
        <Title level={5}>Sale</Title>
        <ul>
          <li>Tạo text links (status = pending, cần Admin duyệt)</li>
          <li>Chọn websites muốn deploy khi tạo link</li>
          <li>Sửa link của mình (sửa nội dung link active → quay về pending)</li>
          <li>Sửa title link active → giữ nguyên active (không cần duyệt lại)</li>
          <li>Xem dashboard và guides</li>
          <li>Đổi mật khẩu và quản lý 2FA trong Settings</li>
          <li>Không truy cập được: websites, API keys, jobs, users</li>
        </ul>
      </>
    ),
  },
  {
    key: "sale-guide",
    title: "Hướng dẫn cho Sale",
    icon: <UserOutlined />,
    role: "all",
    content: (
      <>
        <Title level={5}>Đăng nhập lần đầu</Title>
        <ol>
          <li>Admin cung cấp username và password</li>
          <li>Đăng nhập → hệ thống yêu cầu đổi mật khẩu</li>
          <li>Đặt mật khẩu mới → thiết lập Google Authenticator</li>
          <li>Quét QR code bằng app, nhập mã 6 số → hoàn tất</li>
        </ol>
        <Divider />
        <Title level={5}>Quy trình tạo Text Link</Title>
        <ol>
          <li>Đăng nhập và xác thực 2FA</li>
          <li>Vào <Text code>Text Links → Create</Text></li>
          <li>Điền thông tin: Title, Anchor Text, Target URL</li>
          <li>Chọn Rel attribute nếu cần (mặc định dofollow)</li>
          <li>Đặt ngày hết hạn nếu có</li>
          <li>Chọn websites muốn deploy</li>
          <li>Nhấn <Text strong>Save</Text></li>
        </ol>
        <Alert
          message="Link tạo bởi Sale sẽ ở trạng thái Pending. Admin sẽ review, duyệt và link tự động deploy vào các websites đã chọn."
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />
        <Divider />
        <Title level={5}>Sửa Text Link</Title>
        <Paragraph>
          Bạn có thể sửa link của mình bất cứ lúc nào:
        </Paragraph>
        <ul>
          <li><Text strong>Sửa title</Text> — Không ảnh hưởng trạng thái, link active vẫn giữ active</li>
          <li><Text strong>Sửa nội dung</Text> (anchor text, URL, rel) — Nếu link đang active, sẽ quay về pending và cần Admin duyệt lại. Nội dung cũ vẫn hiển thị trên websites cho đến khi duyệt</li>
        </ul>
        <Divider />
        <Title level={5}>Theo dõi Text Links</Title>
        <Paragraph>
          Vào <Text code>Text Links</Text> để xem danh sách links đã tạo.
          Bạn chỉ thấy links của mình. Nhấn vào link để xem chi tiết trạng thái.
        </Paragraph>
      </>
    ),
  },
  {
    key: "discord",
    title: "Discord Notifications",
    icon: <ApiOutlined />,
    role: "admin",
    content: (
      <>
        <Paragraph>
          Hệ thống gửi thông báo qua Discord webhook khi:
        </Paragraph>
        <ul>
          <li>Text link mới được tạo (kèm link Approve/Reject)</li>
          <li>Link được deploy hoặc gỡ khỏi websites</li>
          <li>Trạng thái link thay đổi (pending → active, active → disabled, v.v.)</li>
          <li>Sale sửa nội dung link → quay về pending (cần duyệt lại)</li>
          <li>Link hết hạn và bị gỡ tự động</li>
        </ul>
        <Paragraph>
          Cấu hình webhook URL trong biến môi trường <Text code>DISCORD_WEBHOOK_URL</Text>.
        </Paragraph>
      </>
    ),
  },
];

export const GuideList = () => {
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isAdmin = identity?.role === "admin";
  const screens = useBreakpoint();

  const filteredGuides = guides.filter(
    (g) => g.role === "all" || (g.role === "admin" && isAdmin),
  );

  return (
    <List headerButtons={false} title="Hướng dẫn hệ thống">
      <Alert
        message={
          isAdmin
            ? "Bạn đang xem tất cả hướng dẫn (Admin)"
            : "Bạn đang xem hướng dẫn dành cho Sale"
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Collapse
        accordion
        defaultActiveKey={["overview"]}
        size={screens.sm ? "middle" : "small"}
        items={filteredGuides.map((g) => ({
          key: g.key,
          label: (
            <Space>
              {g.icon}
              <span>{g.title}</span>
              {g.role === "admin" && <Tag color="blue">Admin</Tag>}
            </Space>
          ),
          children: (
            <Card bordered={false} style={{ margin: -12 }}>
              {g.content}
            </Card>
          ),
        }))}
      />
    </List>
  );
};
