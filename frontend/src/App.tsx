import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { useToast } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { defaultThemeSlug, themes } from './astryx-themes';
import {
  completeDeliveryOrder,
  completePackingOrder,
  createOrder,
  createProduct,
  deleteProduct,
  failDeliveryOrder,
  fetchDashboardData,
  fetchProducts,
  getErrorMessage,
  optimizeTripRoute,
  seedSampleOrders,
  startPickingOrder,
  updateOrder,
  updateProduct,
} from './api/dmsApi';
import { ActiveTripPanel } from './components/ActiveTripPanel';
import { Header } from './components/Header';
import { OrderFormModal } from './components/OrderFormModal';
import { OrderTable } from './components/OrderTable';
import { ProductFormModal } from './components/ProductFormModal';
import { ProductManagementPage } from './components/ProductManagementPage';
import { RouteMap } from './components/RouteMap';
import {
  DEFAULT_DEPOT,
  INITIAL_ORDER_FORM,
  INITIAL_PRODUCT_FORM,
  orderToFormState,
  productToFormState,
  type ActivePage,
  type Order,
  type OrderFormState,
  type Product,
  type ProductFormState,
  type ProductPagination,
  type ProductSummary,
  type Role,
  type Store,
  type ThemeMode,
  type Trip,
} from './types/dms';

const THEME_MODE_STORAGE_KEY = 'dms-astryx-theme-mode';

function readStoredThemeMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'system';
}

interface DmsDashboardProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  isDarkMode: boolean;
}

function readInitialPage(): ActivePage {
  if (typeof window !== 'undefined' && window.location.hash === '#products') {
    return 'products';
  }
  return 'orders';
}

function DmsDashboard({ themeMode, onThemeModeChange, isDarkMode }: DmsDashboardProps) {
  const showToast = useToast();

  const [activePage, setActivePage] = useState<ActivePage>(readInitialPage);
  const [role, setRole] = useState<Role>('ADMIN');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [productPagination, setProductPagination] = useState<ProductPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [productSummary, setProductSummary] = useState<ProductSummary>({
    totalProducts: 0,
    activeProducts: 0,
    lowStockProducts: 0,
    totalStock: 0,
  });
  const [productPage, setProductPage] = useState<number>(1);
  const [productPageSize, setProductPageSize] = useState<number>(20);
  const [productSearch, setProductSearch] = useState<string>('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState<string>('');
  const [productCategory, setProductCategory] = useState<string>('ALL');
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  const [depot, setDepot] = useState<Store>(DEFAULT_DEPOT);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [savingOrder, setSavingOrder] = useState<boolean>(false);
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [orderModalMode, setOrderModalMode] = useState<'create' | 'edit'>('create');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormState>(INITIAL_ORDER_FORM);

  const [savingProduct, setSavingProduct] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [productModalMode, setProductModalMode] = useState<'create' | 'edit'>('create');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(INITIAL_PRODUCT_FORM);

  const handleActivePageChange = (page: ActivePage) => {
    setActivePage(page);
    try {
      window.location.hash = page === 'products' ? '#products' : '#orders';
    } catch {
      // Ignore hash errors
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedProductSearch(productSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  const notify = useCallback(
    (text: string, type: 'info' | 'error' = 'info') => {
      showToast({
        body: text,
        type,
        isAutoHide: type !== 'error',
        autoHideDuration: 4500,
      });
    },
    [showToast]
  );

  const loadProductsPage = useCallback(
    async (
      page = productPage,
      limit = productPageSize,
      search = debouncedProductSearch,
      category = productCategory
    ) => {
      setLoadingProducts(true);
      try {
        const res = await fetchProducts({ page, limit, search, category });
        setProducts(res.items);
        setProductPagination(res.pagination);
        setProductSummary(res.summary);
        if (res.pagination.page !== page) {
          setProductPage(res.pagination.page);
        }
      } catch (err) {
        notify(`Không thể tải danh sách sản phẩm: ${getErrorMessage(err)}`, 'error');
      } finally {
        setLoadingProducts(false);
      }
    },
    [productPage, productPageSize, debouncedProductSearch, productCategory, notify]
  );

  const loadCatalogProducts = useCallback(async () => {
    try {
      const res = await fetchProducts({ activeOnly: true, page: 1, limit: 50 });
      setCatalogProducts(res.items);
      setProductSummary(res.summary);
    } catch {
      // Ignore secondary catalog fetch error
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([
        fetchDashboardData(),
        loadCatalogProducts(),
      ]);
      setOrders(data.orders);
      if (data.depot) {
        setDepot(data.depot);
      }
      setActiveTrip(data.activeTrip);

      const packedSet = new Set(
        data.orders.filter((o) => o.status === 'PACKED').map((o) => o.id)
      );
      setSelectedOrderIds((prev) => prev.filter((id) => packedSet.has(id)));
    } catch (err) {
      notify(`Không thể kết nối Backend: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, loadCatalogProducts]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    void loadProductsPage(
      productPage,
      productPageSize,
      debouncedProductSearch,
      productCategory
    );
  }, [loadProductsPage, productPage, productPageSize, debouncedProductSearch, productCategory]);

  const handleSeedOrders = async () => {
    setLoading(true);
    try {
      const message = await seedSampleOrders();
      notify(message, 'info');
      setSelectedOrderIds([]);
      setActiveTrip(null);
      await loadAllData();
    } catch (err) {
      notify(`Lỗi nạp dữ liệu mẫu: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPicking = async (orderId: number) => {
    try {
      await startPickingOrder(orderId);
      notify(`Đơn #${orderId}: Đã chuyển sang ĐANG NHẶT HÀNG (PICKING)`);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleCompletePacking = async (orderId: number) => {
    try {
      await completePackingOrder(orderId);
      notify(`Đơn #${orderId}: Đã ĐÓNG GÓI XONG (PACKED) — Sẵn sàng điều phối!`);
      setSelectedOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleBatchPreparePacked = async () => {
    setLoading(true);
    try {
      const newOrders = orders.filter((o) => o.status === 'NEW');
      for (const o of newOrders) {
        await startPickingOrder(o.id);
      }
      const pickingOrders = orders.filter(
        (o) => o.status === 'NEW' || o.status === 'PICKING'
      );
      for (const o of pickingOrders) {
        await completePackingOrder(o.id);
      }
      await loadAllData();
      setSelectedOrderIds(pickingOrders.map((o) => o.id));
      notify(
        `Đã nhặt & đóng gói nhanh ${pickingOrders.length} đơn hàng! Sẵn sàng chạy OR-Tools.`
      );
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteDelivery = async (orderId: number) => {
    try {
      await completeDeliveryOrder(orderId);
      notify(`Đơn #${orderId}: Giao hàng THÀNH CÔNG (COMPLETED)!`);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleFailDelivery = async (orderId: number) => {
    try {
      await failDeliveryOrder(orderId);
      notify(`Đơn #${orderId}: Đã đánh dấu GIAO THẤT BẠI (FAILED).`);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleOptimizeRoute = async () => {
    const targetIds =
      selectedOrderIds.length > 0
        ? selectedOrderIds
        : orders.filter((o) => o.status === 'PACKED').map((o) => o.id);

    if (targetIds.length === 0) {
      notify(
        'Vui lòng chuyển ít nhất 1 đơn hàng sang trạng thái PACKED và tick chọn trước khi tối ưu!',
        'error'
      );
      return;
    }

    setOptimizing(true);
    try {
      const trip = await optimizeTripRoute(depot.id, targetIds);
      setActiveTrip(trip);
      setSelectedOrderIds([]);
      notify(
        `Google OR-Tools đã tối ưu lộ trình cho ${targetIds.length} điểm giao (${(
          (trip?.totalDistance || 0) / 1000
        ).toFixed(2)} km)!`
      );
      await loadAllData();
    } catch (err) {
      notify(`Lỗi gọi OR-Tools Solver: ${getErrorMessage(err)}`, 'error');
    } finally {
      setOptimizing(false);
    }
  };

  const handleOpenCreateOrder = () => {
    setOrderModalMode('create');
    setEditingOrder(null);
    setOrderForm(INITIAL_ORDER_FORM);
    setShowOrderModal(true);
  };

  const handleOpenEditOrder = (order: Order) => {
    setOrderModalMode('edit');
    setEditingOrder(order);
    setOrderForm(orderToFormState(order, catalogProducts));
    setShowOrderModal(true);
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderForm.customerName.trim() || !orderForm.customerAddress.trim()) {
      notify('Vui lòng nhập tên khách hàng và địa chỉ giao hàng.', 'error');
      return;
    }

    const lat = Number(orderForm.latitude);
    const lng = Number(orderForm.longitude);
    if (
      orderForm.latitude.trim() === '' ||
      orderForm.longitude.trim() === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      notify('Vui lòng nhập tọa độ GPS hợp lệ hoặc chọn vị trí trên bản đồ.', 'error');
      return;
    }

    if (orderForm.items.length === 0) {
      notify('Đơn hàng phải có ít nhất 1 sản phẩm.', 'error');
      return;
    }

    for (let i = 0; i < orderForm.items.length; i++) {
      const item = orderForm.items[i];
      const qty = Number(item.quantity);
      const price = Number(item.price);
      if (!item.productName.trim()) {
        notify(`Sản phẩm #${i + 1}: Vui lòng nhập tên sản phẩm.`, 'error');
        return;
      }
      if (!Number.isInteger(qty) || qty < 1) {
        notify(`Sản phẩm "${item.productName}": Số lượng phải là số nguyên >= 1.`, 'error');
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        notify(`Sản phẩm "${item.productName}": Đơn giá phải là số hợp lệ >= 0.`, 'error');
        return;
      }
    }

    setSavingOrder(true);
    try {
      if (orderModalMode === 'edit' && editingOrder) {
        await updateOrder(editingOrder.id, orderForm);
        notify(`Đã cập nhật đơn hàng ${editingOrder.orderCode} thành công!`);
      } else {
        await createOrder(depot.id, orderForm);
        notify('Đã tạo đơn hàng mới thành công!');
      }
      setShowOrderModal(false);
      setEditingOrder(null);
      setOrderForm(INITIAL_ORDER_FORM);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  const toggleSelectOrder = (id: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const packedOrders = useMemo(
    () => orders.filter((o) => o.status === 'PACKED'),
    [orders]
  );

  const toggleSelectAllPacked = () => {
    if (selectedOrderIds.length === packedOrders.length && packedOrders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(packedOrders.map((o) => o.id));
    }
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: orders.length,
      NEW: 0,
      PICKING: 0,
      PACKED: 0,
      DELIVERING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  const routedOrders = useMemo(() => {
    if (activeTrip?.orders && activeTrip.orders.length > 0) {
      return [...activeTrip.orders].sort(
        (a, b) => (a.deliverySequence || 999) - (b.deliverySequence || 999)
      );
    }
    return orders
      .filter((o) => o.deliverySequence !== null && o.deliverySequence !== undefined)
      .sort((a, b) => (a.deliverySequence || 999) - (b.deliverySequence || 999));
  }, [activeTrip, orders]);

  const polylinePositions = useMemo<[number, number][]>(() => {
    if (routedOrders.length === 0) return [];
    return [
      [depot.latitude, depot.longitude],
      ...routedOrders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [depot, routedOrders]);

  const allMapPoints = useMemo<[number, number][]>(() => {
    return [
      [depot.latitude, depot.longitude],
      ...orders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [depot, orders]);

  const handleOpenCreateProduct = () => {
    setProductModalMode('create');
    setEditingProduct(null);
    setProductForm(INITIAL_PRODUCT_FORM);
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    setProductModalMode('edit');
    setEditingProduct(product);
    setProductForm(productToFormState(product));
    setShowProductModal(true);
  };

  const handleSubmitProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      notify('Vui lòng nhập tên sản phẩm.', 'error');
      return;
    }

    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    if (!Number.isFinite(price) || price < 0) {
      notify('Đơn giá phải là số hợp lệ >= 0.', 'error');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      notify('Tồn kho phải là số nguyên >= 0.', 'error');
      return;
    }

    setSavingProduct(true);
    try {
      if (productModalMode === 'edit' && editingProduct) {
        await updateProduct(editingProduct.id, productForm);
        notify(`Đã cập nhật sản phẩm "${productForm.name.trim()}" thành công!`);
      } else {
        await createProduct(productForm);
        notify(`Đã thêm sản phẩm "${productForm.name.trim()}" thành công!`);
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm(INITIAL_PRODUCT_FORM);
      await Promise.all([loadProductsPage(), loadCatalogProducts()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (product: Product) => {
    try {
      const nextForm: ProductFormState = {
        ...productToFormState(product),
        isActive: !product.isActive,
      };
      await updateProduct(product.id, nextForm);
      notify(
        nextForm.isActive
          ? `Đã mở bán lại "${product.name}".`
          : `Đã chuyển "${product.name}" sang trạng thái Ngừng bán.`
      );
      await Promise.all([loadProductsPage(), loadCatalogProducts()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      await deleteProduct(product.id);
      notify(`Đã xóa sản phẩm "${product.name}" thành công!`);
      await Promise.all([loadProductsPage(), loadCatalogProducts()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);
    setProductPage(1);
  };

  const handleProductCategoryChange = (value: string) => {
    setProductCategory(value);
    setProductPage(1);
  };

  const handleProductPageSizeChange = (nextSize: number) => {
    setProductPageSize(nextSize);
    setProductPage(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-body text-primary">
      <Header
        activePage={activePage}
        onActivePageChange={handleActivePageChange}
        role={role}
        onRoleChange={setRole}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        counts={counts}
        productsCount={productSummary.totalProducts}
        loading={loading}
        onOpenNewOrder={handleOpenCreateOrder}
        onSeedOrders={handleSeedOrders}
      />

      {activePage === 'orders' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <OrderTable
            role={role}
            filteredOrders={filteredOrders}
            packedOrdersCount={packedOrders.length}
            counts={counts}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            selectedOrderIds={selectedOrderIds}
            onToggleSelectOrder={toggleSelectOrder}
            onToggleSelectAllPacked={toggleSelectAllPacked}
            loading={loading}
            optimizing={optimizing}
            onBatchPreparePacked={handleBatchPreparePacked}
            onOptimizeRoute={handleOptimizeRoute}
            onEditOrder={handleOpenEditOrder}
            onStartPicking={handleStartPicking}
            onCompletePacking={handleCompletePacking}
            onCompleteDelivery={handleCompleteDelivery}
            onFailDelivery={handleFailDelivery}
          />

          <section className="lg:col-span-5 flex flex-col gap-4">
            <RouteMap
              depot={depot}
              orders={orders}
              selectedOrderIds={selectedOrderIds}
              polylinePositions={polylinePositions}
              allMapPoints={allMapPoints}
              isDarkMode={isDarkMode}
            />

            <ActiveTripPanel
              depot={depot}
              activeTrip={activeTrip}
              routedOrders={routedOrders}
              onCompleteDelivery={handleCompleteDelivery}
            />
          </section>
        </main>
      ) : (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <ProductManagementPage
            role={role}
            products={products}
            pagination={productPagination}
            summary={productSummary}
            searchQuery={productSearch}
            onSearchQueryChange={handleProductSearchChange}
            categoryFilter={productCategory}
            onCategoryFilterChange={handleProductCategoryChange}
            onPageChange={setProductPage}
            onPageSizeChange={handleProductPageSizeChange}
            loading={loadingProducts}
            onOpenCreateProduct={handleOpenCreateProduct}
            onEditProduct={handleOpenEditProduct}
            onToggleActive={handleToggleProductActive}
            onDeleteProduct={handleDeleteProduct}
          />
        </main>
      )}

      <OrderFormModal
        isOpen={showOrderModal}
        onOpenChange={(open) => {
          setShowOrderModal(open);
          if (!open) {
            setEditingOrder(null);
          }
        }}
        mode={orderModalMode}
        editingOrder={editingOrder}
        form={orderForm}
        onFormChange={setOrderForm}
        products={catalogProducts}
        depot={depot}
        isDarkMode={isDarkMode}
        submitting={savingOrder}
        onSubmit={handleSubmitOrder}
      />

      <ProductFormModal
        isOpen={showProductModal}
        onOpenChange={(open) => {
          setShowProductModal(open);
          if (!open) {
            setEditingProduct(null);
          }
        }}
        mode={productModalMode}
        editingProduct={editingProduct}
        form={productForm}
        onFormChange={setProductForm}
        submitting={savingProduct}
        onSubmit={handleSubmitProduct}
      />
    </div>
  );
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const handleThemeModeChange = (nextMode: ThemeMode) => {
    setThemeMode(nextMode);
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage errors
    }
  };

  const isDarkMode =
    themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={themeMode}>
      <LayerProvider>
        <DmsDashboard
          themeMode={themeMode}
          onThemeModeChange={handleThemeModeChange}
          isDarkMode={isDarkMode}
        />
      </LayerProvider>
    </Theme>
  );
}
