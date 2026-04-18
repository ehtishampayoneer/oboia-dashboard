'use client';

import { useState, useEffect } from 'react';
import { Plus, Coins, History } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { getAllCraftsmen, addCraftsman, payBonus, getBonusHistory } from '../../lib/db/craftsmen';
import toast from 'react-hot-toast';

export default function CraftsmenPage() {
  const { shopId, currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();

  const [craftsmen, setCraftsmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [payAmount, setPayAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await getAllCraftsmen(shopId);
      setCraftsmen(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setActionLoading(true);
    try {
      await addCraftsman(shopId, form, currentUser.uid);
      toast.success(t('craftsmen_add_success'));
      setAddModal(false);
      setForm({ name: '', phone: '' });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (amount > (payModal?.pendingBalance || 0)) {
      toast.error('Amount exceeds pending balance');
      return;
    }
    setActionLoading(true);
    try {
      await payBonus(payModal.id, shopId, amount, currentUser.uid);
      toast.success(t('craftsmen_pay_success'));
      setPayModal(null);
      setPayAmount('');
      fetchData();
    } catch (err) {
      toast.error(err.message === 'AMOUNT_EXCEEDS_BALANCE' ? 'Amount exceeds pending balance' : t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const openHistory = async (craftsman) => {
    setHistoryModal(craftsman);
    setHistory([]);
    const data = await getBonusHistory(craftsman.id);
    setHistory(data);
  };

  const columns = [
    {
      key: 'name', label: t('craftsmen_name'), accessor: 'name',
      render: (v, row) => (
        <div>
          <p className="text-text-main font-medium">{v}</p>
          <p className="text-subtext text-xs">{row.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'totalEarned', label: t('craftsmen_total_earned'), accessor: 'totalEarned',
      render: (v) => <span className="text-text-main">{format(v || 0)}</span>,
    },
    {
      key: 'totalPaid', label: t('craftsmen_total_paid'), accessor: 'totalPaid',
      render: (v) => <span className="text-text-main">{format(v || 0)}</span>,
    },
    {
      key: 'pendingBalance', label: t('craftsmen_pending_balance'), accessor: 'pendingBalance',
      render: (v) => (
        <span className={`font-bold ${(v || 0) > 0 ? 'text-primary' : 'text-subtext'}`}>
          {format(v || 0)}
        </span>
      ),
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setPayModal(row); setPayAmount(''); }}
            disabled={(row.pendingBalance || 0) <= 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
              bg-primary/10 text-primary hover:bg-primary/20 transition-all
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Coins size={13} />
            {t('craftsmen_pay_bonus')}
          </button>
          <button
            onClick={() => openHistory(row)}
            className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
            title={t('craftsmen_transaction_history')}
          >
            <History size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('craftsmen_title')}>
      <DataTable
        columns={columns}
        data={craftsmen}
        loading={loading}
        actions={
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
              text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
          >
            <Plus size={16} />
            {t('craftsmen_add')}
          </button>
        }
      />

      {/* Add Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('craftsmen_add')}</h2>
              <button onClick={() => setAddModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('craftsmen_name')}</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('craftsmen_phone')}</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
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

      {/* Pay Bonus Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('craftsmen_pay_bonus')} — {payModal.name}</h2>
              <button onClick={() => setPayModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-surface rounded-xl p-4 text-center">
                <p className="text-subtext text-xs mb-1">{t('craftsmen_pending_balance')}</p>
                <p className="text-primary font-black text-3xl">{format(payModal.pendingBalance || 0)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">
                  {t('craftsmen_pay_amount')} (max {format(payModal.pendingBalance || 0)})
                </label>
                <input
                  type="number" min="1" max={payModal.pendingBalance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setPayModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handlePay} disabled={actionLoading || !payAmount} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('craftsmen_pay_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{historyModal.name} — {t('craftsmen_transaction_history')}</h2>
              <button onClick={() => setHistoryModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-white/5">
              {history.length === 0 ? (
                <p className="text-subtext text-sm text-center py-12">{t('common_no_results')}</p>
              ) : (
                history.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <StatusBadge status={tx.type} size="xs" />
                      <p className="text-subtext text-xs mt-1">
                        {tx.createdAt?.toDate?.()?.toLocaleString() || '—'}
                      </p>
                      {tx.receiptNumber && (
                        <p className="text-subtext text-xs font-mono">{tx.receiptNumber}</p>
                      )}
                    </div>
                    <span className={`font-bold ${tx.type === 'earned' ? 'text-primary' : tx.type === 'paid' ? 'text-success' : 'text-error'}`}>
                      {tx.type === 'deducted' ? '-' : ''}{format(tx.amount || 0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
