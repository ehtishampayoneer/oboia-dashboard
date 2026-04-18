import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';

export async function getAllEmployees(shopId) {
  const q = query(
    collection(db, 'users'),
    where('shopId', '==', shopId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEmployeeById(id) {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addEmployee(shopId, data) {
  // Create Firebase Auth user
  const { name, email, password, phone, role, branchId } = data;

  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
  } catch (err) {
    throw err;
  }

  // Create Firestore user document
  await addDoc(collection(db, 'users'), {
    uid,
    shopId,
    name,
    email,
    phone: phone || '',
    role: role || 'seller',
    branchId: branchId || null,
    isBlocked: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return uid;
}

export async function updateEmployee(id, data) {
  await updateDoc(doc(db, 'users', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleBlock(id, isBlocked) {
  await updateDoc(doc(db, 'users', id), {
    isBlocked,
    updatedAt: serverTimestamp(),
  });
}

export async function getEmployeePerformance(employeeId, shopId) {
  const q = query(
    collection(db, 'sales'),
    where('shopId', '==', shopId),
    where('createdBy', '==', employeeId),
    where('status', '==', 'closed')
  );
  const snap = await getDocs(q);
  const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const totalRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.totalCost || 0), 0);

  return {
    count: sales.length,
    revenue: totalRevenue,
    profit: totalRevenue - totalCost,
    sales,
  };
}
