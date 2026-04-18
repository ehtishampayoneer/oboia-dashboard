'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, TrendingUp, Maximize2, ShoppingBag, AlertTriangle,
} from 'lucide-react';
import Layout from '../../components/Layout';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  getTodaySalesSummary, getLast30DaysSales,
} from '../../lib/db/sales';
import { getLowStockWallpapers } from '../../lib/db/wallpapers';
import { getAllOrders } from '../../lib/db/orders';
import {
  collection, query, where, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

const CustomTooltip = ({ active, payload, label, format }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-white/10 rounded-xl px-4 py-3 shadow-card">
      <p className="text-subtext text-xs mb-1">{label}</p>
      <p className="text-primary font-bold text-sm">{format(payload[0]?.value || 0)}</p>
    </div>
  );
};

export default function DashboardPage() {
  const { shopId, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [topWallpapers, setTopWallpapers] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !shopId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [todayStats, chart, low, orders] = await Promise.all([
          getTodaySalesSummary(shopId),
          getLast30DaysSales(shopId),
          getLowStockWallpapers(shopId),
          getAllOrders(shopId, { status: 'pending' }),
        ]);

        setStats(todayStats);
        setChartData(chart);
        setLowStock(low.slice(0, 5));

        // Get recent orders (all, last 5)
        const allOrders = await getAllOrders(shopId);
        setRecentOrders(allOrders.slice(0, 5));

        // Top selling wallpapers from chart/sales
        const salesSnap = await getDocs(
          query(
            collection(db, 'sales'),
            where('shopId', '==', shopId),
            where('status', '==', 'closed')
          )
        );
        const productMap = {};
        salesSnap.docs.forEach((d) => {
          const sale = d.data();
          for (const item of sale.items || []) {
            const id = item.wallpaperId;
            if (!productMap[id]) {
              productMap[id] = { id, name: item.wallpaperName || id, revenue: 0, sqm: 0 };
            }
            productMap[id].revenue += item.total || 0;
            productMap[id].sqm += item.sqm || 0;
          }
        });
        setTopWallpapers(
          Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        );
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [shopId, authLoading]);

  return (
    <Layout title={t('dashboard_title')}>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('dashboard_today_sales')}
          value={format(stats?.revenue || 0)}
          secondary={`${stats?.count || 0} receipts`}
          icon={DollarSign}
          loading={loading}
          highlight
        />
        <StatCard
          label={t('dashboard_today_profit')}
          value={format(stats?.profit || 0)}
          secondary={
            stats?.revenue > 0
              ? `${((stats.profit / stats.revenue) * 100).toFixed(1)}% margin`
              : '0% margin'
          }
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          label={t('dashboard_today_sqm')}
          value={`${(stats?.sqm || 0).toFixed(1)} m²`}
          icon={Maximize2}
          loading={loading}
        />
        <StatCard
          label={t('dashboard_pending_orders')}
          value={recentOrders.filter((o) => o.status === 'pending').length}
          secondary="Need attention"
          icon={ShoppingBag}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        {/* Sales chart */}
        <div className="xl:col-span-2 bg-card border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-text-main font-semibold">{t('dashboard_sales_chart')}</h2>
          </div>
          {loading ? (
            <div className="h-48 bg-surface animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D35" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#B0B3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#B0B3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
                  width={50}
                />
                <Tooltip content={<CustomTooltip format={format} />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#FFD369"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#FFD369', stroke: '#FFD369' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text-main font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" />
              {t('dashboard_low_stock')}
            </h2>
            <button
              onClick={() => router.push('/warehouse')}
              className="text-xs text-primary hover:underline"
            >
              {t('dashboard_view_all')}
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-surface animate-pulse rounded-lg" />
              ))}
            </div>
          ) : lowStock.length === 0 ? (
            <p className="text-subtext text-sm py-8 text-center">{t('dashboard_no_data')}</p>
          ) : (
            <div className="space-y-2">
              {lowStock.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-3 bg-surface rounded-lg
                    border border-error/20"
                >
                  <div className="min-w-0">
                    <p className="text-text-main text-sm font-medium truncate">
                      {w.nameUz || w.nameEn}
                    </p>
                    <p className="text-subtext text-xs">
                      Threshold: {w.lowStockThreshold}
                    </p>
                  </div>
                  <span className="text-error font-bold text-sm ml-2 flex-shrink-0">
                    {w.stock} {t('common_rolls')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top wallpapers */}
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <h2 className="text-text-main font-semibold mb-4">{t('dashboard_top_wallpapers')}</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-surface animate-pulse rounded-lg" />
              ))}
            </div>
          ) : topWallpapers.length === 0 ? (
            <p className="text-subtext text-sm py-8 text-center">{t('dashboard_no_data')}</p>
          ) : (
            <div className="space-y-2">
              {topWallpapers.map((w, i) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3 p-3 bg-surface rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary
                    text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-main text-sm font-medium truncate">{w.name}</p>
                    <p className="text-subtext text-xs">{w.sqm.toFixed(1)} m²</p>
                  </div>
                  <span className="text-primary font-semibold text-sm flex-shrink-0">
                    {format(w.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text-main font-semibold">{t('dashboard_recent_orders')}</h2>
            <button
              onClick={() => router.push('/orders')}
              className="text-xs text-primary hover:underline"
            >
              {t('dashboard_view_all')}
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-surface animate-pulse rounded-lg" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="text-subtext text-sm py-8 text-center">{t('dashboard_no_data')}</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o) => (
                <div
                  key={o.id}
                  onClick={() => router.push(`/orders/${o.id}`)}
                  className="flex items-center justify-between p-3 bg-surface rounded-lg
                    hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-text-main text-sm font-medium">
                      {o.customerPhone || 'Unknown'}
                    </p>
                    <p className="text-subtext text-xs">
                      {o.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
                    </p>
                  </div>
                  <StatusBadge status={o.status} size="xs" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
