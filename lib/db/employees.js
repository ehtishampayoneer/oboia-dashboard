import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';

// Helper: if shopId is provided, filter by it; otherwise return all (for admin)
function applyShopFilter(q, shopId) {
  if (shopId) {
    return query(q, where('shopId', '==', shopId));
  }
  return q;
}

export async function getAllEmployees(shopId) {
  let q = collection(db, 'users');
  let qFiltered = applyShopFilter(q, shopId);
  const snap = await getDocs(qFiltered);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEmployeeById(id) {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addEmployee(shopId, data) {
  const { name, email, password, phone, role, branchId } = data;

  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
  } catch (err) {
    throw err;
  }

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
  let q = collection(db, 'sales');
  // For admin, we need to pass null to get all sales, but here we specifically want sales for this employee?
  // The function is called per employee, so we should not filter by shopId if we want cross‑shop sales? 
  // However, the original code filtered by shopId. To keep behavior consistent, we apply the same logic:
  // If shopId is provided, filter by it; otherwise (admin) get all sales for that employee across shops.
  let qFiltered = applyShopFilter(q, shopId);
  qFiltered = query(
    qFiltered,
    where('createdBy', '==', employeeId),
    where('status', '==', 'closed')
  );
  const snap = await getDocs(qFiltered);
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
