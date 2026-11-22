import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Package, Search, Truck, Warehouse } from 'lucide-react';
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
  formatVND,
  getOrderCodAmount,
  type Driver,
  type Order,
} from '../types/dms';

interface BulkAssignDriverModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  skippedCount?: number;
  drivers: Driver[];
  submitting: boolean;
  onConfirm: (orderIds: number[], driverId: number) => void;
}

export function BulkAssignDriverModal({
  isOpen,
  onOpenChange,
  orders,
  skippedCount = 0,
  drivers,
  submitting,
  onConfirm,
}: BulkAssignDriverModalProps) {
  const [search, setSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedDriverId(null);
    }
  }, [isOpen]);

  const depotBreakdown = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>();
    for (const o of orders) {
      const existing = map.get(o.storeId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(o.storeId, {
          id: o.storeId,
          name: o.store?.name || `Depot #${o.storeId}`,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [orders]);

  const singleDepot = depotBreakdown.length === 1 ? depotBreakdown[0] : null;
  const isMultiDepot = depotBreakdown.length > 1;
  const orderStoreIdSet = useMemo(
    () => new Set(depotBreakdown.map((d) => d.id)),
    [depotBreakdown]
  );

  const sortedAndFilteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const eligible = drivers.filter((driver) => {
      if (!driver.isActive || driver.status === 'OFFLINE') return false;
      if (driver.storeId === null || !orderStoreIdSet.has(driver.storeId)) return false;
      if (!query) return true;
      return (
        driver.name.toLowerCase().includes(query) ||
        driver.phone.toLowerCase().includes(query) ||
        driver.licensePlate.toLowerCase().includes(query) ||
        driver.vehicleType.toLowerCase().includes(query) ||
        (driver.store?.name?.toLowerCase().includes(query) ?? false)
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
  }, [drivers, search, orderStoreIdSet]);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId]
  );

  const matchingOrdersCount = useMemo(() => {
    if (!selectedDriver || selectedDriver.storeId === null) return orders.length;
    return orders.filter((o) => o.storeId === selectedDriver.storeId).length;
  }, [orders, selectedDriver]);

  const skippedByDepotCount = selectedDriver ? orders.length - matchingOrdersCount : 0;

  const totalCod = useMemo(
    () => orders.reduce((sum, o) => sum + getOrderCodAmount(o), 0),
    [orders]
  );

  const previewCodes = useMemo(() => {
    const codes = orders.slice(0, 6).map((o) => o.orderCode);
    const remaining = orders.length - codes.length;
    return remaining > 0 ? `${codes.join(', ')} và ${remaining} đơn khác` : codes.join(', ');
  }, [orders]);

  const canConfirm = orders.length > 0 && selectedDriverId !== null && matchingOrdersCount > 0;

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
            title={`Gán Tài Xế Hàng Loạt (${orders.length} đơn)`}
            subtitle="Các đơn đủ điều kiện sẽ được ghép vào chuyến hiện tại của tài xế hoặc tạo 1 chuyến mới"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <Stack direction="vertical" gap={3}>
              {/* Batch Summary */}
              <Card padding={3}>
                <Stack direction="vertical" gap={1.5}>
                  <Stack
                    direction="horizontal"
                    justify="between"
                    align="center"
                    gap={2}
                    wrap="wrap"
                  >
                    <Stack direction="horizontal" align="center" gap={1.5}>
                      <Package className="w-4 h-4 text-accent shrink-0" />
                      <Text type="label" size="sm">
                        {orders.length} đơn hàng đủ điều kiện
                      </Text>
                      {skippedCount > 0 && (
                        <Badge
                          label={`Bỏ qua ${skippedCount} đơn`}
                          variant="neutral"
                        />
                      )}
                    </Stack>
                    <Text type="label" size="sm" hasTabularNumbers>
                      Tổng COD: {formatVND(totalCod)}
                    </Text>
                  </Stack>

                  {orders.length > 0 && (
                    <Text type="supporting" size="xsm" maxLines={2}>
                      Mã đơn: {previewCodes}
                    </Text>
                  )}

                  {singleDepot && (
                    <Stack direction="horizontal" align="center" gap={1.5}>
                      <Warehouse className="w-3.5 h-3.5 text-accent shrink-0" />
                      <Text type="supporting" size="xsm">
                        Depot:{' '}
                        <Text type="label" size="xsm" color="primary">
                          {singleDepot.name}
                        </Text>
                      </Text>
                    </Stack>
                  )}
                </Stack>
              </Card>

              {isMultiDepot && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <Text type="supporting" size="2xs">
                    Các đơn đã chọn thuộc {depotBreakdown.length} depot khác nhau (
                    {depotBreakdown.map((d) => `${d.name}: ${d.count} đơn`).join(', ')}). Tài xế
                    chỉ nhận các đơn cùng depot;{' '}
                    {selectedDriver ? (
                      <strong>
                        sẽ gán {matchingOrdersCount}/{orders.length} đơn và bỏ qua{' '}
                        {skippedByDepotCount} đơn khác depot.
                      </strong>
                    ) : (
                      'các đơn khác depot sẽ tự động bị bỏ qua.'
                    )}
                  </Text>
                </div>
              )}

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
                      {singleDepot
                        ? `Chỉ hiển thị tài xế thuộc depot "${singleDepot.name}" đang hoạt động ở trạng thái Sẵn sàng hoặc Đang giao.`
                        : 'Chỉ hiển thị tài xế thuộc các depot của đơn hàng đã chọn đang hoạt động ở trạng thái Sẵn sàng hoặc Đang giao.'}
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
                      const driverStatusMeta = DRIVER_STATUS_CONFIG[driver.status];
                      const activeOrdersCount = driver.activeTrip?.ordersCount ?? 0;

                      const badgeLabel =
                        driver.status === 'ON_DELIVERY' && activeOrdersCount > 0
                          ? `${driverStatusMeta.shortLabel} (${activeOrdersCount} đơn)`
                          : driverStatusMeta.shortLabel;

                      const driverDepotCount =
                        driver.storeId !== null
                          ? depotBreakdown.find((d) => d.id === driver.storeId)?.count ?? 0
                          : 0;
                      const depotSuffix = isMultiDepot
                        ? ` • ${driver.store?.name || `Depot #${driver.storeId}`} (${driverDepotCount}/${orders.length} đơn)`
                        : '';

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
                          label={driver.name}
                          description={`${driver.vehicleType} • ${driver.licensePlate} • ${driver.phone}${
                            driver.activeTrip ? ` • ${driver.activeTrip.tripCode}` : ''
                          }${depotSuffix}`}
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
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Stack direction="horizontal" justify="end" align="center" gap={2} width="100%">
              <Button
                label="Hủy"
                type="button"
                variant="secondary"
                size="sm"
                isDisabled={submitting}
                onClick={() => onOpenChange(false)}
              />
              <Button
                label={`Gán tài xế (${selectedDriver ? matchingOrdersCount : orders.length} đơn)`}
                type="button"
                variant="primary"
                size="sm"
                isLoading={submitting}
                isDisabled={!canConfirm}
                onClick={() => {
                  if (canConfirm && selectedDriverId !== null) {
                    onConfirm(
                      orders.map((o) => o.id),
                      selectedDriverId
                    );
                  }
                }}
              />
            </Stack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
