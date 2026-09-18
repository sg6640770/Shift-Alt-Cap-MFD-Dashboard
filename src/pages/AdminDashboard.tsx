import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Users, UserPlus, UserCog, Wallet, PieChart, Target, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Partner, Customer, RelationshipManager, ActivityItem, DashboardSummary } from '@/types/database';
import { PartnerSelector } from '@/components/PartnerSelector';
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

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
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

  // customers / vw_dashboard_summary are keyed by partner_code (text), not by
  // partners.id (uuid) -- the selector gives us the uuid, so look up the
  // matching code once here and filter by that everywhere below.
  // NOTE: the partners table's real column is `partner_code`, not `code`.
  const selectedPartnerCode = useMemo(() => {
    if (!selectedPartnerId) return null;
    return partners.find((p) => p.id === selectedPartnerId)?.partner_code ?? null;
  }, [selectedPartnerId, partners]);

  // Load partners list
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('partners').select('*').order('name');
      if (error) { console.error('partners:', error.message); return; }
      setPartners(data as Partner[]);
    })();
  }, []);

  // Load dashboard summary
  // NOTE: `vw_dashboard_summary` is a real table (despite the vw_ name). It is
  // kept up to date automatically by a trigger on `customers` -- see
  // 2026_dashboard_summary_autocalc_v2.sql. loadSummary() just reads the
  // current values; handleRefresh (below) recomputes them first.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    let query = supabase.from('vw_dashboard_summary').select('*');
    if (selectedPartnerCode) {
      query = query.eq('partner_id', selectedPartnerCode);
    }
    const { data, error } = await query;
    if (error) {
      console.error('summary:', error.message);
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    if (!selectedPartnerCode) {
      // Aggregate across all partners
      const rows = data as DashboardSummary[];
      if (rows.length === 0) {
        setSummary(null);
      } else {
        setSummary({
          partner_id: 'all',
          total_investors: rows.reduce((s, r) => s + Number(r.total_investors), 0),
          active_investors: rows.reduce((s, r) => s + Number(r.active_investors), 0),
          new_investors_7d: rows.reduce((s, r) => s + Number(r.new_investors_7d), 0),
          new_investors_30d: rows.reduce((s, r) => s + Number(r.new_investors_30d), 0),
          new_investors_90d: rows.reduce((s, r) => s + Number(r.new_investors_90d), 0),
          total_invested: rows.reduce((s, r) => s + Number(r.total_invested ?? 0), 0),
          total_current_value: rows.reduce((s, r) => s + Number(r.total_current_value ?? 0), 0),
          monthly_growth: 0,
        });
      }
    } else {
      setSummary((data as DashboardSummary[])[0] ?? null);
    }
    setSummaryLoading(false);
  }, [selectedPartnerCode]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Manual "Refresh" button: recompute vw_dashboard_summary from customers
  // right now (via the refresh_dashboard_summary_rpc SQL function), then
  // re-read it. The trigger already keeps things in sync on every write, so
  // this is mainly for the 7d/30d/90d windows, which only "age" on a write --
  // and for peace of mind after a bulk external sync into customers.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.rpc('refresh_dashboard_summary_rpc', {
        p_partner_code: selectedPartnerCode,
      });
      if (error) {
        console.error('refresh:', error.message);
      }
      await loadSummary();
    } finally {
      setRefreshing(false);
    }
  }, [selectedPartnerCode, loadSummary]);

  // Load customer records from Supabase.
  useEffect(() => {
    setCustomersLoading(true);
    (async () => {
      let customerQuery = supabase.from('customers').select('*');
      if (selectedPartnerCode) {
        customerQuery = customerQuery.eq('partner_code', selectedPartnerCode);
      }
      const { data, error } = await customerQuery;

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
          partner_code: stringValue(row.partner_code) ?? partnerCodeForId(row.partner_id, partners),
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
  }, [partners, selectedPartnerCode]);

  // Load RMs.
  // NOTE: relationship_managers uses full_name (not name) and partner_code
  // (not partner_id) -- mapped below to match the RelationshipManager type.
  useEffect(() => {
    setRmLoading(true);
    (async () => {
      let query = supabase.from('relationship_managers').select('*');
      if (selectedPartnerCode) {
        query = query.eq('partner_code', selectedPartnerCode);
      }
      const { data, error } = await query;
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
  }, [selectedPartnerCode]);

  // IMPORTANT: `customers` has no rm_id / relationship_manager_id column, and
  // no other table we can see links a customer to a specific RM. So we can't
  // honestly compute "customers per RM" yet -- rmCounts below reports 0 for
  // everyone rather than making up a number. The metric card shows the real
  // RM headcount instead. If a linking field turns up (e.g. inside
  // customers.raw, or via fin_transactions.ria_id), this can be wired up for
  // real.
  const rmBreakdown = useMemo(
    () => rms.map((rm) => ({ rm, customer_count: 0 })),
    [rms]
  );

  useEffect(() => {
    setRmCounts(rmBreakdown);
  }, [rmBreakdown]);

  const rmWithCustomersCount = rms.length;

  // Load activity feed (orders + fin_transactions)
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    const limit = 20;

    // orders has partner_code directly -- no join needed to filter it.
    let orderQuery = supabase
      .from('orders')
      .select('order_id, cust_id, symbol, type, category, status, fullname, source_created_at')
      .order('source_created_at', { ascending: false })
      .limit(limit);

    if (selectedPartnerCode) {
      orderQuery = orderQuery.eq('partner_code', selectedPartnerCode);
    }

    // fin_transactions has no partner_code column, only cust_id -- so filtering
    // it by partner still needs the customer id list.
    let finQuery = supabase
      .from('fin_transactions')
      .select('id, cust_id, fin_tran_type_id, account_amount, tran_when')
      .order('tran_when', { ascending: false })
      .limit(limit);

    if (selectedPartnerCode) {
      const { data: custRows, error: custErr } = await supabase
        .from('customers')
        .select('cust_id')
        .eq('partner_code', selectedPartnerCode);
      if (custErr) {
        console.error('activity (customer lookup):', custErr.message);
      }
      const custIds = (custRows ?? []).map((c: { cust_id: string }) => c.cust_id);
      if (custIds.length === 0) {
        setActivity([]);
        setActivityLoading(false);
        return;
      }
      finQuery = finQuery.in('cust_id', custIds);
    }

    const [ordersRes, finRes] = await Promise.all([orderQuery, finQuery]);

    if (ordersRes.error || finRes.error) {
      console.error('activity:', ordersRes.error?.message ?? finRes.error?.message);
      setActivity([]);
      setActivityLoading(false);
      return;
    }

    // orders has no amount column, so the detail line uses type/category/status
    // instead of a currency figure. fullname is denormalized onto the order
    // row itself, so we use it directly rather than looking the customer up.
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
  }, [customers, selectedPartnerCode]);

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

  // Total Growth = current portfolio value vs. what was actually invested.
  // Positive means investors are up overall, negative means down. Guarded
  // against divide-by-zero when total_invested is 0 (e.g. no data yet).
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/brain.png" alt="BrainTree Capital" className="w-8 h-8 rounded-full object-cover" />
            <span className="text-base font-bold text-gray-900 hidden sm:inline">BrainTree Capital</span>
            <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <PartnerSelector
              partners={partners}
              selectedId={selectedPartnerId}
              onChange={setSelectedPartnerId}
            />
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
        {/* Metric Cards */}
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
            {/* Total Investors */}
            <MetricCard
              label="Total Investors"
              value={summary ? Number(summary.total_investors) : 0}
              icon={Users}
              loading={summaryLoading}
            />

            {/* Active Investors */}
            <MetricCard
              label="Active Investors"
              value={summary ? Number(summary.active_investors) : 0}
              icon={UserPlus}
              loading={summaryLoading}
            />

            {/* New Investors with toggle */}
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

            {/* Relationship Managers */}
            <MetricCard
              label="Relationship Managers"
              value={rmWithCustomersCount}
              icon={UserCog}
              loading={rmLoading}
              clickable
              onClick={() => setRmModalOpen(true)}
            />
          </div>

          {/* Pending metrics */}
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

        {/* Customer Table */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Investors</h2>
          <CustomerTable customers={customers} loading={customersLoading} />
        </div>

        {/* Activity Feed */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Activity</h2>
          <ActivityFeed items={activity} loading={activityLoading} />
        </div>
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

// NOTE: the partners table's real column is `partner_code`, not `code`.
function partnerCodeForId(partnerId: unknown, partners: Partner[]): string | null {
  const id = stringValue(partnerId);
  return id ? partners.find((partner) => partner.id === id)?.partner_code ?? null : null;
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
