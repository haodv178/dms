import type { FormEvent } from 'react';
import { Warehouse } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  PRODUCT_CATEGORIES,
  type Product,
  type ProductFormState,
  type Store,
} from '../types/dms';

interface ProductFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingProduct: Product | null;
  stores: Store[];
  form: ProductFormState;
  onFormChange: (next: ProductFormState) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((cat) => ({
  value: cat,
  label: cat,
}));

export function ProductFormModal({
  isOpen,
  onOpenChange,
  mode,
  editingProduct,
  stores,
  form,
  onFormChange,
  submitting,
  onSubmit,
}: ProductFormModalProps) {
  const isEdit = mode === 'edit';

  const orderedStores = [...stores].sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
    if ((a.isActive !== false) !== (b.isActive !== false)) {
      return a.isActive !== false ? -1 : 1;
    }
    return a.id - b.id;
  });

  const totalStock = orderedStores.reduce((sum, s) => {
    const raw = form.depotStocks[s.id];
    const parsed = raw === undefined || raw.trim() === '' ? 0 : Number(raw);
    return sum + (Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0);
  }, 0);

  const handleDepotStockChange = (storeId: number, value: string) => {
    onFormChange({
      ...form,
      depotStocks: {
        ...form.depotStocks,
        [storeId]: value,
      },
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={580}
      maxHeight="85dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={
              isEdit && editingProduct
                ? `Chỉnh Sửa Sản Phẩm (${editingProduct.sku})`
                : 'Thêm Sản Phẩm Mới'
            }
            subtitle={
              isEdit
                ? 'Cập nhật thông tin giá bán, tồn kho tại từng depot và trạng thái kinh doanh'
                : 'Nhập thông tin sản phẩm mới và phân bổ tồn kho ban đầu theo từng depot'
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="product-form" onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Mã SKU"
                  width="100%"
                  size="sm"
                  value={form.sku}
                  onChange={(val) => onFormChange({ ...form, sku: val })}
                  placeholder="Để trống để tự động tạo"
                />

                <Selector
                  label="Danh mục"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  options={CATEGORY_OPTIONS}
                  value={form.category}
                  onChange={(val) =>
                    onFormChange({ ...form, category: val as string })
                  }
                />
              </div>

              <TextInput
                label="Tên sản phẩm"
                isRequired
                width="100%"
                size="sm"
                value={form.name}
                onChange={(val) => onFormChange({ ...form, name: val })}
                placeholder="VD: Gạo ST25 Ông Cua 5kg"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Đơn vị tính"
                  isRequired
                  width="100%"
                  size="sm"
                  value={form.unit}
                  onChange={(val) => onFormChange({ ...form, unit: val })}
                  placeholder="Hộp, Kg, Túi..."
                />

                <TextInput
                  label="Đơn giá (VNĐ)"
                  isRequired
                  inputMode="numeric"
                  width="100%"
                  size="sm"
                  value={form.price}
                  onChange={(val) => onFormChange({ ...form, price: val })}
                  placeholder="50000"
                />
              </div>

              {/* Per-depot stock inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Warehouse className="w-4 h-4 text-accent" />
                    <Text type="label" size="sm">
                      Tồn kho theo từng Depot (Kho hàng)
                    </Text>
                  </div>
                  <Badge
                    label={`Tổng tồn: ${totalStock.toLocaleString('vi-VN')}`}
                    variant={totalStock === 0 ? 'error' : totalStock <= 10 ? 'orange' : 'green'}
                  />
                </div>

                {orderedStores.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-border text-center">
                    <Text type="supporting" size="xsm">
                      Chưa có depot nào trong hệ thống.
                    </Text>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border max-h-[220px] overflow-y-auto bg-secondary/10">
                    {orderedStores.map((store) => {
                      const code = store.code || `DEP-${String(store.id).padStart(3, '0')}`;
                      const value = form.depotStocks[store.id] ?? '0';
                      return (
                        <div
                          key={store.id}
                          className="px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Text type="code" size="2xs">
                                {code}
                              </Text>
                              <Text type="label" size="xsm" maxLines={1}>
                                {store.name}
                              </Text>
                              {store.isDefault && (
                                <Badge label="Mặc định" variant="purple" />
                              )}
                              {store.isActive === false && (
                                <Badge label="Ngừng HĐ" variant="neutral" />
                              )}
                            </div>
                          </div>
                          <div className="w-28 shrink-0">
                            <TextInput
                              label={`Tồn kho tại ${store.name}`}
                              isLabelHidden
                              inputMode="numeric"
                              size="sm"
                              width="100%"
                              value={value}
                              onChange={(val) => handleDepotStockChange(store.id, val)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-1">
                <CheckboxInput
                  size="sm"
                  label="Đang kinh doanh (hiển thị khi tạo đơn hàng)"
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
                label={isEdit ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
                type="submit"
                form="product-form"
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
