import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Package, Search, Sparkles, Truck, Warehouse } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  MAX_DELIVERY_DISTANCE_KM,
  formatDateTime,
  formatVND,
  haversineDistanceKm,
  type Driver,
  type Order,
  type Store,
} from '../types/dms';

interface CreateTripModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  packedOrders: Order[];
  availableDrivers: Driver[];
  stores: Store[];
  defaultDepot: Store;
  submitting: boolean;
  initialSelectedOrderIds?: number[];
  onCreateTrip: (
    storeId: number,
    orderIds: number[],
    driverId: number | null
  ) => Promise<void>;
}

export function CreateTripModal({
  isOpen,
  onOpenChange,
  packedOrders,
  availableDrivers,
  stores,
  defaultDepot,
  submitting,
  initialSelectedOrderIds,
  onCreateTrip,
}: CreateTripModalProps) {
  const activeStores = useMemo(() => {
    const active = stores.filter((s) => s.isActive !== false);
    return active.length > 0 ? active : [defaultDepot];
  }, [stores, defaultDepot]);

  const resolvedDefaultStore = useMemo(
    () => activeStores.find((s) => s.isDefault) ?? activeStores[0] ?? defaultDepot,
    [activeStores, defaultDepot]
  );

  const [selectedStoreId, setSelectedStoreId] = useState<string>(String(resolvedDefaultStore.id));
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('AUTO');
  const [search, setSearch] = useState<string>('');

  const selectedStore = useMemo(() => {
    const id = Number(selectedStoreId);
    return activeStores.find((s) => s.id === id) ?? resolvedDefaultStore;
  }, [selectedStoreId, activeStores, resolvedDefaultStore]);

  const depotPackedOrders = useMemo(
    () => packedOrders.filter((o) => o.storeId === selectedStore.id),
    [packedOrders, selectedStore.id]
  );

  const otherDepotPackedCount = packedOrders.length - depotPackedOrders.length;

  const depotAvailableDrivers = useMemo(
    () => availableDrivers.filter((d) => d.storeId === selectedStore.id),
    [availableDrivers, selectedStore.id]
  );

  const orderDistanceMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of depotPackedOrders) {
      map.set(
        o.id,
        haversineDistanceKm(
          selectedStore.latitude,
          selectedStore.longitude,
          o.latitude,
          o.longitude
        )
      );
    }
    return map;
  }, [depotPackedOrders, selectedStore.latitude, selectedStore.longitude]);

  const eligiblePackedOrders = useMemo(
    () =>
      depotPackedOrders.filter(
        (o) => (orderDistanceMap.get(o.id) ?? Infinity) <= MAX_DELIVERY_DISTANCE_KM
      ),
    [depotPackedOrders, orderDistanceMap]
  );

  const outOfRangeCount = depotPackedOrders.length - eligiblePackedOrders.length;

  useEffect(() => {
    if (isOpen) {
      let initialStore =
        activeStores.find((s) => s.isDefault) ?? activeStores[0] ?? defaultDepot;

      if (initialSelectedOrderIds && initialSelectedOrderIds.length > 0) {
        const firstInitialOrder = packedOrders.find((o) =>
          initialSelectedOrderIds.includes(o.id)
        );
        if (firstInitialOrder) {
          const matchedStore = activeStores.find((s) => s.id === firstInitialOrder.storeId);
          if (matchedStore) {
            initialStore = matchedStore;
          }
        }
      }

      setSelectedStoreId(String(initialStore.id));

      const isEligible = (o: Order) =>
        o.storeId === initialStore.id &&
        haversineDistanceKm(
          initialStore.latitude,
          initialStore.longitude,
          o.latitude,
          o.longitude
        ) <= MAX_DELIVERY_DISTANCE_KM;

      const eligibleIds = packedOrders.filter(isEligible).map((o) => o.id);
      const eligibleSet = new Set(eligibleIds);

      if (initialSelectedOrderIds && initialSelectedOrderIds.length > 0) {
        const validInitial = initialSelectedOrderIds.filter((id) => eligibleSet.has(id));
        setSelectedOrderIds(validInitial.length > 0 ? validInitial : eligibleIds);
      } else {
        setSelectedOrderIds(eligibleIds);
      }
      setSelectedDriverId('AUTO');
      setSearch('');
    }
  }, [isOpen, packedOrders, initialSelectedOrderIds, activeStores, defaultDepot]);

  const handleStoreChange = (nextStoreId: string) => {
    setSelectedStoreId(nextStoreId);
    setSelectedDriverId('AUTO');
    const nextStore =
      activeStores.find((s) => s.id === Number(nextStoreId)) ?? resolvedDefaultStore;
    const nextEligibleIds = packedOrders
      .filter(
        (order) =>
          order.storeId === nextStore.id &&
          haversineDistanceKm(
            nextStore.latitude,
            nextStore.longitude,
            order.latitude,
            order.longitude
          ) <= MAX_DELIVERY_DISTANCE_KM
      )
      .map((o) => o.id);
    setSelectedOrderIds(nextEligibleIds);
  };

  const filteredPackedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return depotPackedOrders;
    return depotPackedOrders.filter(
      (o) =>
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.customerAddress.toLowerCase().includes(q)
    );
  }, [depotPackedOrders, search]);

  const allSelected =
    eligiblePackedOrders.length > 0 && selectedOrderIds.length === eligiblePackedOrders.length;
  const someSelected =
    selectedOrderIds.length > 0 && selectedOrderIds.length < eligiblePackedOrders.length;

  const toggleOrder = (order: Order) => {
    const dist = orderDistanceMap.get(order.id) ?? Infinity;
    if (dist > MAX_DELIVERY_DISTANCE_KM) return;
    setSelectedOrderIds((prev) =>
      prev.includes(order.id)
        ? prev.filter((item) => item !== order.id)
        : [...prev, order.id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(eligiblePackedOrders.map((o) => o.id));
    }
  };

  const selectedTotalCod = useMemo(() => {
    const selectedSet = new Set(selectedOrderIds);
    return packedOrders
      .filter((o) => selectedSet.has(o.id))
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  }, [packedOrders, selectedOrderIds]);

  const hasInvalidSelection = useMemo(
    () =>
      selectedOrderIds.some(
        (id) => (orderDistanceMap.get(id) ?? Infinity) > MAX_DELIVERY_DISTANCE_KM
      ),
    [selectedOrderIds, orderDistanceMap]
  );

  const storeOptions = useMemo(
    () =>
      activeStores.map((s) => ({
        value: String(s.id),
        label: `${s.name}${s.isDefault ? ' (Mặc định)' : ''}`,
      })),
    [activeStores]
  );

  const driverOptions = [
    {
      value: 'AUTO',
      label:
        depotAvailableDrivers.length > 0
          ? `Tự động chọn tài xế cùng depot (${depotAvailableDrivers.length} sẵn sàng)`
          : 'Tự động chọn tài xế (0 sẵn sàng tại depot này)',
    },
    ...depotAvailableDrivers.map((d) => ({
      value: String(d.id),
      label: `${d.name} • ${d.vehicleType} (${d.licensePlate})`,
    })),
  ];

  const hasNoDepotDriver = depotAvailableDrivers.length === 0;

  const handleConfirm = async () => {
    if (selectedOrderIds.length === 0 || hasInvalidSelection || hasNoDepotDriver) return;
    const driverId = selectedDriverId !== 'AUTO' ? Number(selectedDriverId) : null;
    await onCreateTrip(selectedStore.id, selectedOrderIds, driverId);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={720}
      maxHeight="88dvh"
    >
      <Layout
        header={
          <DialogHeader
            title="Tạo Chuyến Xe Mới (Google OR-Tools VRP)"
            subtitle={`Chọn điểm xuất phát, tài xế và các đơn PACKED trong bán kính ${MAX_DELIVERY_DISTANCE_KM} km`}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <div className="flex flex-col gap-4">
              {/* Departure Point & Driver Selectors */}
              <Card padding={3}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Text type="label" size="sm">
                        Điểm xuất phát (Kho / Depot)
                      </Text>
                      <Text type="supporting" size="2xs">
                        Chỉ cho phép gán các đơn hàng thuộc depot này (trong bán kính{' '}
                        {MAX_DELIVERY_DISTANCE_KM} km).
                      </Text>
                    </div>

                    <Selector
                      label="Chọn điểm xuất phát"
                      isLabelHidden
                      variant="secondary"
                      size="sm"
                      width={290}
                      startIcon={<Warehouse className="w-3.5 h-3.5" />}
                      options={storeOptions}
                      value={String(selectedStore.id)}
                      onChange={(val) => handleStoreChange(String(val))}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-border">
                    <div className="flex flex-col gap-0.5">
                      <Text type="label" size="sm">
                        Tài xế phụ trách chuyến xe
                      </Text>
                      <Text type="supporting" size="2xs">
                        Chỉ hiển thị tài xế sẵn sàng (AVAILABLE) thuộc depot &quot;{selectedStore.name}&quot;.
                      </Text>
                    </div>

                    <Selector
                      label="Chọn tài xế giao hàng"
                      isLabelHidden
                      variant="secondary"
                      size="sm"
                      width={290}
                      startIcon={<Truck className="w-3.5 h-3.5" />}
                      options={driverOptions}
                      value={selectedDriverId}
                      onChange={(val) => setSelectedDriverId(val as string)}
                    />
                  </div>
                </div>
              </Card>

              {hasNoDepotDriver && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <Text type="supporting" size="2xs">
                    Depot &quot;<strong>{selectedStore.name}</strong>&quot; hiện không có tài xế nào
                    đang sẵn sàng (AVAILABLE). Vui lòng thêm tài xế cho depot này hoặc đợi tài xế
                    hoàn thành chuyến hiện tại.
                  </Text>
                </div>
              )}

              {outOfRangeCount > 0 && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <Text type="supporting" size="2xs">
                    Có <strong>{outOfRangeCount}</strong> đơn PACKED cách &quot;
                    {selectedStore.name}&quot; hơn {MAX_DELIVERY_DISTANCE_KM} km nên không thể chọn
                    cho chuyến này. Hãy đổi sang điểm xuất phát gần hơn nếu cần giao các đơn đó.
                  </Text>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckboxInput
                    size="sm"
                    label={`Chọn tất cả đơn hợp lệ (${selectedOrderIds.length}/${eligiblePackedOrders.length})`}
                    isDisabled={eligiblePackedOrders.length === 0}
                    value={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onChange={toggleAll}
                  />
                  {selectedOrderIds.length > 0 && (
                    <Badge
                      label={`Tổng COD: ${formatVND(selectedTotalCod)}`}
                      variant="purple"
                    />
                  )}
                </div>

                <div className="w-64">
                  <TextInput
                    label="Tìm đơn PACKED"
                    isLabelHidden
                    placeholder="Tìm mã đơn, khách hàng, địa chỉ..."
                    value={search}
                    onChange={setSearch}
                    startIcon={<Search className="w-4 h-4" />}
                    size="sm"
                  />
                </div>
              </div>

              {depotPackedOrders.length === 0 ? (
                <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border bg-muted flex flex-col items-center gap-2">
                  <Package className="w-8 h-8 text-secondary" />
                  <Text type="label" size="sm">
                    Không có đơn hàng PACKED nào thuộc depot &quot;{selectedStore.name}&quot;
                  </Text>
                  <Text type="supporting" size="xsm">
                    {otherDepotPackedCount > 0
                      ? `Hiện có ${otherDepotPackedCount} đơn PACKED thuộc các depot khác. Hãy đổi điểm xuất phát ở trên để tạo chuyến cho các đơn đó.`
                      : 'Hãy sang trang Đơn hàng để nhặt hàng & đóng gói (hoặc bấm Đóng gói nhanh) trước khi tạo chuyến.'}
                  </Text>
                </div>
              ) : filteredPackedOrders.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-xl border border-border bg-muted">
                  <Text type="supporting" size="sm">
                    Không có đơn hàng PACKED nào khớp với từ khóa tìm kiếm.
                  </Text>
                </div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                  {filteredPackedOrders.map((order) => {
                    const distKm = orderDistanceMap.get(order.id) ?? 0;
                    const outOfRange = distKm > MAX_DELIVERY_DISTANCE_KM;
                    const checked = selectedOrderIds.includes(order.id);
                    return (
                      <div
                        key={order.id}
                        onClick={() => toggleOrder(order)}
                        className={`p-3 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                          outOfRange
                            ? 'border-red-500/30 bg-red-500/5 opacity-70 cursor-not-allowed'
                            : checked
                              ? 'border-accent bg-accent-muted/30 cursor-pointer'
                              : 'border-border bg-surface hover:bg-muted cursor-pointer'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className="pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CheckboxInput
                              size="sm"
                              label={`Chọn ${order.orderCode}`}
                              isLabelHidden
                              isDisabled={outOfRange}
                              value={checked}
                              onChange={() => toggleOrder(order)}
                            />
                          </div>
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Text type="label" size="sm">
                                {order.orderCode}
                              </Text>
                              <Text type="body" size="xsm">
                                {order.customerName}
                              </Text>
                              <Text type="supporting" size="2xs">
                                ({order.customerPhone})
                              </Text>
                              <Badge
                                label={
                                  outOfRange
                                    ? `Vượt ${MAX_DELIVERY_DISTANCE_KM} km (${distKm.toFixed(1)} km)`
                                    : `${distKm.toFixed(2)} km`
                                }
                                variant={outOfRange ? 'error' : 'green'}
                              />
                            </div>
                            <div className="flex items-start gap-1 text-secondary">
                              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <Text type="supporting" size="2xs">
                                {order.customerAddress}
                              </Text>
                            </div>
                            <Text type="supporting" size="2xs" hasTabularNumbers>
                              Tạo lúc: {formatDateTime(order.createdAt)}
                            </Text>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <Text type="label" size="xsm" hasTabularNumbers>
                            {formatVND(order.totalAmount)}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                label="Hủy"
                variant="secondary"
                size="sm"
                isDisabled={submitting}
                onClick={() => onOpenChange(false)}
              />
              <Button
                label={
                  submitting
                    ? 'Đang tối ưu với OR-Tools...'
                    : `Tối ưu & Tạo chuyến (${selectedOrderIds.length} đơn)`
                }
                variant="primary"
                size="sm"
                icon={<Sparkles className="w-4 h-4" />}
                isLoading={submitting}
                isDisabled={
                  selectedOrderIds.length === 0 || hasInvalidSelection || hasNoDepotDriver
                }
                onClick={() => void handleConfirm()}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
