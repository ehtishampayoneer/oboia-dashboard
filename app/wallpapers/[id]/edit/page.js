'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, DollarSign, Package, Plus, Minus, Sparkles } from 'lucide-react';
import Layout from '../../../../components/Layout';
import ImageUpload from '../../../../components/ImageUpload';
import { useAuth } from '../../../../context/AuthContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useCurrency } from '../../../../context/CurrencyContext';
import {
  getWallpaperById, updateWallpaper, updatePrice, getPriceHistory,
  increaseStock, reduceStock,
} from '../../../../lib/db/wallpapers';
import { convertToUSD } from '../../../../lib/currency';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import toast from 'react-hot-toast';

export default function EditWallpaperPage() {
  const { id } = useParams();
  const { shopId, shopOverride, currentUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { format, exchangeRate } = useCurrency();
  const router = useRouter();

  // Same shop scope used everywhere else: shopkeeper → own shop;
  // admin → the shop opened via the switcher.
  const effectiveShopId = isAdmin ? (shopOverride || null) : shopId;

  const [wallpaper, setWallpaper] = useState(null);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [images, setImages] = useState([]);
  const [arTexture, setArTexture] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Price change (writes to price history)
  const [newPrice, setNewPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);

  // Stock adjustment
  const [stockMode, setStockMode] = useState('add'); // 'add' | 'remove' | 'set'
  const [stockAmount, setStockAmount] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const [form, setForm] = useState({
    nameUz: '', nameEn: '', descriptionUz: '', descriptionEn: '',
    categoryId: '', supplierId: '',
    sellPrice: '', costPrice: '',
    rollWidthCm: 53, rollLengthM: 10,
    patternRepeatCm: 0, lowStockThreshold: 5, isActive: true,
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [wp, cats, sups, hist] = await Promise.all([
        getWallpaperById(id),
        effectiveShopId
          ? getDocs(query(collection(db, 'categories'), where('shopId', '==', effectiveShopId)))
          : getDocs(collection(db, 'categories')),
        effectiveShopId
          ? getDocs(query(collection(db, 'suppliers'), where('shopId', '==', effectiveShopId)))
          : getDocs(collection(db, 'suppliers')),
        getPriceHistory(id),
      ]);
      if (wp) {
        setWallpaper(wp);
        setImages(wp.images || []);
        setArTexture(wp.arTexture || wp.pbr?.albedoUrl || '');
        setForm({
          nameUz: wp.nameUz || '',
          nameEn: wp.nameEn || '',
          descriptionUz: wp.descriptionUz || '',
          descriptionEn: wp.descriptionEn || '',
          categoryId: wp.categoryId || '',
          supplierId: wp.supplierId || '',
          sellPrice: wp.sellPrice ?? wp.price ?? '',
          costPrice: wp.costPrice ?? '',
          rollWidthCm: wp.rollWidthCm || (wp.rollWidth ? Math.round(wp.rollWidth * 100) : 53),
          rollLengthM: wp.rollLengthM || wp.rollLength || 10,
          patternRepeatCm: wp.patternRepeatCm || 0,
          lowStockThreshold: wp.lowStockThreshold || 5,
          isActive: wp.isActive !== false,
        });
      }
      setCategories(cats.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSuppliers(sups.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPriceHistory(hist);
    } catch (e) {
      console.error(e);
      toast.error(t('common_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectiveShopId]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Saves EVERYTHING editable here, including sellPrice/costPrice. The db
      // helper recomputes pricePerSqm + mirrors price→mobile fields.
      await updateWallpaper(id, {
        nameUz: form.nameUz,
        nameEn: form.nameEn,
        descriptionUz: form.descriptionUz,
        descriptionEn: form.descriptionEn,
        categoryId: form.categoryId,
        supplierId: form.supplierId,
        sellPrice: Number(form.sellPrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        rollWidthCm: Number(form.rollWidthCm),
        rollLengthM: Number(form.rollLengthM),
        patternRepeatCm: Number(form.patternRepeatCm),
        lowStockThreshold: Number(form.lowStockThreshold),
        isActive: form.isActive,
        images,
        arTexture,
        thumbnailUrl: images?.[0] || arTexture || '',
      }, currentUser.uid);
      toast.success(t('wallpapers_update_success') || 'Wallpaper updated');
      router.push('/wallpapers');
    } catch (e) {
      toast.error(e?.message || t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePriceUpdate = async () => {
    if (!newPrice || Number(newPrice) <= 0) { toast.error('Enter a valid price'); return; }
    setPriceSaving(true);
    try {
      await updatePrice(id, id, effectiveShopId, wallpaper.sellPrice ?? wallpaper.price ?? 0, Number(newPrice), priceReason, currentUser.uid);
      toast.success('Price updated');
      setWallpaper((w) => ({ ...w, sellPrice: Number(newPrice), price: Number(newPrice) }));
      setForm((f) => ({ ...f, sellPrice: Number(newPrice) }));
      setNewPrice('');
      setPriceReason('');
      setPriceHistory(await getPriceHistory(id));
    } catch (e) {
      toast.error(e?.message || t('common_error'));
    } finally {
      setPriceSaving(false);
    }
  };

  // ── Stock manager: add rolls, remove rolls, or set an exact count.
  const handleStockChange = async () => {
    const amt = Number(stockAmount);
    if (!amt || amt < 0) { toast.error('Enter a valid number of rolls'); return; }
    setStockSaving(true);
    try {
      const current = Number(wallpaper.stock || 0);
      if (stockMode === 'add') {
        await increaseStock(id, amt);
      } else if (stockMode === 'remove') {
        if (amt > current) { toast.error('Cannot remove more than current stock'); setStockSaving(false); return; }
        await reduceStock(id, amt, null, currentUser.uid);
      } else if (stockMode === 'set') {
        const diff = amt - current;
        if (diff > 0) await increaseStock(id, diff);
        else if (diff < 0) await reduceStock(id, -diff, null, currentUser.uid);
      }
      const fresh = await getWallpaperById(id);
      setWallpaper(fresh);
      setStockAmount('');
      toast.success('Stock updated');
    } catch (e) {
      toast.error(e?.message || t('common_error'));
    } finally {
      setStockSaving(false);
    }
  };

  const rollSqm = ((Number(form.rollWidthCm) / 100) * Number(form.rollLengthM)).toFixed(2);
  const newPriceUSD = newPrice ? convertToUSD(Number(newPrice), exchangeRate).toFixed(2) : '0.00';

  // Admin with no shop open → can't resolve categories/suppliers correctly
  if (isAdmin && !effectiveShopId) {
    return (
      <Layout title={t('common_edit')}>
        <div className="max-w-xl mx-auto mt-10 bg-card border border-primary/20 rounded-2xl p-8 text-center">
          <Package size={36} className="text-primary mx-auto mb-4" />
          <h2 className="text-text-main font-bold text-lg mb-2">Open a shop first</h2>
          <p className="text-subtext text-sm mb-6">
            To edit a wallpaper, open its shop from the Shops page so categories and suppliers resolve correctly.
          </p>
          <button onClick={() => router.push('/shops')} className="px-6 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all">
            Go to Shops
          </button>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title={t('common_edit')}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`${t('common_edit')} — ${wallpaper?.nameEn || ''}`}>
      <div className="max-w-3xl mx-auto space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-subtext hover:text-text-main text-sm">
          <ArrowLeft size={16} /> Back
        </button>

        {/* Basic info */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-text-main font-semibold">{t('wallpapers_name')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_name_uz')}</label>
              <input type="text" value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_name_en')}</label>
              <input type="text" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_description_uz')}</label>
              <textarea rows={3} value={form.descriptionUz} onChange={(e) => set('descriptionUz', e.target.value)} className="resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_description_en')}</label>
              <textarea rows={3} value={form.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} className="resize-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_category')}</label>
              <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameEn} / {c.nameUz}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_supplier')}</label>
              <select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
                <option value="">Select supplier...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Pricing — editable directly, saved with the main Save button */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">Pricing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_sell_price')}</label>
              <input type="number" min="0" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_cost_price')}</label>
              <input type="number" min="0" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} />
            </div>
          </div>
          <p className="text-subtext text-xs mt-2">
            Changing the sell price here updates it directly. Use the price-history box below if you want to record the change with a reason.
          </p>
        </div>

        {/* Stock manager */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4 flex items-center gap-2">
            <Package size={18} className="text-primary" />
            Stock
          </h3>
          <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-lg">
            <span className="text-subtext text-sm">Current stock:</span>
            <span className={`font-bold text-lg ${Number(wallpaper?.stock || 0) <= Number(wallpaper?.lowStockThreshold || 0) ? 'text-error' : 'text-primary'}`}>
              {wallpaper?.stock || 0} rolls
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {['add', 'remove', 'set'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setStockMode(m)}
                  className={`px-3 py-2 text-xs font-semibold capitalize transition-all
                    ${stockMode === m ? 'bg-primary text-dark' : 'bg-surface text-subtext hover:text-text-main'}`}
                >
                  {m === 'add' ? 'Add rolls' : m === 'remove' ? 'Remove' : 'Set exact'}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-[120px]">
              <input
                type="number" min="0"
                value={stockAmount}
                onChange={(e) => setStockAmount(e.target.value)}
                placeholder="Number of rolls"
              />
            </div>
            <button
              onClick={handleStockChange}
              disabled={stockSaving || !stockAmount}
              className="px-4 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg
                transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {stockMode === 'add' ? <Plus size={14} /> : stockMode === 'remove' ? <Minus size={14} /> : null}
              {stockSaving ? '...' : 'Apply'}
            </button>
          </div>
        </div>

        {/* Price history (records change with reason) */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-primary" />
            {t('wallpapers_price_history')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_new_price')}</label>
              <input type="number" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" />
              <p className="text-subtext text-xs mt-1">≈ ${newPriceUSD} USD</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_price_change_reason')}</label>
              <input type="text" value={priceReason} onChange={(e) => setPriceReason(e.target.value)} placeholder="Optional reason..." />
            </div>
          </div>
          <button
            onClick={handlePriceUpdate}
            disabled={priceSaving || !newPrice}
            className="px-4 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {priceSaving ? t('common_loading') : t('wallpapers_save_price')}
          </button>

          {priceHistory.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-xs text-subtext font-semibold pb-2 pr-4">{t('common_date')}</th>
                    <th className="text-right text-xs text-subtext font-semibold pb-2 pr-4">Old Price</th>
                    <th className="text-right text-xs text-subtext font-semibold pb-2 pr-4">New Price</th>
                    <th className="text-left text-xs text-subtext font-semibold pb-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {priceHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 pr-4 text-subtext text-xs">{h.changedAt?.toDate?.()?.toLocaleDateString() || '—'}</td>
                      <td className="py-2 pr-4 text-right text-subtext">{format(h.oldPrice)}</td>
                      <td className="py-2 pr-4 text-right text-primary font-medium">{format(h.newPrice)}</td>
                      <td className="py-2 text-subtext text-xs">{h.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Roll specs */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">Roll Specifications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: t('wallpapers_roll_width'), key: 'rollWidthCm' },
              { label: t('wallpapers_roll_length'), key: 'rollLengthM' },
              { label: t('wallpapers_pattern_repeat'), key: 'patternRepeatCm' },
              { label: t('wallpapers_low_stock_threshold'), key: 'lowStockThreshold' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
                <input type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_roll_sqm')}</label>
              <input type="text" value={`${rollSqm} m²`} readOnly className="text-primary font-semibold bg-dark/50 cursor-default" />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-text-main font-semibold">{t('wallpapers_images')}</h3>
          <ImageUpload
            multiple
            folder={`wallpapers/${effectiveShopId}`}
            existingUrls={images}
            onUpload={(urls) => setImages((prev) => [...prev, ...(Array.isArray(urls) ? urls : [urls])])}
            onRemove={(_, i) => setImages((prev) => prev.filter((_, j) => j !== i))}
          />
          <div className="flex items-center gap-2 pt-3 border-t border-white/5">
            <Sparkles size={14} className="text-primary" />
            <h3 className="text-text-main font-semibold">{t('wallpapers_ar_texture')}</h3>
          </div>
          <p className="text-subtext text-xs -mt-2">Seamless tile for AR. If empty, the first image is used.</p>
          <ImageUpload
            folder={`ar-textures/${effectiveShopId}`}
            existingUrls={arTexture ? [arTexture] : []}
            onUpload={(url) => setArTexture(Array.isArray(url) ? url[0] : url)}
            onRemove={() => setArTexture('')}
          />
        </div>

        {/* Active toggle */}
        <div className="bg-card border border-white/5 rounded-xl p-6 flex items-center justify-between">
          <p className="text-text-main font-medium">{t('wallpapers_status')}</p>
          <button
            type="button"
            onClick={() => set('isActive', !form.isActive)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200
              ${form.isActive ? 'bg-primary' : 'bg-surface border border-white/20'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200
              ${form.isActive ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button onClick={() => router.back()} className="px-5 py-2.5 text-sm text-subtext border border-white/10 rounded-lg hover:text-text-main transition-all">
            {t('common_cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? t('common_loading') : t('common_save')}
          </button>
        </div>
      </div>
    </Layout>
  );
}
