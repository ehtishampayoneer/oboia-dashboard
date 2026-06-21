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

// Normalise a token for comparison: uppercase, trim, collapse internal spaces,
// and convert any unicode dash variants to a plain hyphen. This makes the
// token check tolerant of copy-paste artefacts (en-dashes, non-breaking
// spaces, trailing spaces) that otherwise cause "Invalid shop token" even when
// the value looks identical.
function normalizeToken(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[\u2010-\u2015\u2212]/g, '-') // various dashes → hyphen
    .replace(/\u00A0/g, ' ')                // non-breaking space → space
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');                    // remove any inner whitespace
}

/**
 * Validate a shop token against the shops collection.
 * Returns the shop document data if valid and active, throws otherwise.
 *
 * Robust matching: first tries an exact indexed query; if that finds nothing
 * (e.g. the stored token has a stray space or odd dash), it falls back to
 * scanning shops and matching on the normalised token client-side.
 */
export async function validateShopToken(token) {
  const wanted = normalizeToken(token);
  if (!wanted) {
    throw new Error('INVALID_TOKEN');
  }

  const shopsRef = collection(db, 'shops');

  // 1) Fast path: exact match on the stored value.
  let shopData = null;
  try {
    const q = query(shopsRef, where('token', '==', wanted));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const d = snapshot.docs[0];
      shopData = { id: d.id, ...d.data() };
    }
  } catch (_) {
    // ignore and try the fallback below
  }

  // 2) Fallback: scan and compare normalised tokens (handles stray
  //    spaces / dash variants stored in the DB).
  if (!shopData) {
    const all = await getDocs(shopsRef);
    for (const d of all.docs) {
      const data = d.data();
      if (normalizeToken(data.token) === wanted) {
        shopData = { id: d.id, ...data };
        break;
      }
    }
  }

  if (!shopData) {
    throw new Error('INVALID_TOKEN');
  }
  if (shopData.isActive === false) {
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

  // Step 3: Get user document from Firestore. Prefer the doc keyed by UID;
  // fall back to an email lookup for older accounts whose doc ID isn't the UID.
  const userDocRef = doc(db, 'users', user.uid);
  let userDocSnap = await getDoc(userDocRef);
  let userDoc = null;
  if (userDocSnap.exists()) {
    userDoc = { id: userDocSnap.id, ...userDocSnap.data() };
  } else {
    const byEmail = await getDocs(
      query(collection(db, 'users'), where('email', '==', email))
    );
    if (!byEmail.empty) {
      const d = byEmail.docs[0];
      userDoc = { id: d.id, ...d.data() };
    }
  }

  if (!userDoc) {
    await signOut(auth);
    throw new Error('USER_NOT_FOUND');
  }

  // Step 4: Check if blocked
  if (userDoc.isBlocked) {
    await signOut(auth);
    throw new Error('USER_BLOCKED');
  }

  // Step 5: Check that user belongs to this shop.
  // Superadmins can sign in against any shop (including the admin shop).
  if (userDoc.role !== 'superadmin' && userDoc.shopId !== shop.id) {
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
