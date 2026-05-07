import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

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
  const rollWidthM = (Number(data.rollWidth) || 53) / 100;   // cm → meters
  const rollLengthM = Number(data.rollLength) || 10;
  const sellPrice = Number(data.sellPrice) || 0;
  const pricePerSqm = rollWidthM * rollLengthM > 0
    ? sellPrice / (rollWidthM * rollLengthM)
    : 0;

  const wallpaper = {
    // Mobile app required fields
    name: data.nameEn || data.nameUz || 'Unnamed',
    description: data.descriptionEn || data.descriptionUz || '',
    category: data.categoryId || '',
    brand: data.brand || '',
    price: sellPrice,
    pricePerSqm: pricePerSqm,
    rollWidth: rollWidthM,
    rollLength: rollLengthM,
    stock: Number(data.initialStock) || 0,
    shopId: shopId,
    isApproved: isAdmin ? true : false,
    thumbnailUrl: data.images?.[0] || '',
    pbr: {
      albedoUrl: data.arTexture || data.images?.[0] || '',
      normalUrl: data.normalMap || '',
      roughnessUrl: data.roughnessMap || '',
      aoUrl: data.aoMap || '',
    },

    // Dashboard compatibility
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
  const updateData = { ...data, updatedAt: serverTimestamp(), updatedBy: userId };
  if (data.approvalStatus === 'approved') updateData.isApproved = true;
  else if (data.approvalStatus === 'rejected') updateData.isApproved = false;
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
  const wallpaper = snap.data();
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
