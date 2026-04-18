'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTranslation } from '../lib/i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [currentLang, setCurrentLang] = useState('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wallar_lang');
      if (saved === 'uz' || saved === 'en') {
        setCurrentLang(saved);
      }
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setCurrentLang((prev) => {
      const next = prev === 'en' ? 'uz' : 'en';
      if (typeof window !== 'undefined') {
        localStorage.setItem('wallar_lang', next);
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key) => getTranslation(currentLang, key),
    [currentLang]
  );

  return (
    <LanguageContext.Provider value={{ currentLang, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
