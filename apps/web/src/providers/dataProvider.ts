import simpleRestDataProvider from "@refinedev/simple-rest";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const axiosInstance = axios.create();

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    if (error?.response?.status === 403) {
      const msg = error?.response?.data?.message || "";
      if (msg.includes("Password change required")) {
        window.location.href = "/change-password";
      }
    }
    return Promise.reject(error);
  },
);

export const dataProvider = simpleRestDataProvider(API_URL, axiosInstance);
export { axiosInstance, API_URL };
