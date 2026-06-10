'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where, Timestamp,
} from 'firebase/firestore';
import {
  Plus, Eye, EyeOff, Copy, RefreshCw, ToggleLeft, ToggleRight,
  Calendar, AlertCircle, Clock,
} from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import ConfirmModal from '../../components/ConfirmModal';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────
// Subscription constants — change here if pricing/grace policy changes.
// ─────────────────────────────────────────────────────────────────────────
const SUB_DEFAULTS = {
  plan: 'monthly',
  amountUsd: 25,
  durationDays: 30,
  graceDays: 5,
};

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'SHOP-';
  for (let i = 0; i < 5; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// Compute subscription status from a shop document.
// Returns: 'active' | 'expiring' | 'grace' | 'expired' | 'none'
function getSubscriptionStatus(shop) {
  if (!shop?.subscription?.expiresAt) return 'none';
  const expiresAt = shop.subscription.expiresAt?.toDate?.()
    ?? new Date(shop.subscription.expiresAt);
  const graceDays = shop.subscription.graceDays ?? SUB_DEFAULTS.graceDays;
  const now = new Date();
  const daysUntil = (expiresAt - now) / (24 * 60 * 60 * 1000);
  if (daysUntil > 7) return 'active';
  if (daysUntil > 0) return 'expiring';
  if (daysUntil > -graceDays) return 'grace';
  return 'expired';
}

function getDaysRemaining(shop) {
  if (!shop?.subscription?.expiresAt) return null;
  const expiresAt = shop.subscription.expiresAt?.toDate?.()
    ?? new Date(shop.subscription.expiresAt);
  return Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
}

// Inline badge component for subscription status
function SubscriptionBadge({ shop }) {
  const status = getSubscriptionStatus(shop);
  const days = getDaysRemaining(shop);

  const config = {
    active:   { color: 'bg-green-500/15 text-success border-green-500/30',  label: 'Active' },
    expiring: { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Expiring' },
    grace:    { color: 'bg-orange-500/15 text-warning border-orange-500/30', label: 'Grace' },
    expired:  { color: 'bg-red-500/15 text-error border-red-500/30',        label: 'Expired' },
    none:     { color: 'bg-gray-500/15 text-subtext border-gray-500/30',    label: 'No sub' },
  };
  const c = config[status] || config.none;
  const daysLabel = days === null ? '' :
    days > 0 ? `${days}d left` :
    days === 0 ? 'today' :
    `${Math.abs(days)}d over`;

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded-md border text-xs font-medium ${c.color}`}>
        {c.label}
      </span>
      {daysLabel && <span className="text-subtext text-xs">{daysLabel}</span>}
    </div>
  );
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
  const [extendModal, setExtendModal] = useState(null);
  const [extendForm, setExtendForm] = useState({ months: 1, amount: SUB_DEFAULTS.amountUsd, notes: '' });
  const [extending, setExtending] = useState(false);
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

  const checkUserExists = async (email) => {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  // ──────────────────────────────────────────────────────────────────────
  // Create shop — auto-starts first 30-day subscription period
  // ──────────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.nameUz || !form.nameEn) {
      toast.error('Name is required in both languages');
      return;
    }
    if (!form.sellerEmail) {
      toast.error('Seller email is required');
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SUB_DEFAULTS.durationDays * 86400000);

      const shopData = {
        nameUz: form.nameUz,
        nameEn: form.nameEn,
        sellerEmail: form.sellerEmail,
        token: form.token,
        isActive: true,
        totalSales: 0,
        exchangeRate: 12500,

        // Subscription auto-started for first month
        subscription: {
          active: true,
          plan: SUB_DEFAULTS.plan,
          amountUsd: SUB_DEFAULTS.amountUsd,
          graceDays: SUB_DEFAULTS.graceDays,
          startedAt: Timestamp.fromDate(now),
          expiresAt: Timestamp.fromDate(expiresAt),
          lastPaidAt: Timestamp.fromDate(now),
        },

        createdBy: currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const shopRef = await addDoc(collection(db, 'shops'), shopData);
      const shopId = shopRef.id;

      // Record first subscription period in audit history
      await addDoc(collection(db, 'shops', shopId, 'subscriptionHistory'), {
        paidAt: Timestamp.fromDate(now),
        amountUsd: SUB_DEFAULTS.amountUsd,
        periodStart: Timestamp.fromDate(now),
        periodEnd: Timestamp.fromDate(expiresAt),
        months: 1,
        recordedBy: currentUser?.uid,
        notes: 'Initial subscription on shop creation',
        createdAt: serverTimestamp(),
      });

      const userExists = await checkUserExists(form.sellerEmail);
      if (!userExists) {
        await addDoc(collection(db, 'users'), {
          email: form.sellerEmail,
          role: 'shopkeeper',
          shopId,
          displayName: form.nameEn,
          createdBy: currentUser?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Shop created. Subscription active until ${expiresAt.toLocaleDateString()}. Shopkeeper user added.`);
      } else {
        toast.success(`Shop created. Subscription active until ${expiresAt.toLocaleDateString()}.`);
      }

      setShowModal(false);
      setForm({ nameUz: '', nameEn: '', sellerEmail: '', token: generateToken() });
      fetchShops();
    } catch (e) {
      console.error(e);
      toast.error('Failed to create shop: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Extend subscription — adds N months. If still active, extends from
  // current expiry. If lapsed, starts fresh from today.
  // ──────────────────────────────────────────────────────────────────────
  const handleExtend = async () => {
    if (!extendModal) return;
    if (!extendForm.months || extendForm.months < 1) {
      toast.error('Months must be at least 1');
      return;
    }
    setExtending(true);
    try {
      const now = new Date();
      const currentExpiry = extendModal.subscription?.expiresAt?.toDate?.() ?? now;
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const months = Number(extendForm.months);
      const periodEnd = new Date(baseDate.getTime() + months * SUB_DEFAULTS.durationDays * 86400000);

      await updateDoc(doc(db, 'shops', extendModal.id), {
        'subscription.active': true,
        'subscription.expiresAt': Timestamp.fromDate(periodEnd),
        'subscription.lastPaidAt': Timestamp.fromDate(now),
        updatedBy: currentUser?.uid,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'shops', extendModal.id, 'subscriptionHistory'), {
        paidAt: Timestamp.fromDate(now),
        amountUsd: Number(extendForm.amount),
        periodStart: Timestamp.fromDate(baseDate),
        periodEnd: Timestamp.fromDate(periodEnd),
        months,
        recordedBy: currentUser?.uid,
        notes: extendForm.notes || `Extended ${months} month(s)`,
        createdAt: serverTimestamp(),
      });

      toast.success(`Subscription extended. New expiry: ${periodEnd.toLocaleDateString()}`);
      setExtendModal(null);
      setExtendForm({ months: 1, amount: SUB_DEFAULTS.amountUsd, notes: '' });
      fetchShops();
    } catch (e) {
      console.error(e);
      toast.error('Failed to extend: ' + e.message);
    } finally {
      setExtending(false);
    }
  };

  const openExtendModal = (shop) => {
    setExtendForm({
      months: 1,
      amount: shop.subscription?.amountUsd || SUB_DEFAULTS.amountUsd,
      notes: '',
    });
    setExtendModal(shop);
  };

  const handleToggleActive = async (shop) => {
    try {
      await updateDoc(doc(db, 'shops', shop.id), {
        isActive: !shop.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(t('shops_update_success') || 'Shop updated');
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
    toast.success(t('shops_token_copied') || 'Token copied');
  };

  const columns = [
    {
      key: 'name', label: t('shops_name') || 'Name', accessor: 'nameEn',
      render: (_, row) => (
        <div>
          <p className="text-text-main font-medium">{row.nameEn}</p>
          <p className="text-subtext text-xs">{row.nameUz}</p>
        </div>
      ),
    },
    {
      key: 'token', label: t('shops_token') || 'Token', sortable: false,
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
      key: 'sellerEmail', label: t('shops_seller_email') || 'Seller email', accessor: 'sellerEmail',
      render: (v) => <span className="text-subtext text-sm">{v || '—'}</span>,
    },
    {
      key: 'subscription', label: 'Subscription', sortable: false,
      render: (_, row) => <SubscriptionBadge shop={row} />,
    },
    {
      key: 'status', label: t('shops_status') || 'Status', sortable: false,
      render: (_, row) => <StatusBadge status={row.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions', label: t('common_actions') || 'Actions', sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openExtendModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-primary/15 text-primary hover:bg-primary/25 transition-all"
            title="Extend subscription"
          >
            <Calendar size={14} />
            Extend
          </button>
          <button
            onClick={() => handleToggleActive(row)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${row.isActive
                ? 'bg-red-500/10 text-error hover:bg-red-500/20'
                : 'bg-green-500/10 text-success hover:bg-green-500/20'
              }`}
          >
            {row.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {row.isActive ? (t('shops_deactivate') || 'Deactivate') : (t('shops_activate') || 'Activate')}
          </button>
          <button
            onClick={() => setRegenModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-orange-500/10 text-warning hover:bg-orange-500/20 transition-all"
          >
            <RefreshCw size={14} />
            {t('shops_regenerate_token') || 'Regen'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('shops_title') || 'Shops'}>
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
            {t('shops_add') || 'Add shop'}
          </button>
        }
      />

      {/* Create Shop Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold text-lg">{t('shops_add') || 'Add shop'}</h2>
              <button onClick={() => setShowModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_uz') || 'Name (UZ)'}</label>
                <input type="text" value={form.nameUz} onChange={(e) => setForm((f) => ({ ...f, nameUz: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_en') || 'Name (EN)'}</label>
                <input type="text" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_seller_email') || 'Seller email'}</label>
                <input type="email" value={form.sellerEmail} onChange={(e) => setForm((f) => ({ ...f, sellerEmail: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_generated_token') || 'Generated token'}</label>
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

              {/* First subscription period preview */}
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-primary" />
                  <p className="text-sm font-medium text-text-main">First subscription period</p>
                </div>
                <p className="text-xs text-subtext">
                  ${SUB_DEFAULTS.amountUsd} / {SUB_DEFAULTS.durationDays} days starting today.
                  Grace period: {SUB_DEFAULTS.graceDays} days after expiry.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-subtext hover:text-text-main border border-white/10 rounded-lg">
                {t('common_cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {saving ? (t('common_loading') || 'Saving…') : 'Create shop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Subscription Modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="text-text-main font-bold text-lg">Extend subscription</h2>
                <p className="text-subtext text-xs mt-0.5">{extendModal.nameEn}</p>
              </div>
              <button onClick={() => setExtendModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-surface rounded-lg">
                <p className="text-xs text-subtext mb-1">Current status</p>
                <div className="flex items-center justify-between">
                  <SubscriptionBadge shop={extendModal} />
                  <p className="text-xs text-subtext">
                    {extendModal.subscription?.expiresAt?.toDate?.()?.toLocaleDateString() || 'No expiry'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">Months</label>
                <div className="flex items-center gap-2">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => setExtendForm((f) => ({ ...f, months: m, amount: m * SUB_DEFAULTS.amountUsd }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-all
                        ${extendForm.months === m
                          ? 'bg-primary text-dark border-primary'
                          : 'bg-surface text-subtext border-white/10 hover:border-white/20'}`}
                    >
                      {m}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    value={extendForm.months}
                    onChange={(e) => setExtendForm((f) => ({
                      ...f,
                      months: e.target.value,
                      amount: Number(e.target.value) * SUB_DEFAULTS.amountUsd,
                    }))}
                    className="text-sm py-1.5 w-20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">Paid amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={extendForm.amount}
                  onChange={(e) => setExtendForm((f) => ({ ...f, amount: e.target.value }))}
                  className="text-sm py-2"
                />
                <p className="text-xs text-subtext mt-1">
                  Default: ${SUB_DEFAULTS.amountUsd}/month × {extendForm.months} = ${SUB_DEFAULTS.amountUsd * Number(extendForm.months || 0)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={extendForm.notes}
                  onChange={(e) => setExtendForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Payment method, reference number, etc."
                  className="resize-none text-sm"
                />
              </div>

              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="text-success flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-success">
                    {(() => {
                      const now = new Date();
                      const current = extendModal.subscription?.expiresAt?.toDate?.() || now;
                      const base = current > now ? current : now;
                      const newExpiry = new Date(base.getTime() + Number(extendForm.months || 0) * 30 * 86400000);
                      return `Will extend to ${newExpiry.toLocaleDateString()}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setExtendModal(null)} className="px-4 py-2 text-sm text-subtext hover:text-text-main border border-white/10 rounded-lg">
                {t('common_cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleExtend}
                disabled={extending}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {extending ? 'Extending…' : 'Confirm extension'}
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
        title={t('shops_regenerate_token') || 'Regenerate token'}
        message={t('shops_regenerate_warning') || 'This will invalidate the old token. Mobile customers using it will lose access until you share the new token.'}
        danger
        loading={regenLoading}
        confirmText={t('shops_regenerate_token') || 'Regenerate'}
      />
    </Layout>
  );
}
