'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
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
  const [resetting, setResetting] = useState(false);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm();

  useEffect(() => {
    if (!loading && currentUser) {
      window.location.href = '/dashboard';
    }
  }, [currentUser, loading]);

  const onSubmit = async (data) => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      await loginWithToken(data.token, data.email, data.password);
      toast.success('Welcome back!');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 300);
    } catch (err) {
      const map = {
        INVALID_TOKEN: 'Invalid shop token. Please check and try again.',
        SHOP_INACTIVE: 'This shop is currently inactive.',
        WRONG_CREDENTIALS: 'Incorrect email or password.',
        USER_BLOCKED: 'Your account has been blocked. Contact admin.',
        // Distinct from wrong password: the login itself worked, but this
        // account has no shop profile linked (e.g. old manually-created
        // accounts). The fix is signing up properly or contacting admin —
        // NOT resetting the password again.
        USER_NOT_FOUND: 'Your password is correct, but this account is not linked to a shop yet. Please sign up as a seller, or contact the OBOIA admin.',
      };
      setErrorMsg(map[err.message] || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  // ── Forgot password: sends a Firebase reset email to the address typed
  //    in the email field. Works for shopkeepers AND admin.
  const handleForgotPassword = async () => {
    const email = (getValues('email') || '').trim();
    if (!email) {
      toast.error(currentLang === 'uz'
        ? 'Avval email manzilingizni kiriting'
        : 'Enter your email address first');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(currentLang === 'uz'
        ? `Parolni tiklash havolasi ${email} manziliga yuborildi`
        : `Password reset link sent to ${email}`);
    } catch (err) {
      // Don't reveal whether the email exists — generic success-style message
      toast.success(currentLang === 'uz'
        ? 'Agar bu email ro\'yxatdan o\'tgan bo\'lsa, tiklash havolasi yuborildi'
        : 'If this email is registered, a reset link has been sent');
    } finally {
      setResetting(false);
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
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Language toggle */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleLanguage}
          className="px-4 py-2 rounded-full bg-card border border-white/10
            text-sm font-semibold text-text-main hover:border-primary/50
            hover:text-primary transition-all"
        >
          {currentLang === 'en' ? "O'zbek" : 'English'}
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/20 mb-4 border border-primary/30">
            <img
              src="/logo.png"
              alt="OBOIA"
              className="w-12 h-12 object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <span
              className="text-primary font-black text-3xl hidden items-center justify-center"
              style={{ display: 'none' }}
            >
              O
            </span>
          </div>
          <h1 className="text-4xl font-black text-primary tracking-tight">OBOIA</h1>
          <p className="text-subtext text-sm mt-1 font-medium">
            Wallpaper Business Management
          </p>
        </div>

        {/* Form card */}
        <div className="bg-card border border-white/10 rounded-2xl p-8 shadow-card">
          <div className="mb-6">
            <h2 className="text-text-main font-bold text-xl">Sign In</h2>
            <p className="text-subtext text-sm mt-1">
              Enter your shop credentials to continue
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Shop Token */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                Shop Token
              </label>
              <input
                type="text"
                placeholder="e.g. SHOP-MAIN001"
                {...register('token', { required: 'Shop token is required' })}
                className="w-full uppercase tracking-widest font-mono text-primary pl-4"
                autoComplete="off"
                spellCheck="false"
              />
              {errors.token && (
                <p className="text-error text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.token.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="your@email.com"
                autoComplete="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email address' },
                })}
                className="w-full pl-4"
              />
              {errors.email && (
                <p className="text-error text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...register('password', { required: 'Password is required' })}
                  className="w-full pl-4 pr-10"
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
                <p className="text-error text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.password.message}
                </p>
              )}
              {/* Forgot password link */}
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {resetting
                    ? (currentLang === 'uz' ? 'Yuborilmoqda...' : 'Sending...')
                    : (currentLang === 'uz' ? 'Parolni unutdingizmi?' : 'Forgot password?')}
                </button>
              </div>
            </div>

            {/* Error message */}
            {errorMsg && (
              <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-lg px-4 py-3">
                <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                <p className="text-error text-sm">{errorMsg}</p>
              </div>
            )}

            {/* Submit button */}
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
                  Signing in...
                </>
              ) : (
                'Sign In to OBOIA'
              )}
            </button>

            {/* Become a seller */}
            <p className="text-center text-subtext text-sm pt-3 border-t border-white/5 mt-4">
              {currentLang === 'uz' ? 'OBOIA\'da sotmoqchimisiz?' : 'Want to sell on OBOIA?'}{' '}
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="text-primary hover:underline font-semibold"
              >
                {currentLang === 'uz' ? 'Sotuvchi bo\'ling' : 'Become a seller'}
              </button>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-subtext text-xs mt-6">
          OBOIA © {new Date().getFullYear()} — Wallpaper Management Platform
        </p>
      </div>
    </div>
  );
}
