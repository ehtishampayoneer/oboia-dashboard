'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function DataTable({
  columns,
  data,
  loading = false,
  searchable = true,
  searchPlaceholder,
  pageSize = 10,
  onRowClick,
  emptyMessage,
  actions,
  keyField = 'id',
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = [...data];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = col.accessor ? row[col.accessor] : null;
          return val && String(val).toLowerCase().includes(q);
        })
      );
    }
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        let cmp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, sortField, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const from = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered.length);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronsUpDown size={14} className="text-subtext/50" />;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-primary" />
      : <ChevronDown size={14} className="text-primary" />;
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="h-9 w-56 bg-surface animate-pulse rounded-lg" />
        </div>
        <div className="divide-y divide-white/5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 p-4">
              {columns.map((_, j) => (
                <div key={j} className="h-4 bg-surface animate-pulse rounded flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-white/5 overflow-hidden">
      {(searchable || actions) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-white/5">
          {searchable && (
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={searchPlaceholder || t('common_search')}
                className="pl-4 pr-4 py-2 text-sm bg-surface border border-white/10 rounded-lg
                  text-text-main placeholder-subtext focus:border-primary/50 focus:outline-none
                  focus:ring-1 focus:ring-primary/20 w-full transition-all"
              />
            </div>
          )}
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {columns.map((col) => (
                <th
                  key={col.key || col.accessor}
                  className={`px-4 py-3 text-left text-xs font-semibold text-subtext uppercase tracking-wider
                    ${col.sortable !== false && col.accessor ? 'cursor-pointer hover:text-text-main select-none' : ''}
                    ${col.width ? col.width : ''}`}
                  onClick={() => col.sortable !== false && col.accessor && handleSort(col.accessor)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable !== false && col.accessor && (
                      <SortIcon field={col.accessor} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="text-subtext text-sm">
                    {emptyMessage || t('common_no_results')}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={row[keyField] || Math.random()}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors duration-100
                    ${onRowClick ? 'cursor-pointer hover:bg-surface' : 'hover:bg-white/[0.02]'}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key || col.accessor}
                      className={`px-4 py-3 text-sm text-text-main ${col.className || ''}`}
                    >
                      {col.render
                        ? col.render(row[col.accessor], row)
                        : (row[col.accessor] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-white/5">
          <span className="text-xs text-subtext">
            {t('common_showing')} {from}–{to} {t('common_of')} {filtered.length} {t('common_entries')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-subtext hover:text-text-main hover:bg-surface
                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            {[...Array(totalPages)].map((_, i) => {
              const p = i + 1;
              if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) {
                if (p === 2 || p === totalPages - 1) return <span key={p} className="text-subtext px-1">…</span>;
                return null;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-all
                    ${page === p
                      ? 'bg-primary text-dark'
                      : 'text-subtext hover:text-text-main hover:bg-surface'}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-subtext hover:text-text-main hover:bg-surface
                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
