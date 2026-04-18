'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { Plus, Eye, EyeOff, Copy, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import ConfirmModal from '../../components/ConfirmModal';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'SHOP-';
  for (let i = 0; i < 5; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export default function ShopsPage() {
  const { t } = useLanguage();
  const { format } = useCurrency();
  const { currentUser, isAdmin } = useAuth();

  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [regenModal, setRegenModal] = useState(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [revealedTokens, setRevealedTokens] = useState({});
  const [form, setForm] = useState({
    nameUz: '', nameEn: '', sellerEmail: '', token: generateToken(),
  });
  const [saving, setSaving] = useState(false);

  const fetchShops = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'shops'));
      setShops(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load shops');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShops(); }, []);

  const handleCreate = async () => {
    if (!form.nameUz || !form.nameEn) {
      toast.error('Name is required in both languages');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'shops'), {
        nameUz: form.nameUz,
        nameEn: form.nameEn,
        sellerEmail: form.sellerEmail,
        token: form.token,
        isActive: true,
        totalSales: 0,
        exchangeRate: 12500,
        createdBy: currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(t('shops_create_success'));
      setShowModal(false);
      setForm({ nameUz: '', nameEn: '', sellerEmail: '', token: generateToken() });
      fetchShops();
    } catch (e) {
      toast.error('Failed to create shop');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (shop) => {
    try {
      await updateDoc(doc(db, 'shops', shop.id), {
        isActive: !shop.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(t('shops_update_success'));
      fetchShops();
    } catch (e) {
      toast.error('Failed to update shop');
    }
  };

  const handleRegenToken = async () => {
    if (!regenModal) return;
    setRegenLoading(true);
    try {
      const newToken = generateToken();
      await updateDoc(doc(db, 'shops', regenModal.id), {
        token: newToken,
        updatedAt: serverTimestamp(),
      });
      toast.success('Token regenerated');
      setRegenModal(null);
      fetchShops();
    } catch (e) {
      toast.error('Failed to regenerate token');
    } finally {
      setRegenLoading(false);
    }
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
    toast.success(t('shops_token_copied'));
  };

  const columns = [
    {
      key: 'name', label: t('shops_name'), accessor: 'nameEn',
      render: (_, row) => (
        <div>
          <p className="text-text-main font-medium">{row.nameEn}</p>
          <p className="text-subtext text-xs">{row.nameUz}</p>
        </div>
      ),
    },
    {
      key: 'token', label: t('shops_token'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm ${revealedTokens[row.id] ? 'text-primary' : 'text-subtext blur-sm select-none'}`}>
            {row.token}
          </span>
          <button
            onClick={() => setRevealedTokens((p) => ({ ...p, [row.id]: !p[row.id] }))}
            className="text-subtext hover:text-text-main p-1 rounded transition-colors"
          >
            {revealedTokens[row.id] ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {revealedTokens[row.id] && (
            <button
              onClick={() => copyToken(row.token)}
              className="text-subtext hover:text-primary p-1 rounded transition-colors"
            >
              <Copy size={14} />
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'sellerEmail', label: t('shops_seller_email'), accessor: 'sellerEmail',
      render: (v) => <span className="text-subtext text-sm">{v || '—'}</span>,
    },
    {
      key: 'status', label: t('shops_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleActive(row)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${row.isActive
                ? 'bg-red-500/10 text-error hover:bg-red-500/20'
                : 'bg-green-500/10 text-success hover:bg-green-500/20'
              }`}
          >
            {row.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {row.isActive ? t('shops_deactivate') : t('shops_activate')}
          </button>
          <button
            onClick={() => setRegenModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-orange-500/10 text-warning hover:bg-orange-500/20 transition-all"
          >
            <RefreshCw size={14} />
            {t('shops_regenerate_token')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('shops_title')}>
      <DataTable
        columns={columns}
        data={shops}
        loading={loading}
        actions={
          <button
            onClick={() => { setForm({ nameUz: '', nameEn: '', sellerEmail: '', token: generateToken() }); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
              text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
          >
            <Plus size={16} />
            {t('shops_add')}
          </button>
        }
      />

      {/* Create Shop Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold text-lg">{t('shops_add')}</h2>
              <button onClick={() => setShowModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_uz')}</label>
                <input type="text" value={form.nameUz} onChange={(e) => setForm((f) => ({ ...f, nameUz: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_en')}</label>
                <input type="text" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_seller_email')}</label>
                <input type="email" value={form.sellerEmail} onChange={(e) => setForm((f) => ({ ...f, sellerEmail: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_generated_token')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.token}
                    readOnly
                    className="font-mono tracking-widest text-primary bg-surface border border-primary/20"
                  />
                  <button
                    onClick={() => setForm((f) => ({ ...f, token: generateToken() }))}
                    className="p-2.5 rounded-lg bg-surface border border-white/10 text-subtext hover:text-primary transition-colors flex-shrink-0"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={() => copyToken(form.token)}
                    className="p-2.5 rounded-lg bg-surface border border-white/10 text-subtext hover:text-primary transition-colors flex-shrink-0"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-subtext hover:text-text-main border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {saving ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Token Confirmation */}
      <ConfirmModal
        isOpen={!!regenModal}
        onClose={() => setRegenModal(null)}
        onConfirm={handleRegenToken}
        title={t('shops_regenerate_token')}
        message={t('shops_regenerate_warning')}
        danger
        loading={regenLoading}
        confirmText={t('shops_regenerate_token')}
      />
    </Layout>
  );
}
