import { useEffect, useMemo, useState } from 'react';
import { MapPin, Package, Search, Sparkles, Truck } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { formatDateTime, formatVND, type Driver, type Order } from '../types/dms';

interface CreateTripModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  packedOrders: Order[];
  availableDrivers: Driver[];
  submitting: boolean;
  onCreateTrip: (orderIds: number[], driverId: number | null) => Promise<void>;
}

export function CreateTripModal({
  isOpen,
  onOpenChange,
  packedOrders,
  availableDrivers,
  submitting,
  onCreateTrip,
}: CreateTripModalProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('AUTO');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedOrderIds(packedOrders.map((o) => o.id));
      setSelectedDriverId('AUTO');
      setSearch('');
    }
  }, [isOpen, packedOrders]);

  const filteredPackedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packedOrders;
    return packedOrders.filter(
      (o) =>
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.customerAddress.toLowerCase().includes(q)
    );
  }, [packedOrders, search]);

  const allSelected =
    packedOrders.length > 0 && selectedOrderIds.length === packedOrders.length;
  const someSelected =
    selectedOrderIds.length > 0 && selectedOrderIds.length < packedOrders.length;

  const toggleOrder = (id: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(packedOrders.map((o) => o.id));
    }
  };

  const selectedTotalCod = useMemo(() => {
    const selectedSet = new Set(selectedOrderIds);
    return packedOrders
      .filter((o) => selectedSet.has(o.id))
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  }, [packedOrders, selectedOrderIds]);

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

  const handleConfirm = async () => {
    if (selectedOrderIds.length === 0) return;
    const driverId = selectedDriverId !== 'AUTO' ? Number(selectedDriverId) : null;
    await onCreateTrip(selectedOrderIds, driverId);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={680}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title="Tạo Chuyến Xe Mới (Google OR-Tools VRP)"
            subtitle="Chọn các đơn hàng đã đóng gói (PACKED) và tài xế để hệ thống tối ưu thứ tự điểm giao"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
          <div className="flex flex-col gap-4">
            <Card padding={3}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <Text type="label" size="sm">
                    Tài xế phụ trách chuyến xe
                  </Text>
                  <Text type="supporting" size="2xs">
                    Để &quot;Tự động&quot; hệ thống sẽ chọn tài xế đang sẵn sàng (AVAILABLE).
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
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckboxInput
                  size="sm"
                  label={`Chọn tất cả đơn PACKED (${selectedOrderIds.length}/${packedOrders.length})`}
                  isDisabled={packedOrders.length === 0}
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

            {packedOrders.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border bg-muted flex flex-col items-center gap-2">
                <Package className="w-8 h-8 text-secondary" />
                <Text type="label" size="sm">
                  Hiện chưa có đơn hàng nào ở trạng thái PACKED
                </Text>
                <Text type="supporting" size="xsm">
                  Hãy sang trang Đơn hàng để nhặt hàng &amp; đóng gói (hoặc bấm Đóng gói nhanh) trước khi tạo chuyến.
                </Text>
              </div>
            ) : filteredPackedOrders.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl border border-border bg-muted">
                <Text type="supporting" size="sm">
                  Không có đơn hàng PACKED nào khớp với từ khóa tìm kiếm.
                </Text>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                {filteredPackedOrders.map((order) => {
                  const checked = selectedOrderIds.includes(order.id);
                  return (
                    <div
                      key={order.id}
                      onClick={() => toggleOrder(order.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                        checked
                          ? 'border-accent bg-accent-muted/30'
                          : 'border-border bg-surface hover:bg-muted'
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
                            value={checked}
                            onChange={() => toggleOrder(order.id)}
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
                isDisabled={selectedOrderIds.length === 0}
                onClick={() => void handleConfirm()}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
