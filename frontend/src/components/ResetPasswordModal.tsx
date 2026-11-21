import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { ManagedUser } from '../types/dms';

interface ResetPasswordModalProps {
  user: ManagedUser | null;
  onClose: () => void;
  onConfirm: (user: ManagedUser, newPassword: string) => Promise<void>;
}

export function ResetPasswordModal({ user, onClose, onConfirm }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      onClose();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(user, newPassword);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={Boolean(user)}
      onOpenChange={handleOpenChange}
      purpose="form"
      width={440}
      maxHeight="80dvh"
    >
      <Layout
        header={
          <DialogHeader
            title="Đặt Lại Mật Khẩu"
            subtitle={
              user
                ? `Tài khoản: ${user.name} (${user.email}). Các phiên đăng nhập cũ sẽ bị thu hồi.`
                : ''
            }
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <TextInput
                label="Mật khẩu mới"
                type="password"
                isRequired
                width="100%"
                size="sm"
                placeholder="Tối thiểu 6 ký tự"
                value={newPassword}
                onChange={(val) => setNewPassword(val)}
              />
              <TextInput
                label="Nhập lại mật khẩu mới"
                type="password"
                isRequired
                width="100%"
                size="sm"
                value={confirmPassword}
                onChange={(val) => setConfirmPassword(val)}
              />
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                label="Hủy"
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleOpenChange(false)}
              />
              <Button
                label="Đặt lại mật khẩu"
                type="submit"
                form="reset-password-form"
                variant="primary"
                size="sm"
                icon={<KeyRound className="w-4 h-4" />}
                isLoading={submitting}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
