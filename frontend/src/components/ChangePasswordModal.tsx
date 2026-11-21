import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { getErrorMessage } from '../api/dmsApi';
import { useAuth } from '../context/AuthContext';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordModal({ isOpen, onOpenChange }: ChangePasswordModalProps) {
  const { changePassword } = useAuth();
  const showToast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const msg = await changePassword(currentPassword, newPassword);
      showToast({ body: msg, type: 'info', isAutoHide: true, autoHideDuration: 4500 });
      handleOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      purpose="form"
      width={460}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title="Đổi Mật Khẩu"
            subtitle="Mật khẩu mới phải có tối thiểu 6 ký tự. Các phiên đăng nhập cũ sẽ bị đăng xuất."
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="change-password-form" onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <TextInput
                label="Mật khẩu hiện tại"
                type="password"
                isRequired
                width="100%"
                size="sm"
                value={currentPassword}
                onChange={(val) => setCurrentPassword(val)}
              />
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
                label="Xác nhận mật khẩu mới"
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
                label="Cập nhật mật khẩu"
                type="submit"
                form="change-password-form"
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
