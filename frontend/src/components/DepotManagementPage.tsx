import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Boxes,
  CheckCircle2,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Star,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Pagination } from '@astryxdesign/core/Pagination';
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
import {
  DEFAULT_DEPOT,
  MAX_DELIVERY_DISTANCE_KM,
  canRoleEditOrders,
  canRoleManageDepots,
  type Role,
  type Store,
  type StorePagination,
  type StoreSummary,
} from '../types/dms';
import { DepotInventoryModal } from './DepotInventoryModal';

interface DepotManagementPageProps {
  role: Role;
  stores: Store[];
  allStores: Store[];
  pagination: StorePagination;
  summary: StoreSummary;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading: boolean;
  isDarkMode: boolean;
  onOpenCreateStore: () => void;
  onEditStore: (store: Store) => void;
  onSetDefaultStore: (store: Store) => Promise<void>;
  onToggleStoreActive: (store: Store) => Promise<void>;
  onDeleteStore: (store: Store) => Promise<void>;
  onInventoryUpdated: () => void;
}

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function createOverviewDepotIcon(isDefault: boolean, isActive: boolean, isSelected: boolean) {
  const bg = !isActive ? '#64748b' : isDefault ? '#dc2626' : '#2563eb';
  const ring = isSelected ? '0 0 0 4px rgba(59,130,246,0.35), 0 4px 12px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.3)';
  const size = isSelected ? 36 : 30;
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${bg};color:white;font-weight:700;font-size:${isSelected ? 16 : 14}px;
      border:3px solid white;box-shadow:${ring};
    ">${isDefault ? '⭐' : '🏪'}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function OverviewMapFocusController({
  focusStore,
  stores,
}: {
  focusStore: Store | null;
  stores: Store[];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (focusStore) {
      map.flyTo([focusStore.latitude, focusStore.longitude], 12, { duration: 0.4 });
    } else if (stores.length > 1) {
      const bounds = L.latLngBounds(stores.map((s) => [s.latitude, s.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [map, focusStore, stores]);

  return null;
}

export function DepotManagementPage({
  role,
  stores,
  allStores,
  pagination,
  summary,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onPageSizeChange,
  loading,
  isDarkMode,
  onOpenCreateStore,
  onEditStore,
  onSetDefaultStore,
  onToggleStoreActive,
  onDeleteStore,
  onInventoryUpdated,
}: DepotManagementPageProps) {
  const [selectedMapStoreId, setSelectedMapStoreId] = useState<number | null>(null);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [inventoryModalStore, setInventoryModalStore] = useState<Store | null>(null);

  const canManage = canRoleManageDepots(role);
  const canManageInventory = canRoleEditOrders(role);

  const mapStores = useMemo(
    () => (allStores.length > 0 ? allStores : stores),
    [allStores, stores]
  );

  const selectedMapStore = useMemo(() => {
    if (selectedMapStoreId !== null) {
      const found = mapStores.find((s) => s.id === selectedMapStoreId);
      if (found) return found;
    }
    return mapStores.find((s) => s.isDefault) ?? mapStores[0] ?? null;
  }, [mapStores, selectedMapStoreId]);

  const initialCenter: [number, number] = selectedMapStore
    ? [selectedMapStore.latitude, selectedMapStore.longitude]
    : [DEFAULT_DEPOT.latitude, DEFAULT_DEPOT.longitude];

  const startItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  const handleConfirmDelete = async () => {
    if (!deletingStore) return;
    setConfirmingDelete(true);
    try {
      await onDeleteStore(deletingStore);
      setDeletingStore(null);
    } finally {
      setConfirmingDelete(false);
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
                Tổng điểm xuất phát
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalStores.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đang hoạt động
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.activeStores.toLocaleString('vi-VN')}
              </Heading>
              <Text type="supporting" size="2xs">
                Ngừng hoạt động: {summary.inactiveStores}
              </Text>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <Text type="supporting" size="xsm">
                Điểm xuất phát mặc định
              </Text>
              <Text type="label" size="sm">
                <span className="line-clamp-1">{summary.defaultStoreName}</span>
              </Text>
              <Text type="supporting" size="2xs">
                Bán kính phục vụ tối đa: {MAX_DELIVERY_DISTANCE_KM} km
              </Text>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-600 shrink-0">
              <Star className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đơn hàng / Chuyến xe
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalOrders.toLocaleString('vi-VN')} /{' '}
                {summary.totalTrips.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-600">
              <Navigation className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Overview Map Card */}
      <Card padding={4}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Heading level={4} accessibilityLevel={2}>
                  Bản đồ tổng quan các Điểm xuất phát
                </Heading>
                <Badge
                  label={`Bán kính giao hàng ${MAX_DELIVERY_DISTANCE_KM} km`}
                  variant="info"
                />
              </div>
              <Text type="supporting" size="xsm">
                Chọn một điểm xuất phát trên bản đồ hoặc bảng bên dưới để xem phạm vi phủ sóng{' '}
                {MAX_DELIVERY_DISTANCE_KM} km.
              </Text>
            </div>

            {selectedMapStore && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  label={`Đang xem: ${selectedMapStore.name}`}
                  variant={selectedMapStore.isDefault ? 'purple' : 'blue'}
                />
                <Text type="supporting" size="2xs" hasTabularNumbers>
                  ({selectedMapStore.latitude.toFixed(4)}, {selectedMapStore.longitude.toFixed(4)})
                </Text>
              </div>
            )}
          </div>

          <div className="h-[320px] w-full rounded-xl overflow-hidden border border-border">
            <MapContainer
              center={initialCenter}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                key={isDarkMode ? 'dark' : 'light'}
                attribution="&copy; OpenStreetMap"
                url={isDarkMode ? DARK_TILE_URL : LIGHT_TILE_URL}
              />
              <OverviewMapFocusController
                focusStore={selectedMapStore}
                stores={mapStores}
              />
              {selectedMapStore && (
                <Circle
                  center={[selectedMapStore.latitude, selectedMapStore.longitude]}
                  radius={MAX_DELIVERY_DISTANCE_KM * 1000}
                  pathOptions={{
                    color: selectedMapStore.isDefault ? '#dc2626' : '#2563eb',
                    fillColor: selectedMapStore.isDefault ? '#ef4444' : '#3b82f6',
                    fillOpacity: 0.08,
                    weight: 1.5,
                    dashArray: '6 4',
                  }}
                />
              )}
              {mapStores.map((store) => {
                const isSelected = selectedMapStore?.id === store.id;
                return (
                  <Marker
                    key={store.id}
                    position={[store.latitude, store.longitude]}
                    icon={createOverviewDepotIcon(
                      Boolean(store.isDefault),
                      store.isActive !== false,
                      isSelected
                    )}
                    eventHandlers={{
                      click: () => setSelectedMapStoreId(store.id),
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 min-w-[180px]">
                        <div className="font-semibold text-slate-900">
                          {store.name}
                          {store.isDefault ? ' ⭐' : ''}
                        </div>
                        <div className="text-slate-600">{store.address}</div>
                        {store.phone && (
                          <div className="text-slate-600">SĐT: {store.phone}</div>
                        )}
                        <div className="text-slate-500">
                          GPS: {store.latitude.toFixed(4)}, {store.longitude.toFixed(4)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>
      </Card>

      {/* Main Table Card */}
      <Card padding={4}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Heading level={4} accessibilityLevel={2}>
                  Danh sách Điểm xuất phát (Kho / Depot)
                </Heading>
                <Badge
                  label={`${pagination.total} điểm`}
                  variant="neutral"
                />
              </div>
              {!canManage && (
                <Text type="supporting" size="2xs">
                  Bạn đang xem ở quyền {role}. Chỉ vai trò ADMIN mới được thêm, sửa, đặt mặc định
                  hoặc xóa điểm xuất phát.
                </Text>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-64">
                <TextInput
                  label="Tìm kiếm điểm xuất phát"
                  isLabelHidden
                  placeholder="Tìm mã kho, tên, địa chỉ, SĐT..."
                  value={searchQuery}
                  onChange={onSearchQueryChange}
                  startIcon={<Search className="w-4 h-4" />}
                  size="sm"
                />
              </div>

              <Selector
                label="Lọc trạng thái"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={180}
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(val) => onStatusFilterChange(val as string)}
              />

              {canManage && (
                <Button
                  label="Thêm điểm xuất phát"
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={onOpenCreateStore}
                />
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table aria-label="Danh sách điểm xuất phát">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Mã kho</TableHeaderCell>
                  <TableHeaderCell>Tên &amp; Địa chỉ</TableHeaderCell>
                  <TableHeaderCell>Tọa độ GPS</TableHeaderCell>
                  <TableHeaderCell>Liên hệ</TableHeaderCell>
                  <TableHeaderCell>Tồn kho</TableHeaderCell>
                  <TableHeaderCell>Đơn / Chuyến / Tài xế</TableHeaderCell>
                  <TableHeaderCell>Trạng thái</TableHeaderCell>
                  <TableHeaderCell>Thao tác</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="py-10 text-center">
                        <Text type="supporting" size="sm">
                          Đang tải danh sách điểm xuất phát...
                        </Text>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="py-10 text-center flex flex-col items-center gap-2">
                        <Warehouse className="w-8 h-8 text-secondary" />
                        <Text type="label" size="sm">
                          Không tìm thấy điểm xuất phát nào
                        </Text>
                        <Text type="supporting" size="xsm">
                          Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái.
                        </Text>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  stores.map((store) => {
                    const isActive = store.isActive !== false;
                    const isDefault = Boolean(store.isDefault);
                    const isFocusedOnMap = selectedMapStore?.id === store.id;
                    const ordersCount = store.ordersCount ?? 0;
                    const tripsCount = store.tripsCount ?? 0;
                    const driversCount = store.driversCount ?? 0;

                    return (
                      <TableRow key={store.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedMapStoreId(store.id)}
                              className="text-left hover:underline cursor-pointer"
                              title="Xem trên bản đồ"
                            >
                              <Text type="label" size="xsm" color={isFocusedOnMap ? 'accent' : 'primary'}>
                                {store.code || `DEP-${String(store.id).padStart(3, '0')}`}
                              </Text>
                            </button>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5 max-w-[320px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedMapStoreId(store.id)}
                                className="text-left hover:underline cursor-pointer"
                                title={`Xem vị trí và bán kính ${MAX_DELIVERY_DISTANCE_KM} km trên bản đồ`}
                              >
                                <Text type="label" size="sm">
                                  {store.name}
                                </Text>
                              </button>
                              {isDefault && <Badge label="Mặc định" variant="purple" />}
                            </div>
                            <div className="flex items-start gap-1 text-secondary">
                              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <Text type="supporting" size="2xs">
                                {store.address}
                              </Text>
                            </div>
                            {store.notes && (
                              <Text type="supporting" size="2xs">
                                Ghi chú: {store.notes}
                              </Text>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Text type="supporting" size="2xs" hasTabularNumbers>
                            {store.latitude.toFixed(5)}, {store.longitude.toFixed(5)}
                          </Text>
                        </TableCell>

                        <TableCell>
                          {store.phone ? (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-secondary" />
                              <Text type="body" size="xsm" hasTabularNumbers>
                                {store.phone}
                              </Text>
                            </div>
                          ) : (
                            <Text type="supporting" size="2xs">
                              —
                            </Text>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Text type="label" size="xsm" hasTabularNumbers>
                              {(store.totalStock ?? 0).toLocaleString('vi-VN')} sp
                            </Text>
                            <Text type="supporting" size="2xs" hasTabularNumbers>
                              {(store.inStockSkuCount ?? 0).toLocaleString('vi-VN')} SKU còn hàng
                            </Text>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge label={`${ordersCount} đơn`} variant="cyan" />
                            <Badge label={`${tripsCount} chuyến`} variant="blue" />
                            <Badge label={`${driversCount} tài xế`} variant="purple" />
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            label={isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                            variant={isActive ? 'green' : 'neutral'}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1">
                            <IconButton
                              label={`Xem tồn kho ${store.name}`}
                              tooltip={canManageInventory ? 'Xem & chỉnh tồn kho depot' : 'Xem tồn kho depot'}
                              icon={<Boxes className="w-4 h-4" />}
                              variant="ghost"
                              size="sm"
                              onClick={() => setInventoryModalStore(store)}
                            />
                            {canManage && (
                              <>
                                {!isDefault && (
                                  <IconButton
                                    label="Đặt làm điểm xuất phát mặc định"
                                    tooltip="Đặt làm mặc định"
                                    icon={<Star className="w-4 h-4" />}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void onSetDefaultStore(store)}
                                  />
                                )}
                                <IconButton
                                  label="Chỉnh sửa điểm xuất phát"
                                  tooltip="Chỉnh sửa"
                                  icon={<Pencil className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                onClick={() => onEditStore(store)}
                              />
                              <IconButton
                                label={
                                  isDefault
                                    ? 'Không thể tắt điểm mặc định'
                                    : isActive
                                      ? 'Ngừng hoạt động'
                                      : 'Kích hoạt lại'
                                }
                                tooltip={
                                  isDefault
                                    ? 'Không thể tắt điểm mặc định'
                                    : isActive
                                      ? 'Ngừng hoạt động'
                                      : 'Kích hoạt lại'
                                }
                                icon={<Power className="w-4 h-4" />}
                                variant="ghost"
                                size="sm"
                                isDisabled={isDefault}
                                onClick={() => void onToggleStoreActive(store)}
                              />
                              <IconButton
                                label="Xóa điểm xuất phát"
                                tooltip={
                                  isDefault
                                    ? 'Không thể xóa điểm mặc định'
                                    : 'Xóa điểm xuất phát'
                                }
                                icon={<Trash2 className="w-4 h-4" />}
                                variant="destructive"
                                size="sm"
                                  isDisabled={isDefault}
                                  onClick={() => setDeletingStore(store)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
              <Text type="supporting" size="xsm" hasTabularNumbers>
                Hiển thị {startItem}–{endItem} trên tổng {pagination.total} điểm xuất phát
              </Text>

              <Pagination
                page={pagination.page}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                variant="pages"
                size="sm"
                isDisabled={loading}
                label="Phân trang danh sách điểm xuất phát"
                onChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingStore)}
        onOpenChange={(open) => {
          if (!open) setDeletingStore(null);
        }}
        purpose="form"
        width={460}
      >
        <Layout
          header={
            <DialogHeader
              title="Xác nhận xóa điểm xuất phát"
              onOpenChange={(open) => {
                if (!open) setDeletingStore(null);
              }}
            />
          }
          content={
            <LayoutContent>
              {deletingStore && (
                <div className="flex flex-col gap-2">
                  <Text type="body" size="sm">
                    Bạn có chắc muốn xóa điểm xuất phát{' '}
                    <Text type="label" size="sm">
                      {deletingStore.name}
                    </Text>{' '}
                    ({deletingStore.code})?
                  </Text>
                  {((deletingStore.ordersCount ?? 0) > 0 ||
                    (deletingStore.tripsCount ?? 0) > 0 ||
                    (deletingStore.driversCount ?? 0) > 0) && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <Text type="supporting" size="xsm">
                        Điểm xuất phát này đang gắn với {deletingStore.ordersCount ?? 0} đơn hàng,{' '}
                        {deletingStore.tripsCount ?? 0} chuyến xe và{' '}
                        {deletingStore.driversCount ?? 0} tài xế. Hệ thống sẽ chặn xóa để bảo toàn
                        dữ liệu — bạn hãy chuyển tài xế sang depot khác hoặc chuyển sang trạng thái
                        &quot;Ngừng hoạt động&quot;.
                      </Text>
                    </div>
                  )}
                </div>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <div className="flex items-center justify-end gap-2 w-full">
                <Button
                  label="Hủy"
                  variant="secondary"
                  size="sm"
                  isDisabled={confirmingDelete}
                  onClick={() => setDeletingStore(null)}
                />
                <Button
                  label={confirmingDelete ? 'Đang xóa...' : 'Xóa điểm xuất phát'}
                  variant="destructive"
                  size="sm"
                  isLoading={confirmingDelete}
                  onClick={() => void handleConfirmDelete()}
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Depot Inventory Modal */}
      <DepotInventoryModal
        store={inventoryModalStore}
        canManage={canManageInventory}
        onClose={() => setInventoryModalStore(null)}
        onInventoryUpdated={onInventoryUpdated}
      />
    </div>
  );
}
