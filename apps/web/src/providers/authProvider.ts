import type { AuthProvider } from "@refinedev/core";
import axios from "axios";
import { API_URL } from "./dataProvider";

export const authProvider: AuthProvider = {
  login: async ({ username, password, totpCode, partialToken }) => {
    if (partialToken && totpCode) {
      try {
        const { data } = await axios.post(
          `${API_URL}/auth/verify-totp`,
          { code: totpCode },
          { headers: { Authorization: `Bearer ${partialToken}` } },
        );
        localStorage.setItem("token", data.accessToken);
        if (data.requirePasswordChange) {
          return { success: true, redirectTo: "/change-password" };
        }
        return { success: true, redirectTo: "/" };
      } catch {
        throw { name: "Error", message: "Invalid TOTP code" };
      }
    }

    let data: any;
    try {
      const response = await axios.post(`${API_URL}/auth/login`, { username, password });
      data = response.data;
    } catch {
      throw { name: "Error", message: "Invalid credentials" };
    }

    if (data.requireTotp) {
      throw { name: "TotpRequired", message: data.partialToken };
    }

    localStorage.setItem("token", data.accessToken);
    if (data.requirePasswordChange) {
      return { success: true, redirectTo: "/change-password" };
    }
    if (data.requireTotpSetup) {
      return { success: true, redirectTo: "/setup-totp" };
    }
    return { success: true, redirectTo: "/" };
  },

  logout: async () => {
    localStorage.removeItem("token");
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const token = localStorage.getItem("token");
    if (!token) return { authenticated: false, redirectTo: "/login" };

    try {
      await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { authenticated: true };
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        localStorage.removeItem("token");
        return { authenticated: false, redirectTo: "/login" };
      }
      return { authenticated: true };
    }
  },

  getIdentity: async () => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      const { data } = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { id: data.id, name: data.username, role: data.role, totpEnabled: data.totpEnabled, mustChangePassword: data.mustChangePassword };
    } catch {
      return null;
    }
  },

  onError: async (error) => {
    if (error?.statusCode === 401) {
      return { logout: true, redirectTo: "/login" };
    }
    return { error };
  },
};
