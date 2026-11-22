import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Store as StoreIcon } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import {
  PAYMENT_METHOD_CONFIG,
  PAYMENT_STATUS_CONFIG,
  STATUS_CONFIG,
  formatVND,
  getOrderCodAmount,
  isOrderPrepaid,
  isOrderUnpaidOnline,
  type Order,
  type Store,
} from '../types/dms';

interface RouteMapProps {
  depot: Store;
  orders: Order[];
  selectedOrderIds: number[];
  polylinePositions: [number, number][];
  allMapPoints: [number, number][];
  isDarkMode: boolean;
}

function createDepotIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:40px;height:40px;border-radius:9999px;
      background:#dc2626;color:white;font-weight:800;font-size:18px;
      border:3px solid white;box-shadow:0 4px 12px rgba(220,38,38,0.5);
    " title="Depot">🏪</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function createOrderMarkerIcon(order: Order, isSelected: boolean) {
  const seq = order.deliverySequence;
  const color = STATUS_CONFIG[order.status]?.dotColor || '#475569';
  const ring = isSelected ? '0 0 0 4px rgba(99,102,241,0.45),' : '';

  if (seq !== null && seq !== undefined) {
    return L.divIcon({
      className: 'leaflet-div-icon',
      html: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:34px;height:34px;border-radius:9999px;
        background:${color};color:white;font-weight:800;font-size:14px;
        border:3px solid white;box-shadow:${ring}0 3px 10px rgba(0,0,0,0.35);
      ">${seq}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -17],
    });
  }

  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:${color};color:white;font-weight:700;font-size:11px;
      border:2.5px solid white;box-shadow:${ring}0 2px 6px rgba(0,0,0,0.28);
    ">•</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function MapBoundsUpdater({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export function RouteMap({
  depot,
  orders,
  selectedOrderIds,
  polylinePositions,
  allMapPoints,
  isDarkMode,
}: RouteMapProps) {
  return (
    <Card padding={0}>
      <div className="flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-error" />
            <Heading level={4} accessibilityLevel={2}>
              Bản Đồ Lộ Trình &amp; Điều Phối (Leaflet OSM)
            </Heading>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
              <Text type="supporting" size="2xs">
                Kho (Depot)
              </Text>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              <Text type="supporting" size="2xs">
                Điểm giao (#1..#N)
              </Text>
            </span>
          </div>
        </div>

        <div className="h-[430px] w-full relative z-0">
          <MapContainer
            center={[depot.latitude, depot.longitude]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              key={isDarkMode ? 'dark-tiles' : 'light-tiles'}
              attribution={
                isDarkMode
                  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              }
              url={isDarkMode ? DARK_TILE_URL : LIGHT_TILE_URL}
            />

            <MapBoundsUpdater points={allMapPoints} />

            {/* Depot Marker */}
            <Marker position={[depot.latitude, depot.longitude]} icon={createDepotIcon()}>
              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-error flex items-center gap-1">
                    <StoreIcon className="w-3.5 h-3.5" />
                    {depot.name}
                  </div>
                  <div className="text-secondary">{depot.address}</div>
                  <div className="text-[11px] text-secondary">
                    GPS: {depot.latitude.toFixed(4)}, {depot.longitude.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* Order Markers */}
            {orders.map((order) => (
              <Marker
                key={order.id}
                position={[order.latitude, order.longitude]}
                icon={createOrderMarkerIcon(order, selectedOrderIds.includes(order.id))}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[200px]">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                      <span className="font-bold text-primary">{order.orderCode}</span>
                      {order.deliverySequence && (
                        <Badge
                          label={`Điểm dừng #${order.deliverySequence}`}
                          variant="purple"
                        />
                      )}
                    </div>
                    <div>
                      <strong>Khách hàng:</strong> {order.customerName}
                    </div>
                    <div>
                      <strong>SĐT:</strong> {order.customerPhone}
                    </div>
                    <div>
                      <strong>Địa chỉ:</strong> {order.customerAddress}
                    </div>
                    <div>
                      <strong>Thanh toán:</strong>{' '}
                      {PAYMENT_METHOD_CONFIG[order.paymentMethod ?? 'COD'].shortLabel} •{' '}
                      {PAYMENT_STATUS_CONFIG[order.paymentStatus ?? 'UNPAID'].label}
                    </div>
                    <div>
                      <strong>Thu hộ (COD):</strong>{' '}
                      {getOrderCodAmount(order) > 0 ? (
                        <span className="font-bold text-success">
                          {formatVND(getOrderCodAmount(order))}
                        </span>
                      ) : isOrderPrepaid(order) ? (
                        <span className="font-semibold text-success">
                          0₫ (Đã thanh toán)
                        </span>
                      ) : isOrderUnpaidOnline(order) ? (
                        <span className="font-semibold text-warning">
                          Chưa thanh toán ({formatVND(order.totalAmount)})
                        </span>
                      ) : (
                        <span>0₫</span>
                      )}
                    </div>
                    <div>
                      <strong>Trạng thái:</strong> {STATUS_CONFIG[order.status].label}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Polyline Route Connecting Depot -> Stop #1 -> Stop #2 -> ... */}
            {polylinePositions.length > 1 && (
              <Polyline
                positions={polylinePositions}
                pathOptions={{
                  color: isDarkMode ? '#818cf8' : '#4f46e5',
                  weight: 4,
                  opacity: 0.9,
                  dashArray: '8, 6',
                }}
              />
            )}
          </MapContainer>
        </div>
      </div>
    </Card>
  );
}
