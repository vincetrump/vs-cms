import { useCustom } from "@refinedev/core";
import { Card, Col, Row, Statistic, Typography } from "antd";
import { GlobalOutlined, LinkOutlined, ClockCircleOutlined, StopOutlined, ColumnHeightOutlined } from "@ant-design/icons";
import { API_URL } from "../../providers/dataProvider";

const { Title } = Typography;

export const DashboardPage = () => {
  const { data, isLoading } = useCustom({
    url: `${API_URL}/dashboard/stats`,
    method: "get",
  });

  const stats = data?.data as any;

  return (
    <div>
      <Title level={4}>Dashboard</Title>
      <Row gutter={[8, 8]} className="dashboard-row">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Websites"
              value={stats?.totalWebsites ?? 0}
              prefix={<GlobalOutlined />}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Websites"
              value={stats?.activeWebsites ?? 0}
              prefix={<GlobalOutlined style={{ color: "#52c41a" }} />}
              loading={isLoading}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Links"
              value={stats?.activeLinks ?? 0}
              prefix={<LinkOutlined />}
              loading={isLoading}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Links"
              value={stats?.pendingLinks ?? 0}
              prefix={<ClockCircleOutlined />}
              loading={isLoading}
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Disabled Links"
              value={stats?.disabledLinks ?? 0}
              prefix={<StopOutlined />}
              loading={isLoading}
              valueStyle={{ color: "#ff4d4f" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Expiring in 7 days"
              value={stats?.expiringIn7Days ?? 0}
              prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
              loading={isLoading}
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Footer Links"
              value={stats?.activeFooterLinks ?? 0}
              prefix={<ColumnHeightOutlined />}
              loading={isLoading}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Footer Links"
              value={stats?.pendingFooterLinks ?? 0}
              prefix={<ColumnHeightOutlined style={{ color: "#faad14" }} />}
              loading={isLoading}
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
