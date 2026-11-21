import {
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Navigation,
  Package,
  Pencil,
  Search,
  ShoppingBag,
  Truck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Tab, TabList } from '@astryxdesign/core/TabList';
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
  STATUS_CONFIG,
  STATUS_TABS,
  canRoleAssignDriver,
  canRoleEditOrders,
  formatDateTime,
  formatVND,
  isOrderAssignable,
  isOrderEditable,
  type Order,
  type Role,
} from '../types/dms';

interface OrderTableProps {
  role: Role;
  filteredOrders: Order[];
  counts: Record<string, number>;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  loading: boolean;
  onBatchPreparePacked: () => void;
  onEditOrder: (order: Order) => void;
  onOpenAssignDriver: (order: Order) => void;
  onStartPicking: (id: number) => void;
  onCompletePacking: (id: number) => void;
  onCompleteDelivery: (id: number) => void;
  onFailDelivery: (id: number) => void;
}

export function OrderTable({
  role,
  filteredOrders,
  counts,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  loading,
  onBatchPreparePacked,
  onEditOrder,
  onOpenAssignDriver,
  onStartPicking,
  onCompletePacking,
  onCompleteDelivery,
  onFailDelivery,
}: OrderTableProps) {
  const newAndPickingCount = (counts.NEW ?? 0) + (counts.PICKING ?? 0);

  return (
    <section className="flex flex-col gap-4">
      {/* Header & Quick Warehouse Prep */}
      <Card padding={4}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <Heading level={4} accessibilityLevel={2}>
                Danh Sách Đơn Hàng
              </Heading>
              <Badge label={`${filteredOrders.length} đơn`} variant="neutral" />
            </div>
            <Text type="supporting" size="xsm">
              Sắp xếp mặc định theo ngày tạo mới nhất (mới nhất ở trên cùng).
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-72">
              <TextInput
                label="Tìm kiếm đơn hàng"
                isLabelHidden
                placeholder="Tìm mã đơn, khách hàng, SĐT, tài xế..."
                value={searchQuery}
                onChange={onSearchQueryChange}
                startIcon={<Search className="w-4 h-4" />}
                size="sm"
              />
            </div>

            {newAndPickingCount > 0 && (
              <Button
                label={`Đóng gói nhanh (${newAndPickingCount} đơn)`}
                variant="secondary"
                size="sm"
                icon={<Package className="w-3.5 h-3.5" />}
                isLoading={loading}
                tooltip="Tự động Nhặt & Đóng gói toàn bộ đơn NEW/PICKING"
                onClick={onBatchPreparePacked}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Filter Tabs & Orders Table */}
      <Card padding={0}>
        <div className="flex flex-col">
          <div className="px-4 pt-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <TabList
              value={statusFilter}
              onChange={onStatusFilterChange}
              size="sm"
              aria-label="Lọc đơn hàng theo trạng thái"
            >
              {STATUS_TABS.map((tab) => (
                <Tab
                  key={tab.key}
                  value={tab.key}
                  label={tab.label}
                  endContent={
                    <Text type="supporting" size="2xs" hasTabularNumbers>
                      {counts[tab.key] ?? 0}
                    </Text>
                  }
                />
              ))}
            </TabList>
          </div>

          <div className="overflow-x-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  {searchQuery.trim()
                    ? 'Không tìm thấy đơn hàng nào khớp với từ khóa tìm kiếm.'
                    : 'Không có đơn hàng nào trong trạng thái này. Hãy tạo đơn mới hoặc bấm "Seed 10 Sample Orders" trên thanh công cụ.'}
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Mã Đơn / Chuyến</TableHeaderCell>
                    <TableHeaderCell>Ngày Tạo</TableHeaderCell>
                    <TableHeaderCell>Khách Hàng &amp; Địa Chỉ</TableHeaderCell>
                    <TableHeaderCell>Tổng Tiền</TableHeaderCell>
                    <TableHeaderCell>Trạng Thái</TableHeaderCell>
                    <TableHeaderCell>Tài Xế</TableHeaderCell>
                    <TableHeaderCell>Thao Tác ({role})</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const statusMeta = STATUS_CONFIG[order.status];
                    const assignedDriver = order.trip?.driver ?? null;
                    const canAssign =
                      canRoleAssignDriver(role) && isOrderAssignable(order.status);
                    const assignLabel =
                      order.status === 'FAILED'
                        ? 'Giao lại'
                        : assignedDriver
                          ? 'Đổi tài xế'
                          : 'Gán tài xế';

                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1 whitespace-nowrap">
                            <Text type="label" size="sm">
                              {order.orderCode}
                            </Text>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {order.trip?.tripCode && (
                                <Badge label={order.trip.tripCode} variant="blue" />
                              )}
                              {order.deliverySequence ? (
                                <Badge
                                  label={`Stop #${order.deliverySequence}`}
                                  variant="purple"
                                  icon={<Navigation className="w-3 h-3" />}
                                />
                              ) : (
                                <Text type="supporting" size="2xs" hasTabularNumbers>
                                  ID: #{order.id}
                                </Text>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5 text-secondary shrink-0" />
                            <Text type="supporting" size="xsm" hasTabularNumbers>
                              {formatDateTime(order.createdAt)}
                            </Text>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5 max-w-md">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Text type="label" size="sm">
                                {order.customerName}
                              </Text>
                              <Text type="supporting" size="xsm">
                                ({order.customerPhone})
                              </Text>
                            </div>
                            <div className="flex items-start gap-1 text-secondary">
                              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <Text type="supporting" size="xsm">
                                {order.customerAddress}
                              </Text>
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="flex items-center gap-1 text-secondary mt-0.5">
                                <ShoppingBag className="w-3 h-3 shrink-0" />
                                <Text type="supporting" size="2xs" maxLines={1}>
                                  {order.items
                                    .map((i) => `${i.productName} (x${i.quantity})`)
                                    .join(', ')}
                                </Text>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Text type="label" size="sm" hasTabularNumbers>
                            {formatVND(order.totalAmount)}
                          </Text>
                        </TableCell>

                        <TableCell>
                          <Badge
                            label={statusMeta.label}
                            variant={statusMeta.badgeVariant}
                          />
                        </TableCell>

                        <TableCell>
                          <Stack direction="vertical" gap={1} className="whitespace-nowrap">
                            {assignedDriver ? (
                              <Stack direction="vertical" gap={0.5}>
                                <Stack direction="horizontal" align="center" gap={1}>
                                  <Truck className="w-3.5 h-3.5 text-accent shrink-0" />
                                  <Text type="label" size="xsm">
                                    {assignedDriver.name}
                                  </Text>
                                </Stack>
                                {assignedDriver.driverProfile?.licensePlate && (
                                  <Text type="supporting" size="2xs">
                                    {assignedDriver.driverProfile.vehicleType} •{' '}
                                    {assignedDriver.driverProfile.licensePlate}
                                  </Text>
                                )}
                              </Stack>
                            ) : (
                              <Text type="supporting" size="xsm">
                                Chưa gán
                              </Text>
                            )}

                            {canAssign && (
                              <Button
                                label={assignLabel}
                                variant={assignedDriver ? 'secondary' : 'primary'}
                                size="sm"
                                icon={<UserPlus className="w-3.5 h-3.5" />}
                                onClick={() => onOpenAssignDriver(order)}
                              />
                            )}
                          </Stack>
                        </TableCell>

                        <TableCell>
                          <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {canRoleEditOrders(role) && isOrderEditable(order.status) && (
                              <IconButton
                                label={`Chỉnh sửa đơn ${order.orderCode}`}
                                tooltip="Chỉnh sửa đơn hàng"
                                variant="secondary"
                                size="sm"
                                icon={<Pencil className="w-3.5 h-3.5" />}
                                onClick={() => onEditOrder(order)}
                              />
                            )}

                            {order.status === 'NEW' && (
                              <Button
                                label="Bắt đầu nhặt hàng"
                                variant="primary"
                                size="sm"
                                onClick={() => onStartPicking(order.id)}
                              />
                            )}

                            {order.status === 'PICKING' && (
                              <Button
                                label="Đóng gói xong"
                                variant="secondary"
                                size="sm"
                                onClick={() => onCompletePacking(order.id)}
                              />
                            )}

                            {order.status === 'PACKED' && (
                              <Text type="supporting" size="xsm">
                                Sẵn sàng tạo chuyến
                              </Text>
                            )}

                            {order.status === 'DELIVERING' && (
                              <>
                                <Button
                                  label="Giao thành công"
                                  variant="primary"
                                  size="sm"
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                  onClick={() => onCompleteDelivery(order.id)}
                                />
                                <IconButton
                                  label="Đánh dấu giao thất bại"
                                  tooltip="Giao thất bại"
                                  variant="destructive"
                                  size="sm"
                                  icon={<XCircle className="w-3.5 h-3.5" />}
                                  onClick={() => onFailDelivery(order.id)}
                                />
                              </>
                            )}

                            {(order.status === 'COMPLETED' ||
                              order.status === 'FAILED') && (
                              <Text type="supporting" size="xsm">
                                Đã kết thúc
                              </Text>
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
        </div>
      </Card>
    </section>
  );
}
