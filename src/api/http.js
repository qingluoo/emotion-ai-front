import axios from 'axios';
import { clearAuth, getTokenName, getTokenValue } from '../utils/auth';

const http = axios.create({
  baseURL: process.env.NODE_ENV === 'production' 
    ? `${window.location.protocol}//${window.location.host}/api`  // 使用完整 URL
    : 'http://localhost:8123/api',
  timeout: 30000
});

http.interceptors.request.use((config) => {
  const tokenValue = getTokenValue();
  if (tokenValue) {
    config.headers[getTokenName()] = tokenValue;
    config.headers.Authorization = `Bearer ${tokenValue}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    if (error?.response?.status === 401) {
      clearAuth();
    }
    return Promise.reject(error);
  }
);

export default http;
