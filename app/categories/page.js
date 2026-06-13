'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import Layout from '../../components/Layout';
import ImageUpload from '../../components/ImageUpload';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

export default function CategoriesPage() {
  const { shopId, shopOverride, currentUser, isAdmin } = useAuth();
  const { t, currentLang } = useLanguage();

  // ── Which shop are we managing?
  // Shopkeeper: always their own shop. Admin: the shop opened via the
  // Shops page / header switcher; if none selected, admin sees ALL
  // categories (read-only overview) but cannot ADD until a shop is opened —
  // this is what killed the old "categories/null" upload bug and the
  // invisible no-shop categories.
  const effectiveShopId = isAdmin ? (shopOverride || null) : shopId;

  const noShopMsg = currentLang === 'uz'
    ? 'Avval Do\'konlar sahifasidan do\'konni oching'
    : 'Open a shop first (Shops page → Open)';

  const [categories, setCategories] = useState([]);
  const [wallpapers, setWallpapers] = useState([]);   // all wallpapers in this shop
  const [viewCat, setViewCat] = useState(null);       // category whose wallpapers we're viewing
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [form, setForm] = useState({ nameUz: '', nameEn: '', image: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Categories — filtered to the managed shop; admins with no shop
      // selected see everything. Sorting happens client-side so no
      // Firestore composite index is ever required.
      let snap;
      if (effectiveShopId) {
        snap = await getDocs(
          query(collection(db, 'categories'), where('shopId', '==', effectiveShopId))
        );
      } else if (isAdmin) {
        snap = await getDocs(collection(db, 'categories'));
      } else {
        setCategories([]);
        setLoading(false);
        return;
      }
      const cats = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      // Wallpaper counts per category (same shop scope)
      let wpSnap;
      if (effectiveShopId) {
        wpSnap = await getDocs(
          query(collection(db, 'wallpapers'), where('shopId', '==', effectiveShopId))
        );
      } else {
        wpSnap = await getDocs(collection(db, 'wallpapers'));
      }
      const wpList = wpSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWallpapers(wpList);
      const countMap = {};
      wpList.forEach((w) => {
        if (w.categoryId) countMap[w.categoryId] = (countMap[w.categoryId] || 0) + 1;
      });
      setCategories(cats.map((c) => ({ ...c, wallpaperCount: countMap[c.id] || 0 })));
    } catch (e) {
      console.error(e);
      toast.error(t('common_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [effectiveShopId, isAdmin]);

  const handleAdd = async () => {
    if (!effectiveShopId) { toast.error(noShopMsg); return; }
    if (!form.nameUz || !form.nameEn) { toast.error('Name required in both languages'); return; }
    setActionLoading(true);
    try {
      await addDoc(collection(db, 'categories'), {
        ...form,
        shopId: effectiveShopId,           // ★ NEVER null — every category belongs to a shop
        sortOrder: categories.length,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(t('categories_add_success'));
      setAddModal(false);
      setForm({ nameUz: '', nameEn: '', image: '' });
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'categories', editModal.id), {
        nameUz: editModal.nameUz,
        nameEn: editModal.nameEn,
        image: editModal.image,
        updatedAt: serverTimestamp(),
      });
      toast.success(t('categories_update_success'));
      setEditModal(null);
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    if (deleteModal.wallpaperCount > 0) {
      toast.error(t('categories_delete_warning'));
      setDeleteModal(null);
      return;
    }
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'categories', deleteModal.id));
      toast.success(t('categories_delete_success'));
      setDeleteModal(null);
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async (targetIdx) => {
    if (dragging === null || dragging === targetIdx) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(dragging, 1);
    reordered.splice(targetIdx, 0, moved);
    setCategories(reordered);
    setDragging(null);
    setDragOver(null);
    for (let i = 0; i < reordered.length; i++) {
      await updateDoc(doc(db, 'categories', reordered[i].id), { sortOrder: i });
    }
  };

  return (
    <Layout title={t('categories_title')}>
      {/* Admin with no shop opened — friendly guidance banner */}
      {isAdmin && !effectiveShopId && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={16} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-subtext">{noShopMsg}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-subtext text-sm">{t('categories_drag_reorder')}</p>
        <button
          onClick={() => {
            if (!effectiveShopId) { toast.error(noShopMsg); return; }
            setForm({ nameUz: '', nameEn: '', image: '' });
            setAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
            text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
        >
          <Plus size={16} />
          {t('categories_add')}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-white/5 rounded-xl p-4 h-36 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat, idx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => setDragging(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
              className={`bg-card border rounded-xl overflow-hidden transition-all cursor-grab active:cursor-grabbing
                ${dragOver === idx ? 'border-primary shadow-glow-sm scale-[1.02]' : 'border-white/5 hover:border-white/10'}
                ${dragging === idx ? 'opacity-50' : ''}`}
            >
              {/* Image */}
              <div className="h-28 bg-surface relative overflow-hidden">
                {cat.image ? (
                  <img src={cat.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-subtext text-3xl">🏷️</span>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <GripVertical size={16} className="text-white/40" />
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-text-main font-semibold truncate">
                  {currentLang === 'uz' ? cat.nameUz : cat.nameEn}
                </p>
                <p className="text-subtext text-xs mt-0.5">
                  {cat.wallpaperCount} {t('categories_wallpaper_count')}
                </p>
                <button
                  onClick={() => setViewCat(cat)}
                  className="w-full mb-2 py-1.5 text-xs rounded-lg bg-primary/10 text-primary
                    hover:bg-primary/20 transition-all text-center font-semibold"
                >
                  View {cat.wallpaperCount} wallpaper{cat.wallpaperCount === 1 ? '' : 's'}
                </button>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setEditModal({ ...cat })}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all text-center"
                  >
                    <Edit2 size={12} className="inline mr-1" />
                    {t('common_edit')}
                  </button>
                  <button
                    onClick={() => setDeleteModal(cat)}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-red-500/10 text-error hover:bg-red-500/20 transition-all text-center"
                  >
                    <Trash2 size={12} className="inline mr-1" />
                    {t('common_delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('categories_add')}</h2>
              <button onClick={() => setAddModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('categories_name_uz')}</label>
                <input type="text" value={form.nameUz} onChange={(e) => setForm((f) => ({ ...f, nameUz: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('categories_name_en')}</label>
                <input type="text" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
              </div>
              <ImageUpload
                folder={`categories/${effectiveShopId}`}
                existingUrls={form.image ? [form.image] : []}
                onUpload={(url) => setForm((f) => ({ ...f, image: Array.isArray(url) ? url[0] : url }))}
                onRemove={() => setForm((f) => ({ ...f, image: '' }))}
                label={t('categories_image')}
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setAddModal(false)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handleAdd} disabled={actionLoading} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('common_edit')}</h2>
              <button onClick={() => setEditModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('categories_name_uz')}</label>
                <input type="text" value={editModal.nameUz} onChange={(e) => setEditModal((m) => ({ ...m, nameUz: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('categories_name_en')}</label>
                <input type="text" value={editModal.nameEn} onChange={(e) => setEditModal((m) => ({ ...m, nameEn: e.target.value }))} />
              </div>
              <ImageUpload
                folder={`categories/${editModal.shopId || effectiveShopId}`}
                existingUrls={editModal.image ? [editModal.image] : []}
                onUpload={(url) => setEditModal((m) => ({ ...m, image: Array.isArray(url) ? url[0] : url }))}
                onRemove={() => setEditModal((m) => ({ ...m, image: '' }))}
                label={t('categories_image')}
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">{t('common_cancel')}</button>
              <button onClick={handleEdit} disabled={actionLoading} className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50">
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category wallpapers viewer */}
      {viewCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-card border border-white/10 rounded-2xl shadow-card max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div>
                <h3 className="text-text-main font-bold">
                  {currentLang === 'uz' ? viewCat.nameUz : viewCat.nameEn}
                </h3>
                <p className="text-subtext text-xs mt-0.5">Wallpapers in this category</p>
              </div>
              <button onClick={() => setViewCat(null)} className="text-subtext hover:text-text-main text-xl">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {(() => {
                const inCat = wallpapers.filter((w) => w.categoryId === viewCat.id);
                if (inCat.length === 0) {
                  return (
                    <div className="text-center py-10 text-subtext text-sm">
                      No wallpapers in this category yet.
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {inCat.map((w) => (
                      <div key={w.id} className="bg-surface border border-white/5 rounded-xl overflow-hidden">
                        <div className="h-24 bg-dark">
                          {w.images?.[0] || w.thumbnailUrl ? (
                            <img src={w.images?.[0] || w.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-subtext text-xs">—</div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-text-main text-sm font-medium truncate">
                            {currentLang === 'uz' ? (w.nameUz || w.nameEn) : (w.nameEn || w.nameUz)}
                          </p>
                          <p className="text-subtext text-[11px] mt-0.5 capitalize">
                            {w.approvalStatus || 'pending'} · {w.stock || 0} rolls
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="px-5 py-4 border-t border-white/5 text-right">
              <button
                onClick={() => setViewCat(null)}
                className="px-5 py-2 bg-surface text-text-main text-sm rounded-lg border border-white/10 hover:bg-white/5"
              >
                {t('common_cancel') || 'Close'}
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
        message={deleteModal?.wallpaperCount > 0 ? t('categories_delete_warning') : t('common_delete_confirm')}
        danger={!deleteModal?.wallpaperCount}
        loading={actionLoading}
      />
    </Layout>
  );
}
