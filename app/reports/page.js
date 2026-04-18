'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { FileDown, FileSpreadsheet, TrendingUp, Package, Users, CreditCard } from 'lucide-react';
import Layout from '../../components/Layout';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { generateReport, exportToExcel, exportToPDF } from '../../lib/db/reports';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

const COLORS = ['#FFD369', '#C89B3C', '#22C55E', '#3B82F6', '#F97316', '#EF4444', '#A855F7'];

const CustomTooltip = ({ active, payload, label, format }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-white/10 rounded-xl px-4 py-3 shadow-card">
      <p className="text-subtext text-xs mb-1">{label}</p>
      <p className="text-primary font-bold text-sm">{format ? format(payload[0]?.value || 0) : payload[0]?.value}</p>
    </div>
  );
};

export default function ReportsPage() {
  const { shopId } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();

  const [branches, setBranches] = useState([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('product');

  useEffect(() => {
    if (!shopId) return;
    getDocs(query(collection(db, 'branches'), where('shopId', '==', shopId))).then((snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [shopId]);

  const handleGenerate = async () => {
    if (!dateFrom || !dateTo) { toast.error('Select date range'); return; }
    setGenerating(true);
    try {
      const data = await generateReport(shopId, dateFrom, dateTo, branchId || null);
      setReport(data);
    } catch (err) {
      toast.error('Failed to generate report');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportToExcel(report, `report_${dateFrom}_${dateTo}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportToPDF(report, `report_${dateFrom}_${dateTo}.pdf`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const TABS = [
    { id: 'product', label: t('reports_by_product'), icon: Package },
    { id: 'employee', label: t('reports_by_employee'), icon: Users },
    { id: 'payment', label: t('reports_by_payment'), icon: CreditCard },
  ];

  return (
    <Layout title={t('reports_title')}>
      {/* Controls */}
      <div className="bg-card border border-white/5 rounded-xl p-5 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-subtext mb-1.5">{t('reports_date_from')}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm py-2" />
          </div>
          <div>
            <label className="block text-xs text-subtext mb-1.5">{t('reports_date_to')}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm py-2" />
          </div>
          <div>
            <label className="block text-xs text-subtext mb-1.5">{t('reports_branch')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="text-sm py-2 min-w-[140px]">
              <option value="">{t('common_all')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.nameEn || b.nameUz}</option>)}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg
              transition-all hover:shadow-glow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? (
              <><div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" /> {t('reports_generating')}</>
            ) : (
              <><TrendingUp size={15} /> {t('reports_generate')}</>
            )}
          </button>
          {report && (
            <>
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-success hover:bg-green-500/20 text-sm transition-all disabled:opacity-50"
              >
                <FileSpreadsheet size={15} />
                {t('reports_export_excel')}
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-error hover:bg-red-500/20 text-sm transition-all disabled:opacity-50"
              >
                <FileDown size={15} />
                {t('reports_export_pdf')}
              </button>
            </>
          )}
        </div>
      </div>

      {report && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {[
              { label: t('reports_total_revenue'), value: format(report.summary.totalRevenue) },
              { label: t('reports_total_cost'), value: format(report.summary.totalCost) },
              { label: t('reports_total_profit'), value: format(report.summary.totalProfit) },
              { label: t('reports_profit_margin'), value: `${report.summary.profitMargin}%` },
              { label: t('reports_total_sqm'), value: `${report.summary.totalSqm.toFixed(1)} m²` },
              { label: t('reports_total_orders'), value: report.summary.totalOrders },
              { label: t('reports_total_refunds'), value: report.summary.totalRefunds },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-white/5 rounded-xl p-4">
                <p className="text-subtext text-xs mb-1">{label}</p>
                <p className="text-primary font-bold text-lg">{value}</p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Daily revenue */}
            <div className="bg-card border border-white/5 rounded-xl p-5">
              <h3 className="text-text-main font-semibold text-sm mb-4">{t('reports_daily_revenue')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={report.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2D35" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#B0B3B8', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(report.dailyData.length / 5)} />
                  <YAxis tick={{ fill: '#B0B3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                  <Tooltip content={<CustomTooltip format={format} />} />
                  <Line type="monotone" dataKey="revenue" stroke="#FFD369" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Payment types pie */}
            <div className="bg-card border border-white/5 rounded-xl p-5">
              <h3 className="text-text-main font-semibold text-sm mb-4">{t('reports_payment_types')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={report.paymentData} dataKey="amount" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {report.paymentData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => format(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top products bar */}
            <div className="bg-card border border-white/5 rounded-xl p-5">
              <h3 className="text-text-main font-semibold text-sm mb-4">{t('reports_top_products')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report.productData.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2D35" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#B0B3B8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#B0B3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(v) => format(v)} />
                  <Bar dataKey="revenue" fill="#FFD369" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Online vs Offline */}
            <div className="bg-card border border-white/5 rounded-xl p-5">
              <h3 className="text-text-main font-semibold text-sm mb-4">{t('reports_online_offline')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={report.onlineOffline} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    <Cell fill="#FFD369" />
                    <Cell fill="#3B82F6" />
                  </Pie>
                  <Tooltip formatter={(v) => format(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detail tables */}
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center gap-1 p-4 border-b border-white/5 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                    ${activeTab === id ? 'bg-primary text-dark' : 'text-subtext hover:text-text-main'}`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {activeTab === 'product' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[t('common_name'), t('reports_sqm'), t('reports_rolls'), t('reports_revenue'), t('reports_cost'), t('reports_profit'), t('reports_margin')].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.productData.map((p) => (
                      <tr key={p.id} className="hover:bg-surface transition-colors">
                        <td className="px-4 py-3 text-text-main">{p.name}</td>
                        <td className="px-4 py-3 text-subtext">{p.sqm.toFixed(1)}</td>
                        <td className="px-4 py-3 text-subtext">{p.rolls}</td>
                        <td className="px-4 py-3 text-primary font-semibold">{format(p.revenue)}</td>
                        <td className="px-4 py-3 text-subtext">{format(p.cost)}</td>
                        <td className="px-4 py-3 text-success">{format(p.profit)}</td>
                        <td className="px-4 py-3 text-subtext">{p.margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'employee' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[t('common_name'), t('reports_count'), t('reports_revenue'), t('reports_profit')].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.employeeData.map((e) => (
                      <tr key={e.id} className="hover:bg-surface transition-colors">
                        <td className="px-4 py-3 text-text-main">{e.name}</td>
                        <td className="px-4 py-3 text-subtext">{e.count}</td>
                        <td className="px-4 py-3 text-primary font-semibold">{format(e.revenue)}</td>
                        <td className="px-4 py-3 text-success">{format(e.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'payment' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Payment Type', t('common_amount'), t('reports_count'), '%'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.paymentData.map((p, i) => {
                      const total = report.paymentData.reduce((s, r) => s + r.amount, 0);
                      return (
                        <tr key={i} className="hover:bg-surface transition-colors">
                          <td className="px-4 py-3 text-text-main capitalize">{p.type}</td>
                          <td className="px-4 py-3 text-primary font-semibold">{format(p.amount)}</td>
                          <td className="px-4 py-3 text-subtext">{p.count}</td>
                          <td className="px-4 py-3 text-subtext">{total > 0 ? ((p.amount / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {!report && !generating && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <TrendingUp size={48} className="text-subtext/30 mb-4" />
          <p className="text-subtext">{t('reports_generate')} to see analytics</p>
        </div>
      )}
    </Layout>
  );
}
