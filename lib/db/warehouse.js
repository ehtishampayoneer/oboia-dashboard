import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function getWarehouseData(shopId) {
  const q = query(
    collection(db, 'wallpapers'),
    where('shopId', '==', shopId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getLowStockItems(shopId) {
  const all = await getWarehouseData(shopId);
  return all.filter(
    (w) =>
      w.lowStockThreshold !== undefined &&
      w.stock !== undefined &&
      w.stock <= w.lowStockThreshold
  );
}

/**
 * Add stock to a wallpaper.
 * Creates a stock movement record and updates stock count.
 */
export async function addStock(shopId, wallpaperId, data, userId) {
  const { rolls, supplierId, purchasePrice, notes } = data;

  if (!rolls || rolls <= 0) throw new Error('INVALID_ROLLS');

  // Update wallpaper stock
  await updateDoc(doc(db, 'wallpapers', wallpaperId), {
    stock: increment(rolls),
    updatedAt: serverTimestamp(),
  });

  // Create stock movement
  const movRef = await addDoc(collection(db, 'stockMovements'), {
    shopId,
    wallpaperId,
    type: 'in',
    rolls,
    supplierId: supplierId || null,
    purchasePrice: purchasePrice || 0,
    notes: notes || '',
    reason: 'Manual stock addition',
    recordedBy: userId,
    createdAt: serverTimestamp(),
  });

  // If supplier provided, record purchase
  if (supplierId && purchasePrice > 0) {
    const totalCost = rolls * purchasePrice;
    await updateDoc(doc(db, 'suppliers', supplierId), {
      totalPurchased: increment(totalCost),
      debt: increment(totalCost),
      updatedAt: serverTimestamp(),
    });
  }

  return movRef.id;
}

export async function getStockMovements(shopId, wallpaperId = null) {
  let q = query(
    collection(db, 'stockMovements'),
    where('shopId', '==', shopId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (wallpaperId) {
    results = results.filter((m) => m.wallpaperId === wallpaperId);
  }
  return results;
}
