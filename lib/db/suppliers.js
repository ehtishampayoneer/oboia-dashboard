import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
// Helper: if shopId is provided, filter by it; otherwise return all (for admin)
function applyShopFilter(q, shopId) {
  if (shopId) {
    return query(q, where('shopId', '==', shopId), orderBy('createdAt', 'desc'));
  }
  return query(q, orderBy('createdAt', 'desc'));
}
export async function getAllSuppliers(shopId) {
  let q = collection(db, 'suppliers');
  let qFiltered = applyShopFilter(q, shopId);
  const snap = await getDocs(qFiltered);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function getSupplierById(id) {
  const snap = await getDoc(doc(db, 'suppliers', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
export async function addSupplier(shopId, data, userId) {
  const ref = await addDoc(collection(db, 'suppliers'), {
    ...data,
    shopId,
    totalPurchased: 0,
    totalPaid: 0,
    debt: 0,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
export async function updateSupplier(id, data) {
  await updateDoc(doc(db, 'suppliers', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
// ─────────────────────────────────────────────────────────────────────────
// DELETE a supplier — permanently removes the document.
// BUSINESS RULE: refuse if the supplier still has outstanding debt, so we
// never erase money owed. Caller should clear the balance first.
// Throws 'HAS_OUTSTANDING_DEBT' so the UI can show the right message.
// ─────────────────────────────────────────────────────────────────────────
export async function deleteSupplier(id) {
  const ref = doc(db, 'suppliers', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Supplier not found');
  const data = snap.data();
  if ((data.debt || 0) > 0) {
    throw new Error('HAS_OUTSTANDING_DEBT');
  }
  await deleteDoc(ref);
}
export async function recordPayment(supplierId, shopId, amount, userId) {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const snap = await getDoc(supplierRef);
  if (!snap.exists()) throw new Error('Supplier not found');
  await updateDoc(supplierRef, {
    totalPaid: increment(amount),
    debt: increment(-amount),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'supplierTransactions'), {
    shopId,
    supplierId,
    type: 'payment',
    amount,
    paidBy: userId,
    createdAt: serverTimestamp(),
  });
}
export async function getSupplierTransactions(supplierId) {
  const q = query(
    collection(db, 'supplierTransactions'),
    where('supplierId', '==', supplierId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function getSupplierProducts(shopId, supplierId) {
  let q = collection(db, 'wallpapers');
  if (shopId) {
    q = query(q, where('shopId', '==', shopId), where('supplierId', '==', supplierId));
  } else {
    q = query(q, where('supplierId', '==', supplierId));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
