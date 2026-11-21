import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
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
import { fetchProducts } from '../api/dmsApi';
import {
  STATUS_CONFIG,
  computeOrderFormTotal,
  formatVND,
  type Order,
  type OrderFormState,
  type Product,
  type Store,
} from '../types/dms';

interface OrderFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingOrder: Order | null;
  form: OrderFormState;
  onFormChange: (next: OrderFormState) => void;
  products: Product[];
  depot: Store;
  isDarkMode: boolean;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function createPinIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:32px;height:32px;border-radius:9999px;
      background:#2563eb;color:white;font-weight:800;font-size:15px;
      border:3px solid white;box-shadow:0 4px 12px rgba(37,99,235,0.5);
      cursor:grab;
    ">📍</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createDepotMiniIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:9999px;
      background:#dc2626;color:white;font-weight:700;font-size:13px;
      border:2px solid white;box-shadow:0 2px 8px rgba(220,38,38,0.45);
    " title="Kho (Depot)">🏪</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function MapPickerController({
  position,
  onPick,
}: {
  position: [number, number];
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    const current = map.getCenter();
    const distance = current.distanceTo(L.latLng(position[0], position[1]));
    if (distance > 15) {
      map.panTo(position, { animate: true });
    }
  }, [map, position]);

  return null;
}

export function OrderFormModal({
  isOpen,
  onOpenChange,
  mode,
  editingOrder,
  form,
  onFormChange,
  products,
  depot,
  isDarkMode,
  submitting,
  onSubmit,
}: OrderFormModalProps) {
  const isEdit = mode === 'edit';
  const pinIcon = useMemo(() => createPinIcon(), []);
  const depotIcon = useMemo(() => createDepotMiniIcon(), []);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<Product[]>(products);
  const [searchingCatalog, setSearchingCatalog] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCatalogSearch('');
      setCatalogResults(products);
      return;
    }

    let cancelled = false;
    const trimmed = catalogSearch.trim();
    if (!trimmed) {
      setCatalogResults(products.filter((p) => p.isActive).slice(0, 20));
      setSearchingCatalog(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingCatalog(true);
      try {
        const res = await fetchProducts({
          activeOnly: true,
          search: trimmed,
          page: 1,
          limit: 15,
        });
        if (!cancelled) {
          setCatalogResults(res.items);
        }
      } catch {
        if (!cancelled) {
          setCatalogResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingCatalog(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, catalogSearch, products]);

  const parsedLat = Number(form.latitude);
  const parsedLng = Number(form.longitude);
  const hasValidCoords =
    form.latitude.trim() !== '' &&
    form.longitude.trim() !== '' &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  const markerPosition: [number, number] = hasValidCoords
    ? [parsedLat, parsedLng]
    : [depot.latitude, depot.longitude];

  const computedTotal = useMemo(
    () => computeOrderFormTotal(form.items),
    [form.items]
  );

  const handleMapPick = (lat: number, lng: number) => {
    onFormChange({
      ...form,
      latitude: lat.toFixed(5),
      longitude: lng.toFixed(5),
    });
  };

  const handleSelectProduct = (product: Product) => {
    const existingIndex = form.items.findIndex(
      (it) =>
        (it.productId && it.productId === product.id) ||
        (it.sku && it.sku !== '—' && it.sku.toUpperCase() === product.sku.toUpperCase())
    );

    if (existingIndex >= 0) {
      const nextItems = form.items.map((it, idx) =>
        idx === existingIndex
          ? { ...it, quantity: String(Math.max(1, Number(it.quantity) || 1) + 1) }
          : it
      );
      onFormChange({ ...form, items: nextItems });
      return;
    }

    onFormChange({
      ...form,
      items: [
        ...form.items,
        {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          price: String(Number(product.price)),
          quantity: '1',
        },
      ],
    });
  };

  const handleUpdateQty = (index: number, quantity: string) => {
    const nextItems = form.items.map((item, idx) =>
      idx === index ? { ...item, quantity } : item
    );
    onFormChange({ ...form, items: nextItems });
  };

  const handleRemoveItem = (index: number) => {
    onFormChange({
      ...form,
      items: form.items.filter((_, idx) => idx !== index),
    });
  };

  const statusMeta = editingOrder ? STATUS_CONFIG[editingOrder.status] : null;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={760}
      maxHeight="88dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={
              isEdit && editingOrder
                ? `Chỉnh Sửa Đơn Hàng ${editingOrder.orderCode}`
                : 'Tạo Đơn Hàng Mới'
            }
            subtitle={
              isEdit
                ? 'Cập nhật thông tin khách hàng, vị trí giao hàng và số lượng sản phẩm'
                : 'Nhập thông tin khách hàng, chọn sản phẩm từ danh mục và vị trí giao hàng'
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="order-form" onSubmit={onSubmit} className="space-y-4">
              {isEdit && editingOrder && statusMeta && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border">
                  <div className="flex items-center gap-2">
                    <Text type="supporting" size="xsm">
                      Mã đơn:
                    </Text>
                    <Text type="label" size="sm">
                      {editingOrder.orderCode}
                    </Text>
                  </div>
                  <Badge label={statusMeta.label} variant={statusMeta.badgeVariant} />
                </div>
              )}

              {/* Customer Info */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextInput
                    label="Tên khách hàng"
                    isRequired
                    width="100%"
                    size="sm"
                    value={form.customerName}
                    onChange={(val) => onFormChange({ ...form, customerName: val })}
                    placeholder="VD: Nguyễn Thị Hương"
                  />

                  <TextInput
                    label="Số điện thoại"
                    type="tel"
                    inputMode="tel"
                    width="100%"
                    size="sm"
                    value={form.customerPhone}
                    onChange={(val) => onFormChange({ ...form, customerPhone: val })}
                    placeholder="VD: 0908123456"
                  />
                </div>

                <TextInput
                  label="Địa chỉ giao hàng"
                  isRequired
                  width="100%"
                  size="sm"
                  value={form.customerAddress}
                  onChange={(val) => onFormChange({ ...form, customerAddress: val })}
                  placeholder="VD: 150 Nguyễn Lương Bằng, Quận 7, TP.HCM"
                />
              </div>

              {/* GPS Coordinates & Interactive Mini-Map */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <TextInput
                    label="Vĩ độ (Latitude)"
                    isRequired
                    inputMode="decimal"
                    width="100%"
                    size="sm"
                    value={form.latitude}
                    onChange={(val) => onFormChange({ ...form, latitude: val })}
                  />
                  <TextInput
                    label="Kinh độ (Longitude)"
                    isRequired
                    inputMode="decimal"
                    width="100%"
                    size="sm"
                    value={form.longitude}
                    onChange={(val) => onFormChange({ ...form, longitude: val })}
                  />
                </div>

                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-secondary">
                    <MapPin className="w-3.5 h-3.5 text-accent" />
                    <Text type="supporting" size="2xs">
                      Click lên bản đồ hoặc kéo ghim xanh để chọn tọa độ giao hàng
                    </Text>
                  </span>

                  {isOpen && (
                    <div className="h-[190px] w-full rounded-lg overflow-hidden border border-border relative z-0">
                      <MapContainer
                        center={markerPosition}
                        zoom={14}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          key={isDarkMode ? 'picker-dark-tiles' : 'picker-light-tiles'}
                          attribution="&copy; OpenStreetMap"
                          url={isDarkMode ? DARK_TILE_URL : LIGHT_TILE_URL}
                        />
                        <MapPickerController
                          position={markerPosition}
                          onPick={handleMapPick}
                        />
                        <Marker
                          position={[depot.latitude, depot.longitude]}
                          icon={depotIcon}
                          interactive={false}
                        />
                        <Marker
                          position={markerPosition}
                          icon={pinIcon}
                          draggable
                          eventHandlers={{
                            dragend(e) {
                              const latLng = (e.target as L.Marker).getLatLng();
                              handleMapPick(latLng.lat, latLng.lng);
                            },
                          }}
                        />
                      </MapContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Catalog Picker (Strict Catalog Selection Only) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Text type="label" size="sm">
                    Chọn sản phẩm từ danh mục
                  </Text>
                  <Text type="supporting" size="2xs">
                    Tìm theo tên hoặc mã SKU để thêm vào đơn
                  </Text>
                </div>

                <TextInput
                  label="Tìm sản phẩm trong danh mục"
                  isLabelHidden
                  type="search"
                  size="sm"
                  width="100%"
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  placeholder="Tìm kiếm sản phẩm theo tên hoặc mã SKU..."
                  value={catalogSearch}
                  onChange={setCatalogSearch}
                />

                <div className="max-h-[150px] overflow-y-auto rounded-lg border border-border divide-y divide-border bg-secondary/15">
                  {searchingCatalog ? (
                    <div className="py-4 text-center">
                      <Text type="supporting" size="xsm">
                        Đang tìm sản phẩm...
                      </Text>
                    </div>
                  ) : catalogResults.length === 0 ? (
                    <div className="py-4 text-center">
                      <Text type="supporting" size="xsm">
                        Không tìm thấy sản phẩm đang kinh doanh phù hợp.
                      </Text>
                    </div>
                  ) : (
                    catalogResults.map((product) => (
                      <div
                        key={product.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Text type="label" size="xsm" maxLines={1}>
                              {product.name}
                            </Text>
                            <Text type="code" size="2xs">
                              {product.sku}
                            </Text>
                          </div>
                          <Text type="supporting" size="2xs" hasTabularNumbers>
                            {formatVND(product.price)} / {product.unit} • Tồn kho:{' '}
                            {product.stock}
                          </Text>
                        </div>
                        <Button
                          label="Thêm"
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={<Plus className="w-3.5 h-3.5" />}
                          onClick={() => handleSelectProduct(product)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Order Items Table: 4 Columns (Tên sản phẩm, SKU, Giá [read-only], Qty [editable]) */}
              <div className="space-y-2">
                <Text type="label" size="sm">
                  Danh sách sản phẩm trong đơn ({form.items.length})
                </Text>

                {form.items.length === 0 ? (
                  <div className="py-6 px-4 rounded-lg border border-dashed border-border text-center">
                    <Text type="supporting" size="xsm">
                      Chưa có sản phẩm nào. Hãy chọn sản phẩm từ danh mục phía trên.
                    </Text>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Tên sản phẩm</TableHeaderCell>
                          <TableHeaderCell>SKU</TableHeaderCell>
                          <TableHeaderCell>Giá</TableHeaderCell>
                          <TableHeaderCell>Qty</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.items.map((item, idx) => (
                          <TableRow key={`${item.productId ?? item.sku}-${idx}`}>
                            <TableCell>
                              <Text type="label" size="sm">
                                {item.productName}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <Text type="code" size="xsm">
                                {item.sku || '—'}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <Text type="supporting" size="sm" hasTabularNumbers>
                                {formatVND(item.price)}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-20">
                                  <TextInput
                                    label={`Số lượng cho ${item.productName}`}
                                    isLabelHidden
                                    isRequired
                                    inputMode="numeric"
                                    size="sm"
                                    width="100%"
                                    value={item.quantity}
                                    onChange={(val) => handleUpdateQty(idx, val)}
                                  />
                                </div>
                                <IconButton
                                  label={`Xóa ${item.productName}`}
                                  tooltip="Xóa sản phẩm khỏi đơn"
                                  variant="destructive"
                                  size="sm"
                                  icon={<Trash2 className="w-3.5 h-3.5" />}
                                  onClick={() => handleRemoveItem(idx)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-secondary/30">
                  <Text type="supporting" size="sm">
                    Tổng tiền tự tính:
                  </Text>
                  <Text type="label" size="sm" color="accent" hasTabularNumbers>
                    {formatVND(computedTotal)}
                  </Text>
                </div>
              </div>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                label="Hủy"
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              />
              <Button
                label={isEdit ? 'Lưu thay đổi' : 'Tạo đơn hàng'}
                type="submit"
                form="order-form"
                variant="primary"
                size="sm"
                isLoading={submitting}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
