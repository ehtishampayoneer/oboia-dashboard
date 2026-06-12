'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertTriangle, Sparkles, Info } from 'lucide-react';
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

// ─────────────────────────────────────────────────────────────────────────
// ★ FOCUS-BUG FIX: These helper components MUST live at module level.
// When they were defined inside the page component, every keystroke
// re-created them as brand-new component types, forcing React to unmount
// and remount the <input> — which is why typing one letter kicked the
// cursor out of the field. At module level their identity is stable, so
// inputs keep focus while typing.
// ─────────────────────────────────────────────────────────────────────────
const TabBtn = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
      ${active ? 'bg-surface text-primary border border-white/10 border-b-surface' : 'text-subtext hover:text-text-main'}`}
  >
    {label}
  </button>
);

const Field = ({ label, children, hint, error }) => (
  <div>
    <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
    {children}
    {error ? (
      <p className="text-error text-xs mt-1 flex items-center gap-1">
        <AlertTriangle size={12} />
        {error}
      </p>
    ) : (
      hint && <p className="text-subtext text-xs mt-1">{hint}</p>
    )}
  </div>
);

const ARChip = ({ arReadiness }) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
      ${arReadiness.ready
        ? 'bg-green-500/10 text-success border border-green-500/20'
        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}
  >
    {arReadiness.ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
    <span>{arReadiness.label}</span>
  </div>
);

export default function AddWallpaperPage() {
  const { shopId, shopOverride, currentUser, isAdmin } = useAuth();
  const { t, currentLang } = useLanguage();
  const { exchangeRate } = useCurrency();
  const router = useRouter();

  // ── Which shop receives this wallpaper?
  // Shopkeeper: their own shop. Admin: the shop opened via the Shops page /
  // header switcher. Without an opened shop, the form is blocked — this is
  // what makes "wallpapers/null/..." uploads impossible.
  const effectiveShopId = isAdmin ? (shopOverride || null) : shopId;

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [nameTab, setNameTab] = useState('uz');
  const [descTab, setDescTab] = useState('uz');
  const [images, setImages] = useState([]);
  const [arTexture, setArTexture] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

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
    if (!effectiveShopId) return;
    Promise.all([
      getDocs(query(collection(db, 'categories'), where('shopId', '==', effectiveShopId))),
      getDocs(query(collection(db, 'suppliers'), where('shopId', '==', effectiveShopId))),
    ]).then(([cats, sups]) => {
      setCategories(cats.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSuppliers(sups.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [effectiveShopId]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Centralized validation. Returns array of human-readable errors.
  const validationErrors = useMemo(() => {
    const errs = [];
    if (!form.nameUz.trim()) errs.push({ key: 'nameUz', msg: 'Name (Uzbek) is required' });
    if (!form.nameEn.trim()) errs.push({ key: 'nameEn', msg: 'Name (English) is required' });
    if (!form.sellPrice || Number(form.sellPrice) <= 0) {
      errs.push({ key: 'sellPrice', msg: 'Sell price must be greater than 0' });
    }
    if (!form.costPrice || Number(form.costPrice) <= 0) {
      errs.push({ key: 'costPrice', msg: 'Cost price must be greater than 0' });
    }
    if (Number(form.rollWidthCm) <= 0) {
      errs.push({ key: 'rollWidthCm', msg: 'Roll width must be greater than 0 cm' });
    }
    if (Number(form.rollLengthM) <= 0) {
      errs.push({ key: 'rollLengthM', msg: 'Roll length must be greater than 0 m' });
    }
    // Image validation — at least ONE image OR AR texture must exist
    if (images.length === 0 && !arTexture) {
      errs.push({
        key: 'images',
        msg: 'Upload at least one image (regular image or AR texture) — required for AR preview',
      });
    }
    return errs;
  }, [form, images, arTexture]);

  // AR readiness — what will actually be sent to mobile app
  const arReadiness = useMemo(() => {
    const hasArTexture = !!arTexture;
    const hasImage = images.length > 0;
    if (hasArTexture) {
      return { ready: true, source: 'ar_texture', label: 'AR Ready · using AR texture' };
    }
    if (hasImage) {
      return { ready: true, source: 'image_fallback', label: 'AR Ready · using first image as fallback' };
    }
    return { ready: false, source: 'none', label: 'Add at least one image to enable AR' };
  }, [images, arTexture]);

  const errorFor = (key) => {
    if (!touched) return null;
    return validationErrors.find((e) => e.key === key)?.msg || null;
  };

  const handleSave = async () => {
    if (!effectiveShopId) return;
    setTouched(true);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0].msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      await addWallpaper(
        effectiveShopId,
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
      toast.error(e?.message || t('common_error'));
    } finally {
      setSaving(false);
    }
  };

  // ── Admin with no shop opened: block the whole form so uploads can never
  //    target a null shop path.
  if (isAdmin && !effectiveShopId) {
    return (
      <Layout title={t('wallpapers_add')}>
        <div className="max-w-xl mx-auto mt-10 bg-card border border-primary/20 rounded-2xl p-8 text-center">
          <AlertTriangle size={36} className="text-primary mx-auto mb-4" />
          <h2 className="text-text-main font-bold text-lg mb-2">
            {currentLang === 'uz' ? 'Avval do\'konni oching' : 'Open a shop first'}
          </h2>
          <p className="text-subtext text-sm mb-6">
            {currentLang === 'uz'
              ? 'Oboy qo\'shish uchun Do\'konlar sahifasiga o\'ting va do\'konning "Ochish" tugmasini bosing.'
              : 'To add a wallpaper, go to the Shops page and press "Open" on the shop you want to manage.'}
          </p>
          <button
            onClick={() => router.push('/shops')}
            className="px-6 py-2.5 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all"
          >
            {currentLang === 'uz' ? 'Do\'konlarga o\'tish' : 'Go to Shops'}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('wallpapers_add')}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-subtext hover:text-text-main text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <ARChip arReadiness={arReadiness} />
        </div>

        {/* Validation summary banner — only shows after first save attempt */}
        {touched && validationErrors.length > 0 && (
          <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-error text-sm font-semibold">
              <AlertTriangle size={16} />
              Please fix the following before saving:
            </div>
            <ul className="text-error/90 text-xs ml-6 list-disc space-y-0.5">
              {validationErrors.map((e) => (
                <li key={e.key}>{e.msg}</li>
              ))}
            </ul>
          </div>
        )}

        {!isAdmin && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-sm">
            {t('wallpapers_pending_approval')} — Your wallpaper will be submitted for admin review.
          </div>
        )}

        {/* Name section */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-text-main font-semibold">{t('wallpapers_name')}</h3>
          <div className="flex gap-1 mb-0">
            <TabBtn label="O'zbek" active={nameTab === 'uz'} onClick={() => setNameTab('uz')} />
            <TabBtn label="English" active={nameTab === 'en'} onClick={() => setNameTab('en')} />
          </div>
          <div className="border border-white/10 rounded-b-lg rounded-tr-lg p-4 bg-surface space-y-4">
            {nameTab === 'uz' ? (
              <Field label={t('wallpapers_name_uz')} error={errorFor('nameUz')}>
                <input type="text" value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} />
              </Field>
            ) : (
              <Field label={t('wallpapers_name_en')} error={errorFor('nameEn')}>
                <input type="text" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
            )}
          </div>

          <h3 className="text-text-main font-semibold pt-2">{t('wallpapers_description')}</h3>
          <div className="flex gap-1">
            <TabBtn label="O'zbek" active={descTab === 'uz'} onClick={() => setDescTab('uz')} />
            <TabBtn label="English" active={descTab === 'en'} onClick={() => setDescTab('en')} />
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
            <Field
              label={t('wallpapers_sell_price')}
              hint={`≈ $${sellUSD} ${t('wallpapers_usd_equiv')}`}
              error={errorFor('sellPrice')}
            >
              <input
                type="number"
                min="0"
                value={form.sellPrice}
                onChange={(e) => set('sellPrice', e.target.value)}
              />
            </Field>
            <Field
              label={t('wallpapers_cost_price')}
              hint={`≈ $${costUSD} ${t('wallpapers_usd_equiv')}`}
              error={errorFor('costPrice')}
            >
              <input
                type="number"
                min="0"
                value={form.costPrice}
                onChange={(e) => set('costPrice', e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Roll specs */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h3 className="text-text-main font-semibold mb-4">Roll Specifications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label={t('wallpapers_roll_width')} error={errorFor('rollWidthCm')} hint="Standard: 53 cm">
              <input
                type="number"
                min="1"
                value={form.rollWidthCm}
                onChange={(e) => set('rollWidthCm', e.target.value)}
              />
            </Field>
            <Field label={t('wallpapers_roll_length')} error={errorFor('rollLengthM')} hint="Standard: 10 m">
              <input
                type="number"
                min="1"
                value={form.rollLengthM}
                onChange={(e) => set('rollLengthM', e.target.value)}
              />
            </Field>
            <Field label={t('wallpapers_roll_sqm')}>
              <input
                type="text"
                value={`${rollSqm} m²`}
                readOnly
                className="bg-dark/50 text-primary font-semibold cursor-default"
              />
            </Field>
            <Field label={t('wallpapers_pattern_repeat')} hint="Vertical pattern repeat (cm). Use 0 for non-repeating">
              <input
                type="number"
                min="0"
                value={form.patternRepeatCm}
                onChange={(e) => set('patternRepeatCm', e.target.value)}
              />
            </Field>
            <Field label={t('wallpapers_initial_stock')}>
              <input
                type="number"
                min="0"
                value={form.initialStock}
                onChange={(e) => set('initialStock', e.target.value)}
              />
            </Field>
            <Field label={t('wallpapers_low_stock_threshold')}>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => set('lowStockThreshold', e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Images section */}
        <div className="bg-card border border-white/5 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-text-main font-semibold">{t('wallpapers_images')}</h3>
            {images.length > 0 && (
              <span className="text-xs text-success flex items-center gap-1">
                <CheckCircle2 size={12} />
                {images.length} uploaded
              </span>
            )}
          </div>
          <ImageUpload
            multiple
            folder={`wallpapers/${effectiveShopId}`}
            existingUrls={images}
            onUpload={(urls) => setImages((prev) => [...prev, ...(Array.isArray(urls) ? urls : [urls])])}
            onRemove={(_, i) => setImages((prev) => prev.filter((_, j) => j !== i))}
          />
          {touched && errorFor('images') && (
            <p className="text-error text-xs flex items-center gap-1">
              <AlertTriangle size={12} />
              {errorFor('images')}
            </p>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <h3 className="text-text-main font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              {t('wallpapers_ar_texture')}
            </h3>
            {arTexture && (
              <span className="text-xs text-success flex items-center gap-1">
                <CheckCircle2 size={12} />
                AR Ready
              </span>
            )}
            {!arTexture && images.length > 0 && (
              <span className="text-xs text-yellow-400 flex items-center gap-1">
                <Info size={12} />
                Auto · using first image
              </span>
            )}
          </div>
          <p className="text-subtext text-xs -mt-2">
            High-resolution seamless tile of just the pattern. Used in mobile AR preview.
            If left empty, the first regular image will be used.
          </p>
          <ImageUpload
            folder={`ar-textures/${effectiveShopId}`}
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
              transition-all hover:shadow-glow-sm disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            {saving
              ? t('common_loading')
              : (isAdmin ? t('common_save') : t('wallpapers_pending_approval'))}
          </button>
        </div>
      </div>
    </Layout>
  );
}
