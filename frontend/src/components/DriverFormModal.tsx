import { useMemo, type FormEvent } from 'react';
import { Warehouse } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  DRIVER_STATUS_CONFIG,
  DRIVER_VEHICLE_TYPES,
  type Driver,
  type DriverFormState,
  type DriverStatus,
  type Store,
} from '../types/dms';

interface DriverFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingDriver: Driver | null;
  stores: Store[];
  form: DriverFormState;
  onFormChange: (next: DriverFormState) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

const VEHICLE_TYPE_OPTIONS = DRIVER_VEHICLE_TYPES.map((vt) => ({
  value: vt,
  label: vt,
}));

const STATUS_OPTIONS = (Object.keys(DRIVER_STATUS_CONFIG) as DriverStatus[]).map((key) => ({
  value: key,
  label: DRIVER_STATUS_CONFIG[key].label,
}));

export function DriverFormModal({
  isOpen,
  onOpenChange,
  mode,
  editingDriver,
  stores,
  form,
  onFormChange,
  submitting,
  onSubmit,
}: DriverFormModalProps) {
  const isEdit = mode === 'edit';
  const hasActiveTrip = isEdit && Boolean(editingDriver?.activeTrip);

  const storeOptions = useMemo(() => {
    const currentStoreId = editingDriver?.storeId ?? null;
    const eligibleStores = stores.filter(
      (s) => s.isActive !== false || (currentStoreId !== null && s.id === currentStoreId)
    );
    return eligibleStores.map((s) => ({
      value: String(s.id),
      label: `${s.code || `DEP-${String(s.id).padStart(3, '0')}`} — ${s.name}${
        s.isDefault ? ' (Mặc định)' : ''
      }${s.isActive === false ? ' [Ngừng hoạt động]' : ''}`,
    }));
  }, [stores, editingDriver?.storeId]);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={560}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={
              isEdit && editingDriver
                ? `Chỉnh Sửa Tài Xế (${editingDriver.name})`
                : 'Thêm Tài Xế Mới'
            }
            subtitle={
              isEdit
                ? 'Cập nhật thông tin tài khoản, phương tiện và trạng thái hoạt động'
                : 'Tạo tài khoản tài xế mới và thông tin phương tiện giao hàng'
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="driver-form" onSubmit={onSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Họ tên tài xế"
                  isRequired
                  width="100%"
                  size="sm"
                  value={form.name}
                  onChange={(val) => onFormChange({ ...form, name: val })}
                  placeholder="VD: Nguyễn Văn A"
                />

                <TextInput
                  label="Số điện thoại"
                  isRequired
                  width="100%"
                  size="sm"
                  value={form.phone}
                  onChange={(val) => onFormChange({ ...form, phone: val })}
                  placeholder="VD: 0901234567"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Email đăng nhập"
                  isRequired
                  type="email"
                  width="100%"
                  size="sm"
                  value={form.email}
                  onChange={(val) => onFormChange({ ...form, email: val })}
                  placeholder="VD: dungpt@dms.vn"
                />

                <TextInput
                  label={isEdit ? 'Mật khẩu mới (tùy chọn)' : 'Mật khẩu (mặc định: 123)'}
                  type="password"
                  width="100%"
                  size="sm"
                  value={form.password}
                  onChange={(val) => onFormChange({ ...form, password: val })}
                  placeholder={isEdit ? 'Để trống nếu giữ nguyên' : 'Mặc định 123 nếu để trống'}
                />
              </div>

              <div className="space-y-1">
                <Selector
                  label="Depot phụ trách *"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  startIcon={<Warehouse className="w-3.5 h-3.5" />}
                  isDisabled={hasActiveTrip}
                  options={storeOptions}
                  value={form.storeId}
                  onChange={(val) =>
                    onFormChange({ ...form, storeId: String(val) })
                  }
                />
                {hasActiveTrip ? (
                  <Text type="supporting" size="2xs">
                    Không thể đổi depot khi tài xế đang có chuyến giao hàng hoạt động (
                    {editingDriver?.activeTrip?.tripCode}).
                  </Text>
                ) : (
                  <Text type="supporting" size="2xs">
                    Tài xế chỉ được nhận đơn hàng và chuyến giao thuộc depot này.
                  </Text>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Selector
                  label="Loại xe"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  options={VEHICLE_TYPE_OPTIONS}
                  value={form.vehicleType}
                  onChange={(val) =>
                    onFormChange({ ...form, vehicleType: val as string })
                  }
                />

                <TextInput
                  label="Biển số xe"
                  isRequired
                  width="100%"
                  size="sm"
                  value={form.licensePlate}
                  onChange={(val) => onFormChange({ ...form, licensePlate: val })}
                  placeholder="VD: 59X3-123.45"
                />

                <Selector
                  label="Trạng thái vận hành"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  options={STATUS_OPTIONS}
                  value={form.status}
                  onChange={(val) =>
                    onFormChange({ ...form, status: val as DriverStatus })
                  }
                />
              </div>

              <TextInput
                label="Ghi chú (tùy chọn)"
                width="100%"
                size="sm"
                value={form.notes}
                onChange={(val) => onFormChange({ ...form, notes: val })}
                placeholder="VD: Khu vực phụ trách, ca làm việc..."
              />

              <div className="pt-1">
                <CheckboxInput
                  size="sm"
                  label="Đang hoạt động (cho phép gán chuyến giao hàng)"
                  value={form.isActive}
                  onChange={(checked) =>
                    onFormChange({ ...form, isActive: Boolean(checked) })
                  }
                />
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
                label={isEdit ? 'Lưu thay đổi' : 'Thêm tài xế'}
                type="submit"
                form="driver-form"
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
