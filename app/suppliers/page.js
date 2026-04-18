'use client';

import { useState, useEffect } from 'react';
import { Plus, CreditCard, History, Package } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  getAllSuppliers, addSupplier, recordPayment,
  getSupplierTransactions, getSupplierProducts,
} from '../../lib/db/suppliers';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';

export default function SuppliersPage() {
  const { shopId, currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [detailTxns, setDetailTxns] = useState([]);
  const [detailProducts, setDetailProducts] = useState([]);
  const [payAmount, setPayAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await getAllSuppliers(shopId);
      setSuppliers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setActionLoading(true);
    try {
      await addSupplier(shopId, form, currentUser.uid);
      toast.success(t('suppliers_add_success'));
      setAddModal(false);
      setForm({ name: '', phone: '', address: '' });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter valid amount'); return; }
    setActionLoading(true);
    try {
      await recordPayment(payModal.id, shopId, amount, currentUser.uid);
      toast.success(t('suppliers_payment_success'));
      setPayModal(null);
      setPayAmount('');
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = async (supplier) => {
    setDetailModal(supplier);
    setDetailTxns([]);
    setDetailProducts([]);
    const [txns, products] = await Promise.all([
      getSupplierTransactions(supplier.id),
      getSupplierProducts(shopId, supplier.id),
    ]);
    setDetailTxns(txns);
    setDetailProducts(products);
  };

  const columns = [
    {
      key: 'name', label: t('suppliers_name'), accessor: 'name',
      render: (v, row) => (
        <div>
          <p className="text-text-main font-medium">{v}</p>
          <p className="text-subtext text-xs">{row.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'totalPurchased', label: t('suppliers_total_purchased'), accessor: 'totalPurchased',
      render: (v) => <span className="text-text-main">{format(v || 0)}</span>,
    },
    {
      key: 'totalPaid', label: t('suppliers_total_paid'), accessor: 'totalPaid',
      render: (v) => <span className="text-success">{format(v || 0)}</span>,
    },
    {
      key: 'debt', label: t('suppliers_debt'), accessor: 'debt',
      render: (v) => (
        <span className={`font-bold ${(v || 0) > 0 ? 'text-error' : 'text-success'}`}>
          {format(v || 0)}
        </span>
      ),
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openDetail(row)}
            className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
            title={t('common_view')}
          >
            <History size={14} />
          </button>
          <button
            onClick={() => { setPayModal(row); setPayAmount(''); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg
              bg-green-500/10 text-success hover:bg-green-500/20 transition-all"
          >
            <CreditCard size={13} />
            {t('suppliers_record_payment')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('suppliers_title')}>
      <DataTable
        columns={columns}
        data={suppliers}
        loading={loading}
        actions={
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
              text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
          >
            <Plus size={16} />
            {t('suppliers_add')}
          </button>
        }
      />

      {/* Add Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('suppliers_add')}</h2>
              <button onClick={() => setAddModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: t('suppliers_name'), key: 'name', type: 'text' },
                { label: t('suppliers_phone'), key: 'phone', type: 'tel' },
                { label: t('suppliers_address'), key: 'address', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
                  <input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setAddModal(false)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handleAdd} disabled={actionLoading} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('suppliers_record_payment')} — {payModal.name}</h2>
              <button onClick={() => setPayModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-surface rounded-xl p-4">
                <p className="text-subtext text-xs">{t('suppliers_debt')}</p>
                <p className="text-error font-bold text-2xl">{format(payModal.debt || 0)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('suppliers_payment_amount')}</label>
                <input type="number" min="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setPayModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handlePay} disabled={actionLoading || !payAmount} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{detailModal.name}</h2>
              <button onClick={() => setDetailModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: t('suppliers_total_purchased'), value: format(detailModal.totalPurchased || 0), cls: 'text-text-main' },
                  { label: t('suppliers_total_paid'), value: format(detailModal.totalPaid || 0), cls: 'text-success' },
                  { label: t('suppliers_debt'), value: format(detailModal.debt || 0), cls: (detailModal.debt || 0) > 0 ? 'text-error' : 'text-success' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-surface rounded-xl p-3 text-center">
                    <p className="text-subtext text-xs mb-1">{label}</p>
                    <p className={`font-bold text-sm ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-text-main font-semibold text-sm mb-3">{t('suppliers_transaction_history')}</h3>
                <div className="divide-y divide-white/5">
                  {detailTxns.length === 0
                    ? <p className="text-subtext text-xs py-4 text-center">{t('common_no_results')}</p>
                    : detailTxns.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <StatusBadge status={tx.type} size="xs" />
                          <p className="text-subtext text-xs mt-0.5">{tx.createdAt?.toDate?.()?.toLocaleString() || '—'}</p>
                        </div>
                        <span className="text-primary font-semibold text-sm">{format(tx.amount || 0)}</span>
                      </div>
                    ))
                  }
                </div>
              </div>

              <div>
                <h3 className="text-text-main font-semibold text-sm mb-3">{t('suppliers_products')}</h3>
                <div className="divide-y divide-white/5">
                  {detailProducts.length === 0
                    ? <p className="text-subtext text-xs py-4 text-center">{t('common_no_results')}</p>
                    : detailProducts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 py-2.5">
                        {p.images?.[0] && <img src={p.images[0]} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />}
                        <p className="text-text-main text-sm flex-1">{p.nameEn || p.nameUz}</p>
                        <span className="text-subtext text-xs">{p.stock || 0} rolls</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
