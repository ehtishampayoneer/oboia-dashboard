'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({
  label,
  value,
  secondary,
  icon: Icon,
  trend,
  trendLabel,
  loading = false,
  highlight = false,
}) {
  const trendPositive = trend > 0;
  const trendNeutral = trend === 0 || trend === null || trend === undefined;

  return (
    <div
      className={`relative bg-card rounded-xl p-5 border border-white/5 overflow-hidden
        ${highlight ? 'shadow-glow' : ''}
        transition-all duration-200 hover:border-primary/20 hover:shadow-glow-sm`}
    >
      {/* Gold top border accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-secondary to-transparent" />

      <div className="flex items-start justify-between mb-3">
        <span className="text-subtext text-sm font-medium">{label}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon size={18} className="text-primary" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-32 bg-surface animate-pulse rounded" />
          <div className="h-4 w-20 bg-surface animate-pulse rounded" />
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold text-primary mb-1 truncate">
            {value ?? '—'}
          </div>

          {secondary && (
            <div className="text-subtext text-sm truncate">{secondary}</div>
          )}

          {!trendNeutral && (
            <div
              className={`flex items-center gap-1 mt-2 text-xs font-medium
              ${trendPositive ? 'text-success' : 'text-error'}`}
            >
              {trendPositive ? (
                <TrendingUp size={12} />
              ) : (
                <TrendingDown size={12} />
              )}
              <span>
                {trendPositive ? '+' : ''}
                {trend}%{trendLabel ? ` ${trendLabel}` : ''}
              </span>
            </div>
          )}

          {trendNeutral && trendLabel && (
            <div className="flex items-center gap-1 mt-2 text-xs text-subtext">
              <Minus size={12} />
              <span>{trendLabel}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
