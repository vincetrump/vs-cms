import type { AuthProvider } from "@refinedev/core";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
        return { success: true, redirectTo: "/" };
      } catch {
        return { success: false, error: { name: "Error", message: "Invalid TOTP code" } };
      }
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { username, password });

      if (data.requireTotp) {
        return {
          success: false,
          error: { name: "TotpRequired", message: data.partialToken },
        };
      }

      localStorage.setItem("token", data.accessToken);
      return { success: true, redirectTo: "/" };
    } catch {
      return { success: false, error: { name: "Error", message: "Invalid credentials" } };
    }
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
    } catch {
      localStorage.removeItem("token");
      return { authenticated: false, redirectTo: "/login" };
    }
  },

  getIdentity: async () => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      const { data } = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { id: data.id, name: data.username, role: data.role };
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
