import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Columns3,
  CreditCard,
  Layers,
  Navigation,
  Package,
  PackageCheck,
  PackageX,
  Pencil,
  RotateCcw,
  Search,
  ShoppingBag,
  UserMinus,
  X,
  XCircle,
} from 'lucide-react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DateInput } from '@astryxdesign/core/DateInput';
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
  DELIVERY_HOURS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_CONFIG,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_CONFIG,
  REJECTION_REASON_CONFIG,
  STATUS_CONFIG,
  STATUS_TABS,
  canRoleAssignDriver,
  canRoleCancelOrders,
  canRoleEditOrders,
  canRolePickAndPack,
  canRoleUpdateStopDelivery,
  formatDateTime,
  formatDeliveryDateShort,
  formatTimeslot,
  formatVND,
  getOrderNetAmount,
  getOrderRefundAmount,
  getOrderRejectedAmount,
  isOrderCancellable,
  isOrderEditable,
  isOrderPrepaid,
  isOrderRefundPending,
  isOrderRejectedStatus,
  toIsoDateString,
  type BulkOrderActionType,
  type Order,
  type PaymentStatus,
  type Role,
} from '../types/dms';

type ConfirmableBulkAction = 'UNASSIGN_DRIVER' | 'COMPLETE_DELIVERY' | 'FAIL_DELIVERY';

type OrderColumnKey =
  | 'orderCode'
  | 'hourDelivery'
  | 'deliveryDate'
  | 'createdAt'
  | 'customerName'
  | 'customerPhone'
  | 'customerAddress'
  | 'store'
  | 'items'
  | 'totalAmount'
  | 'payment'
  | 'status'
  | 'driver'
  | 'actions';

interface OrderColumnDefinition {
  key: OrderColumnKey;
  label: string;
}

const ORDER_TABLE_COLUMNS: readonly OrderColumnDefinition[] = [
  { key: 'orderCode', label: 'Mã đơn / Chuyến' },
  { key: 'hourDelivery', label: 'Khung giờ giao' },
  { key: 'deliveryDate', label: 'Ngày giao' },
  { key: 'createdAt', label: 'Ngày tạo' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'customerPhone', label: 'Số điện thoại' },
  { key: 'customerAddress', label: 'Địa chỉ' },
  { key: 'store', label: 'Kho' },
  { key: 'items', label: 'Sản phẩm' },
  { key: 'totalAmount', label: 'Tổng tiền' },
  { key: 'payment', label: 'Thanh toán' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'driver', label: 'Tài xế' },
  { key: 'actions', label: 'Thao tác' },
] as const;

const ALL_ORDER_COLUMN_KEYS: readonly OrderColumnKey[] = ORDER_TABLE_COLUMNS.map((c) => c.key);
const ORDER_COLUMNS_STORAGE_KEY = 'dms-order-table-visible-columns';

function readStoredVisibleColumns(): OrderColumnKey[] {
  try {
    const raw = window.localStorage.getItem(ORDER_COLUMNS_STORAGE_KEY);
    if (!raw) return [...ALL_ORDER_COLUMN_KEYS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL_ORDER_COLUMN_KEYS];
    const validSet = new Set<string>(ALL_ORDER_COLUMN_KEYS);
    const filtered = parsed.filter(
      (k): k is OrderColumnKey => typeof k === 'string' && validSet.has(k)
    );
    return filtered.length > 0 ? filtered : [...ALL_ORDER_COLUMN_KEYS];
  } catch {
    return [...ALL_ORDER_COLUMN_KEYS];
  }
}

interface PendingBulkConfirmation {
  action: ConfirmableBulkAction;
  eligibleOrders: Order[];
  skippedCount: number;
}

type PendingCancelTarget =
  | { mode: 'single'; order: Order }
  | { mode: 'bulk'; eligibleOrders: Order[]; skippedCount: number };

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
  deliveryDateFilter: string;
  onDeliveryDateFilterChange: (date: string) => void;
  hourDeliveryFilter: string;
  onHourDeliveryFilterChange: (hour: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedOrderIds: number[];
  onSelectedOrderIdsChange: (ids: number[]) => void;
  loading: boolean;
  bulkLoading: boolean;
  onBatchPreparePacked: () => void;
  onBulkAction: (
    action: BulkOrderActionType,
    orderIds: number[],
    driverId?: number,
    reason?: string
  ) => Promise<void>;
  onEditOrder: (order: Order) => void;
  onCancelOrder: (orderId: number, reason?: string) => Promise<void>;
  onUpdatePaymentStatus: (
    orderId: number,
    paymentStatus: PaymentStatus,
    paymentReference?: string | null
  ) => Promise<void>;
  onStartPicking: (id: number) => void;
  onCompletePacking: (id: number) => void;
  onCompleteDelivery: (id: number) => void;
  onFailDelivery: (id: number) => void;
  onOpenRejectDelivery: (order: Order) => void;
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
  deliveryDateFilter,
  onDeliveryDateFilterChange,
  hourDeliveryFilter,
  onHourDeliveryFilterChange,
  searchQuery,
  onSearchQueryChange,
  selectedOrderIds,
  onSelectedOrderIdsChange,
  loading,
  bulkLoading,
  onBatchPreparePacked,
  onBulkAction,
  onEditOrder,
  onCancelOrder,
  onUpdatePaymentStatus,
  onStartPicking,
  onCompletePacking,
  onCompleteDelivery,
  onFailDelivery,
  onOpenRejectDelivery,
}: OrderTableProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingBulkConfirmation | null>(null);
  const [pendingCancel, setPendingCancel] = useState<PendingCancelTarget | null>(null);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<PaymentStatus>('UNPAID');
  const [paymentRefDraft, setPaymentRefDraft] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<OrderColumnKey[]>(readStoredVisibleColumns);
  const [showColumnConfig, setShowColumnConfig] = useState<boolean>(false);

  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      // Ignore storage access errors
    }
  }, [visibleColumns]);

  const visibleColumnSet = useMemo(() => new Set<OrderColumnKey>(visibleColumns), [visibleColumns]);
  const isColumnVisible = (key: OrderColumnKey) => visibleColumnSet.has(key);

  const toggleColumnVisibility = (key: OrderColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== key);
      }
      const nextSet = new Set([...prev, key]);
      return ALL_ORDER_COLUMN_KEYS.filter((colKey) => nextSet.has(colKey));
    });
  };

  const resetVisibleColumns = () => {
    setVisibleColumns([...ALL_ORDER_COLUMN_KEYS]);
  };

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
    const delivering = selectedVisibleOrders.filter((o) => o.status === 'DELIVERING');
    return { pickable, packable, delivering };
  }, [selectedVisibleOrders]);

  const canPickPack = canRolePickAndPack(role);
  const canAssign = canRoleAssignDriver(role);
  const canUpdateDelivery = canRoleUpdateStopDelivery(role);
  const canCancel = canRoleCancelOrders(role);

  const hasAnyAvailableBulkAction =
    (canPickPack && (eligibleGroups.pickable.length > 0 || eligibleGroups.packable.length > 0)) ||
    (canCancel && eligibleGroups.pickable.length > 0) ||
    (canAssign && eligibleGroups.delivering.length > 0) ||
    (canUpdateDelivery && eligibleGroups.delivering.length > 0);

  const openSingleCancelDialog = (order: Order) => {
    setPendingCancel({ mode: 'single', order });
    setCancelReasonDraft('');
  };

  const openBulkCancelDialog = (eligibleOrders: Order[]) => {
    setPendingCancel({
      mode: 'bulk',
      eligibleOrders,
      skippedCount: selectedVisibleOrders.length - eligibleOrders.length,
    });
    setCancelReasonDraft('');
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancel) return;
    setCancelSaving(true);
    try {
      const reason = cancelReasonDraft.trim() || undefined;
      if (pendingCancel.mode === 'single') {
        await onCancelOrder(pendingCancel.order.id, reason);
      } else {
        await onBulkAction(
          'CANCEL_ORDER',
          selectedVisibleOrders.map((o) => o.id),
          undefined,
          reason
        );
      }
      setPendingCancel(null);
      setCancelReasonDraft('');
    } catch {
      // Error toast is handled by parent
    } finally {
      setCancelSaving(false);
    }
  };

  const pendingCancelPrepaidOrders = useMemo(() => {
    if (!pendingCancel) return [];
    const targetOrders =
      pendingCancel.mode === 'single' ? [pendingCancel.order] : pendingCancel.eligibleOrders;
    return targetOrders.filter((o) => isOrderPrepaid(o));
  }, [pendingCancel]);

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

            <DateInput
              label="Ngày giao hàng"
              isLabelHidden
              size="sm"
              width={185}
              format="system_date"
              hasClear
              placeholder="Tất cả ngày giao"
              value={toIsoDateString(deliveryDateFilter)}
              onChange={(val) => onDeliveryDateFilterChange(val ?? '')}
            />

            <div className="w-44">
              <Selector
                label="Khung giờ giao"
                isLabelHidden
                variant="secondary"
                size="sm"
                width="100%"
                startIcon={<Clock className="w-3.5 h-3.5" />}
                options={[
                  { value: 'ALL', label: 'Tất cả khung giờ' },
                  ...DELIVERY_HOURS.map((hour) => ({
                    value: String(hour),
                    label: formatTimeslot(hour),
                  })),
                ]}
                value={hourDeliveryFilter}
                onChange={(val) => onHourDeliveryFilterChange(String(val))}
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

            {isAdmin && (
              <div className="pb-2">
                <Button
                  label={`Cột hiển thị (${visibleColumns.length}/${ORDER_TABLE_COLUMNS.length})`}
                  variant={showColumnConfig ? 'primary' : 'secondary'}
                  size="sm"
                  icon={<Columns3 className="w-3.5 h-3.5" />}
                  onClick={() => setShowColumnConfig((prev) => !prev)}
                />
              </div>
            )}
          </div>

          {/* Admin Column Visibility Panel */}
          {isAdmin && showColumnConfig && (
            <div
              role="region"
              aria-label="Vùng chọn cột hiển thị bảng đơn hàng"
              className="px-4 py-3 border-b border-border bg-muted flex flex-col gap-2"
            >
              <Stack direction="horizontal" align="center" justify="between" gap={2} wrap="wrap">
                <Stack direction="horizontal" align="center" gap={2} wrap="wrap">
                  <Columns3 className="w-4 h-4 text-accent shrink-0" />
                  <Text type="label" size="sm">
                    Chọn cột hiển thị (Admin)
                  </Text>
                  <Badge
                    label={`${visibleColumns.length}/${ORDER_TABLE_COLUMNS.length} cột`}
                    variant="neutral"
                  />
                </Stack>
                <Stack direction="horizontal" align="center" gap={1.5}>
                  {visibleColumns.length < ORDER_TABLE_COLUMNS.length && (
                    <Button
                      label="Hiện tất cả"
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={resetVisibleColumns}
                    />
                  )}
                  <Button
                    label="Thu gọn"
                    variant="ghost"
                    size="sm"
                    icon={<X className="w-3.5 h-3.5" />}
                    onClick={() => setShowColumnConfig(false)}
                  />
                </Stack>
              </Stack>

              <Stack direction="horizontal" align="center" gap={3} wrap="wrap">
                {ORDER_TABLE_COLUMNS.map((col) => {
                  const checked = isColumnVisible(col.key);
                  const isLastVisible = checked && visibleColumns.length === 1;
                  return (
                    <CheckboxInput
                      key={col.key}
                      size="sm"
                      label={col.label}
                      value={checked}
                      isDisabled={isLastVisible}
                      onChange={() => toggleColumnVisibility(col.key)}
                    />
                  );
                })}
              </Stack>
            </div>
          )}

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

                {canCancel && eligibleGroups.pickable.length > 0 && (
                  <Button
                    label={`Hủy đơn (${eligibleGroups.pickable.length})`}
                    variant="destructive"
                    size="sm"
                    icon={<Ban className="w-3.5 h-3.5" />}
                    isDisabled={bulkLoading}
                    onClick={() => openBulkCancelDialog(eligibleGroups.pickable)}
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

          <div className="w-full [&_.astryx-table-scroll-wrapper]:max-h-[65vh] [&_.astryx-table-scroll-wrapper]:overflow-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  {searchQuery.trim()
                    ? 'Không tìm thấy đơn hàng nào khớp với từ khóa tìm kiếm.'
                    : 'Không có đơn hàng nào trong trạng thái này. Hãy tạo đơn mới để bắt đầu.'}
                </Text>
              </div>
            ) : (
              <Table
                density="balanced"
                verticalAlign="top"
                textOverflow="wrap"
                hasHover
                className="w-max min-w-full [&_th]:max-w-none [&_td:not(.max-w-80)]:max-w-none"
              >
                <TableHeader className="sticky top-0 z-10 bg-surface">
                  <TableRow>
                    <TableHeaderCell className="w-14 min-w-14 max-w-none overflow-visible whitespace-nowrap">
                      <Stack direction="horizontal" align="center" justify="center">
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
                      </Stack>
                    </TableHeaderCell>
                    {isColumnVisible('orderCode') && (
                      <TableHeaderCell className="min-w-44 max-w-none whitespace-nowrap">
                        Mã đơn / Chuyến
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('hourDelivery') && (
                      <TableHeaderCell className="min-w-36 whitespace-nowrap">
                        Khung giờ giao
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('deliveryDate') && (
                      <TableHeaderCell className="min-w-28 whitespace-nowrap">
                        Ngày giao
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('createdAt') && (
                      <TableHeaderCell className="min-w-36 whitespace-nowrap">
                        Ngày tạo
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('customerName') && (
                      <TableHeaderCell className="min-w-40 whitespace-nowrap">
                        Khách hàng
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('customerPhone') && (
                      <TableHeaderCell className="min-w-32 whitespace-nowrap">
                        Số điện thoại
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('customerAddress') && (
                      <TableHeaderCell className="min-w-64 whitespace-nowrap">
                        Địa chỉ
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('store') && (
                      <TableHeaderCell className="min-w-32 whitespace-nowrap">
                        Kho
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('items') && (
                      <TableHeaderCell className="min-w-64 whitespace-nowrap">
                        Sản phẩm
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('totalAmount') && (
                      <TableHeaderCell className="min-w-32 whitespace-nowrap">
                        Tổng tiền
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('payment') && (
                      <TableHeaderCell className="min-w-44 whitespace-nowrap">
                        Thanh toán
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('status') && (
                      <TableHeaderCell className="min-w-40 whitespace-nowrap">
                        Trạng thái
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('driver') && (
                      <TableHeaderCell className="min-w-40 whitespace-nowrap">
                        Tài xế
                      </TableHeaderCell>
                    )}
                    {isColumnVisible('actions') && (
                      <TableHeaderCell className="min-w-40 whitespace-nowrap">
                        Thao tác ({role})
                      </TableHeaderCell>
                    )}
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
                    const isSelected = selectedIdSet.has(order.id);
                    const itemsList = order.items ?? [];
                    const fullItemsSummary = itemsList
                      .map((i) =>
                        i.rejectedQuantity && i.rejectedQuantity > 0
                          ? `${i.productName} (x${i.quantity}, trả ${i.rejectedQuantity})`
                          : `${i.productName} (x${i.quantity})`
                      )
                      .join(', ');

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="w-14 min-w-14 max-w-none overflow-visible">
                          <Stack direction="horizontal" align="center" justify="center">
                            <CheckboxInput
                              size="sm"
                              label={`Chọn đơn hàng ${order.orderCode}`}
                              isLabelHidden
                              value={isSelected}
                              isDisabled={bulkLoading}
                              onChange={() => toggleSelectOrder(order.id)}
                            />
                          </Stack>
                        </TableCell>

                        {isColumnVisible('orderCode') && (
                          <TableCell className="min-w-44 max-w-none">
                            <Stack direction="vertical" gap={1}>
                              <Text type="label" size="sm">
                                {order.orderCode}
                              </Text>
                              <Stack direction="horizontal" align="center" gap={1} wrap="wrap">
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
                                  <Text type="supporting" size="xsm" hasTabularNumbers>
                                    ID: #{order.id}
                                  </Text>
                                )}
                              </Stack>
                            </Stack>
                          </TableCell>
                        )}

                        {isColumnVisible('hourDelivery') && (
                          <TableCell className="min-w-36">
                            <Badge
                              label={formatTimeslot(order.hourDelivery)}
                              variant="blue"
                              icon={<Clock className="w-3 h-3" />}
                            />
                          </TableCell>
                        )}

                        {isColumnVisible('deliveryDate') && (
                          <TableCell className="min-w-28">
                            <Text type="body" size="sm" hasTabularNumbers>
                              {formatDeliveryDateShort(order.deliveryDate)}
                            </Text>
                          </TableCell>
                        )}

                        {isColumnVisible('createdAt') && (
                          <TableCell className="min-w-36">
                            <Text type="supporting" size="sm" hasTabularNumbers>
                              {formatDateTime(order.createdAt)}
                            </Text>
                          </TableCell>
                        )}

                        {isColumnVisible('customerName') && (
                          <TableCell className="min-w-40">
                            <Text type="label" size="sm">
                              {order.customerName}
                            </Text>
                          </TableCell>
                        )}

                        {isColumnVisible('customerPhone') && (
                          <TableCell className="min-w-32">
                            <Text type="body" size="sm" hasTabularNumbers>
                              {order.customerPhone}
                            </Text>
                          </TableCell>
                        )}

                        {isColumnVisible('customerAddress') && (
                          <TableCell className="min-w-64 max-w-80">
                            <Text type="body" size="sm" maxLines={3}>
                              {order.customerAddress}
                            </Text>
                          </TableCell>
                        )}

                        {isColumnVisible('store') && (
                          <TableCell className="min-w-32">
                            {order.store?.name ? (
                              <Badge label={order.store.name} variant="neutral" />
                            ) : (
                              <Text type="supporting" size="sm">
                                —
                              </Text>
                            )}
                          </TableCell>
                        )}

                        {isColumnVisible('items') && (
                          <TableCell className="min-w-64 max-w-80">
                            {itemsList.length > 0 ? (
                              <Stack direction="vertical" gap={0.5}>
                                {itemsList.slice(0, 3).map((item) => (
                                  <Text
                                    key={item.id}
                                    type="body"
                                    size="sm"
                                    maxLines={2}
                                  >
                                    {item.rejectedQuantity && item.rejectedQuantity > 0
                                      ? `• ${item.productName} (x${item.quantity}, trả ${item.rejectedQuantity})`
                                      : `• ${item.productName} (x${item.quantity})`}
                                  </Text>
                                ))}
                                {itemsList.length > 3 && (
                                  <Text type="supporting" size="xsm" maxLines={1}>
                                    +{itemsList.length - 3} sản phẩm khác: {fullItemsSummary}
                                  </Text>
                                )}
                              </Stack>
                            ) : (
                              <Text type="supporting" size="sm">
                                —
                              </Text>
                            )}
                          </TableCell>
                        )}

                        {isColumnVisible('totalAmount') && (
                          <TableCell className="min-w-32">
                            <Stack direction="vertical" gap={0.5}>
                              <Text type="label" size="sm" hasTabularNumbers>
                                {formatVND(order.totalAmount)}
                              </Text>
                              {getOrderRejectedAmount(order) > 0 && (
                                <>
                                  <Text
                                    type="supporting"
                                    size="xsm"
                                    color="inherit"
                                    className="text-error"
                                    hasTabularNumbers
                                  >
                                    Trả lại: -{formatVND(getOrderRejectedAmount(order))}
                                  </Text>
                                  <Text type="label" size="xsm" color="accent" hasTabularNumbers>
                                    Thực nhận: {formatVND(getOrderNetAmount(order))}
                                  </Text>
                                </>
                              )}
                            </Stack>
                          </TableCell>
                        )}

                        {isColumnVisible('payment') && (
                          <TableCell className="min-w-44">
                            <Stack direction="vertical" gap={1}>
                              <Stack direction="horizontal" align="center" gap={1} wrap="wrap">
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
                              {isOrderRefundPending(order) && (
                                <Badge
                                  label={`Cần hoàn tiền ${formatVND(getOrderRefundAmount(order))}`}
                                  variant="warning"
                                />
                              )}
                              {order.paymentReference && (
                                <Text type="supporting" size="xsm" maxLines={1}>
                                  Mã GD: {order.paymentReference}
                                </Text>
                              )}
                            </Stack>
                          </TableCell>
                        )}

                        {isColumnVisible('status') && (
                          <TableCell className="min-w-40">
                            <Stack direction="vertical" gap={0.5}>
                              <Badge
                                label={statusMeta.label}
                                variant={statusMeta.badgeVariant}
                              />
                              {isOrderRejectedStatus(order.status) && order.rejectionReason && (
                                <Text type="supporting" size="xsm" maxLines={2}>
                                  Lý do:{' '}
                                  {REJECTION_REASON_CONFIG[order.rejectionReason]?.shortLabel ??
                                    order.rejectionReason}
                                  {order.rejectionNote ? ` — ${order.rejectionNote}` : ''}
                                </Text>
                              )}
                              {order.status === 'CANCELLED' && order.cancelReason && (
                                <Text type="supporting" size="xsm" maxLines={2}>
                                  Lý do hủy: {order.cancelReason}
                                </Text>
                              )}
                            </Stack>
                          </TableCell>
                        )}

                        {isColumnVisible('driver') && (
                          <TableCell className="min-w-40">
                            <Stack direction="vertical" gap={1}>
                              {assignedDriver ? (
                                <Stack direction="vertical" gap={0.5}>
                                  <Text type="label" size="sm">
                                    {assignedDriver.name}
                                  </Text>
                                  {assignedDriver.driverProfile?.licensePlate && (
                                    <Text type="supporting" size="xsm">
                                      {assignedDriver.driverProfile.vehicleType} •{' '}
                                      {assignedDriver.driverProfile.licensePlate}
                                    </Text>
                                  )}
                                </Stack>
                              ) : (
                                <Text type="supporting" size="sm">
                                  Chưa gán
                                </Text>
                              )}
                            </Stack>
                          </TableCell>
                        )}

                        {isColumnVisible('actions') && (
                          <TableCell className="min-w-40">
                            <Stack direction="horizontal" align="center" gap={1.5} wrap="wrap">
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
                                <>
                                  <Button
                                    label="Bắt đầu nhặt"
                                    variant="primary"
                                    size="sm"
                                    icon={<ShoppingBag className="w-3.5 h-3.5" />}
                                    onClick={() => onStartPicking(order.id)}
                                  />
                                  {canCancel && isOrderCancellable(order.status) && (
                                    <IconButton
                                      label={`Hủy đơn ${order.orderCode}`}
                                      tooltip="Hủy đơn hàng"
                                      variant="destructive"
                                      size="sm"
                                      icon={<Ban className="w-3.5 h-3.5" />}
                                      onClick={() => openSingleCancelDialog(order)}
                                    />
                                  )}
                                </>
                              )}

                              {order.status === 'PICKING' && (
                                <Button
                                  label="Đóng gói xong"
                                  variant="secondary"
                                  size="sm"
                                  icon={<PackageCheck className="w-3.5 h-3.5" />}
                                  onClick={() => onCompletePacking(order.id)}
                                />
                              )}

                              {order.status === 'PACKED' && (
                                <Text type="supporting" size="sm">
                                  Sẵn sàng tạo chuyến
                                </Text>
                              )}

                              {order.status === 'DELIVERING' && (
                                <>
                                  <Button
                                    label="Giao xong"
                                    variant="primary"
                                    size="sm"
                                    icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                    onClick={() => onCompleteDelivery(order.id)}
                                  />
                                  {canRoleUpdateStopDelivery(role) && (
                                    <IconButton
                                      label={`Khách từ chối đơn ${order.orderCode}`}
                                      tooltip="Khách từ chối nhận hàng"
                                      variant="secondary"
                                      size="sm"
                                      icon={<PackageX className="w-3.5 h-3.5" />}
                                      onClick={() => onOpenRejectDelivery(order)}
                                    />
                                  )}
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
                                order.status === 'PARTIALLY_REJECTED' ||
                                order.status === 'REJECTED' ||
                                order.status === 'FAILED' ||
                                order.status === 'CANCELLED') && (
                                <Text type="supporting" size="sm">
                                  Đã kết thúc
                                </Text>
                              )}
                            </Stack>
                          </TableCell>
                        )}
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

      {pendingCancel && (
        <Dialog
          isOpen={Boolean(pendingCancel)}
          onOpenChange={(open) => {
            if (!open && !cancelSaving) {
              setPendingCancel(null);
              setCancelReasonDraft('');
            }
          }}
          width={480}
        >
          <Layout
            header={
              <DialogHeader
                title={
                  pendingCancel.mode === 'single'
                    ? `Hủy đơn hàng • ${pendingCancel.order.orderCode}`
                    : `Hủy ${pendingCancel.eligibleOrders.length} đơn hàng NEW?`
                }
                subtitle={
                  pendingCancel.mode === 'single'
                    ? `${pendingCancel.order.customerName} • ${formatVND(pendingCancel.order.totalAmount)}`
                    : 'Chỉ các đơn hàng đang ở trạng thái NEW mới được hủy'
                }
                onOpenChange={(open) => {
                  if (!open && !cancelSaving) {
                    setPendingCancel(null);
                    setCancelReasonDraft('');
                  }
                }}
              />
            }
            content={
              <LayoutContent>
                <Stack direction="vertical" gap={3}>
                  <Text type="body" size="sm">
                    {pendingCancel.mode === 'single'
                      ? `Đơn hàng ${pendingCancel.order.orderCode} sẽ chuyển sang trạng thái CANCELLED và toàn bộ tồn kho sản phẩm sẽ được hoàn về depot.`
                      : `Các đơn sau sẽ chuyển sang CANCELLED và được hoàn tồn kho về depot: ${formatOrderCodesPreview(pendingCancel.eligibleOrders)}.${
                          pendingCancel.skippedCount > 0
                            ? ` (${pendingCancel.skippedCount} đơn khác không ở trạng thái NEW sẽ được bỏ qua.)`
                            : ''
                        }`}
                  </Text>

                  {pendingCancelPrepaidOrders.length > 0 && (
                    <Badge
                      label={
                        pendingCancelPrepaidOrders.length === 1
                          ? `Lưu ý: Đơn đã thanh toán trước (${formatVND(pendingCancelPrepaidOrders[0].totalAmount)}), cần hoàn tiền sau khi hủy.`
                          : `Lưu ý: Có ${pendingCancelPrepaidOrders.length} đơn đã thanh toán trước cần hoàn tiền sau khi hủy.`
                      }
                      variant="warning"
                    />
                  )}

                  <TextInput
                    label="Lý do hủy đơn (tùy chọn)"
                    width="100%"
                    size="sm"
                    value={cancelReasonDraft}
                    onChange={setCancelReasonDraft}
                    placeholder="VD: Khách yêu cầu hủy, đặt trùng đơn..."
                    isDisabled={cancelSaving}
                  />
                </Stack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <Stack direction="horizontal" justify="end" gap={2}>
                  <Button
                    label="Đóng"
                    variant="secondary"
                    size="sm"
                    isDisabled={cancelSaving}
                    onClick={() => {
                      setPendingCancel(null);
                      setCancelReasonDraft('');
                    }}
                  />
                  <Button
                    label={
                      pendingCancel.mode === 'single'
                        ? 'Xác nhận hủy đơn'
                        : `Xác nhận hủy (${pendingCancel.eligibleOrders.length})`
                    }
                    variant="destructive"
                    size="sm"
                    icon={<Ban className="w-3.5 h-3.5" />}
                    isLoading={cancelSaving}
                    onClick={() => void handleConfirmCancel()}
                  />
                </Stack>
              </LayoutFooter>
            }
          />
        </Dialog>
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
