import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { getErrorMessage } from '../api/dmsApi';
import { useAuth } from '../context/AuthContext';

const DEV_DEMO_ACCOUNTS = [
  {
    role: 'ADMIN',
    label: 'Admin',
    email: 'admin@dms.vn',
    password: '123456',
    badgeVariant: 'purple' as const,
  },
  {
    role: 'WAREHOUSE',
    label: 'Kho',
    email: 'linhdn@dms.vn',
    password: '123456',
    badgeVariant: 'orange' as const,
  },
  {
    role: 'DRIVER',
    label: 'Tài xế',
    email: 'luannv@dms.vn',
    password: '123456',
    badgeVariant: 'green' as const,
  },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-accent-bg text-on-accent flex items-center justify-center shadow-sm">
            <Truck className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2">
            <Heading level={2} accessibilityLevel={1}>
              DMS Dashboard
            </Heading>
            <Badge label="OR-Tools VRP" variant="purple" />
          </div>
          <Text type="supporting" size="sm">
            Đăng nhập vào hệ thống Quản lý Đơn hàng Kho &amp; Điều phối Giao hàng
          </Text>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <Text type="label" size="sm">
                Xác thực tài khoản
              </Text>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
              >
                {errorMessage}
              </div>
            )}

            <TextInput
              label="Email"
              type="email"
              isRequired
              width="100%"
              placeholder="name@dms.vn"
              startIcon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(val) => setEmail(val)}
            />

            <div className="relative">
              <TextInput
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                isRequired
                width="100%"
                placeholder="Nhập mật khẩu..."
                startIcon={<Lock className="w-4 h-4" />}
                value={password}
                onChange={(val) => setPassword(val)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-[34px] p-1 text-secondary hover:text-primary rounded cursor-pointer"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button
              label={submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              type="submit"
              variant="primary"
              width="100%"
              icon={<LogIn className="w-4 h-4" />}
              isLoading={submitting}
            />
          </form>

          {import.meta.env.DEV && (
            <div className="mt-5 pt-4 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <Text type="supporting" size="xsm">
                  Tài khoản demo nhanh (Development)
                </Text>
                <Badge label="DEV" variant="neutral" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DEV_DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.password);
                      setErrorMessage(null);
                    }}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted hover:bg-secondary/50 px-2 py-2 text-xs transition-colors cursor-pointer"
                  >
                    <Badge label={acc.label} variant={acc.badgeVariant} />
                    <span className="text-[11px] text-secondary truncate max-w-full">
                      {acc.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
