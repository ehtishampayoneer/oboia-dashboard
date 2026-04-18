'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  danger = false,
  loading = false,
  confirmText,
  cancelText,
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-card border border-white/10 rounded-xl shadow-card animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="p-2 rounded-lg bg-red-500/15">
                <AlertTriangle size={20} className="text-error" />
              </div>
            )}
            <h2 className="text-text-main font-semibold text-lg">
              {title || t('common_are_you_sure')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-subtext hover:text-text-main transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {message && (
          <div className="px-6 pb-4">
            <p className="text-subtext text-sm leading-relaxed">{message}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-subtext hover:text-text-main
              border border-white/10 rounded-lg hover:border-white/20
              transition-all disabled:opacity-50"
          >
            {cancelText || t('common_cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                danger
                  ? 'bg-error hover:bg-red-600 text-white'
                  : 'bg-primary hover:bg-secondary text-dark font-semibold'
              }`}
          >
            {loading
              ? t('common_loading')
              : confirmText || t('common_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
