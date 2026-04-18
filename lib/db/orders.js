import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function getAllOrders(shopId, filters = {}) {
  let q = query(
    collection(db, 'orders'),
    where('shopId', '==', shopId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.status && filters.status !== 'all') {
    results = results.filter((o) => o.status === filters.status);
  }
  if (filters.branchId) {
    results = results.filter((o) => o.branchId === filters.branchId);
  }
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    results = results.filter((o) => o.createdAt?.toDate?.() >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    results = results.filter((o) => o.createdAt?.toDate?.() <= to);
  }
  return results;
}

export async function getOrderById(id) {
  const snap = await getDoc(doc(db, 'orders', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createOrder(shopId, data, userId) {
  const order = {
    ...data,
    shopId,
    status: 'pending',
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusHistory: [
      {
        status: 'pending',
        changedBy: userId,
        changedAt: new Date().toISOString(),
        reason: 'Order created',
      },
    ],
  };
  const ref = await addDoc(collection(db, 'orders'), order);
  return ref.id;
}

export async function updateOrderStatus(id, newStatus, userId, reason = '') {
  const orderRef = doc(db, 'orders', id);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) throw new Error('Order not found');

  const current = snap.data();
  const historyEntry = {
    status: newStatus,
    changedBy: userId,
    changedAt: new Date().toISOString(),
    reason,
  };

  await updateDoc(orderRef, {
    status: newStatus,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    statusHistory: [...(current.statusHistory || []), historyEntry],
  });
}

export async function assignOrder(id, employeeId, userId) {
  await updateDoc(doc(db, 'orders', id), {
    assignedTo: employeeId,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

export async function cancelOrder(id, reason, userId) {
  const orderRef = doc(db, 'orders', id);
  const snap = await getDoc(orderRef);
  const current = snap.data();

  await updateDoc(orderRef, {
    status: 'cancelled',
    cancellationReason: reason,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    statusHistory: [
      ...(current.statusHistory || []),
      {
        status: 'cancelled',
        changedBy: userId,
        changedAt: new Date().toISOString(),
        reason,
      },
    ],
  });
}
