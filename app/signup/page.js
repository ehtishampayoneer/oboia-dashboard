'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, AlertCircle, CheckCircle, Store } from 'lucide-react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

// Self-contained bilingual strings (kept local so lib/i18n.js stays untouched;
// can be merged into the global i18n file post-launch).
const STRINGS = {
  en: {
    title: 'Become a Seller',
    subtitle: 'Request your OBOIA shop account',
    shop_name: 'Shop Name',
    shop_name_ph: 'e.g. Tashkent Wallpapers',
    phone: 'Phone Number',
    phone_ph: '+998 90 123 45 67',
    email: 'Email Address',
    email_ph: 'you@example.com',
    password: 'Password',
    password_ph: 'At least 6 characters',
    confirm: 'Confirm Password',
    confirm_ph: 'Repeat your password',
    submit: 'Submit Request',
    submitting: 'Submitting...',
    have_account: 'Already have a shop token?',
    sign_in: 'Sign In',
    err_required: 'Please fill all fields.',
    err_password_short: 'Password must be at least 6 characters.',
    err_password_match: 'Passwords do not match.',
    err_email_in_use: 'This email is already registered. Try signing in or resetting your password.',
    err_email_invalid: 'Invalid email address.',
    err_generic: 'Something went wrong. Please try again.',
    success_title: 'Request Submitted!',
    success_body:
      'Thank you! Our team will contact you shortly. After approval and payment, '
      + 'you will receive your shop token. Use that token with your email and '
      + 'password to sign in to your dashboard.',
    back_to_login: 'Back to Sign In',
  },
  uz: {
    title: 'Sotuvchi bo\'ling',
    subtitle: 'OBOIA do\'kon hisobingizni so\'rang',
    shop_name: 'Do\'kon nomi',
    shop_name_ph: 'masalan: Toshkent Oboylari',
    phone: 'Telefon raqami',
    phone_ph: '+998 90 123 45 67',
    email: 'Email manzil',
    email_ph: 'siz@misol.com',
    password: 'Parol',
    password_ph: 'Kamida 6 ta belgi',
    confirm: 'Parolni tasdiqlang',
    confirm_ph: 'Parolni qayta kiriting',
    submit: 'So\'rov yuborish',
    submitting: 'Yuborilmoqda...',
    have_account: 'Do\'kon tokeningiz bormi?',
    sign_in: 'Kirish',
    err_required: 'Barcha maydonlarni to\'ldiring.',
    err_password_short: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.',
    err_password_match: 'Parollar mos kelmadi.',
    err_email_in_use: 'Bu email allaqachon ro\'yxatdan o\'tgan. Kirishga yoki parolni tiklashga urinib ko\'ring.',
    err_email_invalid: 'Email manzil noto\'g\'ri.',
    err_generic: 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.',
    success_title: 'So\'rov yuborildi!',
    success_body:
      'Rahmat! Jamoamiz tez orada siz bilan bog\'lanadi. Tasdiqlash va to\'lovdan '
      + 'so\'ng sizga do\'kon tokeni beriladi. Dashboard\'ga kirish uchun shu token, '
      + 'email va parolingizdan foydalaning.',
    back_to_login: 'Kirish sahifasiga qaytish',
  },
};

export default function SignupPage() {
  const router = useRouter();
  const { currentLang, toggleLanguage } = useLanguage();
  const L = STRINGS[currentLang] || STRINGS.en;

  const [form, setForm] = useState({
    shopName: '', phone: '', email: '', password: '', confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setErrorMsg('');
    const { shopName, phone, email, password, confirm } = form;

    if (!shopName.trim() || !email.trim() || !password) {
      setErrorMsg(L.err_required);
      return;
    }
    if (password.length < 6) {
      setErrorMsg(L.err_password_short);
      return;
    }
    if (password !== confirm) {
      setErrorMsg(L.err_password_match);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create the Firebase Auth account. The UID is known immediately —
      //    this is what makes self-signup safer than admin-created accounts.
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      // 2. Create the user profile AT THE UID (the dashboard looks it up there).
      //    Role 'pending' + no shopId = cannot access any shop data yet.
      await setDoc(doc(db, 'users', uid), {
        email: email.trim(),
        name: shopName.trim(),
        phone: phone.trim(),
        role: 'pending',
        shopId: null,
        isBlocked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Create the signup request the admin sees on the Shops page.
      await setDoc(doc(db, 'signupRequests', uid), {
        uid,
        email: email.trim(),
        shopName: shopName.trim(),
        phone: phone.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // 4. Sign out — access begins only after admin approval + token.
      await signOut(auth);

      setDone(true);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg(L.err_email_in_use);
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg(L.err_email_invalid);
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg(L.err_password_short);
      } else {
        setErrorMsg(L.err_generic);
      }
    } finally {
      setSubmitting(false);
    }
  };

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

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/20 mb-4 border border-primary/30">
            <Store className="text-primary" size={36} />
          </div>
          <h1 className="text-4xl font-black text-primary tracking-tight">OBOIA</h1>
          <p className="text-subtext text-sm mt-1 font-medium">{L.subtitle}</p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-8 shadow-card">
          {done ? (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 mb-4">
                <CheckCircle className="text-success" size={32} />
              </div>
              <h2 className="text-text-main font-bold text-xl mb-3">{L.success_title}</h2>
              <p className="text-subtext text-sm leading-relaxed mb-6">{L.success_body}</p>
              <button
                onClick={() => router.push('/login')}
                className="w-full py-3 rounded-xl bg-primary hover:bg-secondary text-dark
                  font-bold text-sm transition-all duration-200 hover:shadow-glow"
              >
                {L.back_to_login}
              </button>
            </div>
          ) : (
            /* ── Signup form ───────────────────────────────────────────── */
            <>
              <div className="mb-6">
                <h2 className="text-text-main font-bold text-xl">{L.title}</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-main mb-1.5">
                    {L.shop_name}
                  </label>
                  <input
                    type="text"
                    placeholder={L.shop_name_ph}
                    value={form.shopName}
                    onChange={set('shopName')}
                    className="w-full pl-4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main mb-1.5">
                    {L.phone}
                  </label>
                  <input
                    type="tel"
                    placeholder={L.phone_ph}
                    value={form.phone}
                    onChange={set('phone')}
                    className="w-full pl-4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main mb-1.5">
                    {L.email}
                  </label>
                  <input
                    type="email"
                    placeholder={L.email_ph}
                    value={form.email}
                    onChange={set('email')}
                    className="w-full pl-4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main mb-1.5">
                    {L.password}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={L.password_ph}
                      value={form.password}
                      onChange={set('password')}
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main mb-1.5">
                    {L.confirm}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={L.confirm_ph}
                    value={form.confirm}
                    onChange={set('confirm')}
                    className="w-full pl-4"
                  />
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-lg px-4 py-3">
                    <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                    <p className="text-error text-sm">{errorMsg}</p>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-primary hover:bg-secondary text-dark
                    font-bold text-sm transition-all duration-200 mt-2
                    hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                      {L.submitting}
                    </>
                  ) : (
                    L.submit
                  )}
                </button>

                <p className="text-center text-subtext text-sm pt-2">
                  {L.have_account}{' '}
                  <button
                    onClick={() => router.push('/login')}
                    className="text-primary hover:underline font-semibold"
                  >
                    {L.sign_in}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-subtext text-xs mt-6">
          OBOIA © {new Date().getFullYear()} — Wallpaper Management Platform
        </p>
      </div>
    </div>
  );
}
