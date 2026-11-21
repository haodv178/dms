import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Save, Search } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
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
import { useToast } from '@astryxdesign/core/Toast';
import {
  fetchStoreInventory,
  getErrorMessage,
  updateStoreInventory,
} from '../api/dmsApi';
import {
  PRODUCT_CATEGORIES,
  formatVND,
  type ProductPagination,
  type Store,
  type StoreInventoryItem,
  type StoreInventorySummary,
} from '../types/dms';

interface DepotInventoryModalProps {
  store: Store | null;
  canManage: boolean;
  onClose: () => void;
  onInventoryUpdated: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'Tất cả danh mục' },
  ...PRODUCT_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
];

const STOCK_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả mức tồn' },
  { value: 'IN_STOCK', label: 'Còn hàng (> 0)' },
  { value: 'LOW_STOCK', label: 'Sắp hết (≤ 10)' },
  { value: 'OUT_OF_STOCK', label: 'Hết hàng (0)' },
];

export function DepotInventoryModal({
  store,
  canManage,
  onClose,
  onInventoryUpdated,
}: DepotInventoryModalProps) {
  const showToast = useToast();

  const [items, setItems] = useState<StoreInventoryItem[]>([]);
  const [pagination, setPagination] = useState<ProductPagination>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<StoreInventorySummary>({
    totalProducts: 0,
    inStockSkuCount: 0,
    outOfStockSkuCount: 0,
    lowStockSkuCount: 0,
    totalStock: 0,
  });

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track user-edited quantities keyed by productId -> { value, original }
  const [drafts, setDrafts] = useState<Record<number, { value: string; original: number }>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!store) {
      setSearch('');
      setDebouncedSearch('');
      setCategory('ALL');
      setStockFilter('ALL');
      setPage(1);
      setDrafts({});
    }
  }, [store]);

  const loadInventory = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const res = await fetchStoreInventory(store.id, {
        page,
        limit: 15,
        search: debouncedSearch,
        category,
        stockFilter,
      });
      setItems(res.items);
      setPagination(res.pagination);
      setSummary(res.summary);
    } catch (err) {
      showToast({
        body: `Không thể tải tồn kho depot: ${getErrorMessage(err)}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [store, page, debouncedSearch, category, stockFilter, showToast]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const dirtyEntries = useMemo(() => {
    const changed: Array<{ productId: number; rawValue: string; parsed: number }> = [];
    for (const [idStr, entry] of Object.entries(drafts)) {
      const parsed = entry.value.trim() === '' ? 0 : Number(entry.value);
      if (parsed !== entry.original) {
        changed.push({
          productId: Number(idStr),
          rawValue: entry.value,
          parsed,
        });
      }
    }
    return changed;
  }, [drafts]);

  const hasInvalidDraft = useMemo(
    () =>
      dirtyEntries.some(
        (entry) => !Number.isInteger(entry.parsed) || entry.parsed < 0
      ),
    [dirtyEntries]
  );

  const handleQuantityChange = (item: StoreInventoryItem, value: string) => {
    setDrafts((prev) => {
      const original = prev[item.productId]?.original ?? item.quantity;
      const parsed = value.trim() === '' ? 0 : Number(value);
      if (parsed === original && value.trim() !== '') {
        const next = { ...prev };
        delete next[item.productId];
        return next;
      }
      return {
        ...prev,
        [item.productId]: { value, original },
      };
    });
  };

  const handleSave = async () => {
    if (!store || dirtyEntries.length === 0) return;
    if (hasInvalidDraft) {
      showToast({
        body: 'Số lượng tồn kho phải là số nguyên >= 0.',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await updateStoreInventory(
        store.id,
        dirtyEntries.map((entry) => ({
          productId: entry.productId,
          quantity: entry.parsed,
        }))
      );
      showToast({ body: res.message, type: 'info', isAutoHide: true, autoHideDuration: 4000 });
      setDrafts({});
      await loadInventory();
      onInventoryUpdated();
    } catch (err) {
      showToast({
        body: `Lỗi cập nhật tồn kho: ${getErrorMessage(err)}`,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const storeCode = store
    ? store.code || `DEP-${String(store.id).padStart(3, '0')}`
    : '';

  return (
    <Dialog
      isOpen={Boolean(store)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="form"
      width={860}
      maxHeight="88dvh"
    >
      <Layout
        header={
          <DialogHeader
            title={store ? `Tồn Kho Depot: ${store.name} (${storeCode})` : 'Tồn Kho Depot'}
            subtitle={
              canManage
                ? 'Xem và cập nhật nhanh số lượng tồn kho của từng sản phẩm tại depot này'
                : 'Chế độ chỉ xem tồn kho sản phẩm tại depot'
            }
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            <div className="space-y-4">
              {/* Compact Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg border border-border bg-secondary/20">
                  <Text type="supporting" size="2xs">
                    Tổng tồn tại depot
                  </Text>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-accent" />
                    <Text type="label" size="sm" hasTabularNumbers>
                      {summary.totalStock.toLocaleString('vi-VN')}
                    </Text>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-border bg-secondary/20">
                  <Text type="supporting" size="2xs">
                    SKU còn hàng
                  </Text>
                  <div className="mt-0.5">
                    <Text type="label" size="sm" hasTabularNumbers>
                      {summary.inStockSkuCount.toLocaleString('vi-VN')} /{' '}
                      {summary.totalProducts.toLocaleString('vi-VN')}
                    </Text>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-border bg-secondary/20">
                  <Text type="supporting" size="2xs">
                    Sắp hết (≤ 10)
                  </Text>
                  <div className="mt-0.5">
                    <Text type="label" size="sm" hasTabularNumbers>
                      {summary.lowStockSkuCount.toLocaleString('vi-VN')}
                    </Text>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-border bg-secondary/20">
                  <Text type="supporting" size="2xs">
                    Hết hàng (0)
                  </Text>
                  <div className="mt-0.5">
                    <Text type="label" size="sm" hasTabularNumbers>
                      {summary.outOfStockSkuCount.toLocaleString('vi-VN')}
                    </Text>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex-1 min-w-[200px]">
                  <TextInput
                    label="Tìm sản phẩm"
                    isLabelHidden
                    type="search"
                    size="sm"
                    width="100%"
                    startIcon={<Search className="w-3.5 h-3.5" />}
                    placeholder="Tìm theo tên hoặc mã SKU..."
                    value={search}
                    onChange={(val) => {
                      setSearch(val);
                      setPage(1);
                    }}
                  />
                </div>
                <Selector
                  label="Lọc danh mục"
                  isLabelHidden
                  variant="secondary"
                  size="sm"
                  width={185}
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(val) => {
                    setCategory(val as string);
                    setPage(1);
                  }}
                />
                <Selector
                  label="Lọc mức tồn"
                  isLabelHidden
                  variant="secondary"
                  size="sm"
                  width={170}
                  options={STOCK_FILTER_OPTIONS}
                  value={stockFilter}
                  onChange={(val) => {
                    setStockFilter(val as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK');
                    setPage(1);
                  }}
                />
              </div>

              {/* Inventory Table */}
              <div className="rounded-lg border border-border overflow-x-auto">
                {loading && items.length === 0 ? (
                  <div className="py-10 text-center">
                    <Text type="supporting" size="sm">
                      Đang tải tồn kho depot...
                    </Text>
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-10 text-center">
                    <Text type="supporting" size="sm">
                      Không tìm thấy sản phẩm phù hợp.
                    </Text>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Mã SKU</TableHeaderCell>
                        <TableHeaderCell>Tên Sản Phẩm</TableHeaderCell>
                        <TableHeaderCell>Đơn Giá</TableHeaderCell>
                        <TableHeaderCell>Trạng Thái</TableHeaderCell>
                        <TableHeaderCell>Tồn Tại Depot</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const draft = drafts[item.productId];
                        const displayVal = draft ? draft.value : String(item.quantity);
                        const numericVal = displayVal.trim() === '' ? 0 : Number(displayVal);
                        const isDirty = Boolean(draft && numericVal !== draft.original);
                        const badgeVariant =
                          item.quantity === 0
                            ? 'error'
                            : item.quantity <= 10
                              ? 'orange'
                              : 'green';

                        return (
                          <TableRow key={item.productId}>
                            <TableCell>
                              <Text type="code" size="2xs">
                                {item.sku}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <Text type="label" size="xsm">
                                  {item.name}
                                </Text>
                                <Text type="supporting" size="2xs">
                                  {item.category} · {item.unit}
                                </Text>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Text type="supporting" size="xsm" hasTabularNumbers>
                                {formatVND(item.price)}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <Badge
                                label={
                                  item.quantity === 0
                                    ? 'Hết hàng'
                                    : item.quantity <= 10
                                      ? 'Sắp hết'
                                      : 'Còn hàng'
                                }
                                variant={badgeVariant}
                              />
                            </TableCell>
                            <TableCell>
                              {canManage ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-24">
                                    <TextInput
                                      label={`Tồn kho ${item.name}`}
                                      isLabelHidden
                                      inputMode="numeric"
                                      size="sm"
                                      width="100%"
                                      value={displayVal}
                                      onChange={(val) => handleQuantityChange(item, val)}
                                    />
                                  </div>
                                  {isDirty && (
                                    <Badge label="Đã sửa" variant="blue" />
                                  )}
                                </div>
                              ) : (
                                <Badge label={String(item.quantity)} variant={badgeVariant} />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              {pagination.total > pagination.limit && (
                <div className="flex items-center justify-between gap-3">
                  <Text type="supporting" size="2xs" hasTabularNumbers>
                    Trang {pagination.page} / {pagination.totalPages} ({pagination.total.toLocaleString('vi-VN')} sản phẩm)
                  </Text>
                  <Pagination
                    page={pagination.page}
                    totalItems={pagination.total}
                    pageSize={pagination.limit}
                    variant="pages"
                    size="sm"
                    isDisabled={loading}
                    label="Phân trang tồn kho depot"
                    onChange={setPage}
                  />
                </div>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex items-center justify-between gap-2 w-full">
              <div>
                {dirtyEntries.length > 0 && (
                  <Text type="supporting" size="xsm">
                    Có{' '}
                    <Text type="label" size="xsm" color="accent">
                      {dirtyEntries.length}
                    </Text>{' '}
                    sản phẩm chưa lưu thay đổi.
                  </Text>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  label="Đóng"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                />
                {canManage && (
                  <Button
                    label={
                      dirtyEntries.length > 0
                        ? `Lưu thay đổi (${dirtyEntries.length})`
                        : 'Lưu thay đổi'
                    }
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={<Save className="w-3.5 h-3.5" />}
                    isLoading={saving}
                    isDisabled={dirtyEntries.length === 0 || hasInvalidDraft}
                    onClick={() => void handleSave()}
                  />
                )}
              </div>
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
