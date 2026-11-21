import {
  ArrowRight,
  ClipboardList,
  Monitor,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Sun,
  Truck,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import {
  ROLE_META,
  type ActivePage,
  type Role,
  type ThemeMode,
} from '../types/dms';

interface HeaderProps {
  activePage: ActivePage;
  onActivePageChange: (page: ActivePage) => void;
  role: Role;
  onRoleChange: (role: Role) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  counts: Record<string, number>;
  productsCount: number;
  loading: boolean;
  onOpenNewOrder: () => void;
  onSeedOrders: () => void;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Quản lý / Điều phối (ADMIN)' },
  { value: 'WAREHOUSE', label: 'Nhân viên Kho (WAREHOUSE)' },
  { value: 'DRIVER', label: 'Tài xế Giao hàng (DRIVER)' },
];

export function Header({
  activePage,
  onActivePageChange,
  role,
  onRoleChange,
  themeMode,
  onThemeModeChange,
  counts,
  productsCount,
  loading,
  onOpenNewOrder,
  onSeedOrders,
}: HeaderProps) {
  const activeRole = ROLE_META[role];

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
              value="products"
              label={`Sản phẩm (${productsCount})`}
              icon={<Package className="w-3.5 h-3.5" />}
            />
          </SegmentedControl>

          <Selector
            label="Vai trò (Switch Role)"
            isLabelHidden
            variant="secondary"
            size="sm"
            width={240}
            startIcon={<UserCheck className="w-4 h-4" />}
            options={ROLE_OPTIONS}
            value={role}
            onChange={(val) => onRoleChange(val as Role)}
          />

          <SegmentedControl
            label="Giao diện sáng hoặc tối"
            size="sm"
            value={themeMode}
            onChange={(val) => onThemeModeChange(val as ThemeMode)}
          >
            <SegmentedControlItem
              value="light"
              label="Sáng"
              icon={<Sun className="w-3.5 h-3.5" />}
            />
            <SegmentedControlItem
              value="system"
              label="Hệ thống"
              icon={<Monitor className="w-3.5 h-3.5" />}
            />
            <SegmentedControlItem
              value="dark"
              label="Tối"
              icon={<Moon className="w-3.5 h-3.5" />}
            />
          </SegmentedControl>

          <Button
            label="Tạo đơn mới"
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={onOpenNewOrder}
          />

          <Button
            label="Seed 10 Sample Orders"
            variant="primary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            isLoading={loading}
            onClick={onSeedOrders}
          />
        </div>
      </div>

      {/* Role Contextual Guide Bar */}
      <div className="bg-muted border-t border-border py-2 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={activeRole.shortLabel} variant={activeRole.badgeVariant} />
            <Text type="supporting" size="xsm">
              Tài khoản đang chọn:{' '}
              <Text type="label" size="xsm" color="primary">
                {activeRole.email}
              </Text>{' '}
              — {activeRole.desc}
            </Text>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Text type="supporting" size="xsm" hasTabularNumbers>
              NEW ({counts.NEW ?? 0})
            </Text>
            <ArrowRight className="w-3 h-3 text-secondary" />
            <Text type="supporting" size="xsm" hasTabularNumbers>
              PICKING ({counts.PICKING ?? 0})
            </Text>
            <ArrowRight className="w-3 h-3 text-secondary" />
            <Text type="supporting" size="xsm" hasTabularNumbers>
              PACKED ({counts.PACKED ?? 0})
            </Text>
            <ArrowRight className="w-3 h-3 text-secondary" />
            <Text type="supporting" size="xsm" hasTabularNumbers>
              DELIVERING ({counts.DELIVERING ?? 0})
            </Text>
            <ArrowRight className="w-3 h-3 text-secondary" />
            <Text type="label" size="xsm" color="accent" hasTabularNumbers>
              COMPLETED ({counts.COMPLETED ?? 0})
            </Text>
          </div>
        </div>
      </div>
    </header>
  );
}
