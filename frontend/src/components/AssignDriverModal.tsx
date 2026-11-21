import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, Search, Truck, UserMinus, Warehouse } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  DRIVER_STATUS_CONFIG,
  STATUS_CONFIG,
  formatVND,
  type Driver,
  type Order,
} from '../types/dms';

interface AssignDriverModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  drivers: Driver[];
  submitting: boolean;
  onAssign: (orderId: number, driverId: number) => void;
  onUnassign: (orderId: number) => void;
}

export function AssignDriverModal({
  isOpen,
  onOpenChange,
  order,
  drivers,
  submitting,
  onAssign,
  onUnassign,
}: AssignDriverModalProps) {
  const [search, setSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const currentDriverId = order?.trip?.driverId ?? order?.trip?.driver?.id ?? null;
  const currentDriverName = order?.trip?.driver?.name ?? null;
  const isDelivering = order?.status === 'DELIVERING';
  const isRetry = order?.status === 'FAILED';

  useEffect(() => {
    if (isOpen && order) {
      setSearch('');
      setSelectedDriverId(currentDriverId);
    }
  }, [isOpen, order, currentDriverId]);

  const sortedAndFilteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const orderStoreId = order?.storeId ?? null;
    const eligible = drivers.filter((driver) => {
      if (!driver.isActive || driver.status === 'OFFLINE') return false;
      if (orderStoreId !== null && driver.storeId !== orderStoreId) return false;
      if (!query) return true;
      return (
        driver.name.toLowerCase().includes(query) ||
        driver.phone.toLowerCase().includes(query) ||
        driver.licensePlate.toLowerCase().includes(query) ||
        driver.vehicleType.toLowerCase().includes(query)
      );
    });

    return [...eligible].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'AVAILABLE' ? -1 : 1;
      }
      const aOrders = a.activeTrip?.ordersCount ?? 0;
      const bOrders = b.activeTrip?.ordersCount ?? 0;
      if (aOrders !== bOrders) return aOrders - bOrders;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [drivers, search, order?.storeId]);

  const statusMeta = order ? STATUS_CONFIG[order.status] : null;
  const isSameActiveDriver =
    isDelivering && currentDriverId !== null && selectedDriverId === currentDriverId;
  const canConfirm = Boolean(order && selectedDriverId !== null && !isSameActiveDriver);

  const modalTitle = !order
    ? 'Gán Tài Xế Cho Đơn Hàng'
    : isRetry
      ? `Gán Tài Xế Giao Lại (${order.orderCode})`
      : isDelivering && currentDriverName
        ? `Đổi Tài Xế Đơn Hàng (${order.orderCode})`
        : `Gán Tài Xế Cho Đơn (${order.orderCode})`;

  const modalSubtitle = isRetry
    ? 'Chọn tài xế đang hoạt động để giao lại đơn hàng thất bại này'
    : isDelivering
      ? 'Chọn tài xế khác để chuyển đơn hoặc bỏ gán để đưa đơn về trạng thái PACKED'
      : 'Chọn tài xế sẵn sàng hoặc đang giao để ghép vào chuyến và chuyển đơn sang DELIVERING';

  const confirmLabel = isRetry
    ? 'Xác nhận giao lại'
    : isDelivering && currentDriverName
      ? 'Đổi tài xế'
      : 'Gán tài xế';

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={560}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={modalTitle}
            subtitle={modalSubtitle}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            {order && (
              <Stack direction="vertical" gap={3}>
                {/* Order Summary */}
                <Card padding={3}>
                  <Stack direction="vertical" gap={1.5}>
                    <Stack direction="horizontal" justify="between" align="center" gap={2} wrap="wrap">
                      <Stack direction="horizontal" align="center" gap={2}>
                        <Text type="label" size="sm">
                          {order.orderCode}
                        </Text>
                        {statusMeta && (
                          <Badge label={statusMeta.shortLabel} variant={statusMeta.badgeVariant} />
                        )}
                      </Stack>
                      <Text type="label" size="sm" hasTabularNumbers>
                        {formatVND(order.totalAmount)}
                      </Text>
                    </Stack>

                    <Text type="body" size="xsm">
                      {order.customerName} ({order.customerPhone})
                    </Text>

                    <Stack direction="horizontal" align="center" gap={1.5}>
                      <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" />
                      <Text type="supporting" size="xsm" maxLines={2}>
                        {order.customerAddress}
                      </Text>
                    </Stack>

                    {order.store && (
                      <Stack direction="horizontal" align="center" gap={1.5}>
                        <Warehouse className="w-3.5 h-3.5 text-accent shrink-0" />
                        <Text type="supporting" size="xsm">
                          Depot:{' '}
                          <Text type="label" size="xsm" color="primary">
                            {order.store.name}
                          </Text>
                          {order.store.code ? ` (${order.store.code})` : ''}
                        </Text>
                      </Stack>
                    )}

                    {currentDriverName && (
                      <Stack direction="horizontal" align="center" gap={1.5}>
                        <Truck className="w-3.5 h-3.5 text-accent shrink-0" />
                        <Text type="supporting" size="xsm">
                          Tài xế hiện tại:{' '}
                          <Text type="label" size="xsm" color="primary">
                            {currentDriverName}
                          </Text>
                          {order.trip?.tripCode ? ` (${order.trip.tripCode})` : ''}
                        </Text>
                      </Stack>
                    )}
                  </Stack>
                </Card>

                {/* Search */}
                <TextInput
                  label="Tìm tài xế"
                  isLabelHidden
                  size="sm"
                  width="100%"
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  value={search}
                  onChange={setSearch}
                  placeholder="Tìm theo tên, số điện thoại, biển số hoặc loại xe..."
                />

                {/* Eligible Driver List */}
                <Stack
                  direction="vertical"
                  isScrollable
                  className="max-h-72 border border-border rounded-lg"
                >
                  {sortedAndFilteredDrivers.length === 0 ? (
                    <Stack
                      direction="vertical"
                      align="center"
                      justify="center"
                      padding={6}
                      gap={1}
                    >
                      <Text type="label" size="sm">
                        Không tìm thấy tài xế phù hợp
                      </Text>
                      <Text type="supporting" size="xsm">
                        Chỉ hiển thị tài xế thuộc depot{' '}
                        {order.store?.name ? `"${order.store.name}"` : 'của đơn hàng'} đang hoạt
                        động ở trạng thái Sẵn sàng hoặc Đang giao.
                      </Text>
                    </Stack>
                  ) : (
                    <List
                      density="compact"
                      hasDividers
                      aria-label="Danh sách tài xế đủ điều kiện"
                    >
                      {sortedAndFilteredDrivers.map((driver) => {
                        const isSelected = selectedDriverId === driver.id;
                        const isCurrent = currentDriverId === driver.id && isDelivering;
                        const driverStatusMeta = DRIVER_STATUS_CONFIG[driver.status];
                        const activeOrdersCount = driver.activeTrip?.ordersCount ?? 0;

                        const badgeLabel =
                          driver.status === 'ON_DELIVERY' && activeOrdersCount > 0
                            ? `${driverStatusMeta.shortLabel} (${activeOrdersCount} đơn)`
                            : driverStatusMeta.shortLabel;

                        return (
                          <ListItem
                            key={driver.id}
                            itemKey={driver.id}
                            isSelected={isSelected}
                            onClick={() => setSelectedDriverId(driver.id)}
                            startContent={
                              <Truck
                                className={
                                  isSelected
                                    ? 'w-4 h-4 text-accent shrink-0'
                                    : 'w-4 h-4 text-secondary shrink-0'
                                }
                              />
                            }
                            label={
                              isCurrent ? `${driver.name} (Hiện tại)` : driver.name
                            }
                            description={`${driver.vehicleType} • ${driver.licensePlate} • ${driver.phone}${
                              driver.activeTrip ? ` • ${driver.activeTrip.tripCode}` : ''
                            }`}
                            endContent={
                              <Stack direction="horizontal" align="center" gap={2}>
                                <Badge
                                  label={badgeLabel}
                                  variant={driverStatusMeta.badgeVariant}
                                />
                                {isSelected && (
                                  <Check className="w-4 h-4 text-accent shrink-0" />
                                )}
                              </Stack>
                            }
                          />
                        );
                      })}
                    </List>
                  )}
                </Stack>
              </Stack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Stack direction="horizontal" justify="between" align="center" gap={2} width="100%">
              <Stack direction="horizontal" align="center" gap={2}>
                {order && isDelivering && currentDriverId !== null && (
                  <Button
                    label="Bỏ gán tài xế"
                    type="button"
                    variant="destructive"
                    size="sm"
                    icon={<UserMinus className="w-3.5 h-3.5" />}
                    isLoading={submitting}
                    onClick={() => onUnassign(order.id)}
                  />
                )}
              </Stack>

              <Stack direction="horizontal" align="center" gap={2}>
                <Button
                  label="Hủy"
                  type="button"
                  variant="secondary"
                  size="sm"
                  isDisabled={submitting}
                  onClick={() => onOpenChange(false)}
                />
                <Button
                  label={confirmLabel}
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={submitting}
                  isDisabled={!canConfirm}
                  onClick={() => {
                    if (order && selectedDriverId !== null) {
                      onAssign(order.id, selectedDriverId);
                    }
                  }}
                />
              </Stack>
            </Stack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
