'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, DollarSign } from 'lucide-react';
import Layout from '../../../../components/Layout';
import ImageUpload from '../../../../components/ImageUpload';
import { useAuth } from '../../../../context/AuthContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useCurrency } from '../../../../context/CurrencyContext';
import { getWallpaperById, updateWallpaper, updatePrice, getPriceHistory } from '../../../../lib/db/wallpapers';
import { convertToUSD } from '../../../../lib/currency';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import toast from 'react-hot-toast';

export default function EditWallpaperPage() {
  const { id } = useParams();
  const { shopId, currentUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { format, exchangeRate } = useCurrency();
  const router = useRouter();

  const [wallpaper, setWallpaper] = useState(null);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);

  const [form, setForm] = useState({
    nameUz: '', nameEn: '', descriptionUz: '', descriptionEn: '',
    categoryId: '', supplierId: '',
    rollWidthCm: 53, rollLengthM: 10,
    patternRepeatCm: 0, lowStockThreshold: 5, isActive: true,
  });

  useEffect(() => {
    if (!id || !shopId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [wp, cats, sups, hist] = await Promise.all([
          getWallpaperById(id),
          getDocs(query(collection(db, 'categories'), where('shopId', '==', shopId))),
          getDocs(query(collection(db, 'suppliers'), where('shopId', '==', shopId))),
          getPriceHistory(id),
        ]);
        if (wp) {
          setWallpaper(wp);
          setImages(wp.images || []);
          setForm({
            nameUz: wp.nameUz || '',
            nameEn: wp.nameEn || '',
            descriptionUz: wp.descriptionUz || '',
            descriptionEn: wp.descriptionEn || '',
            categoryId: wp.categoryId || '',
            supplierId: wp.supplierId || '',
            rollWidthCm: wp.rollWidthCm || 53,
            rollLengthM: wp.rollLengthM || 10,
            patternRepeatCm: wp.patternRepeatCm || 0,
            lowStockThreshold: wp.lowStockThreshold || 5,
            isActive: wp.isActive !== false,
          });
        }
        setCategories(cats.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSuppliers(sups.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPriceHistory(hist);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, shopId]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateWallpaper(id, { ...form, images }, currentUser.uid);
      toast.success(t('wallpapers_update_success'));
      router.push('/wallpapers');
    } catch {
      toast.error(t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePriceUpdate = async () => {
    if (!newPrice || Number(newPrice) <= 0) { toast.error('Enter a valid price'); return; }
    setPriceSaving(true);
    try {
      await updatePrice(id, id, shopId, wallpaper.sellPrice, Number(newPrice), priceReason, currentUser.uid);
      toast.success('Price updated');
      setWallpaper((w) => ({ ...w, sellPrice: Number(newPrice) }));
      setNewPrice('');
      setPriceReason('');
      const hist = await getPriceHistory(id);
      setPriceHistory(hist);
    } catch {
      toast.error(t('common_error'));
    } finally {
      setPriceSaving(false);
    }
  };

  const rollSqm = ((Number(form.rollWidthCm) / 100) * Number(form.rollLengthM)).toFixed(2);
  const newPriceUSD = newPrice ? convertToUSD(Number(newPrice), exchangeRate).toFixed(2) : '0.00';

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
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
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

        {/* Price update section */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-primary" />
            {t('wallpapers_price_history')}
          </h3>
          <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-lg">
            <span className="text-subtext text-sm">Current sell price:</span>
            <span className="text-primary font-bold text-lg">{format(wallpaper?.sellPrice || 0)}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('wallpapers_new_price')}</label>
              <input
                type="number" min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0"
              />
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
            className="px-4 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg
              transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {priceSaving ? t('common_loading') : t('wallpapers_save_price')}
          </button>

          {/* Price history table */}
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
                      <td className="py-2 pr-4 text-subtext text-xs">
                        {h.changedAt?.toDate?.()?.toLocaleDateString() || '—'}
                      </td>
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
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">{t('wallpapers_images')}</h3>
          <ImageUpload
            multiple
            folder={`wallpapers/${shopId}`}
            existingUrls={images}
            onUpload={(urls) => setImages((prev) => [...prev, ...(Array.isArray(urls) ? urls : [urls])])}
            onRemove={(_, i) => setImages((prev) => prev.filter((_, j) => j !== i))}
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
