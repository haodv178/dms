import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { useToast } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { defaultThemeSlug, themes } from './astryx-themes';
import {
  assignDriverToOrder,
  bulkOrderAction,
  cancelOrder,
  cancelOrDeleteTrip,
  completeDeliveryOrder,
  completePackingOrder,
  createDriver,
  createOrder,
  createProduct,
  createStore,
  createUser,
  deleteDriver,
  deleteProduct,
  deleteStore,
  deleteUser,
  failDeliveryOrder,
  fetchDashboardData,
  fetchDrivers,
  fetchProducts,
  fetchStores,
  fetchUsers,
  getErrorMessage,
  optimizeTripRoute,
  reassignTripDriver,
  rejectDeliveryOrder,
  reoptimizeTrip,
  resetUserPassword,
  setDefaultStore,
  startPickingOrder,
  startTrip,
  updateDriver,
  updateOrder,
  updateOrderPaymentStatus,
  updateProduct,
  updateStore,
  updateUser,
  type RejectDeliveryPayload,
} from './api/dmsApi';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AssignDriverModal } from './components/AssignDriverModal';
import { BulkAssignDriverModal } from './components/BulkAssignDriverModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CreateTripModal } from './components/CreateTripModal';
import { DepotFormModal } from './components/DepotFormModal';
import { DepotManagementPage } from './components/DepotManagementPage';
import { DriverFormModal } from './components/DriverFormModal';
import { DriverManagementPage } from './components/DriverManagementPage';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { OrderFormModal } from './components/OrderFormModal';
import { OrderTable } from './components/OrderTable';
import { ProductFormModal } from './components/ProductFormModal';
import { ProductManagementPage } from './components/ProductManagementPage';
import { RejectDeliveryModal } from './components/RejectDeliveryModal';
import { TripManagementPage } from './components/TripManagementPage';
import { UserFormModal } from './components/UserFormModal';
import { UserManagementPage } from './components/UserManagementPage';
import {
  DEFAULT_DEPOT,
  INITIAL_DRIVER_FORM,
  INITIAL_ORDER_FORM,
  INITIAL_PRODUCT_FORM,
  INITIAL_STORE_FORM,
  INITIAL_USER_FORM,
  MAX_DELIVERY_DISTANCE_KM,
  canRoleAccessPage,
  createInitialOrderForm,
  createInitialProductForm,
  driverToFormState,
  formatDeliveryDateShort,
  getDefaultDeliveryDate,
  haversineDistanceKm,
  isDeliveryDateBeforeToday,
  isOrderItemsEditable,
  orderToFormState,
  productToFormState,
  storeToFormState,
  toIsoDateString,
  userToFormState,
  type ActivePage,
  type AuthUser,
  type BulkOrderActionType,
  type Driver,
  type DriverFormState,
  type DriverPagination,
  type DriverSummary,
  type ManagedUser,
  type Order,
  type OrderFormState,
  type OrderStatus,
  type PaymentStatus,
  type Product,
  type ProductFormState,
  type ProductPagination,
  type ProductSummary,
  type Store,
  type StoreFormState,
  type StorePagination,
  type StoreSummary,
  type ThemeMode,
  type Trip,
  type UserFormState,
  type UserPagination,
  type UserSummary,
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
  user: AuthUser;
  onLogout: () => Promise<void>;
  isDarkMode: boolean;
}

function readInitialPage(role: AuthUser['role']): ActivePage {
  let candidate: ActivePage = 'orders';
  if (typeof window !== 'undefined') {
    if (window.location.hash === '#trips') candidate = 'trips';
    else if (window.location.hash === '#products') candidate = 'products';
    else if (window.location.hash === '#drivers') candidate = 'drivers';
    else if (window.location.hash === '#depots') candidate = 'depots';
    else if (window.location.hash === '#users') candidate = 'users';
  }
  return canRoleAccessPage(role, candidate) ? candidate : 'orders';
}

function DmsDashboard({
  user,
  onLogout,
  isDarkMode,
}: DmsDashboardProps) {
  const showToast = useToast();
  const role = user.role;

  const [activePage, setActivePage] = useState<ActivePage>(() => readInitialPage(user.role));
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [savingRejection, setSavingRejection] = useState<boolean>(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userPagination, setUserPagination] = useState<UserPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [userSummary, setUserSummary] = useState<UserSummary>({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminCount: 0,
    warehouseCount: 0,
    driverCount: 0,
  });
  const [userPage, setUserPage] = useState<number>(1);
  const [userPageSize, setUserPageSize] = useState<number>(20);
  const [userSearch, setUserSearch] = useState<string>('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('ALL');
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [savingUser, setSavingUser] = useState<boolean>(false);
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(INITIAL_USER_FORM);
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
  const [productDepotFilter, setProductDepotFilter] = useState<string>('ALL');
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  const [depot, setDepot] = useState<Store>(DEFAULT_DEPOT);
  const [allStores, setAllStores] = useState<Store[]>([DEFAULT_DEPOT]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storePagination, setStorePagination] = useState<StorePagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [storeSummary, setStoreSummary] = useState<StoreSummary>({
    totalStores: 0,
    activeStores: 0,
    inactiveStores: 0,
    defaultStoreId: null,
    defaultStoreName: DEFAULT_DEPOT.name,
    totalOrders: 0,
    totalTrips: 0,
  });
  const [storePage, setStorePage] = useState<number>(1);
  const [storePageSize, setStorePageSize] = useState<number>(20);
  const [storeSearch, setStoreSearch] = useState<string>('');
  const [debouncedStoreSearch, setDebouncedStoreSearch] = useState<string>('');
  const [storeStatusFilter, setStoreStatusFilter] = useState<string>('ALL');
  const [loadingStores, setLoadingStores] = useState<boolean>(false);
  const [savingStore, setSavingStore] = useState<boolean>(false);
  const [showStoreModal, setShowStoreModal] = useState<boolean>(false);
  const [storeModalMode, setStoreModalMode] = useState<'create' | 'edit'>('create');
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeForm, setStoreForm] = useState<StoreFormState>(INITIAL_STORE_FORM);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilters, setStatusFilters] = useState<OrderStatus[]>([]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<string>('');
  const [hourDeliveryFilter, setHourDeliveryFilter] = useState<string>('ALL');
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState<{
    orders: Order[];
    skippedCount: number;
  } | null>(null);
  const [showBulkCreateTripModal, setShowBulkCreateTripModal] = useState<boolean>(false);
  const [bulkCreateTripOrderIds, setBulkCreateTripOrderIds] = useState<number[]>([]);
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
  const [assignableDrivers, setAssignableDrivers] = useState<Driver[]>([]);
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [savingAssignment, setSavingAssignment] = useState<boolean>(false);
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
  const [driverStoreFilter, setDriverStoreFilter] = useState<string>('ALL');
  const [loadingDrivers, setLoadingDrivers] = useState<boolean>(false);

  const [savingDriver, setSavingDriver] = useState<boolean>(false);
  const [showDriverModal, setShowDriverModal] = useState<boolean>(false);
  const [driverModalMode, setDriverModalMode] = useState<'create' | 'edit'>('create');
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [driverForm, setDriverForm] = useState<DriverFormState>(INITIAL_DRIVER_FORM);

  const handleActivePageChange = (page: ActivePage) => {
    const safePage = canRoleAccessPage(role, page) ? page : 'orders';
    setActivePage(safePage);
    try {
      window.location.hash = `#${safePage}`;
    } catch {
      // Ignore hash errors
    }
  };

  useEffect(() => {
    if (!canRoleAccessPage(role, activePage)) {
      setActivePage('orders');
    }
  }, [role, activePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [userSearch]);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedStoreSearch(storeSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storeSearch]);

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
      category = productCategory,
      depotFilter = productDepotFilter
    ) => {
      setLoadingProducts(true);
      try {
        const res = await fetchProducts({
          page,
          limit,
          search,
          category,
          storeId: depotFilter === 'ALL' ? 'ALL' : Number(depotFilter),
        });
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
    [productPage, productPageSize, debouncedProductSearch, productCategory, productDepotFilter, notify]
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
      vehicleType = driverVehicleFilter,
      storeFilter = driverStoreFilter
    ) => {
      setLoadingDrivers(true);
      try {
        const res = await fetchDrivers({
          page,
          limit,
          search,
          status,
          vehicleType,
          storeId: storeFilter === 'ALL' ? 'ALL' : Number(storeFilter),
        });
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
    [
      driverPage,
      driverPageSize,
      debouncedDriverSearch,
      driverStatusFilter,
      driverVehicleFilter,
      driverStoreFilter,
      notify,
    ]
  );

  const loadAvailableDrivers = useCallback(async () => {
    try {
      const res = await fetchDrivers({ activeOnly: true, page: 1, limit: 100 });
      const eligible = res.items.filter((d) => d.isActive && d.status !== 'OFFLINE');
      const available = eligible.filter((d) => d.status === 'AVAILABLE');
      setAssignableDrivers(eligible);
      setAvailableDrivers(available);
      setDriverSummary(res.summary);
    } catch {
      // Ignore secondary driver fetch error
    }
  }, []);

  const loadStoresPage = useCallback(
    async (
      page = storePage,
      limit = storePageSize,
      search = debouncedStoreSearch,
      status = storeStatusFilter
    ) => {
      setLoadingStores(true);
      try {
        const res = await fetchStores({ page, limit, search, status });
        setStores(res.items);
        setStorePagination(res.pagination);
        setStoreSummary(res.summary);
        if (res.pagination.page !== page) {
          setStorePage(res.pagination.page);
        }
      } catch (err) {
        notify(`Không thể tải danh sách điểm xuất phát: ${getErrorMessage(err)}`, 'error');
      } finally {
        setLoadingStores(false);
      }
    },
    [storePage, storePageSize, debouncedStoreSearch, storeStatusFilter, notify]
  );

  const loadUsersPage = useCallback(
    async (
      page = userPage,
      limit = userPageSize,
      search = debouncedUserSearch,
      roleFilterVal = userRoleFilter,
      statusFilterVal = userStatusFilter
    ) => {
      if (!canRoleAccessPage(role, 'users')) return;
      setLoadingUsers(true);
      try {
        const res = await fetchUsers({
          page,
          limit,
          search,
          role: roleFilterVal,
          status: statusFilterVal,
        });
        setUsers(res.items);
        setUserPagination(res.pagination);
        setUserSummary(res.summary);
        if (res.pagination.page !== page) {
          setUserPage(res.pagination.page);
        }
      } catch (err) {
        notify(`Không thể tải danh sách tài khoản: ${getErrorMessage(err)}`, 'error');
      } finally {
        setLoadingUsers(false);
      }
    },
    [role, userPage, userPageSize, debouncedUserSearch, userRoleFilter, userStatusFilter, notify]
  );

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const secondaryPromises: Promise<unknown>[] = [];
      if (canRoleAccessPage(role, 'products')) {
        secondaryPromises.push(loadCatalogProducts());
      }
      if (canRoleAccessPage(role, 'drivers')) {
        secondaryPromises.push(loadAvailableDrivers());
      }

      const [data] = await Promise.all([fetchDashboardData(), ...secondaryPromises]);
      setOrders(data.orders);
      setTrips(data.trips);
      if (data.depot) {
        setDepot(data.depot);
      }
      if (data.stores.length > 0) {
        setAllStores(data.stores);
      }
    } catch (err) {
      notify(`Không thể kết nối Backend: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [role, notify, loadCatalogProducts, loadAvailableDrivers]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (!canRoleAccessPage(role, 'products')) return;
    void loadProductsPage(
      productPage,
      productPageSize,
      debouncedProductSearch,
      productCategory
    );
  }, [role, loadProductsPage, productPage, productPageSize, debouncedProductSearch, productCategory]);

  useEffect(() => {
    if (!canRoleAccessPage(role, 'drivers')) return;
    void loadDriversPage(
      driverPage,
      driverPageSize,
      debouncedDriverSearch,
      driverStatusFilter,
      driverVehicleFilter,
      driverStoreFilter
    );
  }, [
    role,
    loadDriversPage,
    driverPage,
    driverPageSize,
    debouncedDriverSearch,
    driverStatusFilter,
    driverVehicleFilter,
    driverStoreFilter,
  ]);

  useEffect(() => {
    if (!canRoleAccessPage(role, 'depots')) return;
    void loadStoresPage(storePage, storePageSize, debouncedStoreSearch, storeStatusFilter);
  }, [role, loadStoresPage, storePage, storePageSize, debouncedStoreSearch, storeStatusFilter]);

  useEffect(() => {
    if (!canRoleAccessPage(role, 'users')) return;
    void loadUsersPage(
      userPage,
      userPageSize,
      debouncedUserSearch,
      userRoleFilter,
      userStatusFilter
    );
  }, [
    role,
    loadUsersPage,
    userPage,
    userPageSize,
    debouncedUserSearch,
    userRoleFilter,
    userStatusFilter,
  ]);

  const handleStartPicking = async (orderId: number) => {
    try {
      await startPickingOrder(orderId);
      notify(`Đơn #${orderId}: Đã chuyển sang ĐANG NHẶT HÀNG (PICKING)`);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleCancelOrder = async (orderId: number, reason?: string) => {
    try {
      const { message } = await cancelOrder(orderId, reason);
      notify(message, 'info');
      await Promise.all([loadAllData(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
      throw err;
    }
  };

  const handleCompletePacking = async (orderId: number) => {
    try {
      await completePackingOrder(orderId);
      notify(`Đơn #${orderId}: Đã ĐÓNG GÓI XONG (PACKED) — Sẵn sàng điều phối!`);
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
      notify(
        `Đã nhặt & đóng gói nhanh ${pickingOrders.length} đơn hàng! Bạn có thể tạo chuyến tại trang Chuyến xe.`
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
      notify(`Đơn #${orderId}: Đã đánh dấu GIAO THẤT BẠI (FAILED) và hoàn tồn kho về depot.`);
      await Promise.all([loadAllData(), loadDriversPage(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleOpenRejectDelivery = (order: Order) => {
    setRejectingOrder(order);
  };

  const handleConfirmRejectDelivery = async (
    orderId: number,
    payload: RejectDeliveryPayload
  ) => {
    setSavingRejection(true);
    try {
      const { message } = await rejectDeliveryOrder(orderId, payload);
      notify(message, 'info');
      setRejectingOrder(null);
      await Promise.all([loadAllData(), loadDriversPage(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingRejection(false);
    }
  };

  const handleOpenAssignDriver = (order: Order) => {
    setAssigningOrder(order);
    void loadAvailableDrivers();
  };

  const handleAssignDriver = async (orderId: number, driverId: number) => {
    setSavingAssignment(true);
    try {
      const { message } = await assignDriverToOrder(orderId, driverId);
      notify(message, 'info');
      setAssigningOrder(null);
      await Promise.all([loadAllData(), loadDriversPage(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingAssignment(false);
    }
  };

  useEffect(() => {
    const validIds = new Set(orders.map((o) => o.id));
    setSelectedOrderIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [orders]);

  const handleStatusFiltersChange = (nextStatuses: OrderStatus[]) => {
    setStatusFilters(nextStatuses);
    setSelectedOrderIds([]);
  };

  const handleBulkOrderAction = async (
    action: BulkOrderActionType,
    orderIds: number[],
    driverId?: number,
    reason?: string
  ) => {
    if (orderIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const result = await bulkOrderAction(action, orderIds, driverId, reason);
      notify(result.message, 'info');
      setSelectedOrderIds([]);
      setBulkAssignTarget(null);
      await Promise.all([loadAllData(), loadDriversPage(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleOpenBulkAssignDriver = (eligibleOrders: Order[], skippedCount: number) => {
    setBulkAssignTarget({ orders: eligibleOrders, skippedCount });
    void loadAvailableDrivers();
  };

  const handleConfirmBulkAssignDriver = async (orderIds: number[], driverId: number) => {
    await handleBulkOrderAction('ASSIGN_DRIVER', orderIds, driverId);
  };

  const handleOpenBulkCreateTrip = (packedOrderIds: number[]) => {
    setBulkCreateTripOrderIds(packedOrderIds);
    setShowBulkCreateTripModal(true);
    void loadAvailableDrivers();
  };

  const handleConfirmBulkCreateTrip = async (
    storeId: number,
    orderIds: number[],
    driverId: number | null
  ) => {
    const created = await handleCreateTrip(storeId, orderIds, driverId);
    if (created) {
      setShowBulkCreateTripModal(false);
      setBulkCreateTripOrderIds([]);
      setSelectedOrderIds([]);
    }
  };

  const handleUnassignDriver = async (orderId: number) => {
    setSavingAssignment(true);
    try {
      const { message } = await assignDriverToOrder(orderId, null);
      notify(message, 'info');
      setAssigningOrder(null);
      await Promise.all([loadAllData(), loadDriversPage(), loadProductsPage(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleCreateTrip = async (
    storeId: number,
    orderIds: number[],
    driverId: number | null
  ): Promise<Trip | null> => {
    if (orderIds.length === 0) {
      notify('Vui lòng chọn ít nhất 1 đơn hàng PACKED để tạo chuyến!', 'error');
      return null;
    }

    setOptimizing(true);
    try {
      const trip = await optimizeTripRoute(storeId, orderIds, driverId);
      const driverLabel = trip?.driver?.name ? ` — Tài xế: ${trip.driver.name}` : '';
      notify(
        `Google OR-Tools đã tối ưu lộ trình cho ${orderIds.length} điểm giao (${(
          (trip?.totalDistance || 0) / 1000
        ).toFixed(2)} km)${driverLabel}!`
      );
      await Promise.all([loadAllData(), loadDriversPage(), loadStoresPage()]);
      return trip;
    } catch (err) {
      notify(`Lỗi gọi OR-Tools Solver: ${getErrorMessage(err)}`, 'error');
      return null;
    } finally {
      setOptimizing(false);
    }
  };

  const handleStartTrip = async (tripId: number) => {
    try {
      const { message } = await startTrip(tripId);
      notify(message, 'info');
      await Promise.all([loadAllData(), loadDriversPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleReassignTripDriver = async (tripId: number, driverId: number) => {
    try {
      const { message } = await reassignTripDriver(tripId, driverId);
      notify(message, 'info');
      await Promise.all([loadAllData(), loadDriversPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleReoptimizeTrip = async (tripId: number) => {
    try {
      const { message } = await reoptimizeTrip(tripId);
      notify(message, 'info');
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleCancelTrip = async (tripId: number) => {
    try {
      const { message } = await cancelOrDeleteTrip(tripId);
      notify(message, 'info');
      await Promise.all([loadAllData(), loadDriversPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleOpenCreateOrder = () => {
    setOrderModalMode('create');
    setEditingOrder(null);
    setOrderForm({
      ...createInitialOrderForm(String(depot.id)),
      latitude: (depot.latitude + 0.004).toFixed(5),
      longitude: (depot.longitude + 0.005).toFixed(5),
    });
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

    const todayDeliveryDate = getDefaultDeliveryDate();
    const normalizedDeliveryDate = toIsoDateString(orderForm.deliveryDate);
    if (!normalizedDeliveryDate) {
      notify('Vui lòng chọn ngày giao hàng hợp lệ.', 'error');
      return;
    }
    if (isDeliveryDateBeforeToday(normalizedDeliveryDate, todayDeliveryDate)) {
      notify(
        `Ngày giao hàng (${formatDeliveryDateShort(normalizedDeliveryDate)}) không được nhỏ hơn hôm nay (${formatDeliveryDateShort(todayDeliveryDate)}).`,
        'error'
      );
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

    const targetStoreId = Number(orderForm.storeId) || depot.id;
    const targetStore = allStores.find((s) => s.id === targetStoreId) ?? depot;
    const distKm = haversineDistanceKm(targetStore.latitude, targetStore.longitude, lat, lng);
    if (distKm > MAX_DELIVERY_DISTANCE_KM) {
      notify(
        `Điểm giao hàng cách "${targetStore.name}" ${distKm.toFixed(
          2
        )} km, vượt quá bán kính tối đa ${MAX_DELIVERY_DISTANCE_KM} km!`,
        'error'
      );
      return;
    }

    const canEditItems =
      orderModalMode === 'create' ||
      !editingOrder ||
      isOrderItemsEditable(editingOrder.status);

    if (canEditItems) {
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
    }

    setSavingOrder(true);
    try {
      if (orderModalMode === 'edit' && editingOrder) {
        await updateOrder(editingOrder.id, orderForm, { includeItems: canEditItems });
        notify(`Đã cập nhật đơn hàng ${editingOrder.orderCode} thành công!`);
      } else {
        await createOrder(depot.id, orderForm);
        notify('Đã tạo đơn hàng mới thành công!');
      }
      setShowOrderModal(false);
      setEditingOrder(null);
      setOrderForm(INITIAL_ORDER_FORM);
      await Promise.all([loadAllData(), loadStoresPage(), loadProductsPage(), loadCatalogProducts()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (diff !== 0) return diff;
      return b.id - a.id;
    });
  }, [orders]);

  const packedOrders = useMemo(
    () => sortedOrders.filter((o) => o.status === 'PACKED'),
    [sortedOrders]
  );

  const handleUpdateOrderPaymentStatus = async (
    orderId: number,
    paymentStatus: PaymentStatus,
    paymentReference?: string | null
  ) => {
    try {
      const result = await updateOrderPaymentStatus(
        orderId,
        paymentStatus,
        paymentReference
      );
      notify(result.message);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
      throw err;
    }
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return sortedOrders.filter((o) => {
      if (statusFilters.length > 0 && !statusFilters.includes(o.status)) return false;
      if (paymentMethodFilter !== 'ALL' && (o.paymentMethod ?? 'COD') !== paymentMethodFilter) {
        return false;
      }
      if (paymentStatusFilter !== 'ALL' && (o.paymentStatus ?? 'UNPAID') !== paymentStatusFilter) {
        return false;
      }
      if (deliveryDateFilter && o.deliveryDate !== deliveryDateFilter) {
        return false;
      }
      if (hourDeliveryFilter !== 'ALL' && String(o.hourDelivery) !== hourDeliveryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.customerAddress.toLowerCase().includes(q) ||
        (o.store?.name?.toLowerCase().includes(q) ?? false) ||
        (o.items?.some((i) => i.productName.toLowerCase().includes(q)) ?? false) ||
        (o.paymentReference?.toLowerCase().includes(q) ?? false) ||
        (o.trip?.tripCode?.toLowerCase().includes(q) ?? false) ||
        (o.trip?.driver?.name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    sortedOrders,
    statusFilters,
    paymentMethodFilter,
    paymentStatusFilter,
    deliveryDateFilter,
    hourDeliveryFilter,
    orderSearch,
  ]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: orders.length,
      NEW: 0,
      PICKING: 0,
      PACKED: 0,
      DELIVERING: 0,
      COMPLETED: 0,
      PARTIALLY_REJECTED: 0,
      REJECTED: 0,
      FAILED: 0,
      CANCELLED: 0,
    };
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  const handleOpenCreateProduct = () => {
    setProductModalMode('create');
    setEditingProduct(null);
    setProductForm(createInitialProductForm(allStores));
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    setProductModalMode('edit');
    setEditingProduct(product);
    setProductForm(productToFormState(product, allStores));
    setShowProductModal(true);
  };

  const handleSubmitProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      notify('Vui lòng nhập tên sản phẩm.', 'error');
      return;
    }

    const price = Number(productForm.price);
    if (!Number.isFinite(price) || price < 0) {
      notify('Đơn giá phải là số hợp lệ >= 0.', 'error');
      return;
    }

    for (const [storeIdStr, qtyStr] of Object.entries(productForm.depotStocks)) {
      const qty = qtyStr.trim() === '' ? 0 : Number(qtyStr);
      if (!Number.isInteger(qty) || qty < 0) {
        const storeName =
          allStores.find((s) => s.id === Number(storeIdStr))?.name ?? `Depot #${storeIdStr}`;
        notify(`Tồn kho tại "${storeName}" phải là số nguyên >= 0.`, 'error');
        return;
      }
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
      await Promise.all([loadProductsPage(), loadCatalogProducts(), loadStoresPage()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (product: Product) => {
    try {
      const nextForm: ProductFormState = {
        ...productToFormState(product, allStores),
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
      await Promise.all([loadProductsPage(), loadCatalogProducts(), loadStoresPage()]);
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

  const handleProductDepotFilterChange = (value: string) => {
    setProductDepotFilter(value);
    setProductPage(1);
  };

  const handleProductPageSizeChange = (nextSize: number) => {
    setProductPageSize(nextSize);
    setProductPage(1);
  };

  const handleOpenCreateDriver = () => {
    setDriverModalMode('create');
    setEditingDriver(null);
    const defaultActiveStore =
      allStores.find((s) => s.isDefault && s.isActive !== false) ??
      allStores.find((s) => s.isActive !== false) ??
      depot;
    setDriverForm({
      ...INITIAL_DRIVER_FORM,
      storeId: String(defaultActiveStore.id),
    });
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
    const parsedStoreId = Number(driverForm.storeId);
    if (!Number.isInteger(parsedStoreId) || parsedStoreId <= 0) {
      notify('Vui lòng chọn depot phụ trách cho tài xế.', 'error');
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
      await Promise.all([loadDriversPage(), loadAvailableDrivers(), loadStoresPage()]);
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
      await Promise.all([loadDriversPage(), loadAvailableDrivers(), loadStoresPage()]);
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

  const handleDriverStoreFilterChange = (value: string) => {
    setDriverStoreFilter(value);
    setDriverPage(1);
  };

  const handleDriverPageSizeChange = (nextSize: number) => {
    setDriverPageSize(nextSize);
    setDriverPage(1);
  };

  const handleOpenCreateStore = () => {
    setStoreModalMode('create');
    setEditingStore(null);
    setStoreForm({
      ...INITIAL_STORE_FORM,
      latitude: String(depot.latitude),
      longitude: String(depot.longitude),
    });
    setShowStoreModal(true);
  };

  const handleOpenEditStore = (store: Store) => {
    setStoreModalMode('edit');
    setEditingStore(store);
    setStoreForm(storeToFormState(store));
    setShowStoreModal(true);
  };

  const handleSubmitStore = async (e: FormEvent) => {
    e.preventDefault();
    if (!storeForm.name.trim() || !storeForm.address.trim()) {
      notify('Vui lòng nhập đầy đủ tên và địa chỉ điểm xuất phát.', 'error');
      return;
    }
    const lat = Number(storeForm.latitude);
    const lng = Number(storeForm.longitude);
    if (
      storeForm.latitude.trim() === '' ||
      storeForm.longitude.trim() === '' ||
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

    setSavingStore(true);
    try {
      if (storeModalMode === 'edit' && editingStore) {
        await updateStore(editingStore.id, storeForm);
        notify(`Đã cập nhật điểm xuất phát "${storeForm.name.trim()}" thành công!`);
      } else {
        await createStore(storeForm);
        notify(`Đã thêm điểm xuất phát "${storeForm.name.trim()}" thành công!`);
      }
      setShowStoreModal(false);
      setEditingStore(null);
      setStoreForm(INITIAL_STORE_FORM);
      await Promise.all([loadStoresPage(), loadAllData()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingStore(false);
    }
  };

  const handleSetDefaultStore = async (store: Store) => {
    try {
      const { message } = await setDefaultStore(store.id);
      notify(message, 'info');
      await Promise.all([loadStoresPage(), loadAllData()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleToggleStoreActive = async (store: Store) => {
    try {
      const nextIsActive = store.isActive === false;
      const nextForm: StoreFormState = {
        ...storeToFormState(store),
        isActive: nextIsActive,
      };
      await updateStore(store.id, nextForm);
      notify(
        nextIsActive
          ? `Đã kích hoạt lại điểm xuất phát "${store.name}".`
          : `Đã chuyển "${store.name}" sang trạng thái Ngừng hoạt động.`
      );
      await Promise.all([loadStoresPage(), loadAllData()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleDeleteStore = async (store: Store) => {
    try {
      await deleteStore(store.id);
      notify(`Đã xóa điểm xuất phát "${store.name}" thành công!`);
      await Promise.all([loadStoresPage(), loadAllData()]);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleStoreSearchChange = (value: string) => {
    setStoreSearch(value);
    setStorePage(1);
  };

  const handleStoreStatusFilterChange = (value: string) => {
    setStoreStatusFilter(value);
    setStorePage(1);
  };

  const handleStorePageSizeChange = (nextSize: number) => {
    setStorePageSize(nextSize);
    setStorePage(1);
  };

  const handleOpenCreateUser = () => {
    setUserModalMode('create');
    setEditingUser(null);
    setUserForm(INITIAL_USER_FORM);
    setShowUserModal(true);
  };

  const handleOpenEditUser = (target: ManagedUser) => {
    setUserModalMode('edit');
    setEditingUser(target);
    setUserForm(userToFormState(target));
    setShowUserModal(true);
  };

  const handleSubmitUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.email.trim()) {
      notify('Vui lòng nhập đầy đủ họ tên và email.', 'error');
      return;
    }
    if (userModalMode === 'create' && userForm.password.length < 6) {
      notify('Mật khẩu phải có ít nhất 6 ký tự.', 'error');
      return;
    }

    setSavingUser(true);
    try {
      if (userModalMode === 'edit' && editingUser) {
        const updated = await updateUser(editingUser.id, userForm);
        notify(`Đã cập nhật tài khoản "${updated.name}" thành công!`);
      } else {
        const created = await createUser(userForm);
        notify(`Đã tạo tài khoản "${created.name}" thành công!`);
      }
      setShowUserModal(false);
      setEditingUser(null);
      await loadUsersPage();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (target: ManagedUser) => {
    try {
      const updated = await updateUser(target.id, {
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: !target.isActive,
      });
      notify(
        updated.isActive
          ? `Đã kích hoạt lại tài khoản "${updated.name}".`
          : `Đã vô hiệu hóa tài khoản "${updated.name}" và thu hồi phiên đăng nhập.`
      );
      await loadUsersPage();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleResetUserPassword = async (target: ManagedUser, newPassword: string) => {
    const res = await resetUserPassword(target.id, newPassword);
    notify(res.message);
  };

  const handleDeleteUser = async (target: ManagedUser) => {
    try {
      await deleteUser(target.id);
      notify(`Đã xóa tài khoản "${target.name}".`);
      await loadUsersPage();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  const handleUserSearchChange = (value: string) => {
    setUserSearch(value);
    setUserPage(1);
  };

  const handleUserRoleFilterChange = (value: string) => {
    setUserRoleFilter(value);
    setUserPage(1);
  };

  const handleUserStatusFilterChange = (value: string) => {
    setUserStatusFilter(value);
    setUserPage(1);
  };

  const handleUserPageSizeChange = (nextSize: number) => {
    setUserPageSize(nextSize);
    setUserPage(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-body text-primary">
      <Header
        user={user}
        activePage={activePage}
        onActivePageChange={handleActivePageChange}
        counts={counts}
        tripsCount={trips.length}
        productsCount={productSummary.totalProducts}
        driversCount={driverSummary.totalDrivers}
        storesCount={storeSummary.totalStores}
        usersCount={userSummary.totalUsers}
        onOpenNewOrder={handleOpenCreateOrder}
        onOpenChangePassword={() => setShowChangePasswordModal(true)}
        onLogout={() => {
          void onLogout();
        }}
      />

      {activePage === 'orders' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <OrderTable
            role={role}
            filteredOrders={filteredOrders}
            counts={counts}
            statusFilters={statusFilters}
            onStatusFiltersChange={handleStatusFiltersChange}
            paymentMethodFilter={paymentMethodFilter}
            onPaymentMethodFilterChange={setPaymentMethodFilter}
            paymentStatusFilter={paymentStatusFilter}
            onPaymentStatusFilterChange={setPaymentStatusFilter}
            deliveryDateFilter={deliveryDateFilter}
            onDeliveryDateFilterChange={setDeliveryDateFilter}
            hourDeliveryFilter={hourDeliveryFilter}
            onHourDeliveryFilterChange={setHourDeliveryFilter}
            searchQuery={orderSearch}
            onSearchQueryChange={setOrderSearch}
            selectedOrderIds={selectedOrderIds}
            onSelectedOrderIdsChange={setSelectedOrderIds}
            loading={loading}
            bulkLoading={bulkActionLoading}
            onBatchPreparePacked={handleBatchPreparePacked}
            onBulkAction={handleBulkOrderAction}
            onEditOrder={handleOpenEditOrder}
            onCancelOrder={handleCancelOrder}
            onUpdatePaymentStatus={handleUpdateOrderPaymentStatus}
            onStartPicking={handleStartPicking}
            onCompletePacking={handleCompletePacking}
            onCompleteDelivery={handleCompleteDelivery}
            onFailDelivery={handleFailDelivery}
            onOpenRejectDelivery={handleOpenRejectDelivery}
          />
        </main>
      ) : activePage === 'trips' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <TripManagementPage
            role={role}
            depot={depot}
            stores={allStores}
            trips={trips}
            packedOrders={packedOrders}
            availableDrivers={availableDrivers}
            assignableDrivers={assignableDrivers}
            isDarkMode={isDarkMode}
            optimizing={optimizing}
            onCreateTrip={handleCreateTrip}
            onStartTrip={handleStartTrip}
            onReassignTripDriver={handleReassignTripDriver}
            onReoptimizeTrip={handleReoptimizeTrip}
            onCancelTrip={handleCancelTrip}
            onCompleteDelivery={handleCompleteDelivery}
            onFailDelivery={handleFailDelivery}
            onOpenRejectDelivery={handleOpenRejectDelivery}
          />
        </main>
      ) : activePage === 'products' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <ProductManagementPage
            role={role}
            products={products}
            stores={allStores}
            depotFilter={productDepotFilter}
            onDepotFilterChange={handleProductDepotFilterChange}
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
      ) : activePage === 'drivers' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <DriverManagementPage
            role={role}
            drivers={drivers}
            stores={allStores}
            pagination={driverPagination}
            summary={driverSummary}
            searchQuery={driverSearch}
            onSearchQueryChange={handleDriverSearchChange}
            statusFilter={driverStatusFilter}
            onStatusFilterChange={handleDriverStatusFilterChange}
            vehicleTypeFilter={driverVehicleFilter}
            onVehicleTypeFilterChange={handleDriverVehicleFilterChange}
            storeFilter={driverStoreFilter}
            onStoreFilterChange={handleDriverStoreFilterChange}
            onPageChange={setDriverPage}
            onPageSizeChange={handleDriverPageSizeChange}
            loading={loadingDrivers}
            onOpenCreateDriver={handleOpenCreateDriver}
            onEditDriver={handleOpenEditDriver}
            onToggleActive={handleToggleDriverActive}
            onDeleteDriver={handleDeleteDriver}
          />
        </main>
      ) : activePage === 'depots' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <DepotManagementPage
            role={role}
            stores={stores}
            allStores={allStores}
            pagination={storePagination}
            summary={storeSummary}
            searchQuery={storeSearch}
            onSearchQueryChange={handleStoreSearchChange}
            statusFilter={storeStatusFilter}
            onStatusFilterChange={handleStoreStatusFilterChange}
            onPageChange={setStorePage}
            onPageSizeChange={handleStorePageSizeChange}
            loading={loadingStores}
            isDarkMode={isDarkMode}
            onOpenCreateStore={handleOpenCreateStore}
            onEditStore={handleOpenEditStore}
            onSetDefaultStore={handleSetDefaultStore}
            onToggleStoreActive={handleToggleStoreActive}
            onDeleteStore={handleDeleteStore}
            onInventoryUpdated={() => {
              void Promise.all([loadStoresPage(), loadProductsPage(), loadCatalogProducts()]);
            }}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <UserManagementPage
            currentUserId={user.id}
            users={users}
            pagination={userPagination}
            summary={userSummary}
            searchQuery={userSearch}
            onSearchQueryChange={handleUserSearchChange}
            roleFilter={userRoleFilter}
            onRoleFilterChange={handleUserRoleFilterChange}
            statusFilter={userStatusFilter}
            onStatusFilterChange={handleUserStatusFilterChange}
            onPageChange={setUserPage}
            onPageSizeChange={handleUserPageSizeChange}
            loading={loadingUsers}
            onOpenCreateUser={handleOpenCreateUser}
            onEditUser={handleOpenEditUser}
            onToggleUserActive={handleToggleUserActive}
            onResetPassword={handleResetUserPassword}
            onDeleteUser={handleDeleteUser}
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
        stores={allStores}
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
        stores={allStores}
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
        stores={allStores}
        form={driverForm}
        onFormChange={setDriverForm}
        submitting={savingDriver}
        onSubmit={handleSubmitDriver}
      />

      <AssignDriverModal
        isOpen={Boolean(assigningOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningOrder(null);
          }
        }}
        order={assigningOrder}
        drivers={assignableDrivers}
        submitting={savingAssignment}
        onAssign={handleAssignDriver}
        onUnassign={handleUnassignDriver}
      />

      <RejectDeliveryModal
        isOpen={Boolean(rejectingOrder)}
        onOpenChange={(open) => {
          if (!open && !savingRejection) {
            setRejectingOrder(null);
          }
        }}
        order={rejectingOrder}
        submitting={savingRejection}
        onConfirm={handleConfirmRejectDelivery}
      />

      <BulkAssignDriverModal
        isOpen={Boolean(bulkAssignTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setBulkAssignTarget(null);
          }
        }}
        orders={bulkAssignTarget?.orders ?? []}
        skippedCount={bulkAssignTarget?.skippedCount ?? 0}
        drivers={assignableDrivers}
        submitting={bulkActionLoading}
        onConfirm={handleConfirmBulkAssignDriver}
      />

      <CreateTripModal
        isOpen={showBulkCreateTripModal}
        onOpenChange={(open) => {
          setShowBulkCreateTripModal(open);
          if (!open) {
            setBulkCreateTripOrderIds([]);
          }
        }}
        packedOrders={packedOrders}
        availableDrivers={assignableDrivers.length > 0 ? assignableDrivers : availableDrivers}
        stores={allStores}
        defaultDepot={depot}
        submitting={optimizing}
        initialSelectedOrderIds={bulkCreateTripOrderIds}
        onCreateTrip={handleConfirmBulkCreateTrip}
      />

      <DepotFormModal
        isOpen={showStoreModal}
        onOpenChange={(open) => {
          setShowStoreModal(open);
          if (!open) {
            setEditingStore(null);
          }
        }}
        mode={storeModalMode}
        editingStore={editingStore}
        form={storeForm}
        onFormChange={setStoreForm}
        isDarkMode={isDarkMode}
        submitting={savingStore}
        onSubmit={handleSubmitStore}
      />

      <UserFormModal
        isOpen={showUserModal}
        onOpenChange={(open) => {
          setShowUserModal(open);
          if (!open) {
            setEditingUser(null);
          }
        }}
        mode={userModalMode}
        editingUser={editingUser}
        currentUserId={user.id}
        form={userForm}
        onFormChange={setUserForm}
        submitting={savingUser}
        onSubmit={handleSubmitUser}
      />

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onOpenChange={setShowChangePasswordModal}
      />
    </div>
  );
}

function AppGate({
  isDarkMode,
}: {
  isDarkMode: boolean;
}) {
  const { user, isInitializing, logout } = useAuth();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-body text-primary flex items-center justify-center">
        <div className="text-sm text-secondary">Đang khôi phục phiên đăng nhập...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <DmsDashboard
      user={user}
      onLogout={logout}
      isDarkMode={isDarkMode}
    />
  );
}

export default function App() {
  const [themeMode] = useState<ThemeMode>(readStoredThemeMode);
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

  const isDarkMode =
    themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={themeMode}>
      <LayerProvider>
        <AuthProvider>
          <AppGate isDarkMode={isDarkMode} />
        </AuthProvider>
      </LayerProvider>
    </Theme>
  );
}
