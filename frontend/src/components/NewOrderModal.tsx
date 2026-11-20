import type { FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { NewOrderFormState } from '../types/dms';

interface NewOrderModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  form: NewOrderFormState;
  onFormChange: (next: NewOrderFormState) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

export function NewOrderModal({
  isOpen,
  onOpenChange,
  form,
  onFormChange,
  submitting,
  onSubmit,
}: NewOrderModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={480}
    >
      <DialogHeader
        title="Tạo Đơn Hàng Mới"
        subtitle="Nhập thông tin khách hàng và tọa độ giao hàng"
        onOpenChange={onOpenChange}
      />

      <form onSubmit={onSubmit} className="pt-4 space-y-3">
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

        <TextInput
          label="Địa chỉ giao hàng"
          isRequired
          width="100%"
          size="sm"
          value={form.customerAddress}
          onChange={(val) => onFormChange({ ...form, customerAddress: val })}
          placeholder="VD: 150 Nguyễn Lương Bằng, Quận 7, TP.HCM"
        />

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

        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Sản phẩm chính"
            width="100%"
            size="sm"
            value={form.productName}
            onChange={(val) => onFormChange({ ...form, productName: val })}
          />
          <TextInput
            label="Tổng tiền (VNĐ)"
            inputMode="numeric"
            width="100%"
            size="sm"
            value={form.totalAmount}
            onChange={(val) => onFormChange({ ...form, totalAmount: val })}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button
            label="Hủy"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          />
          <Button
            label="Tạo đơn hàng"
            type="submit"
            variant="primary"
            size="sm"
            isLoading={submitting}
          />
        </div>
      </form>
    </Dialog>
  );
}
