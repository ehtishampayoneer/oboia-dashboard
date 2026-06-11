'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Phone } from 'lucide-react';
import Layout from '../../../components/Layout';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmModal from '../../../components/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCurrency } from '../../../context/CurrencyContext';
import { getOrderById, updateOrderStatus, cancelOrder } from '../../../lib/db/orders';
import { calculateWallpaper } from '../../../lib/calculations';
import toast from 'react-hot-toast';

const STATUS_FLOW = ['pending', 'negotiating', 'ready', 'closed'];

// ─────────────────────────────────────────────────────────────────────────
// Mobile app orders carry an items[] array — one entry per scanned wall,
// with wallpaperId/Name, wallWidth/Height, sqm, rollsNeeded, pricePerRoll,
// totalPrice. Older orders may instead have a walls[] array + flat fields.
// This page renders whichever shape the order has.
// ─────────────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const data = await getOrderById(id);
      setOrder(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) fetchOrder(); }, [id]);

  // Legacy walls[] calculation (older order format only)
  const calc = order?.walls
    ? calculateWallpaper(
        order.walls,
        order.rollWidthCm || 53,
        order.rollLengthM || 10,
        order.wallpaperPrice || 0
      )
    : null;

  // Mobile app items[] totals
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsTotalSqm = items.reduce((s, it) => s + (Number(it.sqm) || 0), 0);
  const itemsTotalRolls = items.reduce((s, it) => s + (Number(it.rollsNeeded) || 0), 0);
  const itemsTotalPrice = order?.totalAmount
    ? Number(order.totalAmount)
    : items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);

  const handleStatusChange = async (newStatus) => {
    setStatusLoading(true);
    try {
      await updateOrderStatus(id, newStatus, currentUser.uid);
      toast.success(t('orders_status_changed'));
      fetchOrder();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error(t('common_required')); return; }
    setCancelling(true);
    try {
      await cancelOrder(id, cancelReason, currentUser.uid);
      toast.success(t('orders_status_changed'));
      setCancelModal(false);
      fetchOrder();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <Layout title={t('orders_title')}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return <Layout title={t('orders_title')}><p className="text-subtext p-6">{t('common_no_results')}</p></Layout>;
  }

  const currentStatusIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <Layout title={`${t('orders_title')} — ${order.customerPhone || id}`}>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-subtext hover:text-text-main text-sm">
            <ArrowLeft size={16} /> {t('common_close')}
          </button>
          <div className="flex items-center gap-2">
            {order.status !== 'cancelled' && order.status !== 'closed' && (
              <>
                {STATUS_FLOW.indexOf(order.status) < STATUS_FLOW.length - 2 && (
                  <button
                    onClick={() => handleStatusChange(STATUS_FLOW[currentStatusIdx + 1])}
                    disabled={statusLoading}
                    className="px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-sm transition-all disabled:opacity-50"
                  >
                    → {t(`orders_${STATUS_FLOW[currentStatusIdx + 1]}`)}
                  </button>
                )}
                {(order.status === 'ready' || order.status === 'negotiating') && (
                  <button
                    onClick={() => router.push(`/sales/new?orderId=${order.id}`)}
                    className="px-3 py-2 bg-green-500/10 text-success hover:bg-green-500/20 rounded-lg text-sm transition-all"
                  >
                    {t('orders_convert_to_sale')}
                  </button>
                )}
                <button
                  onClick={() => setCancelModal(true)}
                  className="px-3 py-2 bg-red-500/10 text-error hover:bg-red-500/20 rounded-lg text-sm transition-all"
                >
                  {t('orders_cancel')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Customer info */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-subtext text-xs mb-1">{t('orders_customer_phone')}</p>
              {order.customerPhone ? (
                <a href={`tel:${order.customerPhone}`} className="flex items-center gap-2 text-primary hover:underline font-semibold text-lg">
                  <Phone size={18} />
                  {order.customerPhone}
                </a>
              ) : (
                <p className="text-subtext">—</p>
              )}
            </div>
            <StatusBadge status={order.status} size="sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <p className="text-subtext text-xs">{t('common_name')}</p>
              <p className="text-text-main">{order.customerName || '—'}</p>
            </div>
            <div>
              <p className="text-subtext text-xs">{t('orders_date')}</p>
              <p className="text-text-main">{order.createdAt?.toDate?.()?.toLocaleString() || '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-subtext text-xs">{t('common_address')}</p>
              <p className="text-text-main">{order.customerAddress || '—'}</p>
            </div>
            {order.notes && (
              <div className="sm:col-span-2">
                <p className="text-subtext text-xs">{t('common_notes')}</p>
                <p className="text-text-main">{order.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile-app order items (one row per scanned wall) */}
        {items.length > 0 && (
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <h2 className="text-text-main font-semibold text-sm">{t('sales_items')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{t('orders_wallpaper')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_width')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_height')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('sales_sqm')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_rolls_needed')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('common_total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {it.wallpaperThumbnail ? (
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface flex-shrink-0">
                              <img src={it.wallpaperThumbnail} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : null}
                          <span className="text-text-main">{it.wallpaperName || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-text-main">
                        {it.wallWidth ? `${Number(it.wallWidth).toFixed(2)}${t('common_meters')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-text-main">
                        {it.wallHeight ? `${Number(it.wallHeight).toFixed(2)}${t('common_meters')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-text-main">{(Number(it.sqm) || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-text-main">{Number(it.rollsNeeded) || 0}</td>
                      <td className="px-4 py-3 text-right text-primary font-medium">{format(Number(it.totalPrice) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-primary/20 bg-primary/5">
                    <td colSpan={3} className="px-4 py-3 text-text-main font-semibold text-sm">{t('common_total')}</td>
                    <td className="px-4 py-3 text-right text-text-main font-semibold">{itemsTotalSqm.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-text-main font-semibold">{itemsTotalRolls}</td>
                    <td className="px-4 py-3 text-right text-primary font-bold">{format(itemsTotalPrice)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-white/5">
              <p className="text-subtext text-xs">
                {t('orders_estimated_price')} — {t('sales_close_warning')}
              </p>
            </div>
          </div>
        )}

        {/* Legacy walls[] table (older order format) */}
        {order.walls && order.walls.length > 0 && (
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <h2 className="text-text-main font-semibold text-sm">{t('orders_wall_measurements')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-2.5 text-left text-xs text-subtext font-semibold">{t('orders_wall_measurements')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_width')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_height')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_sqm')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_deductions')}</th>
                    <th className="px-4 py-2.5 text-right text-xs text-subtext font-semibold">{t('orders_wall_net_sqm')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {order.walls.map((wall, i) => {
                    const gross = (wall.widthM || 0) * (wall.heightM || 0);
                    const dedSqm = (wall.deductions || []).reduce((s, d) => s + d.widthM * d.heightM, 0);
                    const net = gross - dedSqm;
                    return (
                      <tr key={i}>
                        <td className="px-4 py-3 text-subtext">{i + 1}</td>
                        <td className="px-4 py-3 text-right text-text-main">{wall.widthM}{t('common_meters')}</td>
                        <td className="px-4 py-3 text-right text-text-main">{wall.heightM}{t('common_meters')}</td>
                        <td className="px-4 py-3 text-right text-text-main">{gross.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-error">{dedSqm > 0 ? `-${dedSqm.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-primary font-medium">{net.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {calc && (
                  <tfoot>
                    <tr className="border-t border-primary/20 bg-primary/5">
                      <td colSpan={3} className="px-4 py-3 text-text-main font-semibold text-sm">{t('common_total')}</td>
                      <td className="px-4 py-3 text-right text-text-main font-semibold">{calc.totalGrossSqm}</td>
                      <td className="px-4 py-3 text-right text-error font-semibold">-{calc.totalDeductionSqm}</td>
                      <td className="px-4 py-3 text-right text-primary font-bold">{calc.netSqm}</td>
                    </tr>
                    <tr className="bg-card">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div><span className="text-subtext">{t('orders_total_rolls')}: </span><span className="text-text-main font-semibold">{calc.rollsNeeded}</span></div>
                          <div><span className="text-subtext">{t('orders_total_length')}: </span><span className="text-text-main font-semibold">{calc.lengthNeededM}{t('common_meters')}</span></div>
                          <div><span className="text-subtext">{t('orders_roll_width')}: </span><span className="text-text-main font-semibold">{calc.rollWidthM}{t('common_meters')}</span></div>
                          <div><span className="text-subtext">{t('orders_estimated_price')}: </span><span className="text-primary font-bold">{format(calc.totalPrice)}</span></div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Status timeline */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="bg-card border border-white/5 rounded-xl p-5">
            <h2 className="text-text-main font-semibold mb-4 text-sm">{t('orders_status_history')}</h2>
            <div className="space-y-3">
              {order.statusHistory.map((entry, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                    {i < order.statusHistory.length - 1 && (
                      <div className="w-px h-8 bg-primary/20 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={entry.status} size="xs" />
                      <span className="text-subtext text-xs">
                        {new Date(entry.changedAt).toLocaleString()}
                      </span>
                    </div>
                    {entry.reason && (
                      <p className="text-subtext text-xs mt-0.5">{entry.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('orders_cancel')}</h2>
              <button onClick={() => setCancelModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('orders_cancel_reason')} *</label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('common_reason')}
                className="resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setCancelModal(false)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-5 py-2 bg-error text-white font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {cancelling ? t('common_loading') : t('orders_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
