import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  MapPin,
  Minus,
  PackageX,
  Plus,
  RotateCcw,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
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
import type { RejectDeliveryPayload } from '../api/dmsApi';
import {
  PAYMENT_METHOD_CONFIG,
  PAYMENT_STATUS_CONFIG,
  REJECTION_REASONS,
  REJECTION_REASON_CONFIG,
  STATUS_CONFIG,
  formatVND,
  type Order,
  type RejectionReason,
} from '../types/dms';

interface RejectDeliveryModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  submitting: boolean;
  onConfirm: (orderId: number, payload: RejectDeliveryPayload) => void;
}

const REASON_OPTIONS = REJECTION_REASONS.map((key) => ({
  value: key,
  label: REJECTION_REASON_CONFIG[key].label,
}));

export function RejectDeliveryModal({
  isOpen,
  onOpenChange,
  order,
  submitting,
  onConfirm,
}: RejectDeliveryModalProps) {
  const [reason, setReason] = useState<RejectionReason>('NOT_AS_DESCRIBED');
  const [note, setNote] = useState('');
  const [rejectedQtyMap, setRejectedQtyMap] = useState<Record<number, number>>({});

  useEffect(() => {
    if (isOpen && order) {
      setReason('NOT_AS_DESCRIBED');
      setNote('');
      const initialMap: Record<number, number> = {};
      for (const item of order.items ?? []) {
        initialMap[item.id] = item.quantity;
      }
      setRejectedQtyMap(initialMap);
    }
  }, [isOpen, order]);

  const summary = useMemo(() => {
    if (!order) {
      return {
        totalOrderedUnits: 0,
        totalRejectedUnits: 0,
        rejectedAmount: 0,
        netAmount: 0,
        isFullRejection: false,
      };
    }

    let totalOrderedUnits = 0;
    let totalRejectedUnits = 0;
    let rawRejectedAmount = 0;

    for (const item of order.items ?? []) {
      const qty = item.quantity;
      const rejQty = Math.min(Math.max(0, rejectedQtyMap[item.id] ?? 0), qty);
      totalOrderedUnits += qty;
      totalRejectedUnits += rejQty;
      rawRejectedAmount += Number(item.price) * rejQty;
    }

    const rejectedAmount = Math.round(rawRejectedAmount * 100) / 100;
    const totalAmount = Number(order.totalAmount) || 0;
    const netAmount = Math.max(0, Math.round((totalAmount - rejectedAmount) * 100) / 100);
    const isFullRejection =
      totalOrderedUnits > 0 && totalRejectedUnits === totalOrderedUnits;

    return {
      totalOrderedUnits,
      totalRejectedUnits,
      rejectedAmount,
      netAmount,
      isFullRejection,
    };
  }, [order, rejectedQtyMap]);

  const setItemRejectedQty = (itemId: number, maxQty: number, nextQty: number) => {
    const clamped = Math.min(Math.max(0, Math.trunc(nextQty)), maxQty);
    setRejectedQtyMap((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const handleRejectAll = () => {
    if (!order) return;
    const next: Record<number, number> = {};
    for (const item of order.items ?? []) {
      next[item.id] = item.quantity;
    }
    setRejectedQtyMap(next);
  };

  const handleResetAll = () => {
    if (!order) return;
    const next: Record<number, number> = {};
    for (const item of order.items ?? []) {
      next[item.id] = 0;
    }
    setRejectedQtyMap(next);
  };

  const isOtherNoteMissing = reason === 'OTHER' && note.trim().length === 0;
  const canConfirm = Boolean(
    order && summary.totalRejectedUnits > 0 && !isOtherNoteMissing && !submitting
  );

  const handleSubmit = () => {
    if (!order || !canConfirm) return;
    const rejectedItems = (order.items ?? []).map((item) => ({
      orderItemId: item.id,
      rejectedQuantity: Math.min(Math.max(0, rejectedQtyMap[item.id] ?? 0), item.quantity),
    }));
    onConfirm(order.id, {
      reason,
      note: note.trim() || undefined,
      rejectedItems,
    });
  };

  const paymentMethodMeta = order
    ? PAYMENT_METHOD_CONFIG[order.paymentMethod ?? 'COD']
    : null;
  const paymentStatusMeta = order
    ? PAYMENT_STATUS_CONFIG[order.paymentStatus ?? 'UNPAID']
    : null;
  const isCod = (order?.paymentMethod ?? 'COD') === 'COD';
  const isPrepaidPaid = !isCod && order?.paymentStatus === 'PAID';

  const resultStatusMeta =
    summary.totalRejectedUnits === 0
      ? null
      : summary.isFullRejection
        ? STATUS_CONFIG.REJECTED
        : STATUS_CONFIG.PARTIALLY_REJECTED;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onOpenChange(false);
        }
      }}
      purpose="form"
      width={660}
      maxHeight="88dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={
              order
                ? `Khách Từ Chối Nhận Hàng (${order.orderCode})`
                : 'Khách Từ Chối Nhận Hàng'
            }
            subtitle="Chọn sản phẩm và số lượng khách từ chối nhận, kèm lý do cụ thể. Tồn kho sẽ được hoàn lại depot ngay."
            onOpenChange={(open) => {
              if (!open && !submitting) {
                onOpenChange(false);
              }
            }}
          />
        }
        content={
          <LayoutContent>
            {order && (
              <Stack direction="vertical" gap={3}>
                {/* Order Summary */}
                <Card padding={3}>
                  <Stack direction="vertical" gap={1.5}>
                    <Stack
                      direction="horizontal"
                      justify="between"
                      align="center"
                      gap={2}
                      wrap="wrap"
                    >
                      <Stack direction="horizontal" align="center" gap={1.5} wrap="wrap">
                        <Text type="label" size="sm">
                          {order.orderCode}
                        </Text>
                        {paymentMethodMeta && (
                          <Badge
                            label={paymentMethodMeta.shortLabel}
                            variant={paymentMethodMeta.badgeVariant}
                          />
                        )}
                        {paymentStatusMeta && (
                          <Badge
                            label={paymentStatusMeta.shortLabel}
                            variant={paymentStatusMeta.badgeVariant}
                          />
                        )}
                      </Stack>
                      <Text type="label" size="sm" hasTabularNumbers>
                        Đơn gốc: {formatVND(order.totalAmount)}
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
                          Hoàn tồn kho về depot:{' '}
                          <Text type="label" size="xsm" color="primary">
                            {order.store.name}
                          </Text>
                        </Text>
                      </Stack>
                    )}
                  </Stack>
                </Card>

                {/* Rejection Reason & Note */}
                <Stack direction="vertical" gap={2}>
                  <Selector
                    label="Lý do khách hàng từ chối nhận hàng"
                    isRequired
                    variant="secondary"
                    size="sm"
                    width="100%"
                    options={REASON_OPTIONS}
                    value={reason}
                    isDisabled={submitting}
                    onChange={(val) => setReason(val as RejectionReason)}
                  />

                  <TextInput
                    label={
                      reason === 'OTHER'
                        ? 'Ghi chú chi tiết (Bắt buộc)'
                        : 'Ghi chú chi tiết (Tùy chọn)'
                    }
                    isRequired={reason === 'OTHER'}
                    size="sm"
                    width="100%"
                    value={note}
                    isDisabled={submitting}
                    onChange={setNote}
                    placeholder="VD: Khách kiểm tra thấy hộp bị móp góc, chỉ nhận 2/3 sản phẩm..."
                  />
                  {isOtherNoteMissing && (
                    <Text type="supporting" size="xsm" color="inherit" className="text-error">
                      Vui lòng nhập ghi chú cụ thể khi chọn &quot;Lý do khác&quot;.
                    </Text>
                  )}
                </Stack>

                {/* Per-item Rejection Selector */}
                <Stack direction="vertical" gap={2}>
                  <Stack
                    direction="horizontal"
                    justify="between"
                    align="center"
                    gap={2}
                    wrap="wrap"
                  >
                    <Stack direction="horizontal" align="center" gap={1.5}>
                      <PackageX className="w-4 h-4 text-accent shrink-0" />
                      <Text type="label" size="sm">
                        Sản phẩm bị từ chối ({summary.totalRejectedUnits}/{summary.totalOrderedUnits} SP)
                      </Text>
                    </Stack>

                    <Stack direction="horizontal" align="center" gap={1.5}>
                      <Button
                        label="Từ chối toàn bộ"
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={<Ban className="w-3.5 h-3.5" />}
                        isDisabled={submitting || summary.isFullRejection}
                        onClick={handleRejectAll}
                      />
                      <Button
                        label="Đặt về 0"
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                        isDisabled={submitting || summary.totalRejectedUnits === 0}
                        onClick={handleResetAll}
                      />
                    </Stack>
                  </Stack>

                  <Stack
                    direction="vertical"
                    isScrollable
                    className="max-h-56 border border-border rounded-lg"
                  >
                    <Table density="compact" aria-label="Danh sách sản phẩm từ chối">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Sản phẩm</TableHeaderCell>
                          <TableHeaderCell>Đơn giá</TableHeaderCell>
                          <TableHeaderCell>Đã đặt</TableHeaderCell>
                          <TableHeaderCell>SL từ chối</TableHeaderCell>
                          <TableHeaderCell>Tiền trả lại</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(order.items ?? []).map((item) => {
                          const rejQty = rejectedQtyMap[item.id] ?? 0;
                          const itemRejectedTotal = Number(item.price) * rejQty;
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Stack direction="vertical" gap={0.5}>
                                  <Text type="label" size="xsm">
                                    {item.productName}
                                  </Text>
                                  {item.sku && (
                                    <Text type="supporting" size="2xs">
                                      SKU: {item.sku}
                                    </Text>
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell>
                                <Text type="supporting" size="xsm" hasTabularNumbers>
                                  {formatVND(item.price)}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Text type="body" size="xsm" hasTabularNumbers>
                                  {item.quantity}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Stack direction="horizontal" align="center" gap={1}>
                                  <IconButton
                                    label={`Giảm số lượng từ chối ${item.productName}`}
                                    variant="secondary"
                                    size="sm"
                                    icon={<Minus className="w-3 h-3" />}
                                    isDisabled={submitting || rejQty <= 0}
                                    onClick={() =>
                                      setItemRejectedQty(item.id, item.quantity, rejQty - 1)
                                    }
                                  />
                                  <Text
                                    type="label"
                                    size="sm"
                                    hasTabularNumbers
                                    className="w-7 text-center"
                                  >
                                    {rejQty}
                                  </Text>
                                  <IconButton
                                    label={`Tăng số lượng từ chối ${item.productName}`}
                                    variant="secondary"
                                    size="sm"
                                    icon={<Plus className="w-3 h-3" />}
                                    isDisabled={submitting || rejQty >= item.quantity}
                                    onClick={() =>
                                      setItemRejectedQty(item.id, item.quantity, rejQty + 1)
                                    }
                                  />
                                </Stack>
                              </TableCell>
                              <TableCell>
                                <Text
                                  type="label"
                                  size="xsm"
                                  color={rejQty > 0 ? 'inherit' : 'secondary'}
                                  className={rejQty > 0 ? 'text-error' : undefined}
                                  hasTabularNumbers
                                >
                                  {rejQty > 0 ? `-${formatVND(itemRejectedTotal)}` : '0₫'}
                                </Text>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Stack>
                </Stack>

                {/* Financial & Status Impact Summary */}
                <Card padding={3}>
                  <Stack direction="vertical" gap={1.5}>
                    <Stack
                      direction="horizontal"
                      justify="between"
                      align="center"
                      gap={2}
                      wrap="wrap"
                    >
                      <Text type="label" size="xsm">
                        Trạng thái đơn sau khi xác nhận
                      </Text>
                      {resultStatusMeta ? (
                        <Badge
                          label={resultStatusMeta.label}
                          variant={resultStatusMeta.badgeVariant}
                        />
                      ) : (
                        <Text type="supporting" size="xsm" color="inherit" className="text-error">
                          Chưa chọn sản phẩm nào bị từ chối
                        </Text>
                      )}
                    </Stack>

                    <Stack direction="horizontal" justify="between" align="center" gap={2}>
                      <Text type="supporting" size="xsm">
                        Tổng tiền hàng bị từ chối (hoàn kho ngay)
                      </Text>
                      <Text
                        type="label"
                        size="sm"
                        color="inherit"
                        className="text-error"
                        hasTabularNumbers
                      >
                        -{formatVND(summary.rejectedAmount)}
                      </Text>
                    </Stack>

                    <Stack direction="horizontal" justify="between" align="center" gap={2}>
                      <Text type="supporting" size="xsm">
                        {isCod
                          ? 'Tiền COD khách cần thanh toán (phần nhận)'
                          : 'Giá trị phần hàng khách thực nhận'}
                      </Text>
                      <Text type="label" size="sm" color="accent" hasTabularNumbers>
                        {formatVND(summary.netAmount)}
                      </Text>
                    </Stack>

                    {isCod && !summary.isFullRejection && summary.totalRejectedUnits > 0 && (
                      <Text type="supporting" size="2xs">
                        Đơn COD giao một phần sẽ tự động ghi nhận Đã thanh toán cho phần hàng khách
                        nhận ({formatVND(summary.netAmount)}).
                      </Text>
                    )}

                    {isPrepaidPaid && summary.totalRejectedUnits > 0 && (
                      <Stack direction="horizontal" align="center" gap={1.5}>
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                        <Text type="label" size="2xs" color="inherit" className="text-warning">
                          Đơn đã thanh toán trước ({paymentMethodMeta?.shortLabel}) — Admin cần
                          hoàn tiền {formatVND(summary.rejectedAmount)} cho khách sau khi đối soát.
                        </Text>
                      </Stack>
                    )}
                  </Stack>
                </Card>
              </Stack>
            )}
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
                label={
                  summary.isFullRejection
                    ? 'Xác nhận từ chối toàn bộ'
                    : 'Xác nhận từ chối một phần'
                }
                type="button"
                variant="destructive"
                size="sm"
                icon={<PackageX className="w-3.5 h-3.5" />}
                isLoading={submitting}
                isDisabled={!canConfirm}
                onClick={handleSubmit}
              />
            </Stack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
