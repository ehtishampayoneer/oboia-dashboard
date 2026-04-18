'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, Search, X, Check } from 'lucide-react';
import Layout from '../../../components/Layout';
import ConfirmModal from '../../../components/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCurrency } from '../../../context/CurrencyContext';
import { getAllWallpapers } from '../../../lib/db/wallpapers';
import { getAllCraftsmen } from '../../../lib/db/craftsmen';
import { createSale, closeSale } from '../../../lib/db/sales';
import { sqmToRolls, sqmToLength } from '../../../lib/calculations';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import toast from 'react-hot-toast';

function NewSaleContent() {
  const { shopId, currentUser, userDoc } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [wallpapers, setWallpapers] = useState([]);
  const [craftsmen, setCraftsmen] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [craftsmanEnabled, setCraftsmanEnabled] = useState(false);
  const [craftsmanId, setCraftsmanId] = useState('');
  const [craftsmanBonus, setCraftsmanBonus] = useState('');
  const [payments, setPayments] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderId] = useState(searchParams.get('orderId'));

  useEffect(() => {
    if (!shopId) return;
    const load = async () => {
      const [wps, crafts] = await Promise.all([
        getAllWallpapers(shopId),
        getAllCraftsmen(shopId),
      ]);
      setWallpapers(wps.filter((w) => w.approvalStatus === 'approved' && w.stock > 0));
      setCraftsmen(crafts);

      const shopDoc = await getDoc(doc(db, 'shops', shopId));
      const shopData = shopDoc.data();
      setPaymentTypes(
        (shopData?.paymentTypes || [{ id: 'cash', nameEn: 'Cash', nameUz: 'Naqd', isActive: true }]).filter((p) => p.isActive)
      );
      setPayments(Object.fromEntries(
        (shopData?.paymentTypes || [{ id: 'cash' }]).filter((p) => p.isActive).map((p) => [p.id, ''])
      ));

      if (orderId) {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const order = orderSnap.data();
          if (order.wallpaperId && order.rollsNeeded) {
            const wp = wps.find((w) => w.id === order.wallpaperId);
            if (wp) {
              setItems([{
                wallpaperId: wp.id,
                wallpaperName: wp.nameEn,
                image: wp.images?.[0] || '',
                sellPrice: wp.sellPrice,
                costPrice: wp.costPrice,
                rollWidthCm: wp.rollWidthCm,
                rollLengthM: wp.rollLengthM,
                stock: wp.stock,
                sqm: order.totalSqm || 0,
                rolls: order.rollsNeeded || 0,
                lengthM: order.lengthNeededM || 0,
                total: (order.rollsNeeded || 0) * wp.sellPrice,
              }]);
            }
          }
        }
      }
    };
    load();
  }, [shopId, orderId]);

  const subtotal = items.reduce((s, i) => s + (i.total || 0), 0);
  const totalAmount = subtotal;
  const paymentsTotal = Object.values(payments).reduce((s, v) => s + (Number(v) || 0), 0);
  const remaining = totalAmount - paymentsTotal;
  const canClose = Math.abs(remaining) < 1 && items.length > 0;

  const addItem = (wp) => {
    if (items.find((i) => i.wallpaperId === wp.id)) {
      toast.error('Already added');
      setSearchOpen(false);
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        wallpaperId: wp.id,
        wallpaperName: wp.nameEn || wp.nameUz,
        image: wp.images?.[0] || '',
        sellPrice: wp.sellPrice,
        costPrice: wp.costPrice,
        rollWidthCm: wp.rollWidthCm,
        rollLengthM: wp.rollLengthM,
        stock: wp.stock,
        sqm: 0, rolls: 0, lengthM: 0, total: 0,
      },
    ]);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const updateSqm = (idx, sqm) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const rolls = sqmToRolls(sqm, item.rollWidthCm, item.rollLengthM, 0);
      const lengthM = sqmToLength(sqm, item.rollWidthCm);
      const total = rolls * item.sellPrice;
      return { ...item, sqm, rolls, lengthM, total };
    }));
  };

  const handleClose = async () => {
    if (!canClose) return;
    setClosing(true);
    try {
      const totalCost = items.reduce((s, i) => s + i.rolls * (i.costPrice || 0), 0);
      const totalSqm = items.reduce((s, i) => s + (i.sqm || 0), 0);
      const sellerName = userDoc?.name || userDoc?.email || '';

      const { id: saleId } = await createSale(shopId, {
        items: items.map((i) => ({
          wallpaperId: i.wallpaperId,
          wallpaperName: i.wallpaperName,
          sqm: i.sqm,
          rolls: i.rolls,
          lengthM: i.lengthM,
          sellPrice: i.sellPrice,
          costPrice: i.costPrice,
          total: i.total,
        })),
        totalAmount,
        totalCost,
        totalSqm,
        craftsmanId: craftsmanEnabled ? craftsmanId : null,
        craftsmanBonus: craftsmanEnabled ? Number(craftsmanBonus) : 0,
        payments,
        orderId: orderId || null,
        sellerName,
        branchId: userDoc?.branchId || null,
      }, currentUser.uid);

      await closeSale(saleId, shopId, currentUser.uid);
      toast.success(t('sales_close_success'));
      router.push(`/sales/${saleId}`);
    } catch (err) {
      if (err.message === 'PAYMENTS_MISMATCH') {
        toast.error(t('sales_close_warning'));
      } else {
        toast.error(t('common_error'));
      }
    } finally {
      setClosing(false);
      setCloseConfirm(false);
    }
  };

  const filteredWallpapers = wallpapers.filter((w) => {
    const q = searchQuery.toLowerCase();
    return !q || w.nameEn?.toLowerCase().includes(q) || w.nameUz?.toLowerCase().includes(q);
  });

  return (
    <Layout title={t('sales_new')}>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text-main font-semibold">1. {t('sales_items')}</h2>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-secondary
                text-dark font-semibold text-sm rounded-lg transition-all"
            >
              <Plus size={15} />
              {t('sales_add_item')}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 text-subtext text-sm">{t('common_no_results')}</div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.wallpaperId} className="bg-surface border border-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-dark flex-shrink-0">
                      {item.image
                        ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-subtext text-xs">—</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-text-main font-medium truncate">{item.wallpaperName}</p>
                        <button
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-subtext hover:text-error p-1 rounded flex-shrink-0 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-subtext mb-1">{t('sales_sqm')}</label>
                          <input
                            type="number" min="0" step="0.1"
                            value={item.sqm || ''}
                            onChange={(e) => updateSqm(idx, Number(e.target.value))}
                            className="py-1.5 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-subtext mb-1">{t('sales_rolls')}</label>
                          <div className="py-1.5 px-3 bg-dark/50 rounded-lg text-sm text-text-main">
                            {item.rolls}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-subtext mb-1">{t('sales_length')}</label>
                          <div className="py-1.5 px-3 bg-dark/50 rounded-lg text-sm text-text-main">
                            {item.lengthM.toFixed(1)}m
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-subtext mb-1">{t('sales_item_total')}</label>
                          <div className="py-1.5 px-3 bg-primary/10 rounded-lg text-sm text-primary font-semibold">
                            {format(item.total)}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-subtext mt-2">
                        Stock: {item.stock} rolls · {format(item.sellPrice)}/roll
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex items-center justify-end mt-4 pt-4 border-t border-white/5">
              <div className="text-right">
                <span className="text-subtext text-sm mr-3">{t('sales_subtotal')}:</span>
                <span className="text-primary font-bold text-lg">{format(subtotal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text-main font-semibold">2. {t('sales_craftsman')}</h2>
            <button
              type="button"
              onClick={() => setCraftsmanEnabled((e) => !e)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200
                ${craftsmanEnabled ? 'bg-primary' : 'bg-surface border border-white/20'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200
                ${craftsmanEnabled ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          {craftsmanEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sales_craftsman')}</label>
                <select value={craftsmanId} onChange={(e) => setCraftsmanId(e.target.value)}>
                  <option value="">Select craftsman...</option>
                  {craftsmen.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {format(c.pendingBalance || 0)} pending</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sales_craftsman_bonus')}</label>
                <input
                  type="number" min="0"
                  value={craftsmanBonus}
                  onChange={(e) => setCraftsmanBonus(e.target.value)}
                  placeholder="0 UZS"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-white/5 rounded-xl p-5">
          <h2 className="text-text-main font-semibold mb-4">3. {t('sales_payments')}</h2>

          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <p className="text-subtext text-sm">{t('sales_total_due')}</p>
              <p className="text-primary font-black text-4xl mt-1">{format(totalAmount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {paymentTypes.map((pt) => (
              <div key={pt.id}>
                <label className="block text-sm font-medium text-text-main mb-1.5">
                  {pt.nameEn}
                </label>
                <input
                  type="number" min="0"
                  value={payments[pt.id] || ''}
                  onChange={(e) => setPayments((p) => ({ ...p, [pt.id]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-white/5">
            <div>
              <p className="text-subtext text-sm">{t('sales_amount_paid')}</p>
              <p className="text-text-main font-bold">{format(paymentsTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-subtext text-sm">{t('sales_remaining')}</p>
              <p className={`font-bold text-lg ${remaining === 0 ? 'text-success' : 'text-error'}`}>
                {format(Math.abs(remaining))}
                {remaining !== 0 && (remaining > 0 ? ' short' : ' over')}
              </p>
            </div>
          </div>

          {!canClose && items.length > 0 && (
            <p className="text-xs text-warning mt-2 text-center">{t('sales_close_warning')}</p>
          )}

          <button
            onClick={() => setCloseConfirm(true)}
            disabled={!canClose || closing}
            className={`w-full mt-4 py-3 rounded-xl font-bold text-base transition-all
              ${canClose
                ? 'bg-primary hover:bg-secondary text-dark hover:shadow-glow'
                : 'bg-surface text-subtext cursor-not-allowed'
              } disabled:opacity-50`}
          >
            <div className="flex items-center justify-center gap-2">
              <Check size={18} />
              {t('sales_close_receipt')}
            </div>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-white/5">
              <Search size={16} className="text-subtext flex-shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('sales_search_wallpaper')}
                className="border-0 bg-transparent p-0 text-sm focus:ring-0 flex-1"
              />
              <button onClick={() => setSearchOpen(false)} className="text-subtext hover:text-text-main flex-shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-white/5 flex-1">
              {filteredWallpapers.length === 0 ? (
                <div className="text-center py-12 text-subtext text-sm">{t('common_no_results')}</div>
              ) : (
                filteredWallpapers.map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => addItem(wp)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-surface transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface flex-shrink-0">
                      {wp.images?.[0]
                        ? <img src={wp.images[0]} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-subtext text-xs">—</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-main font-medium truncate">{wp.nameEn || wp.nameUz}</p>
                      <p className="text-subtext text-xs">{wp.stock} rolls in stock</p>
                    </div>
                    <span className="text-primary font-semibold text-sm flex-shrink-0">{format(wp.sellPrice)}/roll</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        onConfirm={handleClose}
        title={t('sales_close_receipt')}
        message={`${t('sales_close_confirm')} Total: ${format(totalAmount)}`}
        loading={closing}
        confirmText={t('sales_close_receipt')}
      />
    </Layout>
  );
}

export default function NewSalePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <NewSaleContent />
    </Suspense>
  );
}