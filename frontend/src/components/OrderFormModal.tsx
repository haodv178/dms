import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Clock, CreditCard, Lock, MapPin, Plus, Search, Trash2, Warehouse } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
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
  DELIVERY_HOURS,
  MAX_DELIVERY_DISTANCE_KM,
  PAYMENT_METHODS,
  PAYMENT_METHOD_CONFIG,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_CONFIG,
  STATUS_CONFIG,
  computeOrderFormTotal,
  defaultPaymentStatusForMethod,
  formatDeliveryDateShort,
  formatTimeslot,
  formatVND,
  getDefaultDeliveryDate,
  haversineDistanceKm,
  isDeliveryDateBeforeToday,
  isOrderItemsEditable,
  toIsoDateString,
  type DeliveryHour,
  type Order,
  type OrderFormState,
  type PaymentMethod,
  type PaymentStatus,
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
  stores: Store[];
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
  stores,
  isDarkMode,
  submitting,
  onSubmit,
}: OrderFormModalProps) {
  const isEdit = mode === 'edit';
  const canEditItems = !isEdit || !editingOrder || isOrderItemsEditable(editingOrder.status);
  const pinIcon = useMemo(() => createPinIcon(), []);
  const depotIcon = useMemo(() => createDepotMiniIcon(), []);

  const selectableStores = useMemo(() => {
    const active = stores.filter((s) => s.isActive !== false);
    const list = active.length > 0 ? [...active] : [depot];
    if (isEdit && editingOrder?.store && !list.some((s) => s.id === editingOrder.storeId)) {
      list.push(editingOrder.store);
    }
    return list;
  }, [stores, depot, isEdit, editingOrder]);

  const selectedStore = useMemo(() => {
    const id = Number(form.storeId);
    if (Number.isInteger(id) && id > 0) {
      const found = selectableStores.find((s) => s.id === id);
      if (found) return found;
    }
    return selectableStores.find((s) => s.isDefault) ?? depot;
  }, [form.storeId, selectableStores, depot]);

  const storeOptions = useMemo(
    () =>
      selectableStores.map((s) => ({
        value: String(s.id),
        label: `${s.name}${s.isDefault ? ' (Mặc định)' : ''}${s.isActive === false ? ' [Ngừng HĐ]' : ''}`,
      })),
    [selectableStores]
  );

  const [catalogSearch, setCatalogSearch] = useState('');
  const [submittedCatalogSearch, setSubmittedCatalogSearch] = useState('');
  const [catalogSearchTick, setCatalogSearchTick] = useState(0);
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [depotStockMap, setDepotStockMap] = useState<Record<number, number>>({});

  // Seed depotStockMap from products prop if depotStocks breakdown is already present
  useEffect(() => {
    if (!isOpen) {
      setCatalogSearch('');
      setSubmittedCatalogSearch('');
      setCatalogResults([]);
      setSearchingCatalog(false);
      setDepotStockMap({});
      return;
    }

    const seeded: Record<number, number> = {};
    for (const p of products) {
      const ds = p.depotStocks?.find((d) => d.storeId === selectedStore.id);
      if (ds) {
        seeded[p.id] = ds.quantity;
      }
    }
    setDepotStockMap(seeded);
  }, [isOpen, selectedStore.id, products]);

  // Fetch catalog results only after admin explicitly searches with a non-empty keyword
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = submittedCatalogSearch.trim();
    if (!trimmed) {
      setCatalogResults([]);
      setSearchingCatalog(false);
      return;
    }

    let cancelled = false;
    setSearchingCatalog(true);

    (async () => {
      try {
        const res = await fetchProducts({
          activeOnly: true,
          storeId: selectedStore.id,
          search: trimmed,
          page: 1,
          limit: 15,
        });
        if (!cancelled) {
          setCatalogResults(res.items);
          setDepotStockMap((prev) => {
            const next = { ...prev };
            for (const p of res.items) {
              next[p.id] = p.stock;
            }
            return next;
          });
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
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, submittedCatalogSearch, catalogSearchTick, selectedStore.id]);

  const handleCatalogSearchInputChange = (value: string) => {
    setCatalogSearch(value);
    if (!value.trim()) {
      setSubmittedCatalogSearch('');
      setCatalogResults([]);
    }
  };

  const handleCatalogSearch = () => {
    const trimmed = catalogSearch.trim();
    if (!trimmed) {
      setSubmittedCatalogSearch('');
      setCatalogResults([]);
      return;
    }
    setSubmittedCatalogSearch(trimmed);
    setCatalogSearchTick((prev) => prev + 1);
  };

  // Ensure any already-selected items in form.items have their stock loaded for selectedStore.id
  useEffect(() => {
    if (!isOpen || form.items.length === 0) return;

    const missingItems = form.items.filter(
      (it) => it.productId && depotStockMap[it.productId] === undefined
    );
    if (missingItems.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<number, number> = {};
      for (const item of missingItems) {
        if (!item.productId) continue;
        const query = item.sku && item.sku !== '—' ? item.sku : item.productName;
        if (!query) continue;
        try {
          const res = await fetchProducts({
            storeId: selectedStore.id,
            search: query,
            page: 1,
            limit: 5,
          });
          const match = res.items.find((p) => p.id === item.productId);
          if (match) {
            updates[item.productId] = match.stock;
          }
        } catch {
          // Ignore individual lookup errors; server validates on submit
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDepotStockMap((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedStore.id, form.items, depotStockMap]);

  // Original quantities already held by this order if editing on the same depot
  const originalReservedByProductId = useMemo(() => {
    const map = new Map<number, number>();
    if (isEdit && editingOrder && editingOrder.storeId === selectedStore.id) {
      for (const it of editingOrder.items) {
        if (it.productId) {
          map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
        }
      }
    }
    return map;
  }, [isEdit, editingOrder, selectedStore.id]);

  const getEffectiveAvailable = (productId: number, rawDepotStock?: number): number | undefined => {
    const base = rawDepotStock !== undefined ? rawDepotStock : depotStockMap[productId];
    if (base === undefined) return undefined;
    return base + (originalReservedByProductId.get(productId) ?? 0);
  };

  // Requested quantities per productId in the current form
  const requestedByProductId = useMemo(() => {
    const map = new Map<number, number>();
    for (const it of form.items) {
      if (it.productId) {
        const qty = Math.max(0, Number(it.quantity) || 0);
        map.set(it.productId, (map.get(it.productId) ?? 0) + qty);
      }
    }
    return map;
  }, [form.items]);

  const stockIssuesByIndex = useMemo(() => {
    const issues = new Map<number, { available: number; requested: number }>();
    if (!canEditItems && editingOrder && selectedStore.id === editingOrder.storeId) {
      return issues;
    }
    form.items.forEach((item, idx) => {
      if (!item.productId) return;
      const available = getEffectiveAvailable(item.productId);
      if (available === undefined) return;
      const requested = requestedByProductId.get(item.productId) ?? (Number(item.quantity) || 0);
      if (requested > available) {
        issues.set(idx, { available, requested });
      }
    });
    return issues;
  }, [
    canEditItems,
    editingOrder,
    selectedStore.id,
    form.items,
    depotStockMap,
    originalReservedByProductId,
    requestedByProductId,
  ]);

  const hasStockConflict = stockIssuesByIndex.size > 0;

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
    : [selectedStore.latitude, selectedStore.longitude];

  const distanceKm = useMemo(() => {
    if (!hasValidCoords) return null;
    return haversineDistanceKm(
      selectedStore.latitude,
      selectedStore.longitude,
      parsedLat,
      parsedLng
    );
  }, [hasValidCoords, selectedStore.latitude, selectedStore.longitude, parsedLat, parsedLng]);

  const isOutOfRange = distanceKm !== null && distanceKm > MAX_DELIVERY_DISTANCE_KM;
  const todayDeliveryDate = getDefaultDeliveryDate();
  const minDeliveryDate = toIsoDateString(todayDeliveryDate);
  const isDeliveryDatePast = isDeliveryDateBeforeToday(form.deliveryDate, todayDeliveryDate);

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
    if (!canEditItems) return;
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
    if (!canEditItems) return;
    const nextItems = form.items.map((item, idx) =>
      idx === index ? { ...item, quantity } : item
    );
    onFormChange({ ...form, items: nextItems });
  };

  const handleRemoveItem = (index: number) => {
    if (!canEditItems) return;
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
                ? canEditItems
                  ? 'Cập nhật thông tin khách hàng, vị trí giao hàng và số lượng sản phẩm'
                  : 'Cập nhật thông tin khách hàng, vị trí giao hàng và thanh toán (chỉ sửa sản phẩm khi đơn ở trạng thái NEW)'
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

              {/* Departure Point Selection */}
              <div className="p-3 rounded-xl border border-border bg-muted/40 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Warehouse className="w-4 h-4 text-accent" />
                    <Text type="label" size="sm">
                      Điểm xuất phát (Kho / Depot)
                    </Text>
                  </div>
                  {distanceKm !== null && (
                    <Badge
                      label={
                        isOutOfRange
                          ? `Cách kho ${distanceKm.toFixed(2)} km (Vượt quá ${MAX_DELIVERY_DISTANCE_KM} km!)`
                          : `Cách kho ${distanceKm.toFixed(2)} km / tối đa ${MAX_DELIVERY_DISTANCE_KM} km`
                      }
                      variant={isOutOfRange ? 'error' : 'green'}
                    />
                  )}
                </div>

                <Selector
                  label="Chọn điểm xuất phát"
                  isLabelHidden
                  variant="secondary"
                  size="sm"
                  width="100%"
                  startIcon={<Warehouse className="w-3.5 h-3.5" />}
                  options={storeOptions}
                  value={String(selectedStore.id)}
                  onChange={(val) => onFormChange({ ...form, storeId: String(val) })}
                />

                {isOutOfRange && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <Text type="supporting" size="2xs">
                      Điểm giao hàng đang cách &quot;{selectedStore.name}&quot;{' '}
                      <strong>{distanceKm?.toFixed(2)} km</strong>, vượt quá giới hạn cho phép{' '}
                      <strong>{MAX_DELIVERY_DISTANCE_KM} km</strong>. Vui lòng chọn điểm xuất phát
                      gần hơn hoặc điều chỉnh tọa độ giao hàng nằm trong vòng tròn đỏ.
                    </Text>
                  </div>
                )}
              </div>

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

              {/* Delivery Schedule (Date & Timeslot) */}
              <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-accent" />
                    <Text type="label" size="sm">
                      Lịch giao hàng (11 khung giờ/ngày)
                    </Text>
                  </div>
                  <Badge
                    label={`${formatDeliveryDateShort(form.deliveryDate)} • ${formatTimeslot(form.hourDelivery)}`}
                    variant={isDeliveryDatePast ? 'error' : 'blue'}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DateInput
                    label="Ngày giao hàng"
                    isRequired
                    width="100%"
                    size="sm"
                    format="system_date"
                    min={minDeliveryDate}
                    value={toIsoDateString(form.deliveryDate)}
                    status={
                      isDeliveryDatePast
                        ? {
                            type: 'error',
                            message: `Ngày giao hàng không được nhỏ hơn hôm nay (${formatDeliveryDateShort(todayDeliveryDate)}).`,
                          }
                        : undefined
                    }
                    onChange={(val) =>
                      onFormChange({ ...form, deliveryDate: val ?? form.deliveryDate })
                    }
                  />

                  <Selector
                    label="Khung giờ giao hàng"
                    variant="secondary"
                    size="sm"
                    width="100%"
                    startIcon={<Clock className="w-3.5 h-3.5" />}
                    options={DELIVERY_HOURS.map((hour) => ({
                      value: String(hour),
                      label: formatTimeslot(hour),
                    }))}
                    value={String(form.hourDelivery)}
                    onChange={(val) =>
                      onFormChange({
                        ...form,
                        hourDelivery: Number(val) as DeliveryHour,
                      })
                    }
                  />
                </div>

                {isDeliveryDatePast && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <Text type="supporting" size="2xs">
                      Ngày giao hàng đang chọn (<strong>{formatDeliveryDateShort(form.deliveryDate)}</strong>) nhỏ hơn hôm nay (<strong>{formatDeliveryDateShort(todayDeliveryDate)}</strong>). Vui lòng chọn ngày giao hàng từ hôm nay trở đi.
                    </Text>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-accent" />
                    <Text type="label" size="sm">
                      Thông tin thanh toán
                    </Text>
                  </div>
                  <Badge
                    label={
                      form.paymentMethod === 'COD'
                        ? form.paymentStatus === 'PAID'
                          ? 'COD • Đã thu'
                          : 'Tài xế thu hộ khi giao'
                        : form.paymentStatus === 'PAID'
                          ? 'Đã thanh toán (0₫ thu hộ)'
                          : form.paymentStatus === 'REFUNDED'
                            ? 'Đã hoàn tiền'
                            : 'Chưa thanh toán online'
                    }
                    variant={PAYMENT_STATUS_CONFIG[form.paymentStatus].badgeVariant}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Selector
                    label="Phương thức thanh toán"
                    variant="secondary"
                    size="sm"
                    width="100%"
                    options={PAYMENT_METHODS.map((method) => ({
                      value: method,
                      label: PAYMENT_METHOD_CONFIG[method].label,
                    }))}
                    value={form.paymentMethod}
                    onChange={(val) => {
                      const nextMethod = String(val) as PaymentMethod;
                      const prevIsCod = form.paymentMethod === 'COD';
                      const nextIsCod = nextMethod === 'COD';
                      const nextStatus =
                        prevIsCod !== nextIsCod
                          ? defaultPaymentStatusForMethod(nextMethod)
                          : form.paymentStatus;
                      onFormChange({
                        ...form,
                        paymentMethod: nextMethod,
                        paymentStatus: nextStatus,
                      });
                    }}
                  />

                  <Selector
                    label="Trạng thái thanh toán"
                    variant="secondary"
                    size="sm"
                    width="100%"
                    options={PAYMENT_STATUSES.map((status) => ({
                      value: status,
                      label: PAYMENT_STATUS_CONFIG[status].label,
                    }))}
                    value={form.paymentStatus}
                    onChange={(val) =>
                      onFormChange({
                        ...form,
                        paymentStatus: String(val) as PaymentStatus,
                      })
                    }
                  />
                </div>

                <TextInput
                  label="Mã giao dịch (tùy chọn)"
                  width="100%"
                  size="sm"
                  value={form.paymentReference}
                  onChange={(val) => onFormChange({ ...form, paymentReference: val })}
                  placeholder="VD: MOMO-20261122-001, FT261122..."
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
                        <Circle
                          center={[selectedStore.latitude, selectedStore.longitude]}
                          radius={MAX_DELIVERY_DISTANCE_KM * 1000}
                          pathOptions={{
                            color: isOutOfRange ? '#e11d48' : '#2563eb',
                            fillColor: isOutOfRange ? '#e11d48' : '#3b82f6',
                            fillOpacity: 0.08,
                            weight: 1.5,
                            dashArray: '6 4',
                          }}
                        />
                        <Marker
                          position={[selectedStore.latitude, selectedStore.longitude]}
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

              {/* Product Catalog Picker (Strict Catalog Selection Only - NEW orders only) */}
              {canEditItems ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Text type="label" size="sm">
                      Chọn sản phẩm từ danh mục
                    </Text>
                    <Text type="supporting" size="2xs">
                      Hiển thị tồn kho thực tế tại {selectedStore.name}
                    </Text>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <TextInput
                        label="Tìm sản phẩm trong danh mục"
                        isLabelHidden
                        type="search"
                        enterKeyHint="search"
                        size="sm"
                        width="100%"
                        hasClear
                        startIcon={<Search className="w-3.5 h-3.5" />}
                        placeholder="Tìm kiếm sản phẩm theo tên hoặc mã SKU..."
                        value={catalogSearch}
                        onChange={handleCatalogSearchInputChange}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCatalogSearch();
                          }
                        }}
                      />
                    </div>
                    <Button
                      label="Tìm kiếm"
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Search className="w-3.5 h-3.5" />}
                      isLoading={searchingCatalog}
                      isDisabled={!catalogSearch.trim()}
                      onClick={handleCatalogSearch}
                    />
                  </div>

                  {submittedCatalogSearch !== '' && (
                    <div className="max-h-[170px] overflow-y-auto rounded-lg border border-border divide-y divide-border bg-secondary/15">
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
                        catalogResults.map((product) => {
                          const effectiveStock =
                            getEffectiveAvailable(product.id, product.stock) ?? product.stock;
                          const alreadyInOrder = requestedByProductId.get(product.id) ?? 0;
                          const isOutOfStock = effectiveStock <= 0;
                          const isMaxReached = !isOutOfStock && alreadyInOrder >= effectiveStock;

                          return (
                            <div
                              key={product.id}
                              className={`px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                                isOutOfStock ? 'opacity-65 bg-secondary/20' : 'hover:bg-secondary/40'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Text type="label" size="xsm" maxLines={1}>
                                    {product.name}
                                  </Text>
                                  <Text type="code" size="2xs">
                                    {product.sku}
                                  </Text>
                                  {isOutOfStock && (
                                    <Badge label="Hết hàng" variant="error" />
                                  )}
                                </div>
                                <Text type="supporting" size="2xs" hasTabularNumbers>
                                  {formatVND(product.price)} / {product.unit} • Tồn tại depot:{' '}
                                  {effectiveStock}
                                  {alreadyInOrder > 0 ? ` (đã chọn ${alreadyInOrder})` : ''}
                                </Text>
                              </div>
                              <Button
                                label={
                                  isOutOfStock
                                    ? 'Hết hàng'
                                    : isMaxReached
                                      ? 'Đã tối đa'
                                      : 'Thêm'
                                }
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={
                                  !isOutOfStock && !isMaxReached ? (
                                    <Plus className="w-3.5 h-3.5" />
                                  ) : undefined
                                }
                                isDisabled={isOutOfStock || isMaxReached}
                                onClick={() => handleSelectProduct(product)}
                              />
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <Text type="supporting" size="xsm">
                    Đơn hàng đang ở trạng thái{' '}
                    <strong>{statusMeta?.label ?? editingOrder?.status}</strong>. Chỉ cho phép thêm,
                    xóa hoặc sửa số lượng sản phẩm khi đơn hàng đang ở trạng thái{' '}
                    <strong>Mới (NEW)</strong>.
                  </Text>
                </div>
              )}

              {/* Order Items Table: 4 Columns (Tên sản phẩm, SKU, Giá [read-only], Qty [editable when NEW]) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Text type="label" size="sm">
                    Danh sách sản phẩm trong đơn ({form.items.length})
                  </Text>
                  {!canEditItems && (
                    <Badge label="Đã khóa chỉnh sửa" variant="warning" />
                  )}
                </div>

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
                        {form.items.map((item, idx) => {
                          const stockIssue = stockIssuesByIndex.get(idx);
                          const availableAtDepot = item.productId
                            ? getEffectiveAvailable(item.productId)
                            : undefined;

                          return (
                            <TableRow key={`${item.productId ?? item.sku}-${idx}`}>
                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <Text type="label" size="sm">
                                    {item.productName}
                                  </Text>
                                  {stockIssue ? (
                                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      <span className="text-[11px] font-medium">
                                        Vượt tồn kho tại {selectedStore.name} (còn{' '}
                                        {stockIssue.available}, cần {stockIssue.requested})
                                      </span>
                                    </div>
                                  ) : canEditItems && availableAtDepot !== undefined ? (
                                    <Text type="supporting" size="2xs" hasTabularNumbers>
                                      Tồn tại depot: {availableAtDepot}
                                    </Text>
                                  ) : null}
                                </div>
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
                                {canEditItems ? (
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
                                ) : (
                                  <Text type="label" size="sm" hasTabularNumbers>
                                    {item.quantity}
                                  </Text>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {hasStockConflict && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <Text type="supporting" size="xsm">
                      Một số sản phẩm vượt quá tồn kho tại depot{' '}
                      <Text type="label" size="xsm">
                        {selectedStore.name}
                      </Text>
                      . Vui lòng giảm số lượng, xóa sản phẩm hoặc chọn depot khác trước khi lưu.
                    </Text>
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
                isDisabled={isOutOfRange || hasStockConflict || isDeliveryDatePast}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
