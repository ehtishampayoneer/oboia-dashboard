'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Store, Image, Tag, ShoppingBag, Receipt,
  Users, Hammer, Warehouse, Truck, BarChart3, GitBranch,
  Settings, Bell, LogOut, ChevronLeft, ChevronRight, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { logout } from '../lib/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav_dashboard', adminOnly: false },
  { key: 'shops', href: '/shops', icon: Store, labelKey: 'nav_shops', adminOnly: true },
  { key: 'wallpapers', href: '/wallpapers', icon: Image, labelKey: 'nav_wallpapers', adminOnly: false },
  { key: 'categories', href: '/categories', icon: Tag, labelKey: 'nav_categories', adminOnly: false },
  { key: 'orders', href: '/orders', icon: ShoppingBag, labelKey: 'nav_orders', adminOnly: false },
  { key: 'sales', href: '/sales', icon: Receipt, labelKey: 'nav_sales', adminOnly: false },
  { key: 'employees', href: '/employees', icon: Users, labelKey: 'nav_employees', adminOnly: false },
  { key: 'craftsmen', href: '/craftsmen', icon: Hammer, labelKey: 'nav_craftsmen', adminOnly: false },
  { key: 'warehouse', href: '/warehouse', icon: Warehouse, labelKey: 'nav_warehouse', adminOnly: false },
  { key: 'suppliers', href: '/suppliers', icon: Truck, labelKey: 'nav_suppliers', adminOnly: false },
  { key: 'reports', href: '/reports', icon: BarChart3, labelKey: 'nav_reports', adminOnly: false },
  { key: 'branches', href: '/branches', icon: GitBranch, labelKey: 'nav_branches', adminOnly: false },
  { key: 'settings', href: '/settings', icon: Settings, labelKey: 'nav_settings', adminOnly: true },
];

export default function Layout({ children, title }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userDoc, isAdmin, shopId } = useAuth();
  const { t, currentLang, toggleLanguage } = useLanguage();
  const { currentCurrency, toggleCurrency } = useCurrency();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time notifications: pending orders count
  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, 'orders'),
      where('shopId', '==', shopId),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        message: `New order from ${d.data().customerPhone || 'Unknown'}`,
        time: d.data().createdAt?.toDate?.()?.toLocaleTimeString() || '',
      }));
      setNotifications(items.slice(0, 10));
    });
    return () => unsub();
  }, [shopId]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
    toast.success('Logged out successfully');
  };

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const NavItem = ({ item }) => {
    const Icon = item.icon;
    const isActive = pathname.startsWith(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 mb-0.5
          transition-all duration-150 relative
          ${isActive
            ? 'bg-primary/10 text-primary border-l-2 border-primary ml-0 pl-[10px]'
            : 'text-subtext hover:text-text-main hover:bg-white/5 border-l-2 border-transparent'
          }`}
      >
        <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
        {!collapsed && (
          <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-card border border-white/10
            rounded-lg text-xs text-text-main whitespace-nowrap opacity-0
            group-hover:opacity-100 pointer-events-none z-50 shadow-card transition-opacity">
            {t(item.labelKey)}
          </div>
        )}
      </Link>
    );
  };

  const Sidebar = () => (
    <aside className={`flex flex-col bg-dark border-r border-white/5 h-full
      transition-all duration-300
      ${collapsed ? 'w-[60px]' : 'w-60'}`}>
      {/* Logo */}
      <div className={`flex items-center h-16 px-4 border-b border-white/5 flex-shrink-0
        ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <img src="/logo.png" alt="OBOIA" className="h-8 w-8 object-contain" />
        </div>
        {!collapsed && (
          <span className="text-primary font-black text-xl tracking-tight">OBOIA</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0">
        {visibleItems.map((item) => (
          <NavItem key={item.key} item={item} />
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center h-10 border-t border-white/5
          text-subtext hover:text-text-main hover:bg-white/5 transition-all flex-shrink-0"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );

  return (
    <div className="flex h-screen bg-dark overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 h-full bg-dark border-r border-white/5 flex flex-col">
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
              <span className="text-primary font-black text-xl">OBOIA</span>
              <button onClick={() => setMobileOpen(false)} className="text-subtext">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {visibleItems.map((item) => (
                <NavItem key={item.key} item={item} />
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6
          bg-dark border-b border-white/5 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden text-subtext hover:text-text-main"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-text-main font-semibold text-lg truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-full bg-surface border border-white/10
                text-xs font-semibold text-text-main hover:border-primary/40
                hover:bg-primary/10 hover:text-primary transition-all"
            >
              {currentLang.toUpperCase()}
            </button>

            {/* Currency toggle */}
            <button
              onClick={toggleCurrency}
              className="px-3 py-1.5 rounded-full bg-surface border border-white/10
                text-xs font-semibold text-text-main hover:border-primary/40
                hover:bg-primary/10 hover:text-primary transition-all"
            >
              {currentCurrency}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg text-subtext hover:text-text-main
                  hover:bg-surface transition-all"
              >
                <Bell size={18} />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error
                    text-[10px] text-white font-bold flex items-center justify-center">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-white/10
                  rounded-xl shadow-card z-50 overflow-hidden animate-fade-in">
                  <div className="px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-semibold text-text-main">{t('header_notifications')}</span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-subtext text-sm">
                      {t('header_no_notifications')}
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                      {notifications.map((n) => (
                        <div key={n.id} className="px-4 py-3 hover:bg-surface transition-colors">
                          <p className="text-sm text-text-main">{n.message}</p>
                          <p className="text-xs text-subtext mt-0.5">{n.time}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User + Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/10">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-text-main truncate max-w-[120px]">
                  {userDoc?.name || userDoc?.email || 'User'}
                </p>
                <p className="text-[10px] text-subtext capitalize">{userDoc?.role || 'seller'}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-primary text-xs font-bold">
                  {(userDoc?.name || userDoc?.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-subtext hover:text-error hover:bg-error/10 transition-all"
                title={t('header_logout')}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-dark/50">
          {children}
        </main>
      </div>
    </div>
  );
}
