import type { FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { ManagedUser, Role, UserFormState } from '../types/dms';

interface UserFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingUser: ManagedUser | null;
  currentUserId: number;
  form: UserFormState;
  onFormChange: (next: UserFormState) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Quản trị / Điều phối (ADMIN)' },
  { value: 'WAREHOUSE', label: 'Nhân viên Kho (WAREHOUSE)' },
  { value: 'DRIVER', label: 'Tài xế Giao hàng (DRIVER)' },
];

export function UserFormModal({
  isOpen,
  onOpenChange,
  mode,
  editingUser,
  currentUserId,
  form,
  onFormChange,
  submitting,
  onSubmit,
}: UserFormModalProps) {
  const isEdit = mode === 'edit';
  const isEditingSelf = isEdit && editingUser?.id === currentUserId;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={500}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={
              isEdit && editingUser
                ? `Chỉnh Sửa Tài Khoản (${editingUser.name})`
                : 'Tạo Tài Khoản Người Dùng Mới'
            }
            subtitle={
              isEdit
                ? 'Cập nhật họ tên, email, vai trò và trạng thái hoạt động'
                : 'Cấp tài khoản đăng nhập cho quản trị viên, nhân viên kho hoặc tài xế'
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="user-form" onSubmit={onSubmit} className="space-y-3.5">
              <TextInput
                label="Họ và tên"
                isRequired
                width="100%"
                size="sm"
                placeholder="VD: Nguyễn Văn B"
                value={form.name}
                onChange={(val) => onFormChange({ ...form, name: val })}
              />

              <TextInput
                label="Email đăng nhập"
                type="email"
                isRequired
                width="100%"
                size="sm"
                placeholder="nhanvien@dms.vn"
                value={form.email}
                onChange={(val) => onFormChange({ ...form, email: val })}
              />

              {!isEdit && (
                <TextInput
                  label="Mật khẩu ban đầu"
                  type="password"
                  isRequired
                  width="100%"
                  size="sm"
                  placeholder="Tối thiểu 6 ký tự"
                  value={form.password}
                  onChange={(val) => onFormChange({ ...form, password: val })}
                />
              )}

              <Selector
                label="Vai trò (Role)"
                variant="secondary"
                size="sm"
                width="100%"
                options={ROLE_OPTIONS}
                value={form.role}
                isDisabled={isEditingSelf}
                onChange={(val) => onFormChange({ ...form, role: val as Role })}
              />

              {isEditingSelf && (
                <Text type="supporting" size="xsm">
                  Bạn không thể tự thay đổi vai trò hoặc vô hiệu hóa tài khoản của chính mình.
                </Text>
              )}

              <div className="pt-1">
                <CheckboxInput
                  size="sm"
                  label="Tài khoản đang hoạt động (cho phép đăng nhập)"
                  value={form.isActive}
                  isDisabled={isEditingSelf}
                  onChange={(checked) => onFormChange({ ...form, isActive: Boolean(checked) })}
                />
              </div>
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
                onClick={() => onOpenChange(false)}
              />
              <Button
                label={isEdit ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                type="submit"
                form="user-form"
                variant="primary"
                size="sm"
                isLoading={submitting}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
