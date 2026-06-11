'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { getAllOrders, updateOrderStatus } from '../../lib/db/orders';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

const TABS = ['all', 'pending', 'negotiating', 'ready', 'closed', 'cancelled'];

// ─────────────────────────────────────────────────────────────────────────
// The mobile app writes orders with an items[] array (one entry per wall /
// wallpaper). Older orders may have flat fields (wallpaperId, rollsNeeded)
// at the top level. This helper reads BOTH shapes so nothing breaks.
// ─────────────────────────────────────────────────────────────────────────
function getOrderItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }
  // Legacy flat-field order
  if (order.wallpaperId) {
    return [{
      wallpaperId: order.wallpaperId,
      wallpaperName: order.wallpaperName || '',
      sqm: order.totalSqm || 0,
      rollsNeeded: order.rollsNeeded || 0,
      totalPrice: order.estimatedPrice || 0,
    }];
  }
  return [];
}

function orderTotalRolls(order) {
  return getOrderItems(order).reduce(
    (s, it) => s + (Number(it.rollsNeeded ?? it.rolls) || 0), 0);
}

function orderTotalSqm(order) {
  return getOrderItems(order).reduce(
    (s, it) => s + (Number(it.sqm) || 0), 0);
}

function orderTotalPrice(order) {
  if (order.totalAmount) return Number(order.totalAmount);
  if (order.estimatedPrice) return Number(order.estimatedPrice);
  return getOrderItems(order).reduce(
    (s, it) => s + (Number(it.totalPrice ?? it.total) || 0), 0);
}

function orderWallpaperLabel(order) {
  const items = getOrderItems(order);
  if (items.length === 0) return '—';
  const first = items[0].wallpaperName || '—';
  return items.length > 1 ? `${first} +${items.length - 1}` : first;
}

export default function OrdersPage() {
  const { shopId, currentUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', branchId: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      // For admin, pass null shopId to get all orders
      const effectiveShopId = isAdmin ? null : shopId;
      const [ordersData, branchSnap] = await Promise.all([
        getAllOrders(effectiveShopId, {
          status: activeTab === 'all' ? '' : activeTab,
          ...filters,
        }),
        getDocs(query(collection(db, 'branches'), ...(isAdmin ? [] : [where('shopId', '==', shopId)]))),
      ]);
      setOrders(ordersData);
      setBranches(branchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId, activeTab, filters, isAdmin]);

  const handleStatusChange = async (order, newStatus) => {
    try {
      await updateOrderStatus(order.id, newStatus, currentUser.uid);
      toast.success(t('orders_status_changed'));
      fetchData();
    } catch {
      toast.error(t('common_error'));
    }
  };

  const columns = [
    {
      key: 'customer', label: t('orders_customer_phone'), accessor: 'customerPhone',
      render: (v) => v ? (
        <a href={`tel:${v}`} className="flex items-center gap-1.5 text-primary hover:underline text-sm">
          <Phone size={13} />
          {v}
        </a>
      ) : <span className="text-subtext">—</span>,
    },
    {
      key: 'wallpaper', label: t('orders_wallpaper'), sortable: false,
      render: (_, row) => (
        <span className="text-text-main text-sm">{orderWallpaperLabel(row)}</span>
      ),
    },
    {
      key: 'rolls', label: t('orders_rolls_needed'), sortable: false,
      render: (_, row) => {
        const rolls = orderTotalRolls(row);
        return <span className="text-subtext text-sm">{rolls > 0 ? rolls : '—'}</span>;
      },
    },
    {
      key: 'sqm', label: t('orders_total_sqm'), sortable: false,
      render: (_, row) => {
        const sqm = orderTotalSqm(row);
        return <span className="text-subtext text-sm">{sqm > 0 ? `${sqm.toFixed(1)} ${t('common_sqm')}` : '—'}</span>;
      },
    },
    {
      key: 'price', label: t('orders_estimated_price'), sortable: false,
      render: (_, row) => {
        const total = orderTotalPrice(row);
        return total > 0
          ? <span className="text-primary font-semibold text-sm">{format(total)}</span>
          : <span className="text-subtext">—</span>;
      },
    },
    {
      key: 'date', label: t('orders_date'),
      render: (_, row) => (
        <span className="text-subtext text-xs">
          {row.createdAt?.toDate?.()?.toLocaleString() || '—'}
        </span>
      ),
    },
    {
      key: 'status', label: t('common_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(`/orders/${row.id}`)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
          >
            {t('common_view')}
          </button>
          {row.status === 'pending' && (
            <button
              onClick={() => handleStatusChange(row, 'negotiating')}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all"
            >
              {t('orders_negotiating')}
            </button>
          )}
          {row.status === 'negotiating' && (
            <button
              onClick={() => handleStatusChange(row, 'ready')}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all"
            >
              {t('orders_ready')}
            </button>
          )}
          {(row.status === 'ready' || row.status === 'negotiating') && (
            <button
              onClick={() => router.push(`/sales/new?orderId=${row.id}`)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-green-500/10 text-success hover:bg-green-500/20 transition-all"
            >
              {t('orders_convert_to_sale')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('orders_title')}>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
              ${activeTab === tab
                ? 'bg-primary text-dark'
                : 'bg-card text-subtext hover:text-text-main border border-white/5 hover:border-white/10'
              }`}
          >
            {t(`orders_${tab}`)}
            {tab === 'all' ? ` (${orders.length})` : ''}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="text-sm py-2 min-w-[140px]"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="text-sm py-2 min-w-[140px]"
        />
        <select
          value={filters.branchId}
          onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))}
          className="text-sm py-2 min-w-[160px]"
        >
          <option value="">{t('orders_branch')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nameEn || b.nameUz}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        onRowClick={(row) => router.push(`/orders/${row.id}`)}
        keyField="id"
      />
    </Layout>
  );
}
