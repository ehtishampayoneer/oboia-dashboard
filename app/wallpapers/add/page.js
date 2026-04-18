'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Layout from '../../../components/Layout';
import ImageUpload from '../../../components/ImageUpload';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCurrency } from '../../../context/CurrencyContext';
import { addWallpaper } from '../../../lib/db/wallpapers';
import { convertToUSD } from '../../../lib/currency';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import toast from 'react-hot-toast';

export default function AddWallpaperPage() {
  const { shopId, currentUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { exchangeRate } = useCurrency();
  const router = useRouter();

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [nameTab, setNameTab] = useState('uz');
  const [descTab, setDescTab] = useState('uz');
  const [images, setImages] = useState([]);
  const [arTexture, setArTexture] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nameUz: '', nameEn: '', descriptionUz: '', descriptionEn: '',
    categoryId: '', supplierId: '',
    sellPrice: '', costPrice: '',
    rollWidthCm: 53, rollLengthM: 10,
    patternRepeatCm: 0, initialStock: 0,
    lowStockThreshold: 5, isActive: true,
  });

  const rollSqm = ((form.rollWidthCm / 100) * form.rollLengthM).toFixed(2);
  const sellUSD = form.sellPrice ? convertToUSD(Number(form.sellPrice), exchangeRate).toFixed(2) : '0.00';
  const costUSD = form.costPrice ? convertToUSD(Number(form.costPrice), exchangeRate).toFixed(2) : '0.00';

  useEffect(() => {
    if (!shopId) return;
    Promise.all([
      getDocs(query(collection(db, 'categories'), where('shopId', '==', shopId))),
      getDocs(query(collection(db, 'suppliers'), where('shopId', '==', shopId))),
    ]).then(([cats, sups]) => {
      setCategories(cats.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSuppliers(sups.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [shopId]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.nameUz || !form.nameEn) { toast.error('Name required in both languages'); return; }
    if (!form.sellPrice || Number(form.sellPrice) <= 0) { toast.error('Sell price required'); return; }
    if (!form.costPrice || Number(form.costPrice) <= 0) { toast.error('Cost price required'); return; }

    setSaving(true);
    try {
      await addWallpaper(
        shopId,
        {
          ...form,
          sellPrice: Number(form.sellPrice),
          costPrice: Number(form.costPrice),
          rollWidthCm: Number(form.rollWidthCm),
          rollLengthM: Number(form.rollLengthM),
          patternRepeatCm: Number(form.patternRepeatCm),
          initialStock: Number(form.initialStock),
          stock: Number(form.initialStock),
          lowStockThreshold: Number(form.lowStockThreshold),
          images,
          arTexture,
        },
        currentUser.uid,
        isAdmin
      );
      toast.success(t('wallpapers_add_success'));
      router.push('/wallpapers');
    } catch (e) {
      toast.error(t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  const TabBtn = ({ id, label, active, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
        ${active ? 'bg-surface text-primary border border-white/10 border-b-surface' : 'text-subtext hover:text-text-main'}`}
    >
      {label}
    </button>
  );

  const Field = ({ label, children, hint }) => (
    <div>
      <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-subtext text-xs mt-1">{hint}</p>}
    </div>
  );

  return (
    <Layout title={t('wallpapers_add')}>
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-subtext hover:text-text-main text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {!isAdmin && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-sm">
            {t('wallpapers_pending_approval')} — Your wallpaper will be submitted for admin review.
          </div>
        )}

        {/* Name section */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-text-main font-semibold">{t('wallpapers_name')}</h3>
          <div className="flex gap-1 mb-0">
            <TabBtn id="uz" label="O'zbek" active={nameTab === 'uz'} onClick={() => setNameTab('uz')} />
            <TabBtn id="en" label="English" active={nameTab === 'en'} onClick={() => setNameTab('en')} />
          </div>
          <div className="border border-white/10 rounded-b-lg rounded-tr-lg p-4 bg-surface space-y-4">
            {nameTab === 'uz' ? (
              <Field label={t('wallpapers_name_uz')}>
                <input type="text" value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} />
              </Field>
            ) : (
              <Field label={t('wallpapers_name_en')}>
                <input type="text" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
            )}
          </div>

          <h3 className="text-text-main font-semibold pt-2">{t('wallpapers_description')}</h3>
          <div className="flex gap-1">
            <TabBtn id="uz" label="O'zbek" active={descTab === 'uz'} onClick={() => setDescTab('uz')} />
            <TabBtn id="en" label="English" active={descTab === 'en'} onClick={() => setDescTab('en')} />
          </div>
          <div className="border border-white/10 rounded-b-lg rounded-tr-lg p-4 bg-surface">
            {descTab === 'uz' ? (
              <textarea rows={3} value={form.descriptionUz} onChange={(e) => set('descriptionUz', e.target.value)} className="resize-none" />
            ) : (
              <textarea rows={3} value={form.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} className="resize-none" />
            )}
          </div>
        </div>

        {/* Category & Supplier */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('wallpapers_category')}>
              <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameEn} / {c.nameUz}</option>
                ))}
              </select>
            </Field>
            <Field label={t('wallpapers_supplier')}>
              <select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">Pricing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('wallpapers_sell_price')} hint={`≈ $${sellUSD} ${t('wallpapers_usd_equiv')}`}>
              <input type="number" min="0" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} />
            </Field>
            <Field label={t('wallpapers_cost_price')} hint={`≈ $${costUSD} ${t('wallpapers_usd_equiv')}`}>
              <input type="number" min="0" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Roll specs */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">Roll Specifications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label={t('wallpapers_roll_width')}>
              <input type="number" min="1" value={form.rollWidthCm} onChange={(e) => set('rollWidthCm', e.target.value)} />
            </Field>
            <Field label={t('wallpapers_roll_length')}>
              <input type="number" min="1" value={form.rollLengthM} onChange={(e) => set('rollLengthM', e.target.value)} />
            </Field>
            <Field label={t('wallpapers_roll_sqm')}>
              <input type="text" value={`${rollSqm} m²`} readOnly className="bg-dark/50 text-primary font-semibold cursor-default" />
            </Field>
            <Field label={t('wallpapers_pattern_repeat')}>
              <input type="number" min="0" value={form.patternRepeatCm} onChange={(e) => set('patternRepeatCm', e.target.value)} />
            </Field>
            <Field label={t('wallpapers_initial_stock')}>
              <input type="number" min="0" value={form.initialStock} onChange={(e) => set('initialStock', e.target.value)} />
            </Field>
            <Field label={t('wallpapers_low_stock_threshold')}>
              <input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Images */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-text-main font-semibold">{t('wallpapers_images')}</h3>
          <ImageUpload
            multiple
            folder={`wallpapers/${shopId}`}
            existingUrls={images}
            onUpload={(urls) => setImages((prev) => [...prev, ...(Array.isArray(urls) ? urls : [urls])])}
            onRemove={(_, i) => setImages((prev) => prev.filter((_, j) => j !== i))}
          />

          <h3 className="text-text-main font-semibold">{t('wallpapers_ar_texture')}</h3>
          <ImageUpload
            folder={`ar-textures/${shopId}`}
            existingUrls={arTexture ? [arTexture] : []}
            onUpload={(url) => setArTexture(Array.isArray(url) ? url[0] : url)}
            onRemove={() => setArTexture('')}
          />
        </div>

        {/* Active toggle */}
        <div className="bg-card border border-white/5 rounded-xl p-6 flex items-center justify-between">
          <div>
            <p className="text-text-main font-medium">{t('wallpapers_status')}</p>
            <p className="text-subtext text-sm">Make this wallpaper visible to customers</p>
          </div>
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
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 text-sm text-subtext border border-white/10 rounded-lg hover:text-text-main transition-all"
          >
            {t('common_cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg
              transition-all hover:shadow-glow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('common_loading') : (isAdmin ? t('common_save') : t('wallpapers_pending_approval'))}
          </button>
        </div>
      </div>
    </Layout>
  );
}
