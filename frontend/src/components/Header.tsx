import {
  ClipboardList,
  KeyRound,
  LogOut,
  Package,
  Plus,
  Route,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import {
  canRoleAccessPage,
  canRoleEditOrders,
  type ActivePage,
  type AuthUser,
} from '../types/dms';

interface HeaderProps {
  user: AuthUser;
  activePage: ActivePage;
  onActivePageChange: (page: ActivePage) => void;
  counts: Record<string, number>;
  tripsCount: number;
  productsCount: number;
  driversCount: number;
  storesCount: number;
  usersCount: number;
  onOpenNewOrder: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  activePage,
  onActivePageChange,
  counts,
  tripsCount,
  productsCount,
  driversCount,
  storesCount,
  usersCount,
  onOpenNewOrder,
  onOpenChangePassword,
  onLogout,
}: HeaderProps) {
  const canCreateOrder = canRoleEditOrders(user.role);

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border shadow-xs">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-bg text-on-accent flex items-center justify-center shadow-xs shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <Heading level={3} accessibilityLevel={1}>
                DMS Dashboard
              </Heading>
              <Badge label="Google OR-Tools VRP" variant="purple" />
            </div>
            <Text type="supporting" size="xsm">
              Hệ thống Quản lý Đơn hàng Kho &amp; Điều phối Giao hàng
            </Text>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SegmentedControl
            label="Chuyển trang quản lý"
            size="sm"
            value={activePage}
            onChange={(val) => onActivePageChange(val as ActivePage)}
          >
            <SegmentedControlItem
              value="orders"
              label={`Đơn hàng (${counts.ALL ?? 0})`}
              icon={<ClipboardList className="w-3.5 h-3.5" />}
            />
            <SegmentedControlItem
              value="trips"
              label={`Chuyến xe (${tripsCount})`}
              icon={<Route className="w-3.5 h-3.5" />}
            />
            {canRoleAccessPage(user.role, 'products') && (
              <SegmentedControlItem
                value="products"
                label={`Sản phẩm (${productsCount})`}
                icon={<Package className="w-3.5 h-3.5" />}
              />
            )}
            {canRoleAccessPage(user.role, 'drivers') && (
              <SegmentedControlItem
                value="drivers"
                label={`Tài xế (${driversCount})`}
                icon={<Users className="w-3.5 h-3.5" />}
              />
            )}
            {canRoleAccessPage(user.role, 'depots') && (
              <SegmentedControlItem
                value="depots"
                label={`Điểm xuất phát (${storesCount})`}
                icon={<Warehouse className="w-3.5 h-3.5" />}
              />
            )}
            {canRoleAccessPage(user.role, 'users') && (
              <SegmentedControlItem
                value="users"
                label={`Tài khoản (${usersCount})`}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
              />
            )}
          </SegmentedControl>

          {canCreateOrder && (
            <Button
              label="Tạo đơn mới"
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={onOpenNewOrder}
            />
          )}

          <div className="flex items-center gap-1.5 pl-2 border-l border-border">
            <div className="hidden sm:flex flex-col items-end leading-tight mr-1">
              <Text type="label" size="xsm">
                {user.name}
              </Text>
              <Text type="supporting" size="xsm">
                {user.email}
              </Text>
            </div>
            <IconButton
              label="Đổi mật khẩu"
              tooltip="Đổi mật khẩu"
              variant="secondary"
              size="sm"
              icon={<KeyRound className="w-3.5 h-3.5" />}
              onClick={onOpenChangePassword}
            />
            <IconButton
              label="Đăng xuất"
              tooltip="Đăng xuất"
              variant="secondary"
              size="sm"
              icon={<LogOut className="w-3.5 h-3.5" />}
              onClick={onLogout}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
