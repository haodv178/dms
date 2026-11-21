import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { useToast } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { defaultThemeSlug, themes } from './astryx-themes';
import {
  completeDeliveryOrder,
  completePackingOrder,
  createDriver,
  createOrder,
  createProduct,
  deleteDriver,
  deleteProduct,
  failDeliveryOrder,
  fetchDashboardData,
  fetchDrivers,
  fetchProducts,
  getErrorMessage,
  optimizeTripRoute,
  seedSampleOrders,
  startPickingOrder,
  updateDriver,
  updateOrder,
  updateProduct,
} from './api/dmsApi';
import { ActiveTripPanel } from './components/ActiveTripPanel';
import { DriverFormModal } from './components/DriverFormModal';
import { DriverManagementPage } from './components/DriverManagementPage';
import { Header } from './components/Header';
import { OrderFormModal } from './components/OrderFormModal';
import { OrderTable } from './components/OrderTable';
import { ProductFormModal } from './components/ProductFormModal';
import { ProductManagementPage } from './components/ProductManagementPage';
import { RouteMap } from './components/RouteMap';
import {
  DEFAULT_DEPOT,
  INITIAL_DRIVER_FORM,
  INITIAL_ORDER_FORM,
  INITIAL_PRODUCT_FORM,
  driverToFormState,
  orderToFormState,
  productToFormState,
  type ActivePage,
  type Driver,
  type DriverFormState,
  type DriverPagination,
  type DriverSummary,
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
  if (typeof window !== 'undefined') {
    if (window.location.hash === '#products') return 'products';
    if (window.location.hash === '#drivers') return 'drivers';
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

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('AUTO');
  const [driverPagination, setDriverPagination] = useState<DriverPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [driverSummary, setDriverSummary] = useState<DriverSummary>({
    totalDrivers: 0,
    availableDrivers: 0,
    onDeliveryDrivers: 0,
    inactiveDrivers: 0,
  });
  const [driverPage, setDriverPage] = useState<number>(1);
  const [driverPageSize, setDriverPageSize] = useState<number>(20);
  const [driverSearch, setDriverSearch] = useState<string>('');
  const [debouncedDriverSearch, setDebouncedDriverSearch] = useState<string>('');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('ALL');
  const [driverVehicleFilter, setDriverVehicleFilter] = useState<string>('ALL');
  const [loadingDrivers, setLoadingDrivers] = useState<boolean>(false);

  const [savingDriver, setSavingDriver] = useState<boolean>(false);
  const [showDriverModal, setShowDriverModal] = useState<boolean>(false);
  const [driverModalMode, setDriverModalMode] = useState<'create' | 'edit'>('create');
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [driverForm, setDriverForm] = useState<DriverFormState>(INITIAL_DRIVER_FORM);

  const handleActivePageChange = (page: ActivePage) => {
    setActivePage(page);
    try {
      window.location.hash = `#${page}`;
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDriverSearch(driverSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [driverSearch]);

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

  const loadDriversPage = useCallback(
    async (
      page = driverPage,
      limit = driverPageSize,
      search = debouncedDriverSearch,
      status = driverStatusFilter,
      vehicleType = driverVehicleFilter
    ) => {
      setLoadingDrivers(true);
      try {
        const res = await fetchDrivers({ page, limit, search, status, vehicleType });
        setDrivers(res.items);
        setDriverPagination(res.pagination);
        setDriverSummary(res.summary);
        if (res.pagination.page !== page) {
          setDriverPage(res.pagination.page);
        }
      } catch (err) {
        notify(`Không thể tải danh sách tài xế: ${getErrorMessage(err)}`, 'error');
      } finally {
        setLoadingDrivers(false);
      }
    },
    [driverPage, driverPageSize, debouncedDriverSearch, driverStatusFilter, driverVehicleFilter, notify]
  );

  const loadAvailableDrivers = useCallback(async () => {
    try {
      const res = await fetchDrivers({ availableOnly: true, page: 1, limit: 50 });
      setAvailableDrivers(res.items);
      setDriverSummary(res.summary);
      setSelectedDriverId((prev) => {
        if (prev === 'AUTO') return prev;
        return res.items.some((d) => String(d.id) === prev) ? prev : 'AUTO';
      });
    } catch {
      // Ignore secondary driver fetch error
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([
        fetchDashboardData(),
        loadCatalogProducts(),
        loadAvailableDrivers(),
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
  }, [notify, loadCatalogProducts, loadAvailableDrivers]);

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

  useEffect(() => {
    void loadDriversPage(
      driverPage,
      driverPageSize,
      debouncedDriverSearch,
      driverStatusFilter,
      driverVehicleFilter
    );
  }, [
    loadDriversPage,
    driverPage,
    driverPageSize,
    debouncedDriverSearch,
    driverStatusFilter,
    driverVehicleFilter,
  ]);

  const handleSeedOrders = async () => {
    setLoading(true);
    try {
      const message = await seedSampleOrders();
      notify(message, 'info');
      setSelectedOrderIds([]);
      setActiveTrip(null);
      await Promise.all([loadAllData(), loadDriversPage()]);
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
      await Promise.all([loadAllData(), loadDriversPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleFailDelivery = async (orderId: number) => {
    try {
      await failDeliveryOrder(orderId);
      notify(`Đơn #${orderId}: Đã đánh dấu GIAO THẤT BẠI (FAILED).`);
      await Promise.all([loadAllData(), loadDriversPage()]);
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
      const driverIdToAssign =
        selectedDriverId !== 'AUTO' ? Number(selectedDriverId) : null;
      const trip = await optimizeTripRoute(depot.id, targetIds, driverIdToAssign);
      setActiveTrip(trip);
      setSelectedOrderIds([]);
      setSelectedDriverId('AUTO');
      const driverLabel = trip?.driver?.name ? ` — Tài xế: ${trip.driver.name}` : '';
      notify(
        `Google OR-Tools đã tối ưu lộ trình cho ${targetIds.length} điểm giao (${(
          (trip?.totalDistance || 0) / 1000
        ).toFixed(2)} km)${driverLabel}!`
      );
      await Promise.all([loadAllData(), loadDriversPage()]);
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

  const handleOpenCreateDriver = () => {
    setDriverModalMode('create');
    setEditingDriver(null);
    setDriverForm(INITIAL_DRIVER_FORM);
    setShowDriverModal(true);
  };

  const handleOpenEditDriver = (driver: Driver) => {
    setDriverModalMode('edit');
    setEditingDriver(driver);
    setDriverForm(driverToFormState(driver));
    setShowDriverModal(true);
  };

  const handleSubmitDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!driverForm.name.trim()) {
      notify('Vui lòng nhập họ tên tài xế.', 'error');
      return;
    }
    if (!driverForm.email.trim() || !driverForm.email.includes('@')) {
      notify('Vui lòng nhập email hợp lệ.', 'error');
      return;
    }
    if (!driverForm.phone.trim()) {
      notify('Vui lòng nhập số điện thoại tài xế.', 'error');
      return;
    }
    if (!driverForm.licensePlate.trim()) {
      notify('Vui lòng nhập biển số xe.', 'error');
      return;
    }

    setSavingDriver(true);
    try {
      if (driverModalMode === 'edit' && editingDriver) {
        await updateDriver(editingDriver.id, driverForm);
        notify(`Đã cập nhật tài xế "${driverForm.name.trim()}" thành công!`);
      } else {
        await createDriver(driverForm);
        notify(`Đã thêm tài xế "${driverForm.name.trim()}" thành công!`);
      }
      setShowDriverModal(false);
      setEditingDriver(null);
      setDriverForm(INITIAL_DRIVER_FORM);
      await Promise.all([loadDriversPage(), loadAvailableDrivers()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingDriver(false);
    }
  };

  const handleToggleDriverActive = async (driver: Driver) => {
    try {
      const nextIsActive = !driver.isActive;
      const nextStatus = !nextIsActive
        ? driver.status === 'ON_DELIVERY'
          ? 'ON_DELIVERY'
          : 'OFFLINE'
        : driver.status === 'OFFLINE'
          ? 'AVAILABLE'
          : driver.status;
      const nextForm: DriverFormState = {
        ...driverToFormState(driver),
        isActive: nextIsActive,
        status: nextStatus,
      };
      await updateDriver(driver.id, nextForm);
      notify(
        nextIsActive
          ? `Đã kích hoạt lại tài xế "${driver.name}".`
          : `Đã tạm ngưng hoạt động tài xế "${driver.name}".`
      );
      await Promise.all([loadDriversPage(), loadAvailableDrivers()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleDeleteDriver = async (driver: Driver) => {
    try {
      await deleteDriver(driver.id);
      notify(`Đã xóa tài xế "${driver.name}" thành công!`);
      await Promise.all([loadDriversPage(), loadAvailableDrivers()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleDriverSearchChange = (value: string) => {
    setDriverSearch(value);
    setDriverPage(1);
  };

  const handleDriverStatusFilterChange = (value: string) => {
    setDriverStatusFilter(value);
    setDriverPage(1);
  };

  const handleDriverVehicleFilterChange = (value: string) => {
    setDriverVehicleFilter(value);
    setDriverPage(1);
  };

  const handleDriverPageSizeChange = (nextSize: number) => {
    setDriverPageSize(nextSize);
    setDriverPage(1);
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
        driversCount={driverSummary.totalDrivers}
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
            availableDrivers={availableDrivers}
            selectedDriverId={selectedDriverId}
            onSelectedDriverIdChange={setSelectedDriverId}
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
      ) : activePage === 'products' ? (
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
      ) : (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <DriverManagementPage
            role={role}
            drivers={drivers}
            pagination={driverPagination}
            summary={driverSummary}
            searchQuery={driverSearch}
            onSearchQueryChange={handleDriverSearchChange}
            statusFilter={driverStatusFilter}
            onStatusFilterChange={handleDriverStatusFilterChange}
            vehicleTypeFilter={driverVehicleFilter}
            onVehicleTypeFilterChange={handleDriverVehicleFilterChange}
            onPageChange={setDriverPage}
            onPageSizeChange={handleDriverPageSizeChange}
            loading={loadingDrivers}
            onOpenCreateDriver={handleOpenCreateDriver}
            onEditDriver={handleOpenEditDriver}
            onToggleActive={handleToggleDriverActive}
            onDeleteDriver={handleDeleteDriver}
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

      <DriverFormModal
        isOpen={showDriverModal}
        onOpenChange={(open) => {
          setShowDriverModal(open);
          if (!open) {
            setEditingDriver(null);
          }
        }}
        mode={driverModalMode}
        editingDriver={editingDriver}
        form={driverForm}
        onFormChange={setDriverForm}
        submitting={savingDriver}
        onSubmit={handleSubmitDriver}
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
