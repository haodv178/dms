import { useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Package,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
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
  PRODUCT_CATEGORIES,
  canRoleEditOrders,
  formatVND,
  type Product,
  type ProductPagination,
  type ProductSummary,
  type Role,
  type Store,
} from '../types/dms';

interface ProductManagementPageProps {
  role: Role;
  products: Product[];
  stores: Store[];
  depotFilter: string;
  onDepotFilterChange: (value: string) => void;
  pagination: ProductPagination;
  summary: ProductSummary;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading: boolean;
  onOpenCreateProduct: () => void;
  onEditProduct: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDeleteProduct: (product: Product) => Promise<void>;
}

const CATEGORY_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả danh mục' },
  ...PRODUCT_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function ProductManagementPage({
  role,
  products,
  stores,
  depotFilter,
  onDepotFilterChange,
  pagination,
  summary,
  searchQuery,
  onSearchQueryChange,
  categoryFilter,
  onCategoryFilterChange,
  onPageChange,
  onPageSizeChange,
  loading,
  onOpenCreateProduct,
  onEditProduct,
  onToggleActive,
  onDeleteProduct,
}: ProductManagementPageProps) {
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canManage = canRoleEditOrders(role);
  const selectedStore =
    depotFilter !== 'ALL'
      ? stores.find((s) => String(s.id) === depotFilter) ?? null
      : null;

  const depotFilterOptions = [
    { value: 'ALL', label: 'Tất cả depot (Tổng tồn)' },
    ...stores.map((s) => ({
      value: String(s.id),
      label: `${s.code || `DEP-${String(s.id).padStart(3, '0')}`} · ${s.name}${s.isDefault ? ' (Mặc định)' : ''}`,
    })),
  ];

  const startItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setConfirmingDelete(true);
    try {
      await onDeleteProduct(deletingProduct);
      setDeletingProduct(null);
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
                Tổng sản phẩm
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalProducts.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                Đang kinh doanh
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.activeProducts.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-success">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                {selectedStore
                  ? `Sắp hết tại ${selectedStore.code || 'Depot'} (≤ 10)`
                  : 'Sắp hết hàng (≤ 10)'}
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.lowStockProducts.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-warning">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding={4}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Text type="supporting" size="xsm">
                {selectedStore
                  ? `Tồn kho tại ${selectedStore.code || selectedStore.name}`
                  : 'Tổng tồn kho tất cả depot'}
              </Text>
              <Heading level={3} accessibilityLevel={2}>
                {summary.totalStock.toLocaleString('vi-VN')}
              </Heading>
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center text-accent">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Product Catalog Table Card */}
      <Card padding={0}>
        <div className="flex flex-col">
          {/* Toolbar */}
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Heading level={4} accessibilityLevel={2}>
                Danh Mục Sản Phẩm Kho
              </Heading>
              <Text type="supporting" size="xsm" hasTabularNumbers>
                {pagination.total > 0
                  ? `Hiển thị ${startItem.toLocaleString('vi-VN')}–${endItem.toLocaleString('vi-VN')} trên ${pagination.total.toLocaleString('vi-VN')} sản phẩm`
                  : 'Không có sản phẩm phù hợp'}
                {!canManage && ' — Chế độ chỉ xem (DRIVER)'}
              </Text>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-60">
                <TextInput
                  label="Tìm kiếm sản phẩm"
                  isLabelHidden
                  type="search"
                  size="sm"
                  width="100%"
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  placeholder="Tìm theo tên hoặc SKU..."
                  value={searchQuery}
                  onChange={onSearchQueryChange}
                />
              </div>

              <Selector
                label="Lọc theo depot"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={230}
                options={depotFilterOptions}
                value={depotFilter}
                onChange={(val) => onDepotFilterChange(val as string)}
              />

              <Selector
                label="Lọc theo danh mục"
                isLabelHidden
                variant="secondary"
                size="sm"
                width={190}
                options={CATEGORY_FILTER_OPTIONS}
                value={categoryFilter}
                onChange={(val) => onCategoryFilterChange(val as string)}
              />

              {canManage && (
                <Button
                  label="Thêm sản phẩm"
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={onOpenCreateProduct}
                />
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading && products.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Đang tải danh sách sản phẩm...
                </Text>
              </div>
            ) : products.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Text type="supporting" size="sm">
                  Không tìm thấy sản phẩm nào phù hợp.
                </Text>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Mã SKU</TableHeaderCell>
                    <TableHeaderCell>Tên Sản Phẩm</TableHeaderCell>
                    <TableHeaderCell>Danh Mục</TableHeaderCell>
                    <TableHeaderCell>Đơn Vị</TableHeaderCell>
                    <TableHeaderCell>Đơn Giá</TableHeaderCell>
                    <TableHeaderCell>
                      {selectedStore
                        ? `Tồn Kho (${selectedStore.code || selectedStore.name})`
                        : 'Tồn Kho (Theo Depot)'}
                    </TableHeaderCell>
                    <TableHeaderCell>Trạng Thái</TableHeaderCell>
                    {canManage && <TableHeaderCell>Thao Tác</TableHeaderCell>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const stockBadgeVariant =
                      product.stock === 0
                        ? 'error'
                        : product.stock <= 10
                          ? 'orange'
                          : 'green';
                    const stockLabel =
                      product.stock === 0
                        ? 'Hết hàng (0)'
                        : product.stock <= 10
                          ? `Sắp hết (${product.stock})`
                          : String(product.stock);

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Text type="code" size="xsm">
                            {product.sku}
                          </Text>
                        </TableCell>

                        <TableCell>
                          <Text type="label" size="sm">
                            {product.name}
                          </Text>
                        </TableCell>

                        <TableCell>
                          <Badge label={product.category} variant="neutral" />
                        </TableCell>

                        <TableCell>
                          <Text type="supporting" size="sm">
                            {product.unit}
                          </Text>
                        </TableCell>

                        <TableCell>
                          <Text type="label" size="sm" hasTabularNumbers>
                            {formatVND(product.price)}
                          </Text>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div>
                              <Badge label={stockLabel} variant={stockBadgeVariant} />
                            </div>
                            {!selectedStore &&
                              product.depotStocks &&
                              product.depotStocks.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {product.depotStocks.map((ds) => (
                                    <span
                                      key={ds.storeId}
                                      title={`${ds.storeName}: ${ds.quantity}`}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-secondary/50 text-secondary border border-border/60 tabular-nums"
                                    >
                                      {ds.storeCode}: {ds.quantity}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            label={product.isActive ? 'Đang bán' : 'Ngừng bán'}
                            variant={product.isActive ? 'success' : 'neutral'}
                          />
                        </TableCell>

                        {canManage && (
                          <TableCell>
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <IconButton
                                label={`Chỉnh sửa ${product.name}`}
                                tooltip="Chỉnh sửa sản phẩm"
                                variant="secondary"
                                size="sm"
                                icon={<Pencil className="w-3.5 h-3.5" />}
                                onClick={() => onEditProduct(product)}
                              />
                              <IconButton
                                label={
                                  product.isActive
                                    ? `Ngừng bán ${product.name}`
                                    : `Mở bán lại ${product.name}`
                                }
                                tooltip={
                                  product.isActive ? 'Ngừng bán' : 'Mở bán lại'
                                }
                                variant="secondary"
                                size="sm"
                                icon={<Power className="w-3.5 h-3.5" />}
                                onClick={() => onToggleActive(product)}
                              />
                              <IconButton
                                label={`Xóa ${product.name}`}
                                tooltip="Xóa sản phẩm"
                                variant="destructive"
                                size="sm"
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                onClick={() => setDeletingProduct(product)}
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Server-Side Pagination Footer */}
          {pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <Text type="supporting" size="xsm" hasTabularNumbers>
                Trang{' '}
                <Text type="label" size="xsm" color="primary" hasTabularNumbers>
                  {pagination.page}
                </Text>{' '}
                / {pagination.totalPages} ({startItem.toLocaleString('vi-VN')}–
                {endItem.toLocaleString('vi-VN')} trên{' '}
                {pagination.total.toLocaleString('vi-VN')} sản phẩm)
              </Text>

              <Pagination
                page={pagination.page}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                variant="pages"
                size="sm"
                isDisabled={loading}
                label="Phân trang danh sách sản phẩm"
                onChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingProduct)}
        onOpenChange={(open) => {
          if (!open) setDeletingProduct(null);
        }}
        purpose="form"
        width={420}
      >
        <Layout
          header={
            <DialogHeader
              title="Xác Nhận Xóa Sản Phẩm"
              subtitle="Hành động này không thể hoàn tác"
              onOpenChange={(open) => {
                if (!open) setDeletingProduct(null);
              }}
            />
          }
          content={
            <LayoutContent>
              <Text type="body" size="sm">
                Bạn có chắc muốn xóa sản phẩm{' '}
                <Text type="label" size="sm">
                  {deletingProduct?.name}
                </Text>{' '}
                ({deletingProduct?.sku}) khỏi danh mục kho?
              </Text>
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
                  onClick={() => setDeletingProduct(null)}
                />
                <Button
                  label="Xóa sản phẩm"
                  type="button"
                  variant="destructive"
                  size="sm"
                  isLoading={confirmingDelete}
                  onClick={handleConfirmDelete}
                />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}
