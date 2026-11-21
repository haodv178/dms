import { useEffect, useMemo, type FormEvent } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Warehouse } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  DEFAULT_DEPOT,
  MAX_DELIVERY_DISTANCE_KM,
  type Store,
  type StoreFormState,
} from '../types/dms';

interface DepotFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingStore: Store | null;
  form: StoreFormState;
  onFormChange: (next: StoreFormState) => void;
  isDarkMode: boolean;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function createDepotPinIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:34px;height:34px;border-radius:9999px;
      background:#dc2626;color:white;font-weight:800;font-size:16px;
      border:3px solid white;box-shadow:0 4px 12px rgba(220,38,38,0.5);
      cursor:grab;
    ">🏪</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function DepotMapPickerController({
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
    if (distance > 30) {
      map.panTo(position, { animate: true });
    }
  }, [map, position]);

  return null;
}

export function DepotFormModal({
  isOpen,
  onOpenChange,
  mode,
  editingStore,
  form,
  onFormChange,
  isDarkMode,
  submitting,
  onSubmit,
}: DepotFormModalProps) {
  const isEdit = mode === 'edit';
  const depotIcon = useMemo(() => createDepotPinIcon(), []);

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

  const pinPosition: [number, number] = hasValidCoords
    ? [parsedLat, parsedLng]
    : [DEFAULT_DEPOT.latitude, DEFAULT_DEPOT.longitude];

  const handlePickLocation = (lat: number, lng: number) => {
    onFormChange({
      ...form,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={720}
      maxHeight="90dvh"
    >
      <form onSubmit={onSubmit} className="h-full flex flex-col min-h-0">
        <Layout
          header={
            <DialogHeader
              title={
                isEdit
                  ? `Chỉnh sửa điểm xuất phát ${editingStore?.code ?? ''}`
                  : 'Thêm điểm xuất phát (Kho / Depot)'
              }
              subtitle={
                isEdit
                  ? 'Cập nhật thông tin kho, tọa độ GPS và trạng thái hoạt động'
                  : `Khai báo điểm xuất phát mới cho thuật toán điều phối VRP (bán kính phục vụ ${MAX_DELIVERY_DISTANCE_KM} km)`
              }
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TextInput
                    label="Mã kho (Tùy chọn)"
                    placeholder="Để trống để tự sinh (DEP-002)"
                    value={form.code}
                    onChange={(val) => onFormChange({ ...form, code: val })}
                    size="sm"
                  />
                  <div className="sm:col-span-2">
                    <TextInput
                      label="Tên điểm xuất phát *"
                      placeholder="VD: Kho Trung Tâm Quận 1"
                      value={form.name}
                      onChange={(val) => onFormChange({ ...form, name: val })}
                      size="sm"
                      isRequired
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <TextInput
                      label="Địa chỉ chi tiết *"
                      placeholder="VD: 123 Lê Lợi, Bến Thành, Quận 1, TP.HCM"
                      value={form.address}
                      onChange={(val) => onFormChange({ ...form, address: val })}
                      size="sm"
                      isRequired
                    />
                  </div>
                  <TextInput
                    label="Số điện thoại liên hệ"
                    placeholder="VD: 02837753232"
                    value={form.phone}
                    onChange={(val) => onFormChange({ ...form, phone: val })}
                    size="sm"
                  />
                </div>

                {/* Coordinates + Interactive Map Picker */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-accent" />
                      <Text type="label" size="sm">
                        Vị trí GPS điểm xuất phát &amp; Vùng phủ sóng {MAX_DELIVERY_DISTANCE_KM} km
                      </Text>
                    </div>
                    <Badge
                      label="Click bản đồ hoặc kéo ghim 🏪"
                      variant="info"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextInput
                      label="Vĩ độ (Latitude) *"
                      placeholder="10.7423"
                      value={form.latitude}
                      onChange={(val) => onFormChange({ ...form, latitude: val })}
                      size="sm"
                      isRequired
                    />
                    <TextInput
                      label="Kinh độ (Longitude) *"
                      placeholder="106.7024"
                      value={form.longitude}
                      onChange={(val) => onFormChange({ ...form, longitude: val })}
                      size="sm"
                      isRequired
                    />
                  </div>

                  <div className="h-[240px] w-full rounded-lg overflow-hidden border border-border">
                    {isOpen && (
                      <MapContainer
                        center={pinPosition}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          key={isDarkMode ? 'dark' : 'light'}
                          attribution="&copy; OpenStreetMap"
                          url={isDarkMode ? DARK_TILE_URL : LIGHT_TILE_URL}
                        />
                        <DepotMapPickerController
                          position={pinPosition}
                          onPick={handlePickLocation}
                        />
                        <Circle
                          center={pinPosition}
                          radius={MAX_DELIVERY_DISTANCE_KM * 1000}
                          pathOptions={{
                            color: '#dc2626',
                            fillColor: '#ef4444',
                            fillOpacity: 0.08,
                            weight: 1.5,
                            dashArray: '6 4',
                          }}
                        />
                        <Marker
                          position={pinPosition}
                          icon={depotIcon}
                          draggable
                          eventHandlers={{
                            dragend: (e) => {
                              const pos = (e.target as L.Marker).getLatLng();
                              handlePickLocation(pos.lat, pos.lng);
                            },
                          }}
                        />
                      </MapContainer>
                    )}
                  </div>
                </div>

                <TextInput
                  label="Ghi chú"
                  placeholder="VD: Giờ hoạt động 06:00 - 22:00, có bãi đỗ xe tải nhỏ..."
                  value={form.notes}
                  onChange={(val) => onFormChange({ ...form, notes: val })}
                  size="sm"
                />

                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <CheckboxInput
                    size="sm"
                    label="Đặt làm điểm xuất phát mặc định"
                    isDisabled={Boolean(isEdit && editingStore?.isDefault)}
                    value={form.isDefault}
                    onChange={(checked) =>
                      onFormChange({
                        ...form,
                        isDefault: Boolean(checked),
                        isActive: checked ? true : form.isActive,
                      })
                    }
                  />
                  <CheckboxInput
                    size="sm"
                    label="Đang hoạt động"
                    isDisabled={form.isDefault}
                    value={form.isDefault ? true : form.isActive}
                    onChange={(checked) =>
                      onFormChange({ ...form, isActive: Boolean(checked) })
                    }
                  />
                </div>
                {isEdit && editingStore?.isDefault && (
                  <Text type="supporting" size="2xs">
                    Điểm xuất phát mặc định luôn ở trạng thái hoạt động. Để đổi mặc định, hãy chọn
                    &quot;Đặt mặc định&quot; ở một điểm xuất phát khác.
                  </Text>
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
                  type="submit"
                  label={
                    submitting
                      ? 'Đang lưu...'
                      : isEdit
                        ? 'Lưu thay đổi'
                        : 'Thêm điểm xuất phát'
                  }
                  variant="primary"
                  size="sm"
                  icon={<Warehouse className="w-4 h-4" />}
                  isLoading={submitting}
                />
              </div>
            </LayoutFooter>
          }
        />
      </form>
    </Dialog>
  );
}
