import {
  CheckCircle2,
  Layers,
  MapPin,
  Navigation,
  Package,
  Pencil,
  ShoppingBag,
  Sparkles,
  Truck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
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
import {
  STATUS_CONFIG,
  STATUS_TABS,
  canRoleAssignDriver,
  canRoleEditOrders,
  formatVND,
  isOrderAssignable,
  isOrderEditable,
  type Driver,
  type Order,
  type Role,
} from '../types/dms';

interface OrderTableProps {
  role: Role;
  filteredOrders: Order[];
  packedOrdersCount: number;
  counts: Record<string, number>;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  selectedOrderIds: number[];
  onToggleSelectOrder: (id: number) => void;
  onToggleSelectAllPacked: () => void;
  availableDrivers: Driver[];
  selectedDriverId: string;
  onSelectedDriverIdChange: (driverId: string) => void;
  loading: boolean;
  optimizing: boolean;
  onBatchPreparePacked: () => void;
  onOptimizeRoute: () => void;
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
  packedOrdersCount,
  counts,
  statusFilter,
  onStatusFilterChange,
  selectedOrderIds,
  onToggleSelectOrder,
  onToggleSelectAllPacked,
  availableDrivers,
  selectedDriverId,
  onSelectedDriverIdChange,
  loading,
  optimizing,
  onBatchPreparePacked,
  onOptimizeRoute,
  onEditOrder,
  onOpenAssignDriver,
  onStartPicking,
  onCompletePacking,
  onCompleteDelivery,
  onFailDelivery,
}: OrderTableProps) {
  const newAndPickingCount = (counts.NEW ?? 0) + (counts.PICKING ?? 0);
  const allPackedSelected =
    packedOrdersCount > 0 && selectedOrderIds.length === packedOrdersCount;
  const somePackedSelected =
    selectedOrderIds.length > 0 && selectedOrderIds.length < packedOrdersCount;

  const driverOptions = [
    {
      value: 'AUTO',
      label:
        availableDrivers.length > 0
          ? `Tự động chọn tài xế (${availableDrivers.length} sẵn sàng)`
          : 'Tự động chọn tài xế',
    },
    ...availableDrivers.map((d) => ({
      value: String(d.id),
      label: `${d.name} • ${d.vehicleType} (${d.licensePlate})`,
    })),
  ];

  return (
    <section className="lg:col-span-7 flex flex-col gap-4">
      {/* Action Banner for OR-Tools & Quick Warehouse Prep */}
      <Card padding={4}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <Heading level={4} accessibilityLevel={2}>
                Bảng Điều Phối &amp; Quản Lý Vòng Đời Đơn Hàng
              </Heading>
            </div>
            <Text type="supporting" size="xsm">
              Đã chọn{' '}
              <Text type="label" size="xsm" color="accent" hasTabularNumbers>
                {selectedOrderIds.length}
              </Text>{' '}
              /{' '}
              <Text type="label" size="xsm" color="primary" hasTabularNumbers>
                {packedOrdersCount}
              </Text>{' '}
              đơn hàng{' '}
              <Text type="code" size="xsm">
                PACKED
              </Text>{' '}
              sẵn sàng tối ưu lộ trình.
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {newAndPickingCount > 0 && (
              <Button
                label={`Đóng gói nhanh (${newAndPickingCount} đơn)`}
                variant="secondary"
                size="sm"
                icon={<Package className="w-3.5 h-3.5" />}
                isLoading={loading}
                tooltip="Tự động Nhặt & Đóng gói toàn bộ đơn NEW/PICKING để test nhanh OR-Tools"
                onClick={onBatchPreparePacked}
              />
            )}

            <Selector
              label="Chọn tài xế giao hàng"
              isLabelHidden
              variant="secondary"
              size="sm"
              width={250}
              startIcon={<Truck className="w-3.5 h-3.5" />}
              options={driverOptions}
              value={selectedDriverId}
              onChange={(val) => onSelectedDriverIdChange(val as string)}
            />

            <Button
              label={
                optimizing
                  ? 'Đang giải VRP với OR-Tools...'
                  : `Tối ưu hóa lộ trình với Google OR-Tools (${
                      selectedOrderIds.length > 0 ? selectedOrderIds.length : packedOrdersCount
                    })`
              }
              variant="primary"
              size="sm"
              icon={<Sparkles className="w-4 h-4" />}
              isLoading={optimizing}
              isDisabled={packedOrdersCount === 0}
              onClick={onOptimizeRoute}
            />
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

            {packedOrdersCount > 0 && (
              <div className="py-1.5">
                <CheckboxInput
                  size="sm"
                  label={`Chọn tất cả PACKED (${packedOrdersCount})`}
                  value={
                    allPackedSelected
                      ? true
                      : somePackedSelected
                        ? 'indeterminate'
                        : false
                  }
                  onChange={onToggleSelectAllPacked}
                />
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Không có đơn hàng nào trong trạng thái này. Hãy bấm{' '}
                  <Text type="label" size="sm" color="primary">
                    &quot;Seed 10 Sample Orders&quot;
                  </Text>{' '}
                  trên thanh công cụ.
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Chọn</TableHeaderCell>
                    <TableHeaderCell>Mã Đơn / Thứ Tự</TableHeaderCell>
                    <TableHeaderCell>Khách Hàng &amp; Địa Chỉ</TableHeaderCell>
                    <TableHeaderCell>Tổng Tiền</TableHeaderCell>
                    <TableHeaderCell>Trạng Thái</TableHeaderCell>
                    <TableHeaderCell>Tài Xế</TableHeaderCell>
                    <TableHeaderCell>Thao Tác ({role})</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const isPacked = order.status === 'PACKED';
                    const isChecked = selectedOrderIds.includes(order.id);
                    const statusMeta = STATUS_CONFIG[order.status];

                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <CheckboxInput
                            size="sm"
                            label={`Chọn đơn ${order.orderCode}`}
                            isLabelHidden
                            isDisabled={!isPacked}
                            disabledMessage={
                              !isPacked
                                ? 'Chỉ có thể chọn đơn ở trạng thái PACKED để tối ưu lộ trình'
                                : undefined
                            }
                            value={isChecked}
                            onChange={() => onToggleSelectOrder(order.id)}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1 whitespace-nowrap">
                            <Text type="label" size="sm">
                              {order.orderCode}
                            </Text>
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
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5 max-w-xs">
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
                          {(() => {
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
                            );
                          })()}
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
                              <Button
                                label={
                                  isChecked ? 'Đã chọn điều phối' : 'Chọn vào chuyến'
                                }
                                variant={isChecked ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => onToggleSelectOrder(order.id)}
                              />
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
