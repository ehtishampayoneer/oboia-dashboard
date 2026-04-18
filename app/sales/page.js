'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, FileText } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { getAllSales } from '../../lib/db/sales';
import { getAllEmployees } from '../../lib/db/employees';
import { exportToExcel } from '../../lib/db/reports';
import toast from 'react-hot-toast';

export default function SalesPage() {
  const { shopId } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [sales, setSales] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: '', dateTo: '', sellerId: '', paymentType: '',
  });
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [salesData, emps] = await Promise.all([
        getAllSales(shopId, filters),
        getAllEmployees(shopId),
      ]);
      setSales(salesData);
      setEmployees(emps);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId, filters]);

  const totalRevenue = sales.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalProfit = sales.reduce((s, r) => s + ((r.totalAmount || 0) - (r.totalCost || 0)), 0);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const rawSales = sales;
      await exportToExcel(
        {
          summary: {
            totalRevenue,
            totalCost: totalRevenue - totalProfit,
            totalProfit,
            profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0,
            totalSqm: sales.reduce((s, r) => s + (r.totalSqm || 0), 0),
            totalOrders: sales.length,
            totalRefunds: 0,
          },
          productData: [],
          employeeData: [],
          paymentData: [],
          rawSales,
        },
        `sales_export_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      key: 'receiptNumber', label: t('sales_receipt_number'), accessor: 'receiptNumber',
      render: (v) => <span className="font-mono text-primary text-sm font-semibold">{v}</span>,
    },
    {
      key: 'date', label: t('sales_date'),
      render: (_, row) => (
        <span className="text-subtext text-sm">
          {row.closedAt?.toDate?.()?.toLocaleString() || '—'}
        </span>
      ),
    },
    {
      key: 'seller', label: t('sales_seller'),
      render: (_, row) => <span className="text-text-main text-sm">{row.sellerName || '—'}</span>,
    },
    {
      key: 'items', label: t('sales_items'), sortable: false,
      render: (_, row) => (
        <span className="text-subtext text-sm">{(row.items || []).length} items</span>
      ),
    },
    {
      key: 'total', label: t('sales_total'), accessor: 'totalAmount',
      render: (v) => <span className="text-primary font-semibold">{format(v || 0)}</span>,
    },
    {
      key: 'profit', label: t('sales_profit'),
      render: (_, row) => (
        <span className="text-success font-medium">
          {format((row.totalAmount || 0) - (row.totalCost || 0))}
        </span>
      ),
    },
    {
      key: 'payments', label: t('sales_payment_types'), sortable: false,
      render: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {Object.entries(row.payments || {}).map(([type, amt]) =>
            Number(amt) > 0 ? (
              <span key={type} className="text-xs bg-surface px-2 py-0.5 rounded-full text-subtext">
                {type}: {format(Number(amt))}
              </span>
            ) : null
          )}
        </div>
      ),
    },
    {
      key: 'status', label: t('sales_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <Layout title={t('sales_title')}>
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
          value={filters.sellerId}
          onChange={(e) => setFilters((f) => ({ ...f, sellerId: e.target.value }))}
          className="text-sm py-2 min-w-[160px]"
        >
          <option value="">{t('sales_filter_seller')}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.uid || e.id}>{e.name || e.email}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleExportExcel}
            disabled={exporting || sales.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-white/10
              text-subtext hover:text-text-main hover:border-white/20 text-sm transition-all disabled:opacity-50"
          >
            <Download size={15} />
            {t('sales_export_excel')}
          </button>
          <button
            onClick={() => router.push('/sales/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
              text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
          >
            <Plus size={16} />
            {t('sales_new')}
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={sales}
        loading={loading}
        onRowClick={(row) => router.push(`/sales/${row.id}`)}
      />

      {/* Totals row */}
      {sales.length > 0 && (
        <div className="mt-4 bg-card border border-white/10 rounded-xl p-4 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-subtext text-xs">{t('common_total')} ({sales.length} receipts)</p>
            <p className="text-primary font-bold text-lg">{format(totalRevenue)}</p>
          </div>
          <div>
            <p className="text-subtext text-xs">{t('common_profit')}</p>
            <p className="text-success font-bold text-lg">{format(totalProfit)}</p>
          </div>
          <div>
            <p className="text-subtext text-xs">Margin</p>
            <p className="text-text-main font-semibold">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
