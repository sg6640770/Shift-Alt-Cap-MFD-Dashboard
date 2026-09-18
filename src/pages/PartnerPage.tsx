import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Users, UserPlus, UserCog, Wallet, PieChart, Target, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Customer, RelationshipManager, ActivityItem, DashboardSummary } from '@/types/database';
import { MetricCard } from '@/components/MetricCard';
import { CustomerTable } from '@/components/CustomerTable';
import { ActivityFeed } from '@/components/ActivityFeed';
import { RMBreakdownModal } from '@/components/RMBreakdownModal';

type NewInvestorWindow = 7 | 30 | 90;

type CustomerSourceRow = Record<string, unknown>;

type RMSourceRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  partner_code: string;
  created_at: string;
};

type OrderSourceRow = {
  order_id: string;
  cust_id: string;
  symbol: string | null;
  type: string | null;
  category: string | null;
  status: string | null;
  fullname: string | null;
  source_created_at: string;
};

type FinTransactionSourceRow = {
  id: string;
  cust_id: string;
  fin_tran_type_id: string | null;
  account_amount: number | null;
  tran_when: string;
};

export function PartnerPage() {
  const { profile, signOut } = useAuth();

  // A partner is always scoped to their own profile.partner_code -- there is
  // no selector here, unlike AdminDashboard. If a partner-role profile
  // somehow has no partner_code, we treat that as "nothing to show" rather
  // than silently falling back to all data.
  const partnerCode = profile?.partner_code ?? null;

  const [newInvestorWindow, setNewInvestorWindow] = useState<NewInvestorWindow>(30);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);

  const [rms, setRms] = useState<RelationshipManager[]>([]);
  const [rmCounts, setRmCounts] = useState<Array<{ rm: RelationshipManager; customer_count: number }>>([]);
  const [rmModalOpen, setRmModalOpen] = useState(false);
  const [rmLoading, setRmLoading] = useState(false);

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  // Load dashboard summary, scoped to this partner only.
  const loadSummary = useCallback(async () => {
    if (!partnerCode) {
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    const { data, error } = await supabase
      .from('vw_dashboard_summary')
      .select('*')
      .eq('partner_id', partnerCode);

    if (error) {
      console.error('summary:', error.message);
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    setSummary((data as DashboardSummary[])[0] ?? null);
    setSummaryLoading(false);
  }, [partnerCode]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = useCallback(async () => {
    if (!partnerCode) return;
    setRefreshing(true);
    try {
      const { error } = await supabase.rpc('refresh_dashboard_summary_rpc', {
        p_partner_code: partnerCode,
      });
      if (error) {
        console.error('refresh:', error.message);
      }
      await loadSummary();
    } finally {
      setRefreshing(false);
    }
  }, [partnerCode, loadSummary]);

  // Load customer records, scoped to this partner only.
  useEffect(() => {
    if (!partnerCode) {
      setCustomers([]);
      setCustomersLoading(false);
      return;
    }
    setCustomersLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('partner_code', partnerCode);

      if (error) {
        console.error('customers:', error.message);
        setCustomers([]);
        setCustomersLoading(false);
        return;
      }

      const mappedCustomers: Customer[] = ((data ?? []) as CustomerSourceRow[]).map((row) => {
        const name = stringValue(row.name) ?? stringValue(row.full_name);
        const email = stringValue(row.email) ?? stringValue(row.email_address) ?? stringValue(row.user_name);
        const createdAt = stringValue(row.created_at) ?? stringValue(row.source_created_at);

        return {
          id: stringValue(row.id) ?? stringValue(row.cust_id) ?? crypto.randomUUID(),
          partner_code: stringValue(row.partner_code) ?? partnerCode,
          rm_id: stringValue(row.rm_id) ?? stringValue(row.relationship_manager_id) ?? null,
          name: name && name !== '--' ? name : stringValue(row.user_name) ?? 'Unknown customer',
          email: email && email !== '--' ? email : null,
          phone: stringValue(row.phone) ?? stringValue(row.phone_num),
          account_number: stringValue(row.account_number) ?? stringValue(row.account_num) ?? '—',
          status: normalizeCustomerStatus(stringValue(row.status)),
          total_invested: numberValue(row.total_invested),
          current_value: numberValue(row.current_value),
          created_at: createdAt,
          relationship_managers: null,
        };
      });

      mappedCustomers.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      setCustomers(mappedCustomers);
      setCustomersLoading(false);
    })();
  }, [partnerCode]);

  // Load this partner's RMs.
  useEffect(() => {
    if (!partnerCode) {
      setRms([]);
      setRmLoading(false);
      return;
    }
    setRmLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('relationship_managers')
        .select('*')
        .eq('partner_code', partnerCode);

      if (error) {
        console.error('rms:', error.message);
        setRms([]);
        setRmLoading(false);
        return;
      }
      const mapped: RelationshipManager[] = ((data ?? []) as RMSourceRow[]).map((row) => ({
        id: row.id,
        partner_code: row.partner_code,
        name: row.full_name,
        email: row.email,
        phone: row.phone,
        created_at: row.created_at,
      }));
      setRms(mapped);
      setRmLoading(false);
    })();
  }, [partnerCode]);

  // Same caveat as AdminDashboard: no rm_id linkage exists on customers yet,
  // so we report the real RM headcount but can't honestly break down
  // customers-per-RM until a linking field exists.
  const rmBreakdown = useMemo(
    () => rms.map((rm) => ({ rm, customer_count: 0 })),
    [rms]
  );

  useEffect(() => {
    setRmCounts(rmBreakdown);
  }, [rmBreakdown]);

  const rmWithCustomersCount = rms.length;

  // Load activity feed (orders + fin_transactions), scoped to this partner.
  const loadActivity = useCallback(async () => {
    if (!partnerCode) {
      setActivity([]);
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    const limit = 20;

    const orderQuery = supabase
      .from('orders')
      .select('order_id, cust_id, symbol, type, category, status, fullname, source_created_at')
      .eq('partner_code', partnerCode)
      .order('source_created_at', { ascending: false })
      .limit(limit);

    const { data: custRows, error: custErr } = await supabase
      .from('customers')
      .select('cust_id')
      .eq('partner_code', partnerCode);
    if (custErr) {
      console.error('activity (customer lookup):', custErr.message);
    }
    const custIds = (custRows ?? []).map((c: { cust_id: string }) => c.cust_id);

    if (custIds.length === 0) {
      const { data: orderData, error: orderErr } = await orderQuery;
      if (orderErr) {
        console.error('activity:', orderErr.message);
        setActivity([]);
        setActivityLoading(false);
        return;
      }
      const orderItems: ActivityItem[] = ((orderData as OrderSourceRow[] | null) ?? []).map((o) => ({
        id: `order-${o.order_id}`,
        customer_name: o.fullname ?? 'Unknown',
        type: `Order: ${o.symbol ?? '—'}`,
        detail: [o.type, o.category, o.status].filter(Boolean).join(' · ') || '—',
        timestamp: o.source_created_at,
        category: 'order' as const,
      }));
      setActivity(orderItems.slice(0, limit));
      setActivityLoading(false);
      return;
    }

    const finQuery = supabase
      .from('fin_transactions')
      .select('id, cust_id, fin_tran_type_id, account_amount, tran_when')
      .in('cust_id', custIds)
      .order('tran_when', { ascending: false })
      .limit(limit);

    const [ordersRes, finRes] = await Promise.all([orderQuery, finQuery]);

    if (ordersRes.error || finRes.error) {
      console.error('activity:', ordersRes.error?.message ?? finRes.error?.message);
      setActivity([]);
      setActivityLoading(false);
      return;
    }

    const orderItems: ActivityItem[] = ((ordersRes.data as OrderSourceRow[] | null) ?? []).map((o) => ({
      id: `order-${o.order_id}`,
      customer_name: o.fullname ?? customers.find((c) => c.id === o.cust_id)?.name ?? 'Unknown',
      type: `Order: ${o.symbol ?? '—'}`,
      detail: [o.type, o.category, o.status].filter(Boolean).join(' · ') || '—',
      timestamp: o.source_created_at,
      category: 'order' as const,
    }));

    const finItems: ActivityItem[] = ((finRes.data as FinTransactionSourceRow[] | null) ?? []).map((t) => ({
      id: `fin-${t.id}`,
      customer_name: customers.find((customer) => customer.id === t.cust_id)?.name ?? 'Unknown',
      type:
        t.fin_tran_type_id === 'DIV'
          ? 'Dividend'
          : t.fin_tran_type_id === 'DIVTAX'
            ? 'Dividend Tax'
            : t.fin_tran_type_id ?? 'Transaction',
      detail: formatCurrency(Number(t.account_amount ?? 0)),
      timestamp: t.tran_when,
      category: 'transaction' as const,
    }));

    const merged = [...orderItems, ...finItems]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    setActivity(merged);
    setActivityLoading(false);
  }, [customers, partnerCode]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const newInvestorValue = summary
    ? newInvestorWindow === 7
      ? summary.new_investors_7d
      : newInvestorWindow === 30
        ? summary.new_investors_30d
        : summary.new_investors_90d
    : 0;

  const totalGrowth = useMemo(() => {
    if (!summary) return null;
    const invested = Number(summary.total_invested);
    const current = Number(summary.total_current_value);
    if (!invested) return null;
    const amount = current - invested;
    const percent = (amount / invested) * 100;
    return { amount, percent };
  }, [summary]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/brain.png" alt="BrainTree Capital" className="w-8 h-8 rounded-full object-cover" />
            <span className="text-base font-bold text-gray-900 hidden sm:inline">BrainTree Capital</span>
            <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full">
              Partner
            </span>
            {partnerCode && (
              <span className="ml-1 text-sm text-gray-500 hidden sm:inline">{partnerCode}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {!partnerCode ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <p className="text-sm font-medium text-amber-800">
              Your account isn't linked to a partner yet. Contact an administrator to get access to your dashboard.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Overview</h2>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  label="Total Investors"
                  value={summary ? Number(summary.total_investors) : 0}
                  icon={Users}
                  loading={summaryLoading}
                />
                <MetricCard
                  label="Active Investors"
                  value={summary ? Number(summary.active_investors) : 0}
                  icon={UserPlus}
                  loading={summaryLoading}
                />
                <MetricCard
                  label="New Investors"
                  value={newInvestorValue}
                  icon={TrendingUp}
                  loading={summaryLoading}
                  toggle={
                    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                      {([7, 30, 90] as const).map((d) => (
                        <button
                          key={d}
                          onClick={(e) => { e.stopPropagation(); setNewInvestorWindow(d); }}
                          className={[
                            'px-2 py-0.5 text-xs font-medium rounded transition-colors',
                            newInvestorWindow === d
                              ? 'bg-white text-amber-700 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700',
                          ].join(' ')}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  }
                />
                <MetricCard
                  label="Relationship Managers"
                  value={rmWithCustomersCount}
                  icon={UserCog}
                  loading={rmLoading}
                  clickable
                  onClick={() => setRmModalOpen(true)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <MetricCard
                  label="Total Investment"
                  value={summary ? formatCurrency(Number(summary.total_invested), 2) : null}
                  icon={Wallet}
                  loading={summaryLoading}
                />
                <MetricCard
                  label="Current Portfolio"
                  value={summary ? formatCurrency(Number(summary.total_current_value), 2) : null}
                  icon={PieChart}
                  loading={summaryLoading}
                />
                <MetricCard
                  label="Total Growth"
                  value={
                    totalGrowth ? (
                      <span className={totalGrowth.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {totalGrowth.amount >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(totalGrowth.amount), 2)}
                        <span className="text-base font-semibold ml-1.5">
                          ({totalGrowth.amount >= 0 ? '+' : '−'}
                          {Math.abs(totalGrowth.percent).toFixed(1)}%)
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400 text-base font-semibold">N/A</span>
                    )
                  }
                  icon={totalGrowth && totalGrowth.amount < 0 ? TrendingDown : TrendingUp}
                  loading={summaryLoading}
                />
                <MetricCard
                  label="Portfolio Allocation"
                  value={null}
                  icon={Target}
                  pending
                  pendingTooltip="Allocation breakdown requires a connected portfolio data feed. This will show asset allocation distribution."
                />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Investors</h2>
              <CustomerTable customers={customers} loading={customersLoading} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Activity</h2>
              <ActivityFeed items={activity} loading={activityLoading} />
            </div>
          </>
        )}
      </main>

      <RMBreakdownModal
        open={rmModalOpen}
        onClose={() => setRmModalOpen(false)}
        data={rmCounts}
        loading={rmLoading}
      />
    </div>
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCustomerStatus(status: string | null): Customer['status'] {
  switch (status) {
    case 'KYC_APPROVED':
      return 'approved';
    case 'COMPLETE':
      return 'complete';
    case 'CLOSED':
      return 'closed';
    case 'KYC_DENIED':
      return 'closed';
    case 'DOCUMENTS':
    case 'PERSONAL_DETAILS':
    case 'PAN_DETAILS':
    case 'LEGAL_DETAILS':
    case 'DOCUMENTS_OLD':
    case 'KYC_DOC_REQUIRED':
    case 'KYC_MANUAL_REVIEW':
      return 'pending';
    default:
      return status ? 'pending' : 'unlinked';
  }
}

function formatCurrency(amount: number, fractionDigits: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
