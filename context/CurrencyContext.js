'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatCurrency, DEFAULT_EXCHANGE_RATE } from '../lib/currency';
import { useAuth } from './AuthContext';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currentCurrency, setCurrentCurrency] = useState('UZS');
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);
  const { shopId } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wallar_currency');
      if (saved === 'USD' || saved === 'UZS') {
        setCurrentCurrency(saved);
      }
    }
  }, []);

  // Listen to exchange rate from shop settings
  useEffect(() => {
    if (!shopId) return;
    const shopRef = doc(db, 'shops', shopId);
    const unsub = onSnapshot(shopRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.exchangeRate && data.exchangeRate > 0) {
          setExchangeRate(data.exchangeRate);
        }
      }
    });
    return () => unsub();
  }, [shopId]);

  const toggleCurrency = useCallback(() => {
    setCurrentCurrency((prev) => {
      const next = prev === 'UZS' ? 'USD' : 'UZS';
      if (typeof window !== 'undefined') {
        localStorage.setItem('wallar_currency', next);
      }
      return next;
    });
  }, []);

  const format = useCallback(
    (amountUZS) => formatCurrency(amountUZS, currentCurrency, exchangeRate),
    [currentCurrency, exchangeRate]
  );

  return (
    <CurrencyContext.Provider
      value={{ currentCurrency, toggleCurrency, exchangeRate, format }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
