'use client';

import { useState, useEffect } from 'react';
import { Plus, ToggleLeft, ToggleRight, MapPin } from 'lucide-react';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

export default function BranchesPage() {
  const { shopId, currentUser, branchId: activeBranchId, setBranchId } = useAuth();
  const { t, currentLang } = useLanguage();
  const { format } = useCurrency();

  const [branches, setBranches] = useState([]);
  const [salesMap, setSalesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({ nameUz: '', nameEn: '', address: '', phone: '' });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [branchSnap, salesSnap] = await Promise.all([
        getDocs(query(collection(db, 'branches'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'sales'), where('shopId', '==', shopId), where('status', '==', 'closed'))),
      ]);
      const branchData = branchSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBranches(branchData);

      const map = {};
      salesSnap.docs.forEach((d) => {
        const s = d.data();
        if (s.branchId) {
          if (!map[s.branchId]) map[s.branchId] = { count: 0, revenue: 0 };
          map[s.branchId].count++;
          map[s.branchId].revenue += s.totalAmount || 0;
        }
      });
      setSalesMap(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  const handleAdd = async () => {
    if (!form.nameUz || !form.nameEn) { toast.error('Name required in both languages'); return; }
    setActionLoading(true);
    try {
      await addDoc(collection(db, 'branches'), {
        ...form,
        shopId,
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(t('branches_add_success'));
      setAddModal(false);
      setForm({ nameUz: '', nameEn: '', address: '', phone: '' });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'branches', editModal.id), {
        nameUz: editModal.nameUz,
        nameEn: editModal.nameEn,
        address: editModal.address,
        phone: editModal.phone,
        updatedAt: serverTimestamp(),
      });
      toast.success(t('branches_update_success'));
      setEditModal(null);
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle = async (branch) => {
    try {
      await updateDoc(doc(db, 'branches', branch.id), {
        isActive: !branch.isActive,
        updatedAt: serverTimestamp(),
      });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    }
  };

  return (
    <Layout title={t('branches_title')}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-subtext text-sm">
          {activeBranchId
            ? `Active: ${branches.find((b) => b.id === activeBranchId)?.nameEn || activeBranchId}`
            : 'No active branch selected (showing all data)'}
        </p>
        <button
          onClick={() => { setForm({ nameUz: '', nameEn: '', address: '', phone: '' }); setAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
            text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
        >
          <Plus size={16} />
          {t('branches_add')}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card border border-white/5 rounded-xl p-5 h-44 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => {
            const stats = salesMap[branch.id] || { count: 0, revenue: 0 };
            const isActive = branch.id === activeBranchId;
            return (
              <div
                key={branch.id}
                className={`bg-card border rounded-xl p-5 transition-all
                  ${isActive ? 'border-primary shadow-glow-sm' : 'border-white/5 hover:border-white/10'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-text-main font-semibold">
                      {currentLang === 'uz' ? branch.nameUz : branch.nameEn}
                    </p>
                    {isActive && (
                      <span className="text-[10px] font-semibold text-primary bg-primary/15 px-2 py-0.5 rounded-full mt-1 inline-block">
                        {t('branches_active_label')}
                      </span>
                    )}
                  </div>
                  <StatusBadge status={branch.isActive ? 'active' : 'inactive'} size="xs" />
                </div>
                {branch.address && (
                  <div className="flex items-center gap-1.5 text-subtext text-xs mb-1">
                    <MapPin size={12} />
                    {branch.address}
                  </div>
                )}
                {branch.phone && (
                  <p className="text-subtext text-xs mb-3">{branch.phone}</p>
                )}
                <div className="grid grid-cols-2 gap-2 mb-4 mt-3">
                  <div className="bg-surface rounded-lg p-2 text-center">
                    <p className="text-subtext text-[10px]">{t('branches_sales_count')}</p>
                    <p className="text-text-main font-bold text-sm">{stats.count}</p>
                  </div>
                  <div className="bg-surface rounded-lg p-2 text-center">
                    <p className="text-subtext text-[10px]">{t('branches_revenue')}</p>
                    <p className="text-primary font-bold text-sm">{format(stats.revenue)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBranchId(isActive ? null : branch.id)}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all
                      ${isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-surface text-subtext hover:text-text-main hover:bg-white/10'
                      }`}
                  >
                    {isActive ? '✓ Active' : t('branches_set_active')}
                  </button>
                  <button
                    onClick={() => setEditModal({ ...branch })}
                    className="px-3 py-1.5 text-xs rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
                  >
                    {t('common_edit')}
                  </button>
                  <button
                    onClick={() => handleToggle(branch)}
                    className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
                  >
                    {branch.isActive ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('branches_add')}</h2>
              <button onClick={() => setAddModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: t('branches_name_uz'), key: 'nameUz' },
                { label: t('branches_name_en'), key: 'nameEn' },
                { label: t('branches_address'), key: 'address' },
                { label: t('branches_phone'), key: 'phone' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
                  <input type="text" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
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

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('common_edit')}</h2>
              <button onClick={() => setEditModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: t('branches_name_uz'), key: 'nameUz' },
                { label: t('branches_name_en'), key: 'nameEn' },
                { label: t('branches_address'), key: 'address' },
                { label: t('branches_phone'), key: 'phone' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
                  <input type="text" value={editModal[key] || ''} onChange={(e) => setEditModal((m) => ({ ...m, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handleEdit} disabled={actionLoading} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
