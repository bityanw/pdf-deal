import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLogin: (password: string) => boolean;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const success = onLogin(password);
      if (!success) {
        setError('密码错误，请重试');
        setPassword('');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Logo和标题 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">PDF发票处理系统</h1>
            <p className="text-gray-500 mt-2">请输入访问密码</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                访问密码
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <Alert className="bg-red-50 border-red-200">
                <AlertDescription className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={!password || isLoading}
            >
              {isLoading ? '验证中...' : '登录'}
            </Button>
          </form>

          {/* 提示信息 */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>登录后7天内有效</p>
          </div>
        </div>
      </div>
    </div>
  );
}
