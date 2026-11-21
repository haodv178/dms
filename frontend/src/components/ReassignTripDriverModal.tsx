import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Truck } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DRIVER_STATUS_CONFIG, type Driver, type Trip } from '../types/dms';

interface ReassignTripDriverModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip | null;
  drivers: Driver[];
  submitting: boolean;
  onConfirm: (tripId: number, driverId: number) => Promise<void>;
}

export function ReassignTripDriverModal({
  isOpen,
  onOpenChange,
  trip,
  drivers,
  submitting,
  onConfirm,
}: ReassignTripDriverModalProps) {
  const [search, setSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const currentDriverId = trip?.driverId ?? trip?.driver?.id ?? null;

  useEffect(() => {
    if (isOpen && trip) {
      setSearch('');
      setSelectedDriverId(currentDriverId);
    }
  }, [isOpen, trip, currentDriverId]);

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter((d) => {
        if (!d.isActive || d.status === 'OFFLINE') return false;
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          d.phone.toLowerCase().includes(q) ||
          d.licensePlate.toLowerCase().includes(q) ||
          d.vehicleType.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'AVAILABLE' ? -1 : 1;
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [drivers, search]);

  const canConfirm = Boolean(
    trip && selectedDriverId !== null && selectedDriverId !== currentDriverId
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={540}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={trip ? `Đổi Tài Xế Chuyến ${trip.tripCode}` : 'Đổi Tài Xế Chuyến Xe'}
            subtitle="Chọn một tài xế đang hoạt động để chuyển toàn bộ chuyến xe này"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
          <div className="flex flex-col gap-3">
            <TextInput
              label="Tìm kiếm tài xế"
              isLabelHidden
              placeholder="Tìm tên tài xế, SĐT, biển số..."
              value={search}
              onChange={setSearch}
              startIcon={<Search className="w-4 h-4" />}
              size="sm"
            />

            {filteredDrivers.length === 0 ? (
              <div className="py-8 text-center rounded-xl border border-border bg-muted">
                <Text type="supporting" size="sm">
                  Không có tài xế nào phù hợp.
                </Text>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                {filteredDrivers.map((driver) => {
                  const isSelected = selectedDriverId === driver.id;
                  const isCurrent = currentDriverId === driver.id;
                  const statusMeta = DRIVER_STATUS_CONFIG[driver.status];

                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => setSelectedDriverId(driver.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-accent bg-accent-muted/30'
                          : 'border-border bg-surface hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4 text-accent" />
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Text type="label" size="sm">
                              {driver.name}
                            </Text>
                            {isCurrent && (
                              <Badge label="Hiện tại" variant="neutral" />
                            )}
                          </div>
                          <Text type="supporting" size="2xs">
                            {driver.phone} • {driver.vehicleType} ({driver.licensePlate})
                          </Text>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          label={statusMeta.shortLabel}
                          variant={statusMeta.badgeVariant}
                        />
                        {isSelected && <Check className="w-4 h-4 text-accent" />}
                      </div>
                    </button>
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
                label="Xác nhận đổi tài xế"
                variant="primary"
                size="sm"
                isLoading={submitting}
                isDisabled={!canConfirm}
                onClick={() => {
                  if (trip && selectedDriverId) {
                    void onConfirm(trip.id, selectedDriverId);
                  }
                }}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
