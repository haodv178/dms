import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Navigation,
  Play,
  Plus,
  Route as RouteIcon,
  Search,
  Sparkles,
  Trash2,
  Truck,
  UserCog,
  XCircle,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CreateTripModal } from './CreateTripModal';
import { ReassignTripDriverModal } from './ReassignTripDriverModal';
import { RouteMap } from './RouteMap';
import {
  STATUS_CONFIG,
  TRIP_STATUS_CONFIG,
  TRIP_STATUS_TABS,
  canRoleCreateTrips,
  canRoleManageTrips,
  canRoleStartTrip,
  canRoleUpdateStopDelivery,
  formatDateTime,
  formatVND,
  type Driver,
  type Order,
  type Role,
  type Store,
  type Trip,
  type TripStatus,
} from '../types/dms';

interface TripManagementPageProps {
  role: Role;
  depot: Store;
  trips: Trip[];
  packedOrders: Order[];
  availableDrivers: Driver[];
  assignableDrivers: Driver[];
  isDarkMode: boolean;
  optimizing: boolean;
  onCreateTrip: (orderIds: number[], driverId: number | null) => Promise<Trip | null>;
  onStartTrip: (tripId: number) => Promise<void>;
  onReassignTripDriver: (tripId: number, driverId: number) => Promise<void>;
  onReoptimizeTrip: (tripId: number) => Promise<void>;
  onCancelTrip: (tripId: number) => Promise<void>;
  onCompleteDelivery: (orderId: number) => Promise<void>;
  onFailDelivery: (orderId: number) => Promise<void>;
}

function getTripStatusMeta(status: string) {
  return (
    TRIP_STATUS_CONFIG[status as TripStatus] ?? {
      label: status,
      shortLabel: status,
      badgeVariant: 'neutral' as const,
    }
  );
}

export function TripManagementPage({
  role,
  depot,
  trips,
  packedOrders,
  availableDrivers,
  assignableDrivers,
  isDarkMode,
  optimizing,
  onCreateTrip,
  onStartTrip,
  onReassignTripDriver,
  onReoptimizeTrip,
  onCancelTrip,
  onCompleteDelivery,
  onFailDelivery,
}: TripManagementPageProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [reassigningTrip, setReassigningTrip] = useState<Trip | null>(null);
  const [cancellingTrip, setCancellingTrip] = useState<Trip | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: trips.length,
      ASSIGNED: 0,
      IN_TRANSIT: 0,
      COMPLETED: 0,
    };
    for (const t of trips) {
      map[t.status] = (map[t.status] || 0) + 1;
    }
    return map;
  }, [trips]);

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips.filter((trip) => {
      if (statusFilter !== 'ALL' && trip.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const driverName = trip.driver?.name?.toLowerCase() ?? '';
      const plate = trip.driver?.driverProfile?.licensePlate?.toLowerCase() ?? '';
      const hasMatchingOrder = (trip.orders ?? []).some(
        (o) =>
          o.orderCode.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q)
      );
      return (
        trip.tripCode.toLowerCase().includes(q) ||
        driverName.includes(q) ||
        plate.includes(q) ||
        hasMatchingOrder
      );
    });
  }, [trips, statusFilter, searchQuery]);

  // Keep selectedTripId pointing to a valid trip in filteredTrips (or first trip)
  useEffect(() => {
    if (filteredTrips.length === 0) {
      setSelectedTripId(null);
      return;
    }
    if (selectedTripId === null || !filteredTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(filteredTrips[0].id);
    }
  }, [filteredTrips, selectedTripId]);

  const selectedTrip = useMemo(
    () => filteredTrips.find((t) => t.id === selectedTripId) ?? null,
    [filteredTrips, selectedTripId]
  );

  const selectedTripDepot = selectedTrip?.store ?? depot;

  const routedOrders = useMemo(() => {
    if (!selectedTrip?.orders || selectedTrip.orders.length === 0) return [];
    return [...selectedTrip.orders].sort(
      (a, b) => (a.deliverySequence ?? 999) - (b.deliverySequence ?? 999)
    );
  }, [selectedTrip]);

  const polylinePositions = useMemo<[number, number][]>(() => {
    if (routedOrders.length === 0) return [];
    return [
      [selectedTripDepot.latitude, selectedTripDepot.longitude],
      ...routedOrders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [selectedTripDepot, routedOrders]);

  const allMapPoints = useMemo<[number, number][]>(() => {
    return [
      [selectedTripDepot.latitude, selectedTripDepot.longitude],
      ...routedOrders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [selectedTripDepot, routedOrders]);

  const deliveringStopsCount = routedOrders.filter((o) => o.status === 'DELIVERING').length;

  const canCreate = canRoleCreateTrips(role);
  const canManage = canRoleManageTrips(role);
  const canStart = canRoleStartTrip(role);
  const canUpdateStop = canRoleUpdateStopDelivery(role);

  const handleCreateTripSubmit = async (orderIds: number[], driverId: number | null) => {
    const created = await onCreateTrip(orderIds, driverId);
    if (created) {
      setShowCreateModal(false);
      setStatusFilter('ALL');
      setSelectedTripId(created.id);
    }
  };

  const handleStartSelectedTrip = async (tripId: number) => {
    setBusyAction('start');
    try {
      await onStartTrip(tripId);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReassignSubmit = async (tripId: number, driverId: number) => {
    setBusyAction('reassign');
    try {
      await onReassignTripDriver(tripId, driverId);
      setReassigningTrip(null);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReoptimizeSelectedTrip = async (tripId: number) => {
    setBusyAction('reoptimize');
    try {
      await onReoptimizeTrip(tripId);
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmCancelTrip = async () => {
    if (!cancellingTrip) return;
    setBusyAction('cancel');
    try {
      await onCancelTrip(cancellingTrip.id);
      setCancellingTrip(null);
    } finally {
      setBusyAction(null);
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
                Tổng chuyến xe
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {counts.ALL}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-accent">
              <RouteIcon className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Chờ xuất phát (ASSIGNED)
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {counts.ASSIGNED}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-accent">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đang giao hàng (IN_TRANSIT)
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {counts.IN_TRANSIT}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-accent">
              <Truck className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Hoàn thành (COMPLETED)
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {counts.COMPLETED}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-success">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Master-Detail Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Trip List */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <Card padding={4}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="w-4 h-4 text-accent" />
                    <Heading level={4} accessibilityLevel={2}>
                      Danh Sách Chuyến Xe
                    </Heading>
                  </div>
                  <Text type="supporting" size="2xs">
                    {packedOrders.length > 0
                      ? `Có ${packedOrders.length} đơn PACKED sẵn sàng điều phối.`
                      : 'Chưa có đơn PACKED mới để tạo chuyến.'}
                  </Text>
                </div>

                {canCreate && (
                  <Button
                    label={`Tạo chuyến mới (${packedOrders.length})`}
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowCreateModal(true)}
                  />
                )}
              </div>

              <TextInput
                label="Tìm kiếm chuyến xe"
                isLabelHidden
                placeholder="Tìm mã chuyến, tài xế, biển số, mã đơn..."
                value={searchQuery}
                onChange={setSearchQuery}
                startIcon={<Search className="w-4 h-4" />}
                size="sm"
              />
            </div>
          </Card>

          <Card padding={0}>
            <div className="px-3 pt-2 border-b border-border">
              <TabList
                value={statusFilter}
                onChange={setStatusFilter}
                size="sm"
                aria-label="Lọc chuyến xe theo trạng thái"
              >
                {TRIP_STATUS_TABS.map((tab) => (
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

            <div className="p-3 space-y-2.5 max-h-[680px] overflow-y-auto">
              {filteredTrips.length === 0 ? (
                <div className="py-12 px-4 text-center flex flex-col items-center gap-2">
                  <RouteIcon className="w-8 h-8 text-secondary" />
                  <Text type="label" size="sm">
                    Chưa có chuyến xe nào
                  </Text>
                  <Text type="supporting" size="xsm">
                    {searchQuery.trim()
                      ? 'Không tìm thấy chuyến xe khớp với bộ lọc hiện tại.'
                      : 'Bấm "Tạo chuyến mới" để tối ưu lộ trình từ các đơn PACKED bằng Google OR-Tools.'}
                  </Text>
                </div>
              ) : (
                filteredTrips.map((trip) => {
                  const isSelected = trip.id === selectedTrip?.id;
                  const statusMeta = getTripStatusMeta(trip.status);
                  const tripOrders = trip.orders ?? [];
                  const doneCount = tripOrders.filter(
                    (o) => o.status === 'COMPLETED' || o.status === 'FAILED'
                  ).length;

                  return (
                    <button
                      key={trip.id}
                      type="button"
                      onClick={() => setSelectedTripId(trip.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors flex flex-col gap-2 ${
                        isSelected
                          ? 'border-accent bg-accent-muted/30 shadow-xs'
                          : 'border-border bg-surface hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Text type="label" size="sm">
                            {trip.tripCode}
                          </Text>
                          <Badge
                            label={statusMeta.shortLabel}
                            variant={statusMeta.badgeVariant}
                          />
                        </div>
                        <Text type="supporting" size="2xs" hasTabularNumbers>
                          {formatDateTime(trip.createdAt)}
                        </Text>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Truck className="w-3.5 h-3.5 text-accent shrink-0" />
                          <Text type="body" size="xsm" maxLines={1}>
                            {trip.driver?.name || 'Chưa gán tài xế'}
                          </Text>
                          {trip.driver?.driverProfile?.licensePlate && (
                            <Text type="supporting" size="2xs">
                              • {trip.driver.driverProfile.licensePlate}
                            </Text>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                        <Text type="supporting" size="2xs" hasTabularNumbers>
                          Tiến độ: {doneCount}/{tripOrders.length} điểm giao
                        </Text>
                        <Text type="label" size="2xs" color="accent" hasTabularNumbers>
                          {trip.totalDistance
                            ? `${(trip.totalDistance / 1000).toFixed(2)} km`
                            : 'Chưa tính km'}
                        </Text>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </section>

        {/* Right: RouteMap + Selected Trip Detail & Ordered Stops */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <RouteMap
            depot={selectedTripDepot}
            orders={routedOrders}
            selectedOrderIds={[]}
            polylinePositions={polylinePositions}
            allMapPoints={allMapPoints}
            isDarkMode={isDarkMode}
          />

          <Card padding={4}>
            {!selectedTrip ? (
              <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border bg-muted flex flex-col items-center gap-2">
                <Navigation className="w-8 h-8 text-secondary" />
                <Text type="label" size="sm">
                  Chọn một chuyến xe bên trái để xem chi tiết lộ trình
                </Text>
                <Text type="supporting" size="xsm">
                  Hoặc bấm &quot;Tạo chuyến mới&quot; để tạo lộ trình tối ưu bằng Google OR-Tools.
                </Text>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Selected Trip Header + Lifecycle Actions */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Navigation className="w-4 h-4 text-accent" />
                      <Heading level={4} accessibilityLevel={3}>
                        Chuyến {selectedTrip.tripCode}
                      </Heading>
                      <Badge
                        label={getTripStatusMeta(selectedTrip.status).label}
                        variant={getTripStatusMeta(selectedTrip.status).badgeVariant}
                      />
                    </div>
                    <Text type="supporting" size="xsm">
                      Tài xế:{' '}
                      <Text type="label" size="xsm" color="primary">
                        {selectedTrip.driver?.name || 'Chưa gán'}
                      </Text>
                      {selectedTrip.driver?.driverProfile?.licensePlate
                        ? ` (${selectedTrip.driver.driverProfile.vehicleType} • ${selectedTrip.driver.driverProfile.licensePlate})`
                        : ''}{' '}
                      • Tạo lúc: {formatDateTime(selectedTrip.createdAt)}
                    </Text>
                    <Text type="label" size="xsm" color="accent" hasTabularNumbers>
                      Tổng quãng đường:{' '}
                      {selectedTrip.totalDistance
                        ? `${(selectedTrip.totalDistance / 1000).toFixed(2)} km (${Math.round(
                            selectedTrip.totalDistance
                          )} m)`
                        : 'Chưa tối ưu / N/A'}
                    </Text>
                  </div>

                  {/* Action Toolbar */}
                  {selectedTrip.status !== 'COMPLETED' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedTrip.status === 'ASSIGNED' && canStart && (
                        <Button
                          label="Bắt đầu giao"
                          variant="primary"
                          size="sm"
                          icon={<Play className="w-3.5 h-3.5" />}
                          isLoading={busyAction === 'start'}
                          onClick={() => void handleStartSelectedTrip(selectedTrip.id)}
                        />
                      )}

                      {canManage && (
                        <Button
                          label="Đổi tài xế"
                          variant="secondary"
                          size="sm"
                          icon={<UserCog className="w-3.5 h-3.5" />}
                          onClick={() => setReassigningTrip(selectedTrip)}
                        />
                      )}

                      {canManage && deliveringStopsCount > 0 && (
                        <Button
                          label="Tối ưu lại (OR-Tools)"
                          variant="secondary"
                          size="sm"
                          icon={<Sparkles className="w-3.5 h-3.5" />}
                          isLoading={busyAction === 'reoptimize'}
                          onClick={() => void handleReoptimizeSelectedTrip(selectedTrip.id)}
                        />
                      )}

                      {canManage && (
                        <Button
                          label="Hủy chuyến"
                          variant="destructive"
                          size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => setCancellingTrip(selectedTrip)}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Ordered Stops */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {/* Start Depot */}
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-error-muted border border-error text-xs">
                    <div className="w-7 h-7 rounded-full bg-error text-on-error font-bold flex items-center justify-center shrink-0">
                      0
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <Text type="label" size="xsm" maxLines={1}>
                        Điểm xuất phát: {selectedTripDepot.name}
                      </Text>
                      <Text type="supporting" size="2xs" maxLines={1}>
                        {selectedTripDepot.address}
                      </Text>
                    </div>
                  </div>

                  {routedOrders.map((stopOrder, index) => {
                    const statusMeta = STATUS_CONFIG[stopOrder.status];
                    return (
                      <div
                        key={stopOrder.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-muted border border-border text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full text-white font-bold flex items-center justify-center shrink-0"
                            style={{ backgroundColor: statusMeta.dotColor }}
                          >
                            {stopOrder.deliverySequence ?? index + 1}
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Text type="label" size="xsm">
                                {stopOrder.orderCode}
                              </Text>
                              <Text type="supporting" size="2xs">
                                •
                              </Text>
                              <Text type="body" size="xsm" maxLines={1}>
                                {stopOrder.customerName}
                              </Text>
                              <Text type="supporting" size="2xs">
                                ({stopOrder.customerPhone})
                              </Text>
                            </div>
                            <Text type="supporting" size="2xs" maxLines={1}>
                              {stopOrder.customerAddress}
                            </Text>
                            <Text type="label" size="2xs" color="accent" hasTabularNumbers>
                              COD: {formatVND(stopOrder.totalAmount)}
                            </Text>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            label={statusMeta.shortLabel}
                            variant={statusMeta.badgeVariant}
                          />
                          {stopOrder.status === 'DELIVERING' && canUpdateStop && (
                            <>
                              <Button
                                label="Giao xong"
                                variant="primary"
                                size="sm"
                                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                onClick={() => void onCompleteDelivery(stopOrder.id)}
                              />
                              <IconButton
                                label={`Đánh dấu đơn ${stopOrder.orderCode} giao thất bại`}
                                tooltip="Giao thất bại"
                                variant="destructive"
                                size="sm"
                                icon={<XCircle className="w-3.5 h-3.5" />}
                                onClick={() => void onFailDelivery(stopOrder.id)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Create Trip Modal (OR-Tools) */}
      <CreateTripModal
        isOpen={showCreateModal}
        onOpenChange={setShowCreateModal}
        packedOrders={packedOrders}
        availableDrivers={availableDrivers}
        submitting={optimizing}
        onCreateTrip={handleCreateTripSubmit}
      />

      {/* Reassign Driver Modal */}
      <ReassignTripDriverModal
        isOpen={Boolean(reassigningTrip)}
        onOpenChange={(open) => {
          if (!open) setReassigningTrip(null);
        }}
        trip={reassigningTrip}
        drivers={assignableDrivers}
        submitting={busyAction === 'reassign'}
        onConfirm={handleReassignSubmit}
      />

      {/* Cancel Trip Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(cancellingTrip)}
        onOpenChange={(open) => {
          if (!open) setCancellingTrip(null);
        }}
        width={460}
      >
        <Layout
          header={
            <DialogHeader
              title={`Hủy chuyến ${cancellingTrip?.tripCode ?? ''}?`}
              onOpenChange={(open) => {
                if (!open) setCancellingTrip(null);
              }}
            />
          }
          content={
            <LayoutContent>
              <Text type="body" size="sm">
                Tất cả các đơn hàng đang ở trạng thái <strong>DELIVERING</strong> trong chuyến này
                sẽ được đưa về trạng thái <strong>PACKED</strong> để điều phối lại. Tài xế sẽ được
                giải phóng về trạng thái <strong>AVAILABLE</strong> nếu không còn chuyến hoạt động
                khác.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <div className="flex items-center justify-end gap-2 w-full">
                <Button
                  label="Đóng"
                  variant="secondary"
                  size="sm"
                  isDisabled={busyAction === 'cancel'}
                  onClick={() => setCancellingTrip(null)}
                />
                <Button
                  label="Xác nhận hủy chuyến"
                  variant="destructive"
                  size="sm"
                  isLoading={busyAction === 'cancel'}
                  onClick={() => void handleConfirmCancelTrip()}
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}
