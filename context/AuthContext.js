'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [baseShopId, setBaseShopId] = useState(null);   // shop from the user's own doc
  const [shopOverride, setShopOverrideState] = useState(null); // admin-selected shop
  const [branchId, setBranchId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate the admin's shop selection from localStorage (survives reloads)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wallar_admin_shop');
      if (saved) setShopOverrideState(saved);
    }
  }, []);

  /// Admin shop switcher setter. Pass a shopId to operate on that shop,
  /// or null to return to the admin's own default shop.
  const setShopOverride = (id) => {
    setShopOverrideState(id || null);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('wallar_admin_shop', id);
      else localStorage.removeItem('wallar_admin_shop');
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          // First try to find user document by UID (for existing admin users)
          const userRef = doc(db, 'users', user.uid);
          let snap = await getDoc(userRef);
          let userData = null;
          if (snap.exists()) {
            userData = snap.data();
            setUserDoc({ id: snap.id, ...userData });
            setUserRole(userData.role || 'seller');
            setBaseShopId(userData.shopId || null);
            setBranchId(userData.branchId || null);
          } else {
            // If not found by UID, search by email (for shopkeepers created via admin panel)
            const q = query(collection(db, 'users'), where('email', '==', user.email));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              const docSnap = querySnap.docs[0];
              userData = docSnap.data();
              setUserDoc({ id: docSnap.id, ...userData });
              setUserRole(userData.role || 'seller');
              setBaseShopId(userData.shopId || null);
              setBranchId(userData.branchId || null);
            } else {
              setUserDoc(null);
              setUserRole(null);
              setBaseShopId(null);
              setBranchId(null);
            }
          }
          // Set session cookies for middleware if user exists
          if (userData && typeof document !== 'undefined') {
            document.cookie = `wallar_session=1; path=/; max-age=86400`;
            document.cookie = `wallar_role=${userData.role || 'seller'}; path=/; max-age=86400`;
          }
        } catch (err) {
          console.error('Error loading user profile:', err);
        }
      } else {
        setCurrentUser(null);
        setUserDoc(null);
        setUserRole(null);
        setBaseShopId(null);
        setBranchId(null);
        if (typeof document !== 'undefined') {
          document.cookie = 'wallar_session=; path=/; max-age=0';
          document.cookie = 'wallar_role=; path=/; max-age=0';
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ★ SECURITY FIX ★
  // Platform admin = 'superadmin' ONLY. Previously 'admin' also counted, which
  // let a shopkeeper create an employee with role 'admin' and gain full
  // platform access. A shop's elevated staff now use the 'manager' role, which
  // grants in-shop rights only and NEVER platform access.
  const isAdmin = userRole === 'superadmin';

  // In-shop elevated staff (can manage their own shop, but NOT the platform).
  const isManager = userRole === 'manager';

  // The shopId the whole dashboard uses. For admins with a shop selected in
  // the header switcher, it's the selected shop; otherwise the user's own.
  const shopId = isAdmin && shopOverride ? shopOverride : baseShopId;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userDoc,
        userRole,
        shopId,
        baseShopId,
        shopOverride,
        setShopOverride,
        branchId,
        setBranchId,
        loading,
        isAdmin,      // superadmin only
        isManager,    // shop manager (in-shop elevated)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
