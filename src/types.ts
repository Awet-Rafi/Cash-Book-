export type Currency = 'USD' | 'SSP';

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  priceAtSale: number;
  costAtSale: number;
}

export interface Sale {
  id: string;
  businessId: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  totalCost: number;
  profit: number;
  timestamp: string;
  customerName?: string;
  customerId?: string | null;
  paymentMethod: 'cash' | 'credit';
  status: 'paid' | 'pending';
  currency: Currency;
  exchangeRate?: number;
  isConfirmed?: boolean;
  amountUSD?: number;
  amountSSP?: number;
  isMixed?: boolean;
}

export interface Expense {
  id: string;
  businessId: string;
  description: string;
  amount: number;
  category: string;
  timestamp: string;
  currency: Currency;
  exchangeRate?: number;
  amountUSD?: number;
  amountSSP?: number;
  isConfirmed?: boolean;
  employeeId?: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt?: string;
  memberIds?: string[];
}

export interface Payment {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  amount: number; // The actual amount paid in the specified 'currency'
  currency: Currency;
  creditDeductionUSD: number; // The USD value to subtract from credit balance
  amountUSD?: number; // Actual USD paid (for split payments)
  amountSSP?: number; // Actual SSP paid (for split payments)
  exchangeRate?: number;
  timestamp: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'pdf';
  isConfirmed?: boolean;
  status?: 'pending' | 'transferred';
  transferredAt?: string;
}

export interface CashTransaction {
  id: string;
  businessId: string;
  type: 'in' | 'out';
  amount: number;
  currency: Currency;
  notes: string;
  timestamp: string;
  isConfirmed?: boolean;
  customerId?: string;
  customerName?: string;
}

export interface Business {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  logoUrl?: string;
}

export interface UserProfile {
  uid: string;
  businessId: string;
  email: string;
  displayName: string;
}

export interface Employee {
  id: string;
  businessId: string;
  name: string;
  position: string;
  salary: number;
  salaryCurrency: Currency;
  hireDate: string;
  status: 'active' | 'inactive';
}
