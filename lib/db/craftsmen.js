import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function getAllCraftsmen(shopId) {
  const q = query(
    collection(db, 'craftsmen'),
    where('shopId', '==', shopId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCraftsmanById(id) {
  const snap = await getDoc(doc(db, 'craftsmen', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addCraftsman(shopId, data, userId) {
  const ref = await addDoc(collection(db, 'craftsmen'), {
    ...data,
    shopId,
    totalEarned: 0,
    totalPaid: 0,
    pendingBalance: 0,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Pay a bonus to a craftsman.
 * BUSINESS RULE: Amount cannot exceed pending balance.
 */
export async function payBonus(craftsmanId, shopId, amount, userId) {
  const craftsmanRef = doc(db, 'craftsmen', craftsmanId);
  const snap = await getDoc(craftsmanRef);
  if (!snap.exists()) throw new Error('Craftsman not found');

  const data = snap.data();
  if (amount > data.pendingBalance) {
    throw new Error('AMOUNT_EXCEEDS_BALANCE');
  }

  await updateDoc(craftsmanRef, {
    totalPaid: increment(amount),
    pendingBalance: increment(-amount),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'bonusTransactions'), {
    shopId,
    craftsmanId,
    type: 'paid',
    amount,
    paidBy: userId,
    createdAt: serverTimestamp(),
  });
}

export async function getBonusHistory(craftsmanId) {
  const q = query(
    collection(db, 'bonusTransactions'),
    where('craftsmanId', '==', craftsmanId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
