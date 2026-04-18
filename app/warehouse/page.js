'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, History } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { getWarehouseData, addStock, getStockMovements } from '../../lib/db/warehouse';
import { getAllSuppliers } from '../../lib/db/suppliers';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';

export default function WarehousePage() {
  const { shopId, currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();

  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [movements, setMovements] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [stockForm, setStockForm] = useState({ rolls: '', supplierId: '', purchasePrice: '', notes: '' });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [data, sups] = await Promise.all([
        getWarehouseData(shopId),
        getAllSuppliers(shopId),
      ]);
      setItems(data);
      setSuppliers(sups);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  const displayItems = lowOnly
    ? items.filter((w) => w.stock <= (w.lowStockThreshold || 0))
    : items;

  const handleAddStock = async () => {
    if (!stockForm.rolls || Number(stockForm.rolls) <= 0) {
      toast.error('Enter valid rolls count');
      return;
    }
    setActionLoading(true);
    try {
      await addStock(shopId, stockModal.id, {
        rolls: Number(stockForm.rolls),
        supplierId: stockForm.supplierId || null,
        purchasePrice: Number(stockForm.purchasePrice) || 0,
        notes: stockForm.notes,
      }, currentUser.uid);
      toast.success(t('warehouse_add_success'));
      setStockModal(null);
      setStockForm({ rolls: '', supplierId: '', purchasePrice: '', notes: '' });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const openHistory = async (item) => {
    setHistoryModal(item);
    setMovements([]);
    const data = await getStockMovements(shopId, item.id);
    setMovements(data);
  };

  const columns = [
    {
      key: 'img', label: '', sortable: false, width: 'w-12',
      render: (_, row) => (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface flex-shrink-0">
          {row.images?.[0]
            ? <img src={row.images[0]} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-subtext text-xs">—</div>}
        </div>
      ),
    },
    {
      key: 'name', label: t('common_name'), accessor: 'nameEn',
      render: (_, row) => (
        <div>
          <p className="text-text-main font-medium">{row.nameEn || row.nameUz}</p>
          <p className="text-subtext text-xs">{row.nameUz || row.nameEn}</p>
        </div>
      ),
    },
    {
      key: 'stock', label: t('warehouse_current_stock'), accessor: 'stock',
      render: (v, row) => {
        const isLow = v <= (row.lowStockThreshold || 0);
        return (
          <div className="flex items-center gap-2">
            {isLow && <AlertTriangle size={14} className="text-error flex-shrink-0" />}
            <span className={`font-bold ${isLow ? 'text-error' : 'text-text-main'}`}>
              {v || 0} {t('common_rolls')}
            </span>
          </div>
        );
      },
    },
    {
      key: 'soldTotal', label: t('warehouse_sold'), accessor: 'soldTotal',
      render: (v) => <span className="text-subtext">{v || 0} {t('common_rolls')}</span>,
    },
    {
      key: 'threshold', label: t('warehouse_low_threshold'), accessor: 'lowStockThreshold',
      render: (v) => <span className="text-subtext text-sm">{v || 0}</span>,
    },
    {
      key: 'status', label: t('common_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.isActive !== false ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setStockModal(row); setStockForm({ rolls: '', supplierId: '', purchasePrice: '', notes: '' }); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg
              bg-green-500/10 text-success hover:bg-green-500/20 transition-all"
          >
            <Plus size={13} />
            {t('warehouse_add_stock')}
          </button>
          <button
            onClick={() => openHistory(row)}
            className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
            title={t('warehouse_movement_history')}
          >
            <History size={14} />
          </button>
        </div>
      ),
    },
  ];

  // Custom row class for low stock
  const rowClassName = (row) =>
    row.stock <= (row.lowStockThreshold || 0) ? 'border-l-2 border-error' : '';

  return (
    <Layout title={t('warehouse_title')}>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setLowOnly((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all
            ${lowOnly
              ? 'bg-error/10 border-error/30 text-error'
              : 'bg-surface border-white/10 text-subtext hover:text-text-main hover:border-white/20'
            }`}
        >
          <AlertTriangle size={15} />
          {t('warehouse_low_only')}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={displayItems}
        loading={loading}
        keyField="id"
      />

      {/* Add Stock Modal */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="text-text-main font-bold">{t('warehouse_add_stock')}</h2>
                <p className="text-subtext text-xs mt-0.5">{stockModal.nameEn || stockModal.nameUz}</p>
              </div>
              <button onClick={() => setStockModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('warehouse_rolls')} *</label>
                <input type="number" min="1" value={stockForm.rolls} onChange={(e) => setStockForm((f) => ({ ...f, rolls: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('warehouse_supplier')}</label>
                <select value={stockForm.supplierId} onChange={(e) => setStockForm((f) => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">No supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('warehouse_purchase_price')}</label>
                <input type="number" min="0" value={stockForm.purchasePrice} onChange={(e) => setStockForm((f) => ({ ...f, purchasePrice: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">Notes</label>
                <input type="text" value={stockForm.notes} onChange={(e) => setStockForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setStockModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handleAddStock} disabled={actionLoading} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movement History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{historyModal.nameEn} — {t('warehouse_movement_history')}</h2>
              <button onClick={() => setHistoryModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-white/5">
                    {[t('warehouse_movement_date'), t('warehouse_movement_type'), t('warehouse_movement_rolls'), t('warehouse_movement_reason'), t('warehouse_movement_by')].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {movements.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-subtext text-sm">{t('common_no_results')}</td></tr>
                  ) : (
                    movements.map((m) => (
                      <tr key={m.id} className="hover:bg-surface transition-colors">
                        <td className="px-4 py-3 text-subtext text-xs">{m.createdAt?.toDate?.()?.toLocaleString() || '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={m.type} size="xs" /></td>
                        <td className="px-4 py-3 text-text-main font-medium">{m.rolls}</td>
                        <td className="px-4 py-3 text-subtext text-xs">{m.reason || '—'}</td>
                        <td className="px-4 py-3 text-subtext text-xs">{m.recordedBy || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
