// lib/db/employees.js
//
// Data layer for employees (shop staff). Employees are documents in the
// `users` collection with a role of 'seller' or 'manager', scoped to a shop
// via shopId.
//
// SECURITY (important):
//   • This module will ONLY ever create users with role 'seller' or 'manager'.
//     It can NEVER create 'admin' or 'superadmin'. Platform-admin accounts are
//     created exclusively in the Firebase console by the platform owner. This
//     prevents a shopkeeper from minting a platform administrator.
//   • Creating an employee uses a SECONDARY Firebase app instance, so the
//     person creating the employee is NOT signed out / swapped into the new
//     account (which is what the default client SDK does).

import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { db, firebaseConfig } from '../firebase';

// Roles an employee is allowed to have. Anything else is rejected.
const ALLOWED_EMPLOYEE_ROLES = ['seller', 'manager'];

// ─────────────────────────────────────────────────────────────────────────
// READ: list employees
//   effectiveShopId === null  → all employees (platform admin view)
//   effectiveShopId === 'xyz' → only that shop's employees (seller view)
// Only returns shop staff (seller/manager); never admin/superadmin accounts.
// ─────────────────────────────────────────────────────────────────────────
export async function getAllEmployees(effectiveShopId) {
  const usersRef = collection(db, 'users');
  let snap;
  if (effectiveShopId) {
    snap = await getDocs(query(usersRef, where('shopId', '==', effectiveShopId)));
  } else {
    snap = await getDocs(usersRef);
  }

  return snap.docs
    .map((d) => ({ id: d.id, uid: d.id, ...d.data() }))
    // Show only shop staff. Hide platform admins and any non-staff docs.
    .filter((u) => ALLOWED_EMPLOYEE_ROLES.includes(u.role));
}

// ─────────────────────────────────────────────────────────────────────────
// CREATE: add an employee
//   • role is forced into the allowed set (security).
//   • uses a secondary Firebase app so the CURRENT admin stays logged in.
// ─────────────────────────────────────────────────────────────────────────
export async function addEmployee(shopId, form) {
  const { name, email, phone, password, branchId } = form;

  if (!name || !email || !password) {
    throw new Error('Name, email and password are required');
  }
  if (!shopId) {
    // An employee must belong to a shop. For admins this means a shop must be
    // open; the page guards this, but we double-check here.
    throw new Error('Open a shop before adding an employee');
  }

  // SECURITY: never allow creating a platform admin from this screen.
  let role = (form.role || 'seller').toLowerCase();
  if (!ALLOWED_EMPLOYEE_ROLES.includes(role)) {
    role = 'seller';
  }

  // Create the auth account on a SECONDARY app so the primary session (the
  // admin/seller doing this) is not replaced by the new user.
  const secondaryName = `employee-creator-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  let newUid;
  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth, email.trim(), password
    );
    newUid = cred.user.uid;
    // Sign the secondary app out immediately; we only needed it to create.
    await signOut(secondaryAuth);
  } catch (err) {
    // Surface friendly errors
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('That email is already registered');
    }
    if (err.code === 'auth/weak-password') {
      throw new Error('Password should be at least 6 characters');
    }
    if (err.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address');
    }
    throw new Error(err.message || 'Could not create employee');
  } finally {
    // Clean up the secondary app so it doesn't linger.
    try { await deleteApp(secondaryApp); } catch (_) {}
  }

  // Write the user profile document keyed by the new UID.
  await setDoc(doc(db, 'users', newUid), {
    uid: newUid,
    name: name.trim(),
    email: email.trim(),
    phone: (phone || '').trim(),
    role,                        // 'seller' or 'manager' only
    shopId,                      // always tied to the creating shop
    branchId: branchId || null,
    isBlocked: false,
    createdAt: serverTimestamp(),
  });

  return { uid: newUid };
}

// ─────────────────────────────────────────────────────────────────────────
// READ: one employee by id (kept from the original module for compatibility)
// ─────────────────────────────────────────────────────────────────────────
export async function getEmployeeById(id) {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return { id: snap.id, uid: snap.id, ...snap.data() };
}

// ─────────────────────────────────────────────────────────────────────────
// UPDATE: edit an employee's profile.
//   SECURITY: role can only ever be set to an allowed employee role. Any
//   attempt to set 'admin'/'superadmin' is downgraded to 'seller'.
// ─────────────────────────────────────────────────────────────────────────
export async function updateEmployee(id, data) {
  const patch = { ...data, updatedAt: serverTimestamp() };
  if (patch.role !== undefined && !ALLOWED_EMPLOYEE_ROLES.includes(patch.role)) {
    patch.role = 'seller';
  }
  await updateDoc(doc(db, 'users', id), patch);
}

// ─────────────────────────────────────────────────────────────────────────
// UPDATE: block / unblock
// ─────────────────────────────────────────────────────────────────────────
export async function toggleBlock(userId, isBlocked) {
  await updateDoc(doc(db, 'users', userId), {
    isBlocked: !!isBlocked,
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE: remove the employee's profile document.
//   NOTE: This removes their dashboard profile and access. Their Firebase
//   Auth login is not removed by client code (that needs admin privileges);
//   blocking already prevents login. Their past sales remain in `sales`.
// ─────────────────────────────────────────────────────────────────────────
export async function deleteEmployee(userId) {
  await deleteDoc(doc(db, 'users', userId));
}

// ─────────────────────────────────────────────────────────────────────────
// READ: one employee's sales performance.
//   Matches the `sales` schema used across the dashboard:
//   sales: { shopId, createdBy(uid), totalAmount, totalCost, status:'closed',
//            receiptNumber, closedAt }
// ─────────────────────────────────────────────────────────────────────────
export async function getEmployeePerformance(uid, effectiveShopId) {
  const salesRef = collection(db, 'sales');

  const filters = [where('createdBy', '==', uid), where('status', '==', 'closed')];
  if (effectiveShopId) {
    filters.push(where('shopId', '==', effectiveShopId));
  }

  const snap = await getDocs(query(salesRef, ...filters));
  const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let revenue = 0;
  let cost = 0;
  for (const s of sales) {
    revenue += s.totalAmount || 0;
    cost += s.totalCost || 0;
  }

  // Newest first for the list
  sales.sort((a, b) => {
    const da = a.closedAt?.toDate?.()?.getTime?.() || 0;
    const dbt = b.closedAt?.toDate?.()?.getTime?.() || 0;
    return dbt - da;
  });

  return {
    count: sales.length,
    revenue,
    profit: revenue - cost,
    sales,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// (Optional helper) Reset / set a new password is NOT done here because the
// client SDK cannot change another user's password without being signed in as
// them. Use the Firebase console, or a Cloud Function with the Admin SDK, for
// password resets. Blocking is the safe client-side control.
// ─────────────────────────────────────────────────────────────────────────
