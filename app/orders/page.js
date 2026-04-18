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

export default function OrdersPage() {
  const { shopId, currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', branchId: '' });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [ordersData, branchSnap] = await Promise.all([
        getAllOrders(shopId, {
          status: activeTab === 'all' ? '' : activeTab,
          ...filters,
        }),
        getDocs(query(collection(db, 'branches'), where('shopId', '==', shopId))),
      ]);
      setOrders(ordersData);
      setBranches(branchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId, activeTab, filters]);

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
      key: 'wallpaper', label: t('orders_wallpaper'), accessor: 'wallpaperName',
      render: (v) => <span className="text-text-main text-sm">{v || '—'}</span>,
    },
    {
      key: 'rolls', label: t('orders_rolls_needed'), accessor: 'rollsNeeded',
      render: (v) => <span className="text-subtext text-sm">{v || '—'}</span>,
    },
    {
      key: 'length', label: t('orders_length_needed'), accessor: 'lengthNeededM',
      render: (v) => <span className="text-subtext text-sm">{v ? `${v}m` : '—'}</span>,
    },
    {
      key: 'price', label: t('orders_estimated_price'), accessor: 'estimatedPrice',
      render: (v) => v ? <span className="text-primary font-semibold text-sm">{format(v)}</span> : <span className="text-subtext">—</span>,
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
              Negotiate
            </button>
          )}
          {row.status === 'negotiating' && (
            <button
              onClick={() => handleStatusChange(row, 'ready')}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all"
            >
              Mark Ready
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
            {t(`orders_${tab}` in t ? `orders_${tab}` : `orders_${tab}`) || tab}
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
