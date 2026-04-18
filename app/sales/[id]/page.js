'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, RefreshCw, Check } from 'lucide-react';
import Layout from '../../../components/Layout';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmModal from '../../../components/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCurrency } from '../../../context/CurrencyContext';
import { getSaleById, processRefund } from '../../../lib/db/sales';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import toast from 'react-hot-toast';

export default function SaleDetailPage() {
  const { id } = useParams();
  const { shopId, currentUser } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();
  const router = useRouter();

  const [sale, setSale] = useState(null);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState(false);
  const [refundItems, setRefundItems] = useState([]);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const saleData = await getSaleById(id);
        setSale(saleData);
        if (saleData?.shopId) {
          const shopSnap = await getDoc(doc(db, 'shops', saleData.shopId));
          setShopName(shopSnap.data()?.nameEn || 'WallAR Shop');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const openRefund = () => {
    setRefundItems((sale?.items || []).map((item) => ({
      wallpaperId: item.wallpaperId,
      wallpaperName: item.wallpaperName,
      originalRolls: item.rolls,
      rolls: 0,
      selected: false,
    })));
    setRefundModal(true);
  };

  const handleRefund = async () => {
    if (!refundReason.trim()) { toast.error('Reason is required'); return; }
    const selected = refundItems.filter((r) => r.selected && r.rolls > 0);
    if (selected.length === 0) { toast.error('Select at least one item'); return; }

    setRefunding(true);
    try {
      const { refundTotal, bonusDeduction } = await processRefund(
        id, shopId, selected, refundReason, currentUser.uid
      );
      toast.success(t('sales_refund_success'));
      setRefundModal(false);
      const updated = await getSaleById(id);
      setSale(updated);
    } catch {
      toast.error(t('common_error'));
    } finally {
      setRefunding(false);
    }
  };

  const refundTotal = (() => {
    return refundItems
      .filter((r) => r.selected && r.rolls > 0)
      .reduce((sum, r) => {
        const item = sale?.items?.find((i) => i.wallpaperId === r.wallpaperId);
        if (!item) return sum;
        return sum + (r.rolls / item.rolls) * item.total;
      }, 0);
  })();

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <Layout title="Sale Detail">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!sale) {
    return <Layout title="Sale Not Found"><p className="text-subtext p-6">Sale not found.</p></Layout>;
  }

  const totalRevenue = sale.totalAmount || 0;
  const totalCost = sale.totalCost || 0;
  const profit = totalRevenue - totalCost;

  return (
    <Layout title={`Receipt ${sale.receiptNumber}`}>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-subtext hover:text-text-main text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-white/10
                text-subtext hover:text-text-main text-sm transition-all"
            >
              <Printer size={15} />
              {t('sales_print')}
            </button>
            {sale.status === 'closed' && (
              <button
                onClick={openRefund}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20
                  text-warning hover:bg-orange-500/20 text-sm transition-all"
              >
                <RefreshCw size={15} />
                {t('sales_refund')}
              </button>
            )}
          </div>
        </div>

        {/* Receipt header */}
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-primary font-black text-xl">WallAR</span>
                <span className="text-subtext text-sm">·</span>
                <span className="text-text-main text-sm">{shopName}</span>
              </div>
              <p className="text-subtext text-xs">Receipt #{sale.receiptNumber}</p>
            </div>
            <StatusBadge status={sale.status} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-subtext text-xs">{t('sales_date')}</p>
              <p className="text-text-main">{sale.closedAt?.toDate?.()?.toLocaleString() || '—'}</p>
            </div>
            <div>
              <p className="text-subtext text-xs">{t('sales_seller')}</p>
              <p className="text-text-main">{sale.sellerName || '—'}</p>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5">
            <h2 className="text-text-main font-semibold text-sm">{t('sales_items')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Item', 'Sqm', 'Rolls', 'Length', 'Price/Roll', 'Total'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs text-subtext font-semibold uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(sale.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-text-main">{item.wallpaperName}</td>
                    <td className="px-4 py-3 text-subtext">{(item.sqm || 0).toFixed(1)}</td>
                    <td className="px-4 py-3 text-subtext">{item.rolls}</td>
                    <td className="px-4 py-3 text-subtext">{(item.lengthM || 0).toFixed(1)}m</td>
                    <td className="px-4 py-3 text-subtext">{format(item.sellPrice)}</td>
                    <td className="px-4 py-3 text-primary font-semibold">{format(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <h2 className="text-text-main font-semibold mb-3 text-sm">{t('sales_payment_types')}</h2>
          <div className="space-y-2">
            {Object.entries(sale.payments || {}).map(([type, amt]) =>
              Number(amt) > 0 ? (
                <div key={type} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-subtext text-sm capitalize">{type}</span>
                  <span className="text-text-main font-medium">{format(Number(amt))}</span>
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Profit summary */}
        <div className="bg-card border border-white/5 rounded-xl p-5">
          <h2 className="text-text-main font-semibold mb-3 text-sm">Profit Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-subtext">{t('sales_revenue')}</span>
              <span className="text-text-main">{format(totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-subtext">{t('sales_cost')}</span>
              <span className="text-text-main">{format(totalCost)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-white/5">
              <span className="text-text-main font-semibold">{t('common_profit')}</span>
              <span className="text-success font-bold">{format(profit)}</span>
            </div>
          </div>
        </div>

        {/* Craftsman section */}
        {sale.craftsmanId && (
          <div className="bg-card border border-white/5 rounded-xl p-5">
            <h2 className="text-text-main font-semibold mb-3 text-sm">{t('sales_craftsman')}</h2>
            <div className="flex justify-between">
              <span className="text-subtext text-sm">{t('sales_craftsman_bonus')}</span>
              <span className="text-primary font-semibold">{format(sale.craftsmanBonus || 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('sales_refund')}</h2>
              <button onClick={() => setRefundModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <p className="text-subtext text-sm">{t('sales_refund_items')}</p>
              {refundItems.map((r, idx) => (
                <div key={r.wallpaperId} className="border border-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={(e) =>
                        setRefundItems((prev) =>
                          prev.map((item, i) => i === idx ? { ...item, selected: e.target.checked } : item)
                        )
                      }
                    />
                    <span className="text-text-main text-sm font-medium">{r.wallpaperName}</span>
                    <span className="text-subtext text-xs ml-auto">Max: {r.originalRolls} rolls</span>
                  </div>
                  {r.selected && (
                    <div>
                      <label className="block text-xs text-subtext mb-1">{t('sales_refund_rolls')}</label>
                      <input
                        type="number" min="1" max={r.originalRolls}
                        value={r.rolls}
                        onChange={(e) =>
                          setRefundItems((prev) =>
                            prev.map((item, i) => i === idx ? { ...item, rolls: Number(e.target.value) } : item)
                          )
                        }
                        className="text-sm py-1.5"
                      />
                    </div>
                  )}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('sales_refund_reason')} *</label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="resize-none"
                />
              </div>
              {refundTotal > 0 && (
                <div className="bg-surface rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-subtext">{t('sales_refund_amount')}</span>
                    <span className="text-primary font-bold">{format(refundTotal)}</span>
                  </div>
                  {sale.craftsmanBonus > 0 && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-subtext">{t('sales_refund_bonus_impact')}</span>
                      <span className="text-error text-xs">
                        −{format(Math.round((refundTotal / totalRevenue) * sale.craftsmanBonus))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setRefundModal(false)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="px-5 py-2 bg-error hover:bg-red-600 text-white font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {refunding ? t('common_loading') : t('sales_refund')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
