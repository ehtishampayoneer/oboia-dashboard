'use client';

import { useLanguage } from '../context/LanguageContext';

const STATUS_CONFIG = {
  // Order statuses
  pending: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    key: 'orders_pending',
  },
  negotiating: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    key: 'orders_negotiating',
  },
  ready: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    key: 'orders_ready',
  },
  closed: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    key: 'orders_closed',
  },
  cancelled: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    key: 'orders_cancelled',
  },
  // User statuses
  active: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    key: 'common_active',
  },
  inactive: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    key: 'common_inactive',
  },
  blocked: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    key: 'common_blocked',
  },
  // Approval statuses
  approved: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    key: 'common_approved',
  },
  rejected: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    key: 'common_rejected',
  },
  // Stock movement types
  in: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    key: 'warehouse_stock_in',
  },
  out: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    key: 'warehouse_stock_out',
  },
  sold: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    key: 'warehouse_sold',
  },
  refunded: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Refunded',
  },
  // Payment / bonus types
  earned: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    key: 'craftsmen_bonus_earned',
  },
  paid: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    key: 'craftsmen_bonus_paid',
  },
};

export default function StatusBadge({ status, label, size = 'sm' }) {
  const { t } = useLanguage();

  const config = STATUS_CONFIG[status?.toLowerCase()] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
  };

  const displayLabel =
    label || (config.key ? t(config.key) : status) || config.label || status;

  const sizeClasses =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5'
      : size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium capitalize
        ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      {displayLabel}
    </span>
  );
}
