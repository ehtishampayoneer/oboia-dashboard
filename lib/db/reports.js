import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { calculateMargin } from '../calculations';
import { formatUZS } from '../currency';

export async function generateReport(shopId, dateFrom, dateTo, branchId = null) {
  const from = new Date(dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dateTo);
  to.setHours(23, 59, 59, 999);

  // Fetch all closed sales in range
  const salesSnap = await getDocs(
    query(
      collection(db, 'sales'),
      where('shopId', '==', shopId),
      where('status', '==', 'closed')
    )
  );
  let sales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  sales = sales.filter((s) => {
    const d = s.closedAt?.toDate?.();
    if (!d) return false;
    if (d < from || d > to) return false;
    if (branchId && s.branchId !== branchId) return false;
    return true;
  });

  // Fetch refunds
  const refundsSnap = await getDocs(
    query(collection(db, 'refunds'), where('shopId', '==', shopId))
  );
  const refunds = refundsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => {
    const d = r.createdAt?.toDate?.();
    return d && d >= from && d <= to;
  });

  // Summary
  const totalRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const totalSqm = sales.reduce((sum, s) => sum + (s.totalSqm || 0), 0);
  const profitMargin = calculateMargin(totalRevenue, totalCost);

  // Daily breakdown
  const dailyMap = {};
  for (const s of sales) {
    const d = s.closedAt?.toDate?.();
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    if (!dailyMap[key]) dailyMap[key] = { date: key, revenue: 0, count: 0 };
    dailyMap[key].revenue += s.totalAmount || 0;
    dailyMap[key].count += 1;
  }
  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Payment types breakdown
  const paymentMap = {};
  for (const s of sales) {
    for (const [type, amt] of Object.entries(s.payments || {})) {
      if (!paymentMap[type]) paymentMap[type] = { type, amount: 0, count: 0 };
      paymentMap[type].amount += Number(amt) || 0;
      paymentMap[type].count += 1;
    }
  }
  const paymentData = Object.values(paymentMap);

  // By product
  const productMap = {};
  for (const s of sales) {
    for (const item of s.items || []) {
      const id = item.wallpaperId;
      if (!productMap[id]) {
        productMap[id] = {
          id,
          name: item.wallpaperName || id,
          sqm: 0, rolls: 0, revenue: 0, cost: 0,
        };
      }
      productMap[id].sqm += item.sqm || 0;
      productMap[id].rolls += item.rolls || 0;
      productMap[id].revenue += item.total || 0;
      productMap[id].cost += (item.rolls || 0) * (item.costPrice || 0);
    }
  }
  const productData = Object.values(productMap)
    .map((p) => ({ ...p, profit: p.revenue - p.cost, margin: calculateMargin(p.revenue, p.cost) }))
    .sort((a, b) => b.revenue - a.revenue);

  // By employee
  const employeeMap = {};
  for (const s of sales) {
    const id = s.createdBy;
    if (!id) continue;
    if (!employeeMap[id]) employeeMap[id] = { id, name: s.sellerName || id, count: 0, revenue: 0, cost: 0 };
    employeeMap[id].count += 1;
    employeeMap[id].revenue += s.totalAmount || 0;
    employeeMap[id].cost += s.totalCost || 0;
  }
  const employeeData = Object.values(employeeMap).map((e) => ({
    ...e, profit: e.revenue - e.cost,
  }));

  // Online vs Offline
  let online = 0, offline = 0;
  for (const s of sales) {
    if (s.orderId) online += s.totalAmount || 0;
    else offline += s.totalAmount || 0;
  }

  return {
    summary: {
      totalRevenue, totalCost, totalProfit, profitMargin,
      totalSqm, totalOrders: sales.length, totalRefunds: refunds.length,
    },
    dailyData,
    paymentData,
    productData,
    employeeData,
    onlineOffline: [
      { name: 'Online', value: online },
      { name: 'Offline', value: offline },
    ],
    rawSales: sales,
  };
}

export async function exportToExcel(report, filename = 'report.xlsx') {
  const XLSX = (await import('xlsx')).default;

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Metric', 'Value'],
    ['Total Revenue (UZS)', report.summary.totalRevenue],
    ['Total Cost (UZS)', report.summary.totalCost],
    ['Total Profit (UZS)', report.summary.totalProfit],
    ['Profit Margin (%)', report.summary.profitMargin],
    ['Total Sqm', report.summary.totalSqm],
    ['Total Orders', report.summary.totalOrders],
    ['Total Refunds', report.summary.totalRefunds],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

  // By Product
  const productRows = [
    ['Product', 'Sqm', 'Rolls', 'Revenue (UZS)', 'Cost (UZS)', 'Profit (UZS)', 'Margin %'],
    ...report.productData.map((p) => [
      p.name, p.sqm.toFixed(2), p.rolls,
      p.revenue, p.cost, p.profit, p.margin,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productRows), 'By Product');

  // By Employee
  const empRows = [
    ['Employee', 'Sales Count', 'Revenue (UZS)', 'Profit (UZS)'],
    ...report.employeeData.map((e) => [e.name, e.count, e.revenue, e.profit]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empRows), 'By Employee');

  // By Payment Type
  const payRows = [
    ['Payment Type', 'Amount (UZS)', 'Count'],
    ...report.paymentData.map((p) => [p.type, p.amount, p.count]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payRows), 'By Payment Type');

  // Raw Sales
  const rawRows = [
    ['Receipt #', 'Date', 'Seller', 'Total (UZS)', 'Cost (UZS)', 'Profit (UZS)', 'Sqm'],
    ...report.rawSales.map((s) => [
      s.receiptNumber,
      s.closedAt?.toDate?.()?.toLocaleDateString() || '',
      s.sellerName || s.createdBy || '',
      s.totalAmount || 0,
      s.totalCost || 0,
      (s.totalAmount || 0) - (s.totalCost || 0),
      s.totalSqm || 0,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rawRows), 'Raw Sales Data');

  XLSX.writeFile(wb, filename);
}

export async function exportToPDF(report, filename = 'report.pdf') {
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(255, 211, 105);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(10, 10, 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('WallAR — Sales Report', 105, 13, { align: 'center' });

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 18, { align: 'center' });

  let y = 28;

  // Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Summary', 14, y);
  y += 5;

  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Revenue', formatUZS(report.summary.totalRevenue)],
      ['Total Cost', formatUZS(report.summary.totalCost)],
      ['Total Profit', formatUZS(report.summary.totalProfit)],
      ['Profit Margin', `${report.summary.profitMargin}%`],
      ['Total Sqm Sold', `${report.summary.totalSqm.toFixed(2)} m²`],
      ['Total Orders', report.summary.totalOrders],
      ['Total Refunds', report.summary.totalRefunds],
    ],
    theme: 'grid',
    headStyles: { fillColor: [255, 211, 105], textColor: [10, 10, 10], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Top Products
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Top Products', 14, y);
  y += 5;

  doc.autoTable({
    startY: y,
    head: [['Product', 'Sqm', 'Rolls', 'Revenue', 'Profit', 'Margin']],
    body: report.productData.slice(0, 15).map((p) => [
      p.name,
      p.sqm.toFixed(1),
      p.rolls,
      formatUZS(p.revenue),
      formatUZS(p.profit),
      `${p.margin}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 33, 40], textColor: [245, 245, 245] },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 10;

  // By Employee
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('By Employee', 14, y);
  y += 5;

  doc.autoTable({
    startY: y,
    head: [['Employee', 'Sales', 'Revenue', 'Profit']],
    body: report.employeeData.map((e) => [
      e.name, e.count, formatUZS(e.revenue), formatUZS(e.profit),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 33, 40], textColor: [245, 245, 245] },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}
