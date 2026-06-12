'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, Timestamp,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  Plus, Eye, EyeOff, Copy, RefreshCw, ToggleLeft, ToggleRight,
  Calendar, AlertCircle, Clock, Trash2, Check, X, KeyRound, Inbox, Phone, Pencil, FolderOpen,
} from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import ConfirmModal from '../../components/ConfirmModal';
import StatusBadge from '../../components/StatusBadge';
import { auth, db } from '../../lib/firebase';
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

// Bilingual strings for the newer features (local, so the big lib/i18n.js
// stays untouched; can be merged there post-launch).
const REQ_STRINGS = {
  en: {
    requests_title: 'Pending Seller Requests',
    approve: 'Approve',
    reject: 'Reject',
    approved_toast: 'Approved! Token: {token} — send it to the seller after payment.',
    rejected_toast: 'Request rejected',
    reset_pw: 'Reset password',
    reset_sent: 'Password reset email sent to {email}',
    requested: 'Requested',
    edit: 'Edit',
    edit_shop: 'Edit Shop',
    edit_saved: 'Shop updated',
    open: 'Open',
    opening: 'Now managing {name} — use Categories & Wallpapers in the sidebar',
  },
  uz: {
    requests_title: 'Kutilayotgan sotuvchi so\'rovlari',
    approve: 'Tasdiqlash',
    reject: 'Rad etish',
    approved_toast: 'Tasdiqlandi! Token: {token} — to\'lovdan keyin sotuvchiga yuboring.',
    rejected_toast: 'So\'rov rad etildi',
    reset_pw: 'Parolni tiklash',
    reset_sent: 'Parolni tiklash xati {email} manziliga yuborildi',
    requested: 'So\'ralgan sana',
    edit: 'Tahrirlash',
    edit_shop: 'Do\'konni tahrirlash',
    edit_saved: 'Do\'kon yangilandi',
    open: 'Ochish',
    opening: 'Endi {name} boshqarilmoqda — yon paneldagi Kategoriyalar va Oboylardan foydalaning',
  },
};

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'SHOP-';
  for (let i = 0; i < 5; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// Compute subscription status from a shop document.
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

// Inline badge component for subscription status (uses t() for labels)
function SubscriptionBadge({ shop, t }) {
  const status = getSubscriptionStatus(shop);
  const days = getDaysRemaining(shop);

  const config = {
    active:   { color: 'bg-green-500/15 text-success border-green-500/30',  label: t('sub_status_active') },
    expiring: { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: t('sub_status_expiring') },
    grace:    { color: 'bg-orange-500/15 text-warning border-orange-500/30', label: t('sub_status_grace') },
    expired:  { color: 'bg-red-500/15 text-error border-red-500/30',        label: t('sub_status_expired') },
    none:     { color: 'bg-gray-500/15 text-subtext border-gray-500/30',    label: t('sub_status_none') },
  };
  const c = config[status] || config.none;
  const daysLabel = days === null ? '' :
    days > 0 ? t('sub_days_left').replace('{n}', days) :
    days === 0 ? t('sub_today') :
    t('sub_days_over').replace('{n}', Math.abs(days));

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
  const { t, currentLang } = useLanguage();
  const R = REQ_STRINGS[currentLang] || REQ_STRINGS.en;
  const { format } = useCurrency();
  const { currentUser, isAdmin, setShopOverride } = useAuth();
  const router = useRouter();

  const [shops, setShops] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [regenModal, setRegenModal] = useState(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [extendModal, setExtendModal] = useState(null);
  const [extendForm, setExtendForm] = useState({ months: 1, amount: SUB_DEFAULTS.amountUsd, notes: '' });
  const [extending, setExtending] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ nameUz: '', nameEn: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [actionRequestId, setActionRequestId] = useState(null);
  const [revealedTokens, setRevealedTokens] = useState({});
  const [form, setForm] = useState({
    nameUz: '', nameEn: '', sellerEmail: '', token: generateToken(),
  });
  const [saving, setSaving] = useState(false);

  // Hard double-submit guard. React state updates are async, so a rapid
  // double-tap can fire a handler twice before state flips. This ref
  // flips synchronously and blocks the second call instantly.
  const busyRef = useRef(false);

  const fetchShops = async () => {
    setLoading(true);
    // Shops and signup requests load INDEPENDENTLY — a permission problem
    // on one collection must never blank the other.
    try {
      const shopSnap = await getDocs(collection(db, 'shops'));
      setShops(shopSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('shops read failed', e);
      toast.error(t('common_error'));
    }
    try {
      const reqSnap = await getDocs(
        query(collection(db, 'signupRequests'), where('status', '==', 'pending'))
      );
      setRequests(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('signupRequests read failed', e);
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchShops(); }, []);

  const checkUserExists = async (email) => {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  // ──────────────────────────────────────────────────────────────────────
  // Shared shop-creation core. Returns { shopId, token, expiresAt }.
  // Writes BOTH name (legacy field the mobile app's older code paths read)
  // AND nameUz/nameEn — so shop names always display everywhere.
  // ──────────────────────────────────────────────────────────────────────
  const createShopDoc = async ({ nameUz, nameEn, sellerEmail, token }) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUB_DEFAULTS.durationDays * 86400000);

    const shopRef = await addDoc(collection(db, 'shops'), {
      name: nameEn || nameUz,            // legacy display field
      nameUz,
      nameEn,
      sellerEmail,
      token,
      isActive: true,
      totalSales: 0,
      exchangeRate: 12500,
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
    });

    await addDoc(collection(db, 'shops', shopRef.id, 'subscriptionHistory'), {
      paidAt: Timestamp.fromDate(now),
      amountUsd: SUB_DEFAULTS.amountUsd,
      periodStart: Timestamp.fromDate(now),
      periodEnd: Timestamp.fromDate(expiresAt),
      months: 1,
      recordedBy: currentUser?.uid,
      notes: t('sub_initial_note'),
      createdAt: serverTimestamp(),
    });

    return { shopId: shopRef.id, token, expiresAt };
  };

  // ──────────────────────────────────────────────────────────────────────
  // APPROVE a self-signup request: create shop + link the seller's
  // existing Auth account (users/{uid}) to it. No manual UID copying.
  // ──────────────────────────────────────────────────────────────────────
  const handleApproveRequest = async (request) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActionRequestId(request.id);
    try {
      const token = generateToken();
      const { shopId } = await createShopDoc({
        nameUz: request.shopName,
        nameEn: request.shopName,
        sellerEmail: request.email,
        token,
      });

      // Link the seller's account (doc ID = their Auth UID, written at signup)
      await updateDoc(doc(db, 'users', request.uid), {
        role: 'shopkeeper',
        shopId,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'signupRequests', request.id), {
        status: 'approved',
        shopId,
        token,
        approvedBy: currentUser?.uid,
        approvedAt: serverTimestamp(),
      });

      toast.success(R.approved_toast.replace('{token}', token), { duration: 8000 });
      fetchShops();
    } catch (e) {
      console.error(e);
      toast.error(t('common_error') + ': ' + e.message);
    } finally {
      busyRef.current = false;
      setActionRequestId(null);
    }
  };

  const handleRejectRequest = async (request) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActionRequestId(request.id);
    try {
      await updateDoc(doc(db, 'signupRequests', request.id), {
        status: 'rejected',
        rejectedBy: currentUser?.uid,
        rejectedAt: serverTimestamp(),
      });
      toast.success(R.rejected_toast);
      fetchShops();
    } catch (e) {
      toast.error(t('common_error'));
    } finally {
      busyRef.current = false;
      setActionRequestId(null);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Send password-reset email to a shop's seller.
  // ──────────────────────────────────────────────────────────────────────
  const handleResetPassword = async (shop) => {
    if (!shop.sellerEmail) return;
    try {
      await sendPasswordResetEmail(auth, shop.sellerEmail);
      toast.success(R.reset_sent.replace('{email}', shop.sellerEmail));
    } catch (e) {
      // Generic message either way — don't leak whether email exists
      toast.success(R.reset_sent.replace('{email}', shop.sellerEmail));
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // EDIT shop names (keeps name/nameUz/nameEn in sync everywhere)
  // ──────────────────────────────────────────────────────────────────────
  const openEditModal = (shop) => {
    setEditForm({ nameUz: shop.nameUz || '', nameEn: shop.nameEn || '' });
    setEditModal(shop);
  };

  const handleEditShop = async () => {
    if (!editModal) return;
    if (!editForm.nameUz && !editForm.nameEn) {
      toast.error(t('shops_name_required'));
      return;
    }
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'shops', editModal.id), {
        name: editForm.nameEn || editForm.nameUz,
        nameUz: editForm.nameUz,
        nameEn: editForm.nameEn,
        updatedBy: currentUser?.uid,
        updatedAt: serverTimestamp(),
      });
      toast.success(R.edit_saved);
      setEditModal(null);
      fetchShops();
    } catch (e) {
      toast.error(t('common_error'));
    } finally {
      setEditSaving(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Manual create (admin-driven; prefer the /signup flow for real sellers)
  // ──────────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (busyRef.current) return;
    if (!form.nameUz || !form.nameEn) {
      toast.error(t('shops_name_required'));
      return;
    }
    if (!form.sellerEmail) {
      toast.error(t('shops_email_required'));
      return;
    }
    busyRef.current = true;
    setSaving(true);
    try {
      const { expiresAt } = await createShopDoc({
        nameUz: form.nameUz,
        nameEn: form.nameEn,
        sellerEmail: form.sellerEmail,
        token: form.token,
      });

      const userExists = await checkUserExists(form.sellerEmail);
      if (!userExists) {
        await addDoc(collection(db, 'users'), {
          email: form.sellerEmail,
          role: 'shopkeeper',
          shopId: null,
          displayName: form.nameEn,
          createdBy: currentUser?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success(
        t('shops_create_success_with_date').replace('{date}', expiresAt.toLocaleDateString())
      );

      setShowModal(false);
      setForm({ nameUz: '', nameEn: '', sellerEmail: '', token: generateToken() });
      fetchShops();
    } catch (e) {
      console.error(e);
      toast.error(t('common_error') + ': ' + e.message);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Extend subscription
  // ──────────────────────────────────────────────────────────────────────
  const handleExtend = async () => {
    if (!extendModal) return;
    if (!extendForm.months || extendForm.months < 1) {
      toast.error(t('sub_months_required'));
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
        notes: extendForm.notes || t('sub_extended_note').replace('{n}', months),
        createdAt: serverTimestamp(),
      });

      toast.success(
        t('sub_extended_success').replace('{date}', periodEnd.toLocaleDateString())
      );
      setExtendModal(null);
      setExtendForm({ months: 1, amount: SUB_DEFAULTS.amountUsd, notes: '' });
      fetchShops();
    } catch (e) {
      console.error(e);
      toast.error(t('common_error') + ': ' + e.message);
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

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'shops', deleteModal.id));
      toast.success(t('common_success'));
      setDeleteModal(null);
      fetchShops();
    } catch (e) {
      toast.error(t('common_error'));
    } finally {
      setDeleting(false);
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
      toast.error(t('common_error'));
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
      toast.success(t('shops_token_regenerated'));
      setRegenModal(null);
      fetchShops();
    } catch (e) {
      toast.error(t('common_error'));
    } finally {
      setRegenLoading(false);
    }
  };

  // ── ENTER a shop: the whole dashboard (Categories, Wallpapers,
  //    Warehouse, Sales...) switches to operate on this shop. The header
  //    switcher shows which shop you're inside.
  const openShop = (shop) => {
    setShopOverride(shop.id);
    toast.success(R.opening.replace('{name}', shop.nameEn || shop.nameUz || ''), { duration: 4000 });
    router.push('/wallpapers');
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
    toast.success(t('shops_token_copied'));
  };

  const columns = [
    {
      key: 'name', label: t('shops_name'), accessor: 'nameEn',
      render: (_, row) => (
        <button onClick={() => openShop(row)} className="text-left group">
          <p className="text-text-main font-medium group-hover:text-primary group-hover:underline transition-colors">
            {row.nameEn}
          </p>
          <p className="text-subtext text-xs">{row.nameUz}</p>
        </button>
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
      key: 'subscription', label: t('sub_label'), sortable: false,
      render: (_, row) => <SubscriptionBadge shop={row} t={t} />,
    },
    {
      key: 'status', label: t('shops_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openShop(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
              bg-primary text-dark hover:bg-secondary transition-all"
            title={R.open}
          >
            <FolderOpen size={14} />
            {R.open}
          </button>
          <button
            onClick={() => openEditModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-white/5 text-text-main hover:bg-white/10 transition-all"
            title={R.edit}
          >
            <Pencil size={14} />
            {R.edit}
          </button>
          <button
            onClick={() => openExtendModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-primary/15 text-primary hover:bg-primary/25 transition-all"
            title={t('sub_extend')}
          >
            <Calendar size={14} />
            {t('sub_extend')}
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
          <button
            onClick={() => handleResetPassword(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all"
            title={R.reset_pw}
          >
            <KeyRound size={14} />
            {R.reset_pw}
          </button>
          <button
            onClick={() => setDeleteModal(row)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-red-500/10 text-error hover:bg-red-500/20 transition-all"
            title={t('common_delete')}
          >
            <Trash2 size={14} />
            {t('common_delete')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('shops_title')}>
      {/* ── Pending seller requests panel ─────────────────────────────── */}
      {requests.length > 0 && (
        <div className="bg-card border border-primary/20 rounded-xl mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
            <Inbox size={16} className="text-primary" />
            <h2 className="text-text-main font-semibold text-sm">{R.requests_title}</h2>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold">
              {requests.length}
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {requests.map((req) => (
              <div key={req.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-text-main font-medium">{req.shopName}</p>
                  <div className="flex items-center gap-3 flex-wrap mt-0.5">
                    <span className="text-subtext text-xs">{req.email}</span>
                    {req.phone && (
                      <a href={`tel:${req.phone}`} className="flex items-center gap-1 text-primary text-xs hover:underline">
                        <Phone size={11} />
                        {req.phone}
                      </a>
                    )}
                    <span className="text-subtext text-xs">
                      {R.requested}: {req.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveRequest(req)}
                    disabled={actionRequestId === req.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold
                      bg-green-500/15 text-success hover:bg-green-500/25 transition-all disabled:opacity-50"
                  >
                    <Check size={14} />
                    {actionRequestId === req.id ? t('common_loading') : R.approve}
                  </button>
                  <button
                    onClick={() => handleRejectRequest(req)}
                    disabled={actionRequestId === req.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold
                      bg-red-500/10 text-error hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <X size={14} />
                    {R.reject}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Edit Shop Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold text-lg">{R.edit_shop}</h2>
              <button onClick={() => setEditModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_uz')}</label>
                <input type="text" value={editForm.nameUz}
                  onChange={(e) => setEditForm((f) => ({ ...f, nameUz: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('shops_name_en')}</label>
                <input type="text" value={editForm.nameEn}
                  onChange={(e) => setEditForm((f) => ({ ...f, nameEn: e.target.value }))} />
              </div>
              <p className="text-xs text-subtext">
                {editModal.sellerEmail} · {editModal.token}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-subtext hover:text-text-main border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleEditShop}
                disabled={editSaving}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {editSaving ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

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

              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-primary" />
                  <p className="text-sm font-medium text-text-main">{t('sub_first_period')}</p>
                </div>
                <p className="text-xs text-subtext">
                  {t('sub_first_period_desc')
                    .replace('{amount}', SUB_DEFAULTS.amountUsd)
                    .replace('{days}', SUB_DEFAULTS.durationDays)
                    .replace('{grace}', SUB_DEFAULTS.graceDays)}
                </p>
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
                {saving ? t('common_loading') : t('shops_create_button')}
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
                <h2 className="text-text-main font-bold text-lg">{t('sub_extend_title')}</h2>
                <p className="text-subtext text-xs mt-0.5">{extendModal.nameEn}</p>
              </div>
              <button onClick={() => setExtendModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-surface rounded-lg">
                <p className="text-xs text-subtext mb-1">{t('sub_current_status')}</p>
                <div className="flex items-center justify-between">
                  <SubscriptionBadge shop={extendModal} t={t} />
                  <p className="text-xs text-subtext">
                    {extendModal.subscription?.expiresAt?.toDate?.()?.toLocaleDateString() || t('sub_no_expiry')}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sub_months')}</label>
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
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sub_paid_amount')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={extendForm.amount}
                  onChange={(e) => setExtendForm((f) => ({ ...f, amount: e.target.value }))}
                  className="text-sm py-2"
                />
                <p className="text-xs text-subtext mt-1">
                  {t('sub_default_calc')
                    .replace('{rate}', SUB_DEFAULTS.amountUsd)
                    .replace('{months}', extendForm.months)
                    .replace('{total}', SUB_DEFAULTS.amountUsd * Number(extendForm.months || 0))}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sub_notes_optional')}</label>
                <textarea
                  rows={2}
                  value={extendForm.notes}
                  onChange={(e) => setExtendForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t('sub_notes_placeholder')}
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
                      return t('sub_will_extend_to').replace('{date}', newExpiry.toLocaleDateString());
                    })()}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setExtendModal(null)} className="px-4 py-2 text-sm text-subtext hover:text-text-main border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleExtend}
                disabled={extending}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {extending ? t('sub_extending') : t('sub_confirm_extension')}
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

      {/* Delete Shop Confirmation */}
      <ConfirmModal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        title={t('common_delete_title')}
        message={`${deleteModal?.nameEn || ''} — ${t('common_delete_confirm')} ${t('common_cannot_undo')}`}
        danger
        loading={deleting}
        confirmText={t('common_delete')}
      />
    </Layout>
  );
}
