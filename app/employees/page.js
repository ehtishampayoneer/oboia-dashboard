'use client';

import { useState, useEffect } from 'react';
import { Plus, Shield, ShieldOff, BarChart2 } from 'lucide-react';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { getAllEmployees, addEmployee, toggleBlock, getEmployeePerformance } from '../../lib/db/employees';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

export default function EmployeesPage() {
  const { shopId } = useAuth();
  const { t } = useLanguage();
  const { format } = useCurrency();

  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [perfModal, setPerfModal] = useState(null);
  const [perfData, setPerfData] = useState(null);
  const [blockModal, setBlockModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', role: 'seller', branchId: '',
  });

  const fetchData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [emps, branchSnap] = await Promise.all([
        getAllEmployees(shopId),
        getDocs(query(collection(db, 'branches'), where('shopId', '==', shopId))),
      ]);
      setEmployees(emps);
      setBranches(branchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error('Name, email and password are required');
      return;
    }
    setActionLoading(true);
    try {
      await addEmployee(shopId, form);
      toast.success(t('employees_add_success'));
      setAddModal(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'seller', branchId: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!blockModal) return;
    setActionLoading(true);
    try {
      await toggleBlock(blockModal.id, !blockModal.isBlocked);
      toast.success(blockModal.isBlocked ? t('employees_unblock_success') : t('employees_block_success'));
      setBlockModal(null);
      fetchData();
    } catch {
      toast.error(t('common_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const openPerf = async (emp) => {
    setPerfModal(emp);
    setPerfData(null);
    const data = await getEmployeePerformance(emp.uid || emp.id, shopId);
    setPerfData(data);
  };

  const getBranchName = (id) => {
    const b = branches.find((b) => b.id === id);
    return b ? (b.nameEn || b.nameUz) : '—';
  };

  const columns = [
    {
      key: 'name', label: t('employees_name'), accessor: 'name',
      render: (v, row) => (
        <div>
          <p className="text-text-main font-medium">{v || '—'}</p>
          <p className="text-subtext text-xs">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'phone', label: t('employees_phone'), accessor: 'phone',
      render: (v) => <span className="text-subtext text-sm">{v || '—'}</span>,
    },
    {
      key: 'role', label: t('employees_role'), accessor: 'role',
      render: (v) => (
        <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-full
          ${v === 'admin' ? 'bg-primary/20 text-primary' : 'bg-surface text-subtext'}`}>
          {v}
        </span>
      ),
    },
    {
      key: 'branch', label: t('employees_branch'),
      render: (_, row) => <span className="text-subtext text-sm">{getBranchName(row.branchId)}</span>,
    },
    {
      key: 'status', label: t('employees_status'), sortable: false,
      render: (_, row) => <StatusBadge status={row.isBlocked ? 'blocked' : 'active'} />,
    },
    {
      key: 'actions', label: t('common_actions'), sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openPerf(row)}
            className="p-1.5 rounded-lg bg-surface text-subtext hover:text-text-main hover:bg-white/10 transition-all"
            title={t('employees_performance')}
          >
            <BarChart2 size={14} />
          </button>
          <button
            onClick={() => setBlockModal(row)}
            className={`p-1.5 rounded-lg transition-all
              ${row.isBlocked
                ? 'bg-green-500/10 text-success hover:bg-green-500/20'
                : 'bg-red-500/10 text-error hover:bg-red-500/20'
              }`}
            title={row.isBlocked ? t('employees_unblock') : t('employees_block')}
          >
            {row.isBlocked ? <Shield size={14} /> : <ShieldOff size={14} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title={t('employees_title')}>
      <DataTable
        columns={columns}
        data={employees}
        loading={loading}
        actions={
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-secondary
              text-dark font-semibold text-sm transition-all hover:shadow-glow-sm"
          >
            <Plus size={16} />
            {t('employees_add')}
          </button>
        }
      />

      {/* Add Employee Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{t('employees_add')}</h2>
              <button onClick={() => setAddModal(false)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: t('employees_name'), key: 'name', type: 'text' },
                { label: t('employees_phone'), key: 'phone', type: 'tel' },
                { label: t('employees_email'), key: 'email', type: 'email' },
                { label: t('employees_password'), key: 'password', type: 'password' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-text-main mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('employees_role')}</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="seller">{t('employees_role_seller')}</option>
                  <option value="admin">{t('employees_role_admin')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">{t('employees_branch')}</label>
                <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">No branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameEn || b.nameUz}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setAddModal(false)} className="px-4 py-2 text-sm text-subtext border border-white/10 rounded-lg">
                {t('common_cancel')}
              </button>
              <button
                onClick={handleAdd}
                disabled={actionLoading}
                className="px-5 py-2 bg-primary hover:bg-secondary text-dark font-bold text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {actionLoading ? t('common_loading') : t('common_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Modal */}
      {perfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl shadow-card animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-text-main font-bold">{perfModal.name} — {t('employees_performance')}</h2>
              <button onClick={() => setPerfModal(null)} className="text-subtext hover:text-text-main">✕</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {!perfData ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Sales', value: perfData.count },
                      { label: t('employees_total_revenue'), value: format(perfData.revenue) },
                      { label: t('employees_total_profit'), value: format(perfData.profit) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-surface rounded-xl p-3 text-center">
                        <p className="text-subtext text-xs mb-1">{label}</p>
                        <p className="text-primary font-bold text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {perfData.sales.slice(0, 20).map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-surface rounded-lg text-sm">
                        <span className="font-mono text-subtext text-xs">{s.receiptNumber}</span>
                        <span className="text-primary font-semibold">{format(s.totalAmount || 0)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!blockModal}
        onClose={() => setBlockModal(null)}
        onConfirm={handleToggleBlock}
        title={blockModal?.isBlocked ? t('employees_unblock') : t('employees_block')}
        message={`${blockModal?.isBlocked ? t('employees_unblock') : t('employees_block')} ${blockModal?.name}?`}
        danger={!blockModal?.isBlocked}
        loading={actionLoading}
      />
    </Layout>
  );
}
