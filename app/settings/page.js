'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, RefreshCw, Plus, GripVertical, Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'SHOP-';
  for (let i = 0; i < 5; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export default function SettingsPage() {
  const { shopId } = useAuth();
  const { t } = useLanguage();
  const { exchangeRate } = useCurrency();

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [regenModal, setRegenModal] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);

  // Form states
  const [newRate, setNewRate] = useState('');
  const [threshold, setThreshold] = useState(5);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [newPaymentUz, setNewPaymentUz] = useState('');
  const [newPaymentEn, setNewPaymentEn] = useState('');
  const [notifications, setNotifications] = useState({
    newOrders: true, lowStock: true, bonuses: true,
  });

  useEffect(() => {
    if (!shopId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'shops', shopId));
        if (snap.exists()) {
          const data = snap.data();
          setShop({ id: snap.id, ...data });
          setNewRate(data.exchangeRate || 12500);
          setThreshold(data.defaultLowStockThreshold || 5);
          setPaymentTypes(data.paymentTypes || [
            { id: 'cash', nameEn: 'Cash', nameUz: 'Naqd', isActive: true },
          ]);
          setNotifications(data.notifications || { newOrders: true, lowStock: true, bonuses: true });
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shopId]);

  const updateShop = async (data) => {
    await updateDoc(doc(db, 'shops', shopId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(doc(db, 'shops', shopId));
    setShop({ id: snap.id, ...snap.data() });
  };

  const handleUpdateRate = async () => {
    const rate = Number(newRate);
    if (!rate || rate <= 0) { toast.error('Enter valid rate'); return; }
    setSaving(true);
    try {
      await updateShop({ exchangeRate: rate });
      toast.success(t('settings_rate_updated'));
    } catch {
      toast.error(t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddPayment = async () => {
    if (!newPaymentUz || !newPaymentEn) { toast.error('Name required in both languages'); return; }
    const id = newPaymentEn.toLowerCase().replace(/\s+/g, '_');
    const updated = [...paymentTypes, { id, nameEn: newPaymentEn, nameUz: newPaymentUz, isActive: true }];
    setPaymentTypes(updated);
    setNewPaymentUz('');
    setNewPaymentEn('');
    await updateShop({ paymentTypes: updated });
    toast.success('Payment type added');
  };

  const togglePayment = async (id) => {
    const updated = paymentTypes.map((p) => p.id === id ? { ...p, isActive: !p.isActive } : p);
    setPaymentTypes(updated);
    await updateShop({ paymentTypes: updated });
  };

  const removePayment = async (id) => {
    const updated = paymentTypes.filter((p) => p.id !== id);
    setPaymentTypes(updated);
    await updateShop({ paymentTypes: updated });
  };

  const handleRegenToken = async () => {
    setRegenLoading(true);
    try {
      const newToken = generateToken();
      await updateShop({ token: newToken });
      toast.success('Token regenerated');
      setRegenModal(false);
    } catch {
      toast.error(t('common_error'));
    } finally {
      setRegenLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await updateShop({ notifications, defaultLowStockThreshold: Number(threshold) });
      toast.success(t('settings_save_success'));
    } catch {
      toast.error(t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  const copyToken = () => {
    if (shop?.token) {
      navigator.clipboard.writeText(shop.token);
      toast.success(t('settings_copy_token') + '!');
    }
  };

  if (loading) {
    return (
      <Layout title={t('settings_title')}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const Section = ({ title, children }) => (
    <div className="bg-card border border-white/5 rounded-xl p-6">
      <h2 className="text-text-main font-semibold mb-5 pb-3 border-b border-white/5">{title}</h2>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange, label, description }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div>
        <p className="text-text-main text-sm font-medium">{label}</p>
        {description && <p className="text-subtext text-xs mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0
          ${checked ? 'bg-primary' : 'bg-surface border border-white/20'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200
          ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );

  return (
    <Layout title={t('settings_title')}>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Exchange Rate */}
        <Section title={t('settings_exchange_rate')}>
          <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-xl">
            <div>
              <p className="text-subtext text-xs">{t('settings_current_rate')}</p>
              <p className="text-primary font-bold text-lg">1 USD = {(shop?.exchangeRate || 12500).toLocaleString()} UZS</p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('settings_new_rate')}</label>
              <input
                type="number" min="1"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="12500"
              />
            </div>
            <button
              onClick={handleUpdateRate}
              disabled={saving}
              className="px-4 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? t('common_loading') : t('settings_update_rate')}
            </button>
          </div>
        </Section>

        {/* Payment Types */}
        <Section title={t('settings_payment_types')}>
          <div className="space-y-2 mb-4">
            {paymentTypes.map((pt) => (
              <div key={pt.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                <GripVertical size={14} className="text-subtext flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-text-main text-sm font-medium truncate">{pt.nameEn}</p>
                  <p className="text-subtext text-xs truncate">{pt.nameUz}</p>
                </div>
                <button
                  onClick={() => togglePayment(pt.id)}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0
                    ${pt.isActive ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                    ${pt.isActive ? 'left-5' : 'left-0.5'}`} />
                </button>
                <button
                  onClick={() => removePayment(pt.id)}
                  className="p-1 text-subtext hover:text-error transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-subtext mb-1">{t('settings_payment_name_uz')}</label>
              <input type="text" value={newPaymentUz} onChange={(e) => setNewPaymentUz(e.target.value)} className="text-sm py-2" />
            </div>
            <div>
              <label className="block text-xs text-subtext mb-1">{t('settings_payment_name_en')}</label>
              <input type="text" value={newPaymentEn} onChange={(e) => setNewPaymentEn(e.target.value)} className="text-sm py-2" />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAddPayment}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-surface border border-white/10
                  text-subtext hover:text-text-main hover:border-white/20 text-sm rounded-lg transition-all"
              >
                <Plus size={14} />
                {t('settings_add_payment')}
              </button>
            </div>
          </div>
        </Section>

        {/* Shop Token */}
        <Section title={t('settings_shop_token')}>
          <div className="flex items-center gap-3 p-4 bg-surface rounded-xl mb-4">
            <span className={`font-mono text-sm flex-1 tracking-widest ${showToken ? 'text-primary' : 'blur-sm select-none text-subtext'}`}>
              {shop?.token || '—'}
            </span>
            <button
              onClick={() => setShowToken((s) => !s)}
              className="text-subtext hover:text-text-main p-1.5 rounded-lg transition-colors"
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {showToken && (
              <button onClick={copyToken} className="text-subtext hover:text-primary p-1.5 rounded-lg transition-colors">
                <Copy size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setRegenModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20
              text-warning hover:bg-orange-500/20 text-sm transition-all"
          >
            <RefreshCw size={15} />
            {t('settings_regen_token')}
          </button>
        </Section>

        {/* Default Threshold + Notifications */}
        <Section title={t('settings_notifications')}>
          <div className="mb-5">
            <label className="block text-sm font-medium text-text-main mb-1.5">{t('settings_default_threshold')}</label>
            <input
              type="number" min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="max-w-[160px]"
            />
          </div>
          <Toggle
            label={t('settings_notify_orders')}
            checked={notifications.newOrders}
            onChange={() => setNotifications((n) => ({ ...n, newOrders: !n.newOrders }))}
          />
          <Toggle
            label={t('settings_notify_low_stock')}
            checked={notifications.lowStock}
            onChange={() => setNotifications((n) => ({ ...n, lowStock: !n.lowStock }))}
          />
          <Toggle
            label={t('settings_notify_bonuses')}
            checked={notifications.bonuses}
            onChange={() => setNotifications((n) => ({ ...n, bonuses: !n.bonuses }))}
          />
          <div className="mt-5">
            <button
              onClick={handleSaveNotifications}
              disabled={saving}
              className="px-5 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? t('common_loading') : t('settings_save')}
            </button>
          </div>
        </Section>
      </div>

      <ConfirmModal
        isOpen={regenModal}
        onClose={() => setRegenModal(false)}
        onConfirm={handleRegenToken}
        title={t('settings_regen_token')}
        message={t('settings_regen_warning')}
        danger
        loading={regenLoading}
        confirmText={t('settings_regen_token')}
      />
    </Layout>
  );
}
