import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Customer } from '@/types/database';

type StatusFilter = 'all' | Customer['status'];
type SortKey = 'name' | 'account_number' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

interface CustomerTableProps {
  customers: Customer[];
  loading: boolean;
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
  { key: 'unlinked', label: 'Unlinked' },
];

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<Customer['status'], string> = {
  approved: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  closed: 'bg-gray-100 text-gray-500',
  unlinked: 'bg-gray-50 text-gray-400',
};

function formatMoney(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CustomerTable({ customers, loading }: CustomerTableProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        c.account_number.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [customers, query, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'account_number') cmp = a.account_number.localeCompare(b.account_number);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'created_at') cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [customers, query, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(currentPage, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paginated = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortHeader({ label, sortableKey }: { label: string; sortableKey: SortKey }) {
    const active = sortKey === sortableKey;
    return (
      <button
        onClick={() => toggleSort(sortableKey)}
        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide"
      >
        {label}
        <span className={active ? 'text-gray-700' : 'text-gray-300'}>
          {active && sortDir === 'desc' ? '▾' : '▴'}
        </span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, account, or phone..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={[
                'px-3 py-1 text-xs font-medium rounded-full border',
                statusFilter === tab.key
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3"><SortHeader label="Name" sortableKey="name" /></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-3"><SortHeader label="Account" sortableKey="account_number" /></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner Code</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Invested</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Value</th>
              <th className="text-left px-4 py-3"><SortHeader label="Status" sortableKey="status" /></th>
              <th className="text-left px-4 py-3"><SortHeader label="Created" sortableKey="created_at" /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">Loading investors…</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">No investors match this view.</td>
              </tr>
            ) : (
              paginated.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.account_number}</td>
                  <td className="px-4 py-3 text-gray-600">{c.partner_code ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{formatMoney(c.total_invested)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{formatMoney(c.current_value)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
          <span className="text-xs text-gray-500">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              title="Previous page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-gray-600">Page {page} of {pageCount}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((value) => Math.min(pageCount, value + 1))}
              disabled={page === pageCount}
              aria-label="Next page"
              title="Next page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}