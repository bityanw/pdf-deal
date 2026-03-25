import { useState, useEffect } from 'react';

const AUTH_KEY = 'pdf_invoice_auth';
const PASSWORD = 'admin123'; // 可以修改为你想要的密码

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // 检查本地存储的认证状态
    const authData = localStorage.getItem(AUTH_KEY);
    if (authData) {
      try {
        const { token, expiry } = JSON.parse(authData);
        // 检查是否过期（7天有效期）
        if (token === PASSWORD && expiry > Date.now()) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(AUTH_KEY);
        }
      } catch {
        localStorage.removeItem(AUTH_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (password: string): boolean => {
    if (password === PASSWORD) {
      // 设置7天有效期
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(AUTH_KEY, JSON.stringify({ token: password, expiry }));
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
  };

  return { isAuthenticated, isLoading, login, logout };
}
