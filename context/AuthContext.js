'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            setUserDoc({ id: snap.id, ...data });
            setUserRole(data.role || 'seller');
            setShopId(data.shopId || null);
            setBranchId(data.branchId || null);

            // Set session cookies for middleware
            if (typeof document !== 'undefined') {
              document.cookie = `wallar_session=1; path=/; max-age=86400`;
              document.cookie = `wallar_role=${data.role || 'seller'}; path=/; max-age=86400`;
            }
          } else {
            setCurrentUser(null);
            setUserDoc(null);
            setUserRole(null);
            setShopId(null);
            setBranchId(null);
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
