'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, X, Edit, Trash2, Search } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  getAllWallpapers, approveWallpaper, rejectWallpaper, deleteWallpaper,
} from '../../lib/db/wallpapers';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import Image from 'next/image';

export default function WallpapersPage() {
  const { shopId, currentUser, isAdmin } = useAuth();
  const { t, currentLang } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [wallpapers, setWallpapers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ categoryId: '', status: '', search: '' });
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [wp, cats] = await Promise.all([
        getAllWallpapers(shopId, filters),
        getDocs(query(collection(db, 'categories'), where('shopId', '==', shopId))),
      ]);
      setWallpapers(wp);
      setCategories(cats.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId, filters]);

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      await approveWallpaper(id, currentUser.uid);
      toast.success(t('wallpapers_approve_success'));
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Reason is required'); return; }
    setActionLoading(true);
    try {
      await rejectWallpaper(rejectModal.id, rejectReason, currentUser.uid);
      toast.success(t('wallpapers_reject_success'));
      setRejectModal(null);
      setRejectReason('');
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await deleteWallpaper(deleteModal.id);
      toast.success(t('wallpapers_delete_success'));
      setDeleteModal(null);
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const getCatName = (id) => {
    const cat = categories.find((c) => c.id === id);
    return cat ? (currentLang === 'uz' ? cat.nameUz : cat.nameEn) : '—';
  };

  const columns = [
    {
      key: 'img', label: '', sortable: false, width: 'w-12',
      render: (_, row) => (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface flex-shrink-0">
          {row.images?.[0] ? (
            <img src={row.images[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-subtext text-xs">—</div>
          )}
        </div>
      ),
    },
    {
      key: 'name', label: t('wallpapers_name'), accessor: 'nameEn',
      render: (_, row) => (
        <div>
          <p className="text-text-main font-medium">{currentLang === 'uz' ? row.nameUz : row.nameEn}</p>
          <p className="text-subtext text-xs">{getCatName(row.categoryId)}</p>
        </div>
      ),
    },
    {
      key: 'sellPrice', label: t('wallpapers_sell_price'), accessor: 'sellPrice',
      render: (v) => <span className="text-primary font-semibold">{format(v || 0)}</span>,
    },
    {
      key: 'costPrice', label: t('wallpapers_cost_price'), accessor: 'costPrice',
      render: (v) => <span className="text-subtext">{format(v || 0)}</span>,
    },
    {
      key: 'stock', label: t('wallpapers_stock'), accessor: 'stock',
      render: (v, row) => (
        <span className={v <= (row.lowStockThreshold || 0) ? 'text-error font-bold' : 'text-text-main'}>
          {v || 0} {t('common_rolls')}
        </span>
      ),
    },
    {
      key: 'approval', label: t('wallpapers_approval'), sortable: false,
      render: (_, row) => <StatusBadge status={row.approvalStatus || 'pending'} />,
    },
    {
      key: 'status', label: t('wallpapers_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.status || 'active'} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          {isAdmin && row.approvalStatus === 'pending' && (
            <>
              <button
                onClick={() => handleApprove(row.id)}
                className="p-1.5 rounded-lg bg-green-500/10 text-success hover:bg-green-500/20 transition-all"
                title={t('wallpapers_approve')}
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setRejectModal(row)}
                className="p-1.5 rounded-lg bg-red-500/10 text-error hover:bg-red-500/20 transition-all"
                title={t('wallpapers_reject')}
              >
                <X size={14} />
              </button>
            </>
          )}
          <button
            onClick={() => router.push(`/wallpapers/${row.id}/edit`)}
            className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
            title={t('common_edit')}
          >
            <Edit size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setDeleteModal(row)}
              className="p-1.5 rounded-lg bg-red-500/10 text-error hover:bg-red-500/20 transition-all"
              title={t('common_delete')}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('wallpapers_title')}>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder={t('wallpapers_search')}
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="pl-4 text-sm py-2"
          />
        </div>
        <select
          value={filters.categoryId}
          onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
          className="text-sm py-2 min-w-[160px]"
        >
          <option value="">{t('wallpapers_filter_category')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {currentLang === 'uz' ? c.nameUz : c.nameEn}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="text-sm py-2 min-w-[160px]"
        >
          <option value="">{t('wallpapers_filter_status')}</option>
          <option value="approved">{t('common_approved')}</option>
          <option value="pending">{t('common_pending')}</option>
          <option value="rejected">{t('common_rejected')}</option>
        </select>
        <button
          onClick={() => router.push('/wallpapers/add')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
            text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
        >
          <Plus size={16} />
          {t('wallpapers_add')}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={wallpapers}
        loading={loading}
        searchable={false}
        keyField="id"
      />

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold text-lg">{t('wallpapers_reject')}</h2>
              <button onClick={() => setRejectModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6">
              <p className="text-subtext text-sm mb-3">
                {currentLang === 'uz' ? rejectModal.nameUz : rejectModal.nameEn}
              </p>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_reject_reason')}</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('wallpapers_reject_reason_placeholder')}
                className="resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="px-5 py-2 bg-error hover:bg-red-600 text-white font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {actionLoading ? t('common_loading') : t('wallpapers_reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        title={t('common_delete_title')}
        message={t('common_delete_confirm')}
        danger
        loading={actionLoading}
      />
    </Layout>
  );
}
