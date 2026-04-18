import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Validate a shop token against the shops collection.
 * Returns the shop document data if valid and active, throws otherwise.
 */
export async function validateShopToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('INVALID_TOKEN');
  }

  const shopsRef = collection(db, 'shops');
  const q = query(shopsRef, where('token', '==', token.trim().toUpperCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('INVALID_TOKEN');
  }

  const shopDoc = snapshot.docs[0];
  const shopData = { id: shopDoc.id, ...shopDoc.data() };

  if (!shopData.isActive) {
    throw new Error('SHOP_INACTIVE');
  }

  return shopData;
}

/**
 * Login with shop token + email + password.
 * Validates token first, then authenticates.
 * Checks if user is blocked.
 * Returns { user, userDoc, shop }
 */
export async function loginWithToken(token, email, password) {
  // Step 1: Validate shop token
  const shop = await validateShopToken(token);

  // Step 2: Authenticate with Firebase Auth
  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (
      err.code === 'auth/wrong-password' ||
      err.code === 'auth/user-not-found' ||
      err.code === 'auth/invalid-credential'
    ) {
      throw new Error('WRONG_CREDENTIALS');
    }
    throw err;
  }

  const user = userCredential.user;

  // Step 3: Get user document from Firestore
  const userDocRef = doc(db, 'users', user.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    await signOut(auth);
    throw new Error('USER_NOT_FOUND');
  }

  const userDoc = { id: userDocSnap.id, ...userDocSnap.data() };

  // Step 4: Check if blocked
  if (userDoc.isBlocked) {
    await signOut(auth);
    throw new Error('USER_BLOCKED');
  }

  // Step 5: Check that user belongs to this shop
  if (userDoc.shopId !== shop.id && userDoc.role !== 'superadmin') {
    await signOut(auth);
    throw new Error('INVALID_TOKEN');
  }

  return { user, userDoc, shop };
}

/**
 * Logout the current user.
 */
export async function logout() {
  await signOut(auth);
  if (typeof window !== 'undefined') {
    localStorage.removeItem('wallar_lang');
    localStorage.removeItem('wallar_currency');
  }
}

/**
 * Get the current Firebase Auth user.
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Check if a user document is blocked.
 */
export async function isUserBlocked(uid) {
  const userDocRef = doc(db, 'users', uid);
  const snap = await getDoc(userDocRef);
  if (!snap.exists()) return true;
  return snap.data().isBlocked === true;
}

/**
 * Get full user profile from Firestore.
 */
export async function getUserProfile(uid) {
  const userDocRef = doc(db, 'users', uid);
  const snap = await getDoc(userDocRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
