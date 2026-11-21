import { useState } from 'react';
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Selector } from '@astryxdesign/core/Selector';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  ROLE_META,
  formatDateTime,
  type ManagedUser,
  type UserPagination,
  type UserSummary,
} from '../types/dms';
import { ResetPasswordModal } from './ResetPasswordModal';

interface UserManagementPageProps {
  currentUserId: number;
  users: ManagedUser[];
  pagination: UserPagination;
  summary: UserSummary;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading: boolean;
  onOpenCreateUser: () => void;
  onEditUser: (user: ManagedUser) => void;
  onToggleUserActive: (user: ManagedUser) => Promise<void>;
  onResetPassword: (user: ManagedUser, newPassword: string) => Promise<void>;
  onDeleteUser: (user: ManagedUser) => Promise<void>;
}

const ROLE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả vai trò' },
  { value: 'ADMIN', label: 'Quản trị (ADMIN)' },
  { value: 'WAREHOUSE', label: 'Nhân viên Kho (WAREHOUSE)' },
  { value: 'DRIVER', label: 'Tài xế (DRIVER)' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Đã vô hiệu hóa' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function UserManagementPage({
  currentUserId,
  users,
  pagination,
  summary,
  searchQuery,
  onSearchQueryChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onPageSizeChange,
  loading,
  onOpenCreateUser,
  onEditUser,
  onToggleUserActive,
  onResetPassword,
  onDeleteUser,
}: UserManagementPageProps) {
  const [resettingUser, setResettingUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const startItem = pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endItem = Math.min(pagination.total, pagination.page * pagination.limit);

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setConfirmingDelete(true);
    try {
      await onDeleteUser(deletingUser);
      setDeletingUser(null);
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Text type="supporting" size="xsm">
                Tổng tài khoản
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalUsers}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Text type="supporting" size="xsm">
                Đang hoạt động
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.activeUsers}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Text type="supporting" size="xsm">
                Admin / Kho / Tài xế
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.adminCount} / {summary.warehouseCount} / {summary.driverCount}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Shield className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Text type="supporting" size="xsm">
                Đã vô hiệu hóa
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.inactiveUsers}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600">
              <UserX className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card padding={0}>
        <div className="flex flex-col">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Heading level={4} accessibilityLevel={2}>
                Quản Lý Tài Khoản &amp; Phân Quyền
              </Heading>
              <Text type="supporting" size="xsm" hasTabularNumbers>
                {pagination.total > 0
                  ? `Hiển thị ${startItem}–${endItem} trên ${pagination.total} tài khoản`
                  : 'Không có tài khoản phù hợp'}
              </Text>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-60">
                <TextInput
                  label="Tìm kiếm tài khoản"
                  isLabelHidden
                  type="search"
                  size="sm"
                  width="100%"
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  placeholder="Tìm theo tên hoặc email..."
                  value={searchQuery}
                  onChange={onSearchQueryChange}
                />
              </div>

              <Selector
                label="Lọc vai trò"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={200}
                options={ROLE_FILTER_OPTIONS}
                value={roleFilter}
                onChange={(val) => onRoleFilterChange(val as string)}
              />

              <Selector
                label="Lọc trạng thái"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={175}
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(val) => onStatusFilterChange(val as string)}
              />

              <Button
                label="Tạo tài khoản"
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={onOpenCreateUser}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading && users.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Đang tải danh sách tài khoản...
                </Text>
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Không tìm thấy tài khoản nào phù hợp.
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Người Dùng</TableHeaderCell>
                    <TableHeaderCell>Vai Trò</TableHeaderCell>
                    <TableHeaderCell>Trạng Thái</TableHeaderCell>
                    <TableHeaderCell>Ngày Tạo</TableHeaderCell>
                    <TableHeaderCell>Thao Tác</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const roleMeta = ROLE_META[u.role];
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <Text type="label" size="sm">
                                {u.name}
                              </Text>
                              {isSelf && <Badge label="Bạn" variant="info" />}
                            </div>
                            <Text type="supporting" size="xsm">
                              {u.email}
                            </Text>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge label={roleMeta.shortLabel} variant={roleMeta.badgeVariant} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            label={u.isActive ? 'Đang hoạt động' : 'Vô hiệu hóa'}
                            variant={u.isActive ? 'success' : 'neutral'}
                          />
                        </TableCell>
                        <TableCell>
                          <Text type="supporting" size="xsm">
                            {formatDateTime(u.createdAt)}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <IconButton
                              label={`Chỉnh sửa ${u.name}`}
                              tooltip="Chỉnh sửa tài khoản"
                              variant="secondary"
                              size="sm"
                              icon={<Pencil className="w-3.5 h-3.5" />}
                              onClick={() => onEditUser(u)}
                            />
                            <IconButton
                              label={`Đặt lại mật khẩu cho ${u.name}`}
                              tooltip="Đặt lại mật khẩu"
                              variant="secondary"
                              size="sm"
                              icon={<KeyRound className="w-3.5 h-3.5" />}
                              onClick={() => setResettingUser(u)}
                            />
                            {!isSelf && (
                              <>
                                <IconButton
                                  label={
                                    u.isActive ? `Vô hiệu hóa ${u.name}` : `Kích hoạt lại ${u.name}`
                                  }
                                  tooltip={u.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                                  variant="secondary"
                                  size="sm"
                                  icon={<Power className="w-3.5 h-3.5" />}
                                  onClick={() => onToggleUserActive(u)}
                                />
                                <IconButton
                                  label={`Xóa ${u.name}`}
                                  tooltip="Xóa tài khoản"
                                  variant="destructive"
                                  size="sm"
                                  icon={<Trash2 className="w-3.5 h-3.5" />}
                                  onClick={() => setDeletingUser(u)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <Text type="supporting" size="xsm" hasTabularNumbers>
                Trang{' '}
                <Text type="label" size="xsm" color="primary" hasTabularNumbers>
                  {pagination.page}
                </Text>{' '}
                / {pagination.totalPages} ({startItem}–{endItem} trên {pagination.total} tài khoản)
              </Text>

              <Pagination
                page={pagination.page}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                variant="pages"
                size="sm"
                isDisabled={loading}
                label="Phân trang danh sách tài khoản"
                onChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          )}
        </div>
      </Card>

      <ResetPasswordModal
        user={resettingUser}
        onClose={() => setResettingUser(null)}
        onConfirm={onResetPassword}
      />

      <Dialog
        isOpen={Boolean(deletingUser)}
        onOpenChange={(open) => {
          if (!open) setDeletingUser(null);
        }}
        purpose="form"
        width={420}
      >
        <Layout
          header={
            <DialogHeader
              title="Xác Nhận Xóa Tài Khoản"
              subtitle="Hành động này không thể hoàn tác"
              onOpenChange={(open) => {
                if (!open) setDeletingUser(null);
              }}
            />
          }
          content={
            <LayoutContent>
              <Text type="body" size="sm">
                Bạn có chắc muốn xóa tài khoản{' '}
                <Text type="label" size="sm">
                  {deletingUser?.name}
                </Text>{' '}
                ({deletingUser?.email})?
              </Text>
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
                  onClick={() => setDeletingUser(null)}
                />
                <Button
                  label="Xóa tài khoản"
                  type="button"
                  variant="destructive"
                  size="sm"
                  isLoading={confirmingDelete}
                  onClick={handleConfirmDelete}
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}
