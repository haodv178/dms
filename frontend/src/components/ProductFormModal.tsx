import type { FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  PRODUCT_CATEGORIES,
  type Product,
  type ProductFormState,
} from '../types/dms';

interface ProductFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingProduct: Product | null;
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
  form,
  onFormChange,
  submitting,
  onSubmit,
}: ProductFormModalProps) {
  const isEdit = mode === 'edit';

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={540}
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
                ? 'Cập nhật thông tin giá bán, tồn kho và trạng thái kinh doanh'
                : 'Nhập thông tin sản phẩm mới vào danh mục kho hàng'
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="product-form" onSubmit={onSubmit} className="space-y-3.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                <TextInput
                  label="Tồn kho"
                  isRequired
                  inputMode="numeric"
                  width="100%"
                  size="sm"
                  value={form.stock}
                  onChange={(val) => onFormChange({ ...form, stock: val })}
                  placeholder="50"
                />
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
