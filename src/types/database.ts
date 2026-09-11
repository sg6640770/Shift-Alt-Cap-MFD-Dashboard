export type UserRole = 'admin' | 'partner';

export interface Partner {
  id: string;
  name: string;
  code: string; // maps to partners.partner_code
  created_at: string;
}

export interface Profile {
  id: string;
  role: UserRole;
  partner_id: string | null;
  created_at: string;
}

export interface RelationshipManager {
  id: string;
  partner_code: string; // relationship_managers has no partner_id, only partner_code
  name: string; // mapped from relationship_managers.full_name
  email: string | null;
  phone: string | null;
  created_at: string;
}

export type CustomerStatus = 'approved' | 'complete' | 'pending' | 'closed' | 'unlinked';

export interface Customer {
  id: string; // mapped from customers.cust_id
  partner_code: string | null;
  // NOTE: customers has no rm_id / relationship_manager_id column in the
  // current schema, so this is always null today. Kept on the type in case
  // a linking column is added later (see customers.raw / fin_transactions.ria_id).
  rm_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  account_number: string;
  status: CustomerStatus;
  total_invested: number | null;
  current_value: number | null;
  created_at: string | null; // mapped from customers.source_created_at
  relationship_managers: null;
}

export interface Order {
  id: string; // mapped from orders.order_id
  customer_id: string; // mapped from orders.cust_id
  partner_code: string | null;
  order_no: string | null;
  symbol: string | null;
  type: string | null;
  category: string | null;
  status: string | null;
  fullname: string | null; // denormalized customer name, present on the row itself
  created_at: string; // mapped from orders.source_created_at
  // NOTE: orders has no amount/value column in the current schema.
}

export interface FinTransaction {
  id: string;
  customer_id: string; // mapped from fin_transactions.cust_id
  order_id: string | null;
  ria_id: string | null;
  fin_tran_type_id: string | null; // e.g. 'DIV', 'DIVTAX'
  amount: number; // mapped from fin_transactions.account_amount
  balance: number | null; // mapped from fin_transactions.account_balance
  comment: string | null;
  created_at: string; // mapped from fin_transactions.tran_when
}

export interface DashboardSummary {
  partner_id: string; // vw_dashboard_summary.partner_id actually holds a partner_code value
  total_investors: number;
  active_investors: number;
  new_investors_7d: number;
  new_investors_30d: number;
  new_investors_90d: number;
  total_invested: number;
  total_current_value: number;
  monthly_growth: number;
}

export interface ActivityItem {
  id: string;
  customer_name: string;
  type: string;
  detail: string;
  timestamp: string;
  category: 'order' | 'transaction';
}
