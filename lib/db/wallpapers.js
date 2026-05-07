import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─────────────────────────────────────────────────────────────────────────
// Defensive URL cleaning. The mobile app had to add the same fix on the
// read side because old documents in Firestore have URLs wrapped in literal
// quote characters: `"https://..."`. We strip quotes here on the write
// side too so the bug can never come back, regardless of source.
// ─────────────────────────────────────────────────────────────────────────
function cleanUrl(value) {
  if (typeof value !== 'string') return '';
  // Strip leading/trailing whitespace, then strip wrapping single or double quotes.
  return value.trim().replace(/^["']+|["']+$/g, '');
}

// Helper: if shopId is provided, filter by it; otherwise return all (for admin)
function applyShopFilter(q, shopId) {
  if (shopId) {
    return query(q, where('shopId', '==', shopId));
  }
  return q;
}

export async function getAllWallpapers(shopId, filters = {}) {
  let q = collection(db, 'wallpapers');
  let qFiltered = applyShopFilter(q, shopId);
  qFiltered = query(qFiltered, orderBy('createdAt', 'desc'));

  const snap = await getDocs(qFiltered);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.categoryId) {
    results = results.filter((w) => w.categoryId === filters.categoryId);
  }
  if (filters.status) {
    results = results.filter((w) => w.status === filters.status);
  }
  if (filters.approvalStatus) {
    results = results.filter((w) => w.approvalStatus === filters.approvalStatus);
  }
  if (filters.search) {
    const q2 = filters.search.toLowerCase();
    results = results.filter(
      (w) =>
        w.nameUz?.toLowerCase().includes(q2) ||
        w.nameEn?.toLowerCase().includes(q2) ||
        w.name?.toLowerCase().includes(q2)
    );
  }
  return results;
}

export async function getPendingWallpapers(shopId) {
  let q = collection(db, 'wallpapers');
  let qFiltered = applyShopFilter(q, shopId);
  qFiltered = query(
    qFiltered,
    where('approvalStatus', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(qFiltered);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWallpaperById(id) {
  const snap = await getDoc(doc(db, 'wallpapers', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addWallpaper(shopId, data, userId, isAdmin) {
  // ── CHANGED: Read both new and legacy field names so the form/db contract
  // can never silently mismatch again. Form currently sends rollWidthCm and
  // rollLengthM. Older callers may send rollWidth (in meters) and rollLength.
  const rollWidthCmRaw = data.rollWidthCm ?? (data.rollWidth ? data.rollWidth * 100 : 53);
  const rollLengthMRaw = data.rollLengthM ?? data.rollLength ?? 10;

  const rollWidthM = Number(rollWidthCmRaw) / 100;   // cm → meters
  const rollLengthM = Number(rollLengthMRaw);
  const sellPrice = Number(data.sellPrice) || 0;
  const costPrice = Number(data.costPrice) || 0;
  const pricePerSqm = (rollWidthM * rollLengthM > 0)
    ? sellPrice / (rollWidthM * rollLengthM)
    : 0;

  // ── CHANGED: Clean every URL on write. Empty strings stay empty.
  const thumbnailUrl = cleanUrl(data.images?.[0]);
  const albedoUrl = cleanUrl(data.arTexture) || thumbnailUrl;
  const normalUrl = cleanUrl(data.normalMap);
  const roughnessUrl = cleanUrl(data.roughnessMap);
  const aoUrl = cleanUrl(data.aoMap);

  // ── CHANGED: Validate the wallpaper has a usable image. Saving a wallpaper
  // with no image = guaranteed AR failure later. Better to fail loudly here.
  if (!albedoUrl) {
    throw new Error('Wallpaper requires at least one image (regular image or AR texture).');
  }

  // ── CHANGED: Multi-field name fallback so AR always shows something
  const name = data.nameEn || data.nameUz || data.name || 'Unnamed';

  const wallpaper = {
    // Mobile app required fields
    name,
    description: data.descriptionEn || data.descriptionUz || '',
    category: data.categoryId || '',
    brand: data.brand || '',
    price: sellPrice,
    pricePerSqm,
    rollWidth: rollWidthM,
    rollLength: rollLengthM,
    stock: Number(data.initialStock) || 0,
    shopId,
    isApproved: !!isAdmin,
    thumbnailUrl,
    pbr: {
      albedoUrl,
      normalUrl,
      roughnessUrl,
      aoUrl,
    },

    // Dashboard compatibility
    nameUz: data.nameUz || '',
    nameEn: data.nameEn || '',
    descriptionUz: data.descriptionUz || '',
    descriptionEn: data.descriptionEn || '',
    categoryId: data.categoryId || '',
    supplierId: data.supplierId || '',
    sellPrice,
    costPrice,
    rollWidthCm: Number(rollWidthCmRaw),
    rollLengthM: Number(rollLengthMRaw),
    patternRepeatCm: Number(data.patternRepeatCm) || 0,
    initialStock: Number(data.initialStock) || 0,
    lowStockThreshold: Number(data.lowStockThreshold) || 5,
    images: Array.isArray(data.images) ? data.images.map(cleanUrl).filter(Boolean) : [],
    arTexture: albedoUrl,
    isActive: data.isActive !== false,
    approvalStatus: isAdmin ? 'approved' : 'pending',
    status: 'active',
    processingStatus: isAdmin ? 'complete' : 'pending',

    // Metadata
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'wallpapers'), wallpaper);
  return ref.id;
}

export async function updateWallpaper(id, data, userId) {
  // ── CHANGED: Clean any URL fields that come through edits.
  const updateData = { ...data, updatedAt: serverTimestamp(), updatedBy: userId };

  if (typeof updateData.thumbnailUrl === 'string') {
    updateData.thumbnailUrl = cleanUrl(updateData.thumbnailUrl);
  }
  if (Array.isArray(updateData.images)) {
    updateData.images = updateData.images.map(cleanUrl).filter(Boolean);
  }
  if (typeof updateData.arTexture === 'string') {
    updateData.arTexture = cleanUrl(updateData.arTexture);
  }
  if (updateData.pbr && typeof updateData.pbr === 'object') {
    updateData.pbr = {
      albedoUrl: cleanUrl(updateData.pbr.albedoUrl),
      normalUrl: cleanUrl(updateData.pbr.normalUrl),
      roughnessUrl: cleanUrl(updateData.pbr.roughnessUrl),
      aoUrl: cleanUrl(updateData.pbr.aoUrl),
    };
  }

  // Mirror dashboard approval status to mobile-app field
  if (data.approvalStatus === 'approved') updateData.isApproved = true;
  else if (data.approvalStatus === 'rejected') updateData.isApproved = false;

  // ── CHANGED: Recompute pricePerSqm if dimensions or price changed.
  if (data.sellPrice !== undefined || data.rollWidthCm !== undefined || data.rollLengthM !== undefined) {
    const snap = await getDoc(doc(db, 'wallpapers', id));
    const existing = snap.exists() ? snap.data() : {};
    const sellPrice = Number(data.sellPrice ?? existing.sellPrice ?? existing.price ?? 0);
    const widthCm = Number(data.rollWidthCm ?? existing.rollWidthCm ?? (existing.rollWidth ? existing.rollWidth * 100 : 53));
    const lengthM = Number(data.rollLengthM ?? existing.rollLengthM ?? existing.rollLength ?? 10);
    const widthM = widthCm / 100;
    const area = widthM * lengthM;
    if (area > 0) {
      updateData.price = sellPrice;
      updateData.pricePerSqm = sellPrice / area;
      updateData.rollWidth = widthM;
      updateData.rollLength = lengthM;
    }
  }

  await updateDoc(doc(db, 'wallpapers', id), updateData);
}

export async function updatePrice(id, wallpaperId, shopId, oldPrice, newPrice, reason, userId) {
  await addDoc(collection(db, 'priceHistory'), {
    wallpaperId,
    shopId,
    oldPrice,
    newPrice,
    reason: reason || '',
    changedBy: userId,
    changedAt: serverTimestamp(),
  });

  const wallpaperRef = doc(db, 'wallpapers', wallpaperId);
  const snap = await getDoc(wallpaperRef);
  const wallpaper = snap.data() || {};
  const rollArea = (wallpaper.rollWidth || 0.53) * (wallpaper.rollLength || 10);
  const newPricePerSqm = rollArea > 0 ? newPrice / rollArea : 0;

  await updateDoc(wallpaperRef, {
    sellPrice: newPrice,
    price: newPrice,
    pricePerSqm: newPricePerSqm,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function getPriceHistory(wallpaperId) {
  const q = query(
    collection(db, 'priceHistory'),
    where('wallpaperId', '==', wallpaperId),
    orderBy('changedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function approveWallpaper(id, userId) {
  await updateDoc(doc(db, 'wallpapers', id), {
    approvalStatus: 'approved',
    isApproved: true,
    approvedBy: userId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectWallpaper(id, reason, userId) {
  await updateDoc(doc(db, 'wallpapers', id), {
    approvalStatus: 'rejected',
    isApproved: false,
    rejectionReason: reason,
    rejectedBy: userId,
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWallpaper(id) {
  await deleteDoc(doc(db, 'wallpapers', id));
}

export async function reduceStock(wallpaperId, rolls, saleId, userId) {
  await updateDoc(doc(db, 'wallpapers', wallpaperId), {
    stock: increment(-rolls),
    soldTotal: increment(rolls),
    updatedAt: serverTimestamp(),
  });
}

export async function increaseStock(wallpaperId, rolls) {
  await updateDoc(doc(db, 'wallpapers', wallpaperId), {
    stock: increment(rolls),
    soldTotal: increment(-rolls),
    updatedAt: serverTimestamp(),
  });
}

export async function getLowStockWallpapers(shopId) {
  let q = collection(db, 'wallpapers');
  let qFiltered = applyShopFilter(q, shopId);
  const snap = await getDocs(qFiltered);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter(
    (w) => w.stock !== undefined && w.lowStockThreshold !== undefined && w.stock <= w.lowStockThreshold
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CHANGED: One-time helper to retroactively clean existing wallpapers in
// Firestore. Call this once from a dashboard admin tool or a script if you
// want to clean old documents that have quoted URLs. Safe to run multiple
// times — idempotent.
// ─────────────────────────────────────────────────────────────────────────
export async function cleanAllWallpaperUrls(shopId = null) {
  let q = collection(db, 'wallpapers');
  let qFiltered = applyShopFilter(q, shopId);
  const snap = await getDocs(qFiltered);
  let cleaned = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const update = {};
    let needs = false;

    const t = cleanUrl(data.thumbnailUrl);
    if (t !== data.thumbnailUrl) { update.thumbnailUrl = t; needs = true; }

    const a = cleanUrl(data.arTexture);
    if (a !== data.arTexture) { update.arTexture = a; needs = true; }

    if (Array.isArray(data.images)) {
      const imgs = data.images.map(cleanUrl).filter(Boolean);
      if (JSON.stringify(imgs) !== JSON.stringify(data.images)) {
        update.images = imgs;
        needs = true;
      }
    }

    if (data.pbr && typeof data.pbr === 'object') {
      const pbr = {
        albedoUrl: cleanUrl(data.pbr.albedoUrl),
        normalUrl: cleanUrl(data.pbr.normalUrl),
        roughnessUrl: cleanUrl(data.pbr.roughnessUrl),
        aoUrl: cleanUrl(data.pbr.aoUrl),
      };
      if (JSON.stringify(pbr) !== JSON.stringify(data.pbr)) {
        update.pbr = pbr;
        needs = true;
      }
    }

    if (needs) {
      await updateDoc(doc(db, 'wallpapers', d.id), update);
      cleaned++;
    }
  }
  return cleaned;
}
