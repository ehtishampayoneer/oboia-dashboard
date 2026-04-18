import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function getAllWallpapers(shopId, filters = {}) {
  let q = query(
    collection(db, 'wallpapers'),
    where('shopId', '==', shopId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
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
        w.nameEn?.toLowerCase().includes(q2)
    );
  }
  return results;
}

export async function getPendingWallpapers(shopId) {
  const q = query(
    collection(db, 'wallpapers'),
    where('shopId', '==', shopId),
    where('approvalStatus', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWallpaperById(id) {
  const snap = await getDoc(doc(db, 'wallpapers', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addWallpaper(shopId, data, userId, isAdmin) {
  const wallpaper = {
    ...data,
    shopId,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalStatus: isAdmin ? 'approved' : 'pending',
    status: 'active',
    stock: data.initialStock || 0,
    soldTotal: 0,
  };
  const ref = await addDoc(collection(db, 'wallpapers'), wallpaper);
  return ref.id;
}

export async function updateWallpaper(id, data, userId) {
  await updateDoc(doc(db, 'wallpapers', id), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function updatePrice(id, wallpaperId, shopId, oldPrice, newPrice, reason, userId) {
  // Save to price history
  await addDoc(collection(db, 'priceHistory'), {
    wallpaperId,
    shopId,
    oldPrice,
    newPrice,
    reason: reason || '',
    changedBy: userId,
    changedAt: serverTimestamp(),
  });

  // Update wallpaper sell price
  await updateDoc(doc(db, 'wallpapers', wallpaperId), {
    sellPrice: newPrice,
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
    approvedBy: userId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectWallpaper(id, reason, userId) {
  await updateDoc(doc(db, 'wallpapers', id), {
    approvalStatus: 'rejected',
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
  const snap = await getDocs(
    query(collection(db, 'wallpapers'), where('shopId', '==', shopId))
  );
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter(
    (w) => w.stock !== undefined && w.lowStockThreshold !== undefined && w.stock <= w.lowStockThreshold
  );
}
