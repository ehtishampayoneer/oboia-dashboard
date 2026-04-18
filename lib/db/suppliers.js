import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function getAllSuppliers(shopId) {
  const q = query(
    collection(db, 'suppliers'),
    where('shopId', '==', shopId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
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

/**
 * Record a payment to a supplier.
 * Reduces debt and creates a transaction record.
 */
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
  const q = query(
    collection(db, 'wallpapers'),
    where('shopId', '==', shopId),
    where('supplierId', '==', supplierId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
