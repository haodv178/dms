import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

let accessToken: string | null = null;
let onAuthFailureCallback: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setOnAuthFailure(cb: (() => void) | null): void {
  onAuthFailureCallback = cb;
}

export const httpClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Separate raw client for refresh calls so we don't recurse through interceptors
const refreshClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  for (const prom of failedQueue) {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  }
  failedQueue = [];
}

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url || '';

    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return httpClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await refreshClient.post('/auth/refresh');
        const newToken = res.data?.accessToken as string | undefined;
        if (!newToken) {
          throw new Error('Không nhận được access token mới.');
        }
        setAccessToken(newToken);
        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return httpClient(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        processQueue(refreshError, null);
        if (onAuthFailureCallback) {
          onAuthFailureCallback();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
