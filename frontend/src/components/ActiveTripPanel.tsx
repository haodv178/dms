import { Clock, Navigation } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import {
  PAYMENT_METHOD_CONFIG,
  STATUS_CONFIG,
  formatVND,
  getOrderCodAmount,
  isOrderPrepaid,
  isOrderUnpaidOnline,
  type Order,
  type Store,
  type Trip,
} from '../types/dms';

interface ActiveTripPanelProps {
  depot: Store;
  activeTrip: Trip | null;
  routedOrders: Order[];
  onCompleteDelivery: (orderId: number) => void;
}

export function ActiveTripPanel({
  depot,
  activeTrip,
  routedOrders,
  onCompleteDelivery,
}: ActiveTripPanelProps) {
  return (
    <Card padding={4}>
      <div className="flex flex-col flex-1">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3 mb-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-accent" />
              <Heading level={4} accessibilityLevel={3}>
                Lộ Trình Chuyến Xe Tối Ưu (OR-Tools VRP Output)
              </Heading>
            </div>
            <Text type="supporting" size="xsm">
              {activeTrip
                ? `Mã chuyến: ${activeTrip.tripCode} • Tài xế: ${
                    activeTrip.driver?.name || 'Tài xế Nguyễn Văn A'
                  }`
                : 'Chưa có chuyến xe nào được khởi tạo'}
            </Text>
          </div>

          {activeTrip && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Text type="label" size="xsm" color="accent" hasTabularNumbers>
                Tổng quãng đường:{' '}
                {activeTrip.totalDistance
                  ? `${(activeTrip.totalDistance / 1000).toFixed(2)} km (${activeTrip.totalDistance} m)`
                  : 'N/A'}
              </Text>
              <Badge
                label={activeTrip.status}
                variant={activeTrip.status === 'COMPLETED' ? 'green' : 'blue'}
              />
            </div>
          )}
        </div>

        {routedOrders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 bg-muted rounded-xl border border-dashed border-border">
            <Clock className="w-8 h-8 text-secondary mb-2" />
            <Text type="label" size="sm">
              Chưa có lộ trình tối ưu nào trên bản đồ
            </Text>
            <Text type="supporting" size="xsm" as="p">
              Hãy chuyển các đơn hàng sang trạng thái{' '}
              <Text type="label" size="xsm" color="primary">
                PACKED
              </Text>
              , tick chọn và bấm nút{' '}
              <Text type="label" size="xsm" color="accent">
                &quot;Tối ưu hóa lộ trình với Google OR-Tools&quot;
              </Text>
              .
            </Text>
          </div>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {/* Start Depot */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-error-muted border border-error text-xs">
              <div className="w-7 h-7 rounded-full bg-error text-on-error font-bold flex items-center justify-center shrink-0">
                0
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <Text type="label" size="xsm" maxLines={1}>
                  Điểm xuất phát: {depot.name}
                </Text>
                <Text type="supporting" size="2xs" maxLines={1}>
                  {depot.address}
                </Text>
              </div>
            </div>

            {/* Ordered Stops */}
            {routedOrders.map((stopOrder) => {
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
                      {stopOrder.deliverySequence}
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Text type="label" size="xsm">
                          {stopOrder.orderCode}
                        </Text>
                        <Text type="supporting" size="2xs">
                          •
                        </Text>
                        <Text type="body" size="xsm" maxLines={1}>
                          {stopOrder.customerName}
                        </Text>
                      </div>
                      <Text type="supporting" size="2xs" maxLines={1}>
                        {stopOrder.customerAddress}
                      </Text>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <Badge
                          label={PAYMENT_METHOD_CONFIG[stopOrder.paymentMethod ?? 'COD'].shortLabel}
                          variant={PAYMENT_METHOD_CONFIG[stopOrder.paymentMethod ?? 'COD'].badgeVariant}
                        />
                        {getOrderCodAmount(stopOrder) > 0 ? (
                          <Text type="label" size="2xs" color="accent" hasTabularNumbers>
                            Thu hộ COD: {formatVND(getOrderCodAmount(stopOrder))}
                          </Text>
                        ) : isOrderPrepaid(stopOrder) ? (
                          <Badge label="Đã thanh toán (0₫ thu hộ)" variant="success" />
                        ) : isOrderUnpaidOnline(stopOrder) ? (
                          <Badge label="Chưa thanh toán" variant="warning" />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      label={statusMeta.shortLabel}
                      variant={statusMeta.badgeVariant}
                    />
                    {stopOrder.status === 'DELIVERING' && (
                      <Button
                        label="Giao xong"
                        variant="primary"
                        size="sm"
                        onClick={() => onCompleteDelivery(stopOrder.id)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
