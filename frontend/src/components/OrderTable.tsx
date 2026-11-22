import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Layers,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  Pencil,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
  UserMinus,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
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
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_CONFIG,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_CONFIG,
  STATUS_CONFIG,
  STATUS_TABS,
  canRoleAssignDriver,
  canRoleCreateTrips,
  canRoleEditOrders,
  canRolePickAndPack,
  canRoleUpdateStopDelivery,
  formatDateTime,
  formatVND,
  isOrderAssignable,
  isOrderEditable,
  type BulkOrderActionType,
  type Order,
  type PaymentStatus,
  type Role,
} from '../types/dms';

type ConfirmableBulkAction = 'UNASSIGN_DRIVER' | 'COMPLETE_DELIVERY' | 'FAIL_DELIVERY';

interface PendingBulkConfirmation {
  action: ConfirmableBulkAction;
  eligibleOrders: Order[];
  skippedCount: number;
}

interface OrderTableProps {
  role: Role;
  filteredOrders: Order[];
  counts: Record<string, number>;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  paymentMethodFilter: string;
  onPaymentMethodFilterChange: (method: string) => void;
  paymentStatusFilter: string;
  onPaymentStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedOrderIds: number[];
  onSelectedOrderIdsChange: (ids: number[]) => void;
  loading: boolean;
  bulkLoading: boolean;
  onBatchPreparePacked: () => void;
  onBulkAction: (
    action: BulkOrderActionType,
    orderIds: number[]
  ) => Promise<void>;
  onOpenBulkAssignDriver: (eligibleOrders: Order[], skippedCount: number) => void;
  onOpenBulkCreateTrip: (packedOrderIds: number[]) => void;
  onEditOrder: (order: Order) => void;
  onUpdatePaymentStatus: (
    orderId: number,
    paymentStatus: PaymentStatus,
    paymentReference?: string | null
  ) => Promise<void>;
  onOpenAssignDriver: (order: Order) => void;
  onStartPicking: (id: number) => void;
  onCompletePacking: (id: number) => void;
  onCompleteDelivery: (id: number) => void;
  onFailDelivery: (id: number) => void;
}

function formatOrderCodesPreview(orders: Order[], limit = 6): string {
  const codes = orders.slice(0, limit).map((o) => o.orderCode);
  const remaining = orders.length - codes.length;
  return remaining > 0 ? `${codes.join(', ')} và ${remaining} đơn khác` : codes.join(', ');
}

export function OrderTable({
  role,
  filteredOrders,
  counts,
  statusFilter,
  onStatusFilterChange,
  paymentMethodFilter,
  onPaymentMethodFilterChange,
  paymentStatusFilter,
  onPaymentStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  selectedOrderIds,
  onSelectedOrderIdsChange,
  loading,
  bulkLoading,
  onBatchPreparePacked,
  onBulkAction,
  onOpenBulkAssignDriver,
  onOpenBulkCreateTrip,
  onEditOrder,
  onUpdatePaymentStatus,
  onOpenAssignDriver,
  onStartPicking,
  onCompletePacking,
  onCompleteDelivery,
  onFailDelivery,
}: OrderTableProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingBulkConfirmation | null>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<PaymentStatus>('UNPAID');
  const [paymentRefDraft, setPaymentRefDraft] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const openPaymentModal = (order: Order) => {
    setPaymentModalOrder(order);
    setPaymentStatusDraft(order.paymentStatus ?? 'UNPAID');
    setPaymentRefDraft(order.paymentReference ?? '');
  };

  const handleSavePaymentStatus = async () => {
    if (!paymentModalOrder) return;
    setPaymentSaving(true);
    try {
      await onUpdatePaymentStatus(
        paymentModalOrder.id,
        paymentStatusDraft,
        paymentRefDraft.trim() || null
      );
      setPaymentModalOrder(null);
    } finally {
      setPaymentSaving(false);
    }
  };

  const newAndPickingCount = (counts.NEW ?? 0) + (counts.PICKING ?? 0);

  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);

  const selectedVisibleOrders = useMemo(
    () => filteredOrders.filter((o) => selectedIdSet.has(o.id)),
    [filteredOrders, selectedIdSet]
  );

  const visibleOrderIds = useMemo(
    () => filteredOrders.map((o) => o.id),
    [filteredOrders]
  );

  const allVisibleSelected =
    visibleOrderIds.length > 0 && selectedVisibleOrders.length === visibleOrderIds.length;
  const someVisibleSelected =
    selectedVisibleOrders.length > 0 && selectedVisibleOrders.length < visibleOrderIds.length;

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleOrderIds);
      onSelectedOrderIdsChange(selectedOrderIds.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = Array.from(new Set([...selectedOrderIds, ...visibleOrderIds]));
      onSelectedOrderIdsChange(merged);
    }
  };

  const toggleSelectOrder = (orderId: number) => {
    if (selectedIdSet.has(orderId)) {
      onSelectedOrderIdsChange(selectedOrderIds.filter((id) => id !== orderId));
    } else {
      onSelectedOrderIdsChange([...selectedOrderIds, orderId]);
    }
  };

  const clearSelection = () => {
    onSelectedOrderIdsChange([]);
  };

  const eligibleGroups = useMemo(() => {
    const pickable = selectedVisibleOrders.filter((o) => o.status === 'NEW');
    const packable = selectedVisibleOrders.filter((o) => o.status === 'PICKING');
    const packed = selectedVisibleOrders.filter((o) => o.status === 'PACKED');
    const assignable = selectedVisibleOrders.filter((o) => isOrderAssignable(o.status));
    const delivering = selectedVisibleOrders.filter((o) => o.status === 'DELIVERING');
    return { pickable, packable, packed, assignable, delivering };
  }, [selectedVisibleOrders]);

  const canPickPack = canRolePickAndPack(role);
  const canAssign = canRoleAssignDriver(role);
  const canCreateTrip = canRoleCreateTrips(role);
  const canUpdateDelivery = canRoleUpdateStopDelivery(role);

  const hasAnyAvailableBulkAction =
    (canPickPack && (eligibleGroups.pickable.length > 0 || eligibleGroups.packable.length > 0)) ||
    (canAssign && (eligibleGroups.assignable.length > 0 || eligibleGroups.delivering.length > 0)) ||
    (canCreateTrip && eligibleGroups.packed.length > 0) ||
    (canUpdateDelivery && eligibleGroups.delivering.length > 0);

  const openConfirmDialog = (
    action: ConfirmableBulkAction,
    eligibleOrders: Order[]
  ) => {
    setPendingConfirm({
      action,
      eligibleOrders,
      skippedCount: selectedVisibleOrders.length - eligibleOrders.length,
    });
  };

  const confirmDialogMeta = useMemo(() => {
    if (!pendingConfirm) return null;
    const { action, eligibleOrders, skippedCount } = pendingConfirm;
    const codes = formatOrderCodesPreview(eligibleOrders);
    const skippedNote =
      skippedCount > 0 ? ` (${skippedCount} đơn khác không đủ điều kiện sẽ được bỏ qua.)` : '';

    if (action === 'UNASSIGN_DRIVER') {
      return {
        title: `Bỏ gán tài xế cho ${eligibleOrders.length} đơn hàng?`,
        description: `Các đơn sau sẽ được gỡ khỏi chuyến hiện tại và đưa về trạng thái PACKED: ${codes}.${skippedNote}`,
        actionLabel: `Bỏ gán (${eligibleOrders.length})`,
        actionVariant: 'destructive' as const,
      };
    }
    if (action === 'COMPLETE_DELIVERY') {
      return {
        title: `Xác nhận giao thành công ${eligibleOrders.length} đơn hàng?`,
        description: `Các đơn sau sẽ được chuyển sang COMPLETED và tự động cập nhật trạng thái chuyến xe / tài xế: ${codes}.${skippedNote}`,
        actionLabel: `Giao thành công (${eligibleOrders.length})`,
        actionVariant: 'primary' as const,
      };
    }
    return {
      title: `Đánh dấu giao thất bại ${eligibleOrders.length} đơn hàng?`,
      description: `Các đơn sau sẽ được chuyển sang FAILED và tự động cập nhật trạng thái chuyến xe / tài xế: ${codes}.${skippedNote}`,
      actionLabel: `Giao thất bại (${eligibleOrders.length})`,
      actionVariant: 'destructive' as const,
    };
  }, [pendingConfirm]);

  const handleConfirmPendingAction = async () => {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    await onBulkAction(
      action,
      selectedVisibleOrders.map((o) => o.id)
    );
    setPendingConfirm(null);
  };

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
            <div className="w-64">
              <TextInput
                label="Tìm kiếm đơn hàng"
                isLabelHidden
                placeholder="Tìm mã đơn, khách hàng, SĐT, mã GD..."
                value={searchQuery}
                onChange={onSearchQueryChange}
                startIcon={<Search className="w-4 h-4" />}
                size="sm"
              />
            </div>

            <div className="w-44">
              <Selector
                label="Phương thức thanh toán"
                isLabelHidden
                variant="secondary"
                size="sm"
                width="100%"
                options={[
                  { value: 'ALL', label: 'Tất cả PTTT' },
                  ...PAYMENT_METHODS.map((m) => ({
                    value: m,
                    label: PAYMENT_METHOD_CONFIG[m].shortLabel,
                  })),
                ]}
                value={paymentMethodFilter}
                onChange={(val) => onPaymentMethodFilterChange(String(val))}
              />
            </div>

            <div className="w-44">
              <Selector
                label="Trạng thái thanh toán"
                isLabelHidden
                variant="secondary"
                size="sm"
                width="100%"
                options={[
                  { value: 'ALL', label: 'Tất cả thanh toán' },
                  ...PAYMENT_STATUSES.map((s) => ({
                    value: s,
                    label: PAYMENT_STATUS_CONFIG[s].label,
                  })),
                ]}
                value={paymentStatusFilter}
                onChange={(val) => onPaymentStatusFilterChange(String(val))}
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

      {/* Filter Tabs, Contextual Bulk Toolbar & Orders Table */}
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

          {/* Contextual Mass Actions Toolbar */}
          {selectedVisibleOrders.length > 0 && (
            <div
              role="region"
              aria-label="Thanh thao tác hàng loạt"
              className="px-4 py-2.5 border-b border-border bg-muted flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2">
                <Badge
                  label={`Đã chọn ${selectedVisibleOrders.length} đơn`}
                  variant="purple"
                />
                <Button
                  label="Bỏ chọn"
                  variant="ghost"
                  size="sm"
                  icon={<X className="w-3.5 h-3.5" />}
                  isDisabled={bulkLoading}
                  onClick={clearSelection}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!hasAnyAvailableBulkAction && (
                  <Text type="supporting" size="xsm">
                    Không có thao tác hàng loạt khả dụng cho vai trò {role} với các đơn đã chọn.
                  </Text>
                )}

                {canPickPack && eligibleGroups.pickable.length > 0 && (
                  <Button
                    label={`Bắt đầu nhặt (${eligibleGroups.pickable.length})`}
                    variant="primary"
                    size="sm"
                    icon={<ShoppingBag className="w-3.5 h-3.5" />}
                    isLoading={bulkLoading}
                    onClick={() =>
                      void onBulkAction(
                        'START_PICKING',
                        selectedVisibleOrders.map((o) => o.id)
                      )
                    }
                  />
                )}

                {canPickPack && eligibleGroups.packable.length > 0 && (
                  <Button
                    label={`Đóng gói xong (${eligibleGroups.packable.length})`}
                    variant="secondary"
                    size="sm"
                    icon={<PackageCheck className="w-3.5 h-3.5" />}
                    isLoading={bulkLoading}
                    onClick={() =>
                      void onBulkAction(
                        'COMPLETE_PACKING',
                        selectedVisibleOrders.map((o) => o.id)
                      )
                    }
                  />
                )}

                {canAssign && eligibleGroups.assignable.length > 0 && (
                  <Button
                    label={`Gán tài xế (${eligibleGroups.assignable.length})`}
                    variant="primary"
                    size="sm"
                    icon={<UserPlus className="w-3.5 h-3.5" />}
                    isDisabled={bulkLoading}
                    onClick={() =>
                      onOpenBulkAssignDriver(
                        eligibleGroups.assignable,
                        selectedVisibleOrders.length - eligibleGroups.assignable.length
                      )
                    }
                  />
                )}

                {canCreateTrip && eligibleGroups.packed.length > 0 && (
                  <Button
                    label={`Tạo chuyến tối ưu (${eligibleGroups.packed.length})`}
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                    isDisabled={bulkLoading}
                    onClick={() =>
                      onOpenBulkCreateTrip(eligibleGroups.packed.map((o) => o.id))
                    }
                  />
                )}

                {canAssign && eligibleGroups.delivering.length > 0 && (
                  <Button
                    label={`Bỏ gán tài xế (${eligibleGroups.delivering.length})`}
                    variant="secondary"
                    size="sm"
                    icon={<UserMinus className="w-3.5 h-3.5" />}
                    isDisabled={bulkLoading}
                    onClick={() =>
                      openConfirmDialog('UNASSIGN_DRIVER', eligibleGroups.delivering)
                    }
                  />
                )}

                {canUpdateDelivery && eligibleGroups.delivering.length > 0 && (
                  <>
                    <Button
                      label={`Giao thành công (${eligibleGroups.delivering.length})`}
                      variant="primary"
                      size="sm"
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      isDisabled={bulkLoading}
                      onClick={() =>
                        openConfirmDialog('COMPLETE_DELIVERY', eligibleGroups.delivering)
                      }
                    />
                    <Button
                      label={`Giao thất bại (${eligibleGroups.delivering.length})`}
                      variant="destructive"
                      size="sm"
                      icon={<XCircle className="w-3.5 h-3.5" />}
                      isDisabled={bulkLoading}
                      onClick={() =>
                        openConfirmDialog('FAIL_DELIVERY', eligibleGroups.delivering)
                      }
                    />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  {searchQuery.trim()
                    ? 'Không tìm thấy đơn hàng nào khớp với từ khóa tìm kiếm.'
                    : 'Không có đơn hàng nào trong trạng thái này. Hãy tạo đơn mới để bắt đầu.'}
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>
                      <CheckboxInput
                        size="sm"
                        label="Chọn tất cả đơn hàng đang hiển thị"
                        isLabelHidden
                        value={
                          allVisibleSelected
                            ? true
                            : someVisibleSelected
                              ? 'indeterminate'
                              : false
                        }
                        isDisabled={bulkLoading}
                        onChange={toggleSelectAllVisible}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Mã Đơn / Chuyến</TableHeaderCell>
                    <TableHeaderCell>Ngày Tạo</TableHeaderCell>
                    <TableHeaderCell>Khách Hàng &amp; Địa Chỉ</TableHeaderCell>
                    <TableHeaderCell>Tổng Tiền</TableHeaderCell>
                    <TableHeaderCell>Thanh Toán</TableHeaderCell>
                    <TableHeaderCell>Trạng Thái</TableHeaderCell>
                    <TableHeaderCell>Tài Xế</TableHeaderCell>
                    <TableHeaderCell>Thao Tác ({role})</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const statusMeta = STATUS_CONFIG[order.status];
                    const paymentMethodMeta =
                      PAYMENT_METHOD_CONFIG[order.paymentMethod ?? 'COD'];
                    const paymentStatusMeta =
                      PAYMENT_STATUS_CONFIG[order.paymentStatus ?? 'UNPAID'];
                    const assignedDriver = order.trip?.driver ?? null;
                    const canAssignRow =
                      canRoleAssignDriver(role) && isOrderAssignable(order.status);
                    const assignLabel =
                      order.status === 'FAILED'
                        ? 'Giao lại'
                        : assignedDriver
                          ? 'Đổi tài xế'
                          : 'Gán tài xế';
                    const isSelected = selectedIdSet.has(order.id);

                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <CheckboxInput
                            size="sm"
                            label={`Chọn đơn hàng ${order.orderCode}`}
                            isLabelHidden
                            value={isSelected}
                            isDisabled={bulkLoading}
                            onChange={() => toggleSelectOrder(order.id)}
                          />
                        </TableCell>

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
                            {order.store?.name && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge
                                  label={`Kho: ${order.store.name}`}
                                  variant="neutral"
                                />
                              </div>
                            )}
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
                          <Stack direction="vertical" gap={1} className="whitespace-nowrap">
                            <Stack direction="horizontal" align="center" gap={1}>
                              <Badge
                                label={paymentMethodMeta.shortLabel}
                                variant={paymentMethodMeta.badgeVariant}
                              />
                              <Badge
                                label={paymentStatusMeta.shortLabel}
                                variant={paymentStatusMeta.badgeVariant}
                              />
                              {canRoleEditOrders(role) && (
                                <IconButton
                                  label={`Cập nhật thanh toán đơn ${order.orderCode}`}
                                  tooltip="Cập nhật trạng thái thanh toán"
                                  variant="ghost"
                                  size="sm"
                                  icon={<CreditCard className="w-3.5 h-3.5" />}
                                  onClick={() => openPaymentModal(order)}
                                />
                              )}
                            </Stack>
                            {order.paymentReference && (
                              <Text type="supporting" size="2xs">
                                Mã GD: {order.paymentReference}
                              </Text>
                            )}
                          </Stack>
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

                            {canAssignRow && (
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

      {confirmDialogMeta && (
        <AlertDialog
          isOpen={Boolean(pendingConfirm)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingConfirm(null);
            }
          }}
          title={confirmDialogMeta.title}
          description={confirmDialogMeta.description}
          cancelLabel="Hủy"
          actionLabel={confirmDialogMeta.actionLabel}
          actionVariant={confirmDialogMeta.actionVariant}
          isActionLoading={bulkLoading}
          onAction={handleConfirmPendingAction}
          width={480}
        />
      )}

      {paymentModalOrder && (
        <Dialog
          isOpen={Boolean(paymentModalOrder)}
          onOpenChange={(open) => {
            if (!open && !paymentSaving) {
              setPaymentModalOrder(null);
            }
          }}
          width={460}
        >
          <Layout
            header={
              <DialogHeader
                title={`Cập nhật thanh toán • ${paymentModalOrder.orderCode}`}
                subtitle={`${PAYMENT_METHOD_CONFIG[paymentModalOrder.paymentMethod ?? 'COD'].label} • ${formatVND(paymentModalOrder.totalAmount)}`}
                onOpenChange={(open) => {
                  if (!open && !paymentSaving) {
                    setPaymentModalOrder(null);
                  }
                }}
              />
            }
            content={
              <LayoutContent>
                <Stack direction="vertical" gap={3}>
                  <Selector
                    label="Trạng thái thanh toán"
                    variant="secondary"
                    size="sm"
                    width="100%"
                    options={PAYMENT_STATUSES.map((status) => ({
                      value: status,
                      label: PAYMENT_STATUS_CONFIG[status].label,
                    }))}
                    value={paymentStatusDraft}
                    onChange={(val) => setPaymentStatusDraft(String(val) as PaymentStatus)}
                  />

                  <TextInput
                    label="Mã giao dịch (tùy chọn)"
                    width="100%"
                    size="sm"
                    value={paymentRefDraft}
                    onChange={setPaymentRefDraft}
                    placeholder="VD: MOMO-20261122-001, FT261122..."
                  />
                </Stack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <Stack direction="horizontal" justify="end" gap={2}>
                  <Button
                    label="Hủy"
                    variant="secondary"
                    size="sm"
                    isDisabled={paymentSaving}
                    onClick={() => setPaymentModalOrder(null)}
                  />
                  <Button
                    label="Lưu thanh toán"
                    variant="primary"
                    size="sm"
                    isLoading={paymentSaving}
                    onClick={() => void handleSavePaymentStatus()}
                  />
                </Stack>
              </LayoutFooter>
            }
          />
        </Dialog>
      )}
    </section>
  );
}
