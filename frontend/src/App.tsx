import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { useToast } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { defaultThemeSlug, themes } from './astryx-themes';
import {
  completeDeliveryOrder,
  completePackingOrder,
  createOrder,
  failDeliveryOrder,
  fetchDashboardData,
  getErrorMessage,
  optimizeTripRoute,
  seedSampleOrders,
  startPickingOrder,
} from './api/dmsApi';
import { ActiveTripPanel } from './components/ActiveTripPanel';
import { Header } from './components/Header';
import { NewOrderModal } from './components/NewOrderModal';
import { OrderTable } from './components/OrderTable';
import { RouteMap } from './components/RouteMap';
import {
  DEFAULT_DEPOT,
  INITIAL_NEW_ORDER_FORM,
  type NewOrderFormState,
  type Order,
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

function DmsDashboard({ themeMode, onThemeModeChange, isDarkMode }: DmsDashboardProps) {
  const showToast = useToast();

  const [role, setRole] = useState<Role>('ADMIN');
  const [orders, setOrders] = useState<Order[]>([]);
  const [depot, setDepot] = useState<Store>(DEFAULT_DEPOT);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [newOrderForm, setNewOrderForm] =
    useState<NewOrderFormState>(INITIAL_NEW_ORDER_FORM);

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

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardData();
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
  }, [notify]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

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

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.customerName.trim() || !newOrderForm.customerAddress.trim()) {
      notify('Vui lòng nhập tên khách hàng và địa chỉ giao hàng.', 'error');
      return;
    }

    setCreatingOrder(true);
    try {
      await createOrder(depot.id, newOrderForm);
      notify('Đã tạo đơn hàng mới thành công!');
      setShowNewOrderModal(false);
      setNewOrderForm(INITIAL_NEW_ORDER_FORM);
      await loadAllData();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setCreatingOrder(false);
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

  return (
    <div className="min-h-screen flex flex-col bg-body text-primary">
      <Header
        role={role}
        onRoleChange={setRole}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        counts={counts}
        loading={loading}
        onOpenNewOrder={() => setShowNewOrderModal(true)}
        onSeedOrders={handleSeedOrders}
      />

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

      <NewOrderModal
        isOpen={showNewOrderModal}
        onOpenChange={setShowNewOrderModal}
        form={newOrderForm}
        onFormChange={setNewOrderForm}
        submitting={creatingOrder}
        onSubmit={handleCreateOrder}
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
