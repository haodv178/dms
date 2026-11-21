import { useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Trash2,
  Truck,
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
  DRIVER_STATUS_CONFIG,
  DRIVER_VEHICLE_TYPES,
  canRoleManageDrivers,
  type Driver,
  type DriverPagination,
  type DriverSummary,
  type Role,
} from '../types/dms';

interface DriverManagementPageProps {
  role: Role;
  drivers: Driver[];
  pagination: DriverPagination;
  summary: DriverSummary;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  vehicleTypeFilter: string;
  onVehicleTypeFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading: boolean;
  onOpenCreateDriver: () => void;
  onEditDriver: (driver: Driver) => void;
  onToggleActive: (driver: Driver) => void;
  onDeleteDriver: (driver: Driver) => Promise<void>;
}

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'AVAILABLE', label: 'Sẵn sàng (AVAILABLE)' },
  { value: 'ON_DELIVERY', label: 'Đang giao (ON_DELIVERY)' },
  { value: 'OFFLINE', label: 'Ngoại tuyến (OFFLINE)' },
];

const VEHICLE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả loại xe' },
  ...DRIVER_VEHICLE_TYPES.map((vt) => ({ value: vt, label: vt })),
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function DriverManagementPage({
  role,
  drivers,
  pagination,
  summary,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  vehicleTypeFilter,
  onVehicleTypeFilterChange,
  onPageChange,
  onPageSizeChange,
  loading,
  onOpenCreateDriver,
  onEditDriver,
  onToggleActive,
  onDeleteDriver,
}: DriverManagementPageProps) {
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canManage = canRoleManageDrivers(role);

  const startItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  const handleConfirmDelete = async () => {
    if (!deletingDriver) return;
    setConfirmingDelete(true);
    try {
      await onDeleteDriver(deletingDriver);
      setDeletingDriver(null);
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Tổng tài xế
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalDrivers.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đang sẵn sàng
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.availableDrivers.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-success">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đang giao hàng
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.onDeliveryDrivers.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Truck className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Ngừng hoạt động
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.inactiveDrivers.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-warning">
              <UserX className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Drivers Table Card */}
      <Card padding={0}>
        <div className="flex flex-col">
          {/* Toolbar */}
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Heading level={4} accessibilityLevel={2}>
                Danh Sách Đội Ngũ Tài Xế
              </Heading>
              <Text type="supporting" size="xsm" hasTabularNumbers>
                {pagination.total > 0
                  ? `Hiển thị ${startItem.toLocaleString('vi-VN')}–${endItem.toLocaleString('vi-VN')} trên ${pagination.total.toLocaleString('vi-VN')} tài xế`
                  : 'Không có tài xế phù hợp'}
                {!canManage && ` — Chế độ chỉ xem (${role})`}
              </Text>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-60">
                <TextInput
                  label="Tìm kiếm tài xế"
                  isLabelHidden
                  type="search"
                  size="sm"
                  width="100%"
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  placeholder="Tìm tên, SĐT, email, biển số..."
                  value={searchQuery}
                  onChange={onSearchQueryChange}
                />
              </div>

              <Selector
                label="Lọc theo trạng thái"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={190}
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(val) => onStatusFilterChange(val as string)}
              />

              <Selector
                label="Lọc theo loại xe"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={160}
                options={VEHICLE_FILTER_OPTIONS}
                value={vehicleTypeFilter}
                onChange={(val) => onVehicleTypeFilterChange(val as string)}
              />

              {canManage && (
                <Button
                  label="Thêm tài xế"
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={onOpenCreateDriver}
                />
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading && drivers.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Đang tải danh sách tài xế...
                </Text>
              </div>
            ) : drivers.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Không tìm thấy tài xế nào phù hợp.
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Tài Xế</TableHeaderCell>
                    <TableHeaderCell>Liên Hệ</TableHeaderCell>
                    <TableHeaderCell>Phương Tiện &amp; Biển Số</TableHeaderCell>
                    <TableHeaderCell>Vận Hành</TableHeaderCell>
                    <TableHeaderCell>Chuyến Giao</TableHeaderCell>
                    <TableHeaderCell>Tài Khoản</TableHeaderCell>
                    {canManage && <TableHeaderCell>Thao Tác</TableHeaderCell>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((driver) => {
                    const statusMeta =
                      DRIVER_STATUS_CONFIG[driver.status] ?? DRIVER_STATUS_CONFIG.AVAILABLE;

                    return (
                      <TableRow key={driver.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Text type="label" size="sm">
                              {driver.name}
                            </Text>
                            <Text type="supporting" size="xsm">
                              {driver.email}
                            </Text>
                            {driver.notes && (
                              <Text type="supporting" size="xsm">
                                {driver.notes}
                              </Text>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-secondary shrink-0" />
                            <Text type="supporting" size="sm" hasTabularNumbers>
                              {driver.phone || '—'}
                            </Text>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge label={driver.vehicleType || 'Xe máy'} variant="neutral" />
                            <Text type="code" size="xsm">
                              {driver.licensePlate || '—'}
                            </Text>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            label={statusMeta.shortLabel}
                            variant={statusMeta.badgeVariant}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {driver.activeTrip ? (
                              <Badge
                                label={`${driver.activeTrip.tripCode} (${driver.activeTrip.ordersCount} đơn)`}
                                variant="purple"
                              />
                            ) : (
                              <Text type="supporting" size="xsm">
                                Chưa có chuyến đang chạy
                              </Text>
                            )}
                            <Text type="supporting" size="xsm" hasTabularNumbers>
                              Tổng: {driver.totalTrips} chuyến
                            </Text>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            label={driver.isActive ? 'Hoạt động' : 'Tạm ngưng'}
                            variant={driver.isActive ? 'success' : 'neutral'}
                          />
                        </TableCell>

                        {canManage && (
                          <TableCell>
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <IconButton
                                label={`Chỉnh sửa ${driver.name}`}
                                tooltip="Chỉnh sửa tài xế"
                                variant="secondary"
                                size="sm"
                                icon={<Pencil className="w-3.5 h-3.5" />}
                                onClick={() => onEditDriver(driver)}
                              />
                              <IconButton
                                label={
                                  driver.isActive
                                    ? `Tạm ngưng ${driver.name}`
                                    : `Kích hoạt lại ${driver.name}`
                                }
                                tooltip={
                                  driver.isActive ? 'Tạm ngưng hoạt động' : 'Kích hoạt lại'
                                }
                                variant="secondary"
                                size="sm"
                                icon={<Power className="w-3.5 h-3.5" />}
                                onClick={() => onToggleActive(driver)}
                              />
                              <IconButton
                                label={`Xóa ${driver.name}`}
                                tooltip={
                                  driver.activeTrip
                                    ? 'Không thể xóa tài xế đang có chuyến hoạt động'
                                    : 'Xóa tài xế'
                                }
                                variant="destructive"
                                size="sm"
                                isDisabled={Boolean(driver.activeTrip)}
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                onClick={() => setDeletingDriver(driver)}
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Server-Side Pagination Footer */}
          {pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <Text type="supporting" size="xsm" hasTabularNumbers>
                Trang{' '}
                <Text type="label" size="xsm" color="primary" hasTabularNumbers>
                  {pagination.page}
                </Text>{' '}
                / {pagination.totalPages} ({startItem.toLocaleString('vi-VN')}–
                {endItem.toLocaleString('vi-VN')} trên{' '}
                {pagination.total.toLocaleString('vi-VN')} tài xế)
              </Text>

              <Pagination
                page={pagination.page}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                variant="pages"
                size="sm"
                isDisabled={loading}
                label="Phân trang danh sách tài xế"
                onChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingDriver)}
        onOpenChange={(open) => {
          if (!open) setDeletingDriver(null);
        }}
        purpose="form"
        width={440}
      >
        <Layout
          header={
            <DialogHeader
              title="Xác Nhận Xóa Tài Xế"
              subtitle="Hành động này không thể hoàn tác"
              onOpenChange={(open) => {
                if (!open) setDeletingDriver(null);
              }}
            />
          }
          content={
            <LayoutContent>
              <Text type="body" size="sm">
                Bạn có chắc muốn xóa tài xế{' '}
                <Text type="label" size="sm">
                  {deletingDriver?.name}
                </Text>{' '}
                ({deletingDriver?.licensePlate || deletingDriver?.email})? Các chuyến đã hoàn thành trước đây sẽ vẫn được giữ lại trong lịch sử.
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
                  onClick={() => setDeletingDriver(null)}
                />
                <Button
                  label="Xóa tài xế"
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
