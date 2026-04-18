import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, writeBatch, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { reduceStock, increaseStock } from './wallpapers';

function generateReceiptNumber() {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RCP-${ymd}-${rand}`;
}

/**
 * Create a new sale (open receipt).
 */
export async function createSale(shopId, data, userId) {
  const receiptNumber = generateReceiptNumber();
  const sale = {
    ...data,
    shopId,
    receiptNumber,
    status: 'open',
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'sales'), sale);
  return { id: ref.id, receiptNumber };
}

/**
 * Close a sale receipt.
 * BUSINESS RULE: Sum of all payments must equal total amount exactly.
 * Reduces stock, creates stock movements, activates craftsman bonus.
 */
export async function closeSale(saleId, shopId, userId) {
  const saleRef = doc(db, 'sales', saleId);
  const snap = await getDoc(saleRef);
  if (!snap.exists()) throw new Error('Sale not found');

  const sale = snap.data();

  // Validate payments sum equals total
  const paymentsTotal = Object.values(sale.payments || {}).reduce(
    (sum, amt) => sum + (Number(amt) || 0),
    0
  );

  if (Math.abs(paymentsTotal - sale.totalAmount) > 1) {
    throw new Error('PAYMENTS_MISMATCH');
  }

  const batch = writeBatch(db);

  // Update sale status
  batch.update(saleRef, {
    status: 'closed',
    closedAt: serverTimestamp(),
    closedBy: userId,
    updatedAt: serverTimestamp(),
  });

  // Process each item: reduce stock, create stock movement
  for (const item of sale.items || []) {
    const wallpaperRef = doc(db, 'wallpapers', item.wallpaperId);
    batch.update(wallpaperRef, {
      stock: increment(-item.rolls),
      soldTotal: increment(item.rolls),
      updatedAt: serverTimestamp(),
    });

    const movementRef = doc(collection(db, 'stockMovements'));
    batch.set(movementRef, {
      shopId,
      wallpaperId: item.wallpaperId,
      wallpaperName: item.wallpaperName || '',
      type: 'sold',
      rolls: item.rolls,
      saleId,
      receiptNumber: sale.receiptNumber,
      reason: `Sale ${sale.receiptNumber}`,
      recordedBy: userId,
      createdAt: serverTimestamp(),
    });
  }

  // Activate craftsman bonus if applicable
  if (sale.craftsmanId && sale.craftsmanBonus > 0) {
    const craftsmanRef = doc(db, 'craftsmen', sale.craftsmanId);
    batch.update(craftsmanRef, {
      totalEarned: increment(sale.craftsmanBonus),
      pendingBalance: increment(sale.craftsmanBonus),
      updatedAt: serverTimestamp(),
    });

    const bonusTxRef = doc(collection(db, 'bonusTransactions'));
    batch.set(bonusTxRef, {
      shopId,
      craftsmanId: sale.craftsmanId,
      saleId,
      receiptNumber: sale.receiptNumber,
      type: 'earned',
      amount: sale.craftsmanBonus,
      createdBy: userId,
      createdAt: serverTimestamp(),
    });
  }

  // Update linked order status to closed if exists
  if (sale.orderId) {
    const orderRef = doc(db, 'orders', sale.orderId);
    batch.update(orderRef, {
      status: 'closed',
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function getSaleById(id) {
  const snap = await getDoc(doc(db, 'sales', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAllSales(shopId, filters = {}) {
  let q = query(
    collection(db, 'sales'),
    where('shopId', '==', shopId),
    where('status', '==', 'closed'),
    orderBy('closedAt', 'desc')
  );
  const snap = await getDocs(q);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.sellerId) {
    results = results.filter((s) => s.createdBy === filters.sellerId);
  }
  if (filters.branchId) {
    results = results.filter((s) => s.branchId === filters.branchId);
  }
  if (filters.paymentType) {
    results = results.filter((s) => s.payments?.[filters.paymentType] > 0);
  }
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    results = results.filter((s) => s.closedAt?.toDate?.() >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    results = results.filter((s) => s.closedAt?.toDate?.() <= to);
  }
  return results;
}

/**
 * Process a refund.
 * BUSINESS RULE: Returns stock, deducts craftsman bonus, updates sale status.
 */
export async function processRefund(saleId, shopId, refundItems, reason, userId) {
  const saleRef = doc(db, 'sales', saleId);
  const snap = await getDoc(saleRef);
  if (!snap.exists()) throw new Error('Sale not found');

  const sale = snap.data();
  const batch = writeBatch(db);

  let refundTotal = 0;
  let bonusDeduction = 0;

  for (const ri of refundItems) {
    if (!ri.rolls || ri.rolls <= 0) continue;

    const originalItem = sale.items?.find((i) => i.wallpaperId === ri.wallpaperId);
    if (!originalItem) continue;

    const rollsToRefund = Math.min(ri.rolls, originalItem.rolls);
    const refundAmount = (rollsToRefund / originalItem.rolls) * originalItem.total;
    refundTotal += refundAmount;

    // Return stock to warehouse
    const wallpaperRef = doc(db, 'wallpapers', ri.wallpaperId);
    batch.update(wallpaperRef, {
      stock: increment(rollsToRefund),
      soldTotal: increment(-rollsToRefund),
      updatedAt: serverTimestamp(),
    });

    // Stock movement record
    const movementRef = doc(collection(db, 'stockMovements'));
    batch.set(movementRef, {
      shopId,
      wallpaperId: ri.wallpaperId,
      wallpaperName: originalItem.wallpaperName || '',
      type: 'refunded',
      rolls: rollsToRefund,
      saleId,
      receiptNumber: sale.receiptNumber,
      reason: `Refund: ${reason}`,
      recordedBy: userId,
      createdAt: serverTimestamp(),
    });
  }

  // Deduct craftsman bonus proportionally if applicable
  if (sale.craftsmanId && sale.craftsmanBonus > 0 && sale.totalAmount > 0) {
    bonusDeduction = Math.round((refundTotal / sale.totalAmount) * sale.craftsmanBonus);
    if (bonusDeduction > 0) {
      const craftsmanRef = doc(db, 'craftsmen', sale.craftsmanId);
      batch.update(craftsmanRef, {
        totalEarned: increment(-bonusDeduction),
        pendingBalance: increment(-bonusDeduction),
        updatedAt: serverTimestamp(),
      });

      const bonusTxRef = doc(collection(db, 'bonusTransactions'));
      batch.set(bonusTxRef, {
        shopId,
        craftsmanId: sale.craftsmanId,
        saleId,
        receiptNumber: sale.receiptNumber,
        type: 'deducted',
        amount: bonusDeduction,
        reason: `Refund deduction: ${reason}`,
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
    }
  }

  // Create refund record
  const refundRef = doc(collection(db, 'refunds'));
  batch.set(refundRef, {
    shopId,
    saleId,
    receiptNumber: sale.receiptNumber,
    items: refundItems,
    refundAmount: refundTotal,
    bonusDeducted: bonusDeduction,
    reason,
    processedBy: userId,
    createdAt: serverTimestamp(),
  });

  // Update sale status
  batch.update(saleRef, {
    status: 'refunded',
    refundedAt: serverTimestamp(),
    refundedBy: userId,
    refundAmount: refundTotal,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { refundTotal, bonusDeduction };
}

export async function getTodaySalesSummary(shopId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, 'sales'),
    where('shopId', '==', shopId),
    where('status', '==', 'closed')
  );
  const snap = await getDocs(q);
  const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const todaySales = sales.filter((s) => {
    const d = s.closedAt?.toDate?.();
    return d && d >= today;
  });

  const totalRevenue = todaySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const totalCost = todaySales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalSqm = todaySales.reduce((sum, s) => sum + (s.totalSqm || 0), 0);

  return {
    count: todaySales.length,
    revenue: totalRevenue,
    profit: totalRevenue - totalCost,
    sqm: totalSqm,
  };
}

export async function getLast30DaysSales(shopId) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const q = query(
    collection(db, 'sales'),
    where('shopId', '==', shopId),
    where('status', '==', 'closed')
  );
  const snap = await getDocs(q);
  const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    const daySales = sales.filter((s) => {
      const sd = s.closedAt?.toDate?.();
      return sd && sd >= d && sd < next;
    });

    result.push({
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      revenue: daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
      count: daySales.length,
    });
  }
  return result;
}
