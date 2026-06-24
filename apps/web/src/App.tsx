import { Refine, Authenticated, AccessControlProvider, useGetIdentity } from "@refinedev/core";
import { ThemedLayoutV2, useNotificationProvider, RefineThemes } from "@refinedev/antd";
import routerProvider, { NavigateToResource, CatchAllNavigate } from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router";
import { ConfigProvider, App as AntdApp } from "antd";
import { GlobalOutlined, LinkOutlined, KeyOutlined, DashboardOutlined, HistoryOutlined, SettingOutlined, BookOutlined } from "@ant-design/icons";

import "@refinedev/antd/dist/reset.css";
import "./styles/responsive.css";

import { authProvider } from "./providers/authProvider";
import { dataProvider } from "./providers/dataProvider";

import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { WebsiteList } from "./pages/websites/list";
import { WebsiteShow } from "./pages/websites/show";
import { TextLinkList } from "./pages/text-links/list";
import { TextLinkCreate } from "./pages/text-links/create";
import { TextLinkEdit } from "./pages/text-links/edit";
import { TextLinkShow } from "./pages/text-links/show";
import { ApiKeyList } from "./pages/api-keys/list";
import { ApiKeyCreate } from "./pages/api-keys/create";
import { ApiKeyShow } from "./pages/api-keys/show";
import { SettingsPage } from "./pages/settings";
import { JobList } from "./pages/jobs/list";
import { JobShow } from "./pages/jobs/show";
import { SetupTotpPage } from "./pages/setup-totp";
import { GuideList } from "./pages/guides/list";

const TotpGuard = () => {
  const { data: identity, isLoading } = useGetIdentity<{ totpEnabled: boolean }>();
  if (isLoading) return null;
  if (identity && !identity.totpEnabled) {
    return <Navigate to="/setup-totp" replace />;
  }
  return <Outlet />;
};

const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const identity = await authProvider.getIdentity?.();
    const role = (identity as any)?.role;

    if (role === "admin") return { can: true };

    const saleAllowed: Record<string, string[]> = {
      "text-links": ["list", "create", "edit", "show", "delete"],
      dashboard: ["list"],
      settings: ["list"],
      guides: ["list"],
    };

    const allowed = saleAllowed[resource || ""] || [];
    return { can: allowed.includes(action || "") };
  },
};

function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <ConfigProvider theme={RefineThemes.Blue}>
        <AntdApp>
          <Refine
            routerProvider={routerProvider}
            dataProvider={dataProvider}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: "dashboard",
                list: "/",
                meta: { label: "Dashboard", icon: <DashboardOutlined /> },
              },
              {
                name: "websites",
                list: "/websites",
                show: "/websites/show/:id",
                meta: { icon: <GlobalOutlined /> },
              },
              {
                name: "text-links",
                list: "/text-links",
                create: "/text-links/create",
                edit: "/text-links/edit/:id",
                show: "/text-links/show/:id",
                meta: { label: "Text Links", icon: <LinkOutlined /> },
              },
              {
                name: "api-keys",
                list: "/api-keys",
                create: "/api-keys/create",
                show: "/api-keys/show/:id",
                meta: { label: "API Keys", icon: <KeyOutlined /> },
              },
              {
                name: "jobs",
                list: "/jobs",
                show: "/jobs/show/:id",
                meta: { label: "Jobs", icon: <HistoryOutlined /> },
              },
              {
                name: "settings",
                list: "/settings",
                meta: { label: "Settings", icon: <SettingOutlined /> },
              },
              {
                name: "guides",
                list: "/guides",
                meta: { label: "Hướng dẫn", icon: <BookOutlined /> },
              },
            ]}
            options={{ syncWithLocation: true }}
          >
            <Routes>
              <Route
                element={
                  <Authenticated key="auth-setup" fallback={<CatchAllNavigate to="/login" />}>
                    <Outlet />
                  </Authenticated>
                }
              >
                <Route path="/setup-totp" element={<SetupTotpPage />} />
              </Route>
              <Route
                element={
                  <Authenticated key="auth" fallback={<CatchAllNavigate to="/login" />}>
                    <TotpGuard />
                  </Authenticated>
                }
              >
                <Route
                  element={
                    <ThemedLayoutV2 Title={() => <span style={{ fontSize: 18, fontWeight: 700 }}>VS-CMS</span>}>
                      <Outlet />
                    </ThemedLayoutV2>
                  }
                >
                <Route index element={<DashboardPage />} />
                <Route path="/websites">
                  <Route index element={<WebsiteList />} />
                  <Route path="show/:id" element={<WebsiteShow />} />
                </Route>
                <Route path="/text-links">
                  <Route index element={<TextLinkList />} />
                  <Route path="create" element={<TextLinkCreate />} />
                  <Route path="edit/:id" element={<TextLinkEdit />} />
                  <Route path="show/:id" element={<TextLinkShow />} />
                </Route>
                <Route path="/api-keys">
                  <Route index element={<ApiKeyList />} />
                  <Route path="create" element={<ApiKeyCreate />} />
                  <Route path="show/:id" element={<ApiKeyShow />} />
                </Route>
                <Route path="/jobs">
                  <Route index element={<JobList />} />
                  <Route path="show/:id" element={<JobShow />} />
                </Route>
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/guides" element={<GuideList />} />
                </Route>
              </Route>
              <Route
                element={
                  <Authenticated key="auth" fallback={<Outlet />}>
                    <NavigateToResource resource="dashboard" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
