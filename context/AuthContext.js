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
  const [shopId, setShopId] = useState(null);
  const [branchId, setBranchId] = useState(null);
  const [loading, setLoading] = useState(true);

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
            setShopId(userData.shopId || null);
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
              setShopId(userData.shopId || null);
              setBranchId(userData.branchId || null);
            } else {
              // No user document – treat as unknown (e.g., customer or unregistered)
              setUserDoc(null);
              setUserRole(null);
              setShopId(null);
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
        setShopId(null);
        setBranchId(null);

        // Clear cookies
        if (typeof document !== 'undefined') {
          document.cookie = 'wallar_session=; path=/; max-age=0';
          document.cookie = 'wallar_role=; path=/; max-age=0';
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userDoc,
        userRole,
        shopId,
        branchId,
        setBranchId,
        loading,
        isAdmin,
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
