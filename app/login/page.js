'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, KeyRound, Mail, Lock, AlertCircle } from 'lucide-react';
import { loginWithToken } from '../../lib/auth';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();
  const { t, currentLang, toggleLanguage } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace('/dashboard');
    }
  }, [currentUser, loading, router]);

  const onSubmit = async (data) => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      await loginWithToken(data.token, data.email, data.password);
      toast.success('Welcome back!');
      router.replace('/dashboard');
    } catch (err) {
      const map = {
        INVALID_TOKEN: t('login_error_invalid_token'),
        SHOP_INACTIVE: t('login_error_shop_inactive'),
        WRONG_CREDENTIALS: t('login_error_wrong_credentials'),
        USER_BLOCKED: t('login_error_blocked'),
        USER_NOT_FOUND: t('login_error_wrong_credentials'),
      };
      setErrorMsg(map[err.message] || t('login_error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-4 relative">
      {/* Background texture */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
      </div>

      {/* Language toggle top right */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleLanguage}
          className="px-4 py-2 rounded-full bg-card border border-white/10
            text-sm font-semibold text-text-main hover:border-primary/50
            hover:text-primary transition-all"
        >
          {currentLang === 'en' ? 'O\'zbek' : 'English'}
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 mb-4">
            <span className="text-primary font-black text-3xl">W</span>
          </div>
          <h1 className="text-3xl font-black text-primary tracking-tight">OBOIA</h1>
          <p className="text-subtext text-sm mt-1">{t('login_subtitle')}</p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-8 shadow-card">
          <h2 className="text-text-main font-bold text-xl mb-6">{t('login_title')}</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Shop Token */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                {t('login_shop_token')}
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
                <input
                  type="text"
                  placeholder={t('login_shop_token_placeholder')}
                  {...register('token', { required: t('common_required') })}
                  className="pl-9 uppercase tracking-widest font-mono text-primary"
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              {errors.token && (
                <p className="text-error text-xs mt-1">{errors.token.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                {t('login_email')}
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
                <input
                  type="email"
                  placeholder={t('login_email_placeholder')}
                  {...register('email', {
                    required: t('common_required'),
                    pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' },
                  })}
                  className="pl-9"
                />
              </div>
              {errors.email && (
                <p className="text-error text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                {t('login_password')}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('login_password_placeholder')}
                  {...register('password', { required: t('common_required') })}
                  className="pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtext hover:text-text-main transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-error text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Error message */}
            {errorMsg && (
              <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-lg px-4 py-3">
                <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                <p className="text-error text-sm">{errorMsg}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-primary hover:bg-secondary text-dark
                font-bold text-sm transition-all duration-200 mt-2
                hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                  {t('login_loading')}
                </>
              ) : (
                t('login_button')
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-subtext text-xs mt-6">
          OBOIA © {new Date().getFullYear()} — Wallpaper Management Platform
        </p>
      </div>
    </div>
  );
}
