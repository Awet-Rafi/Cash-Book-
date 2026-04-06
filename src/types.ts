export interface Product {
  id: string;
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
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  totalCost: number;
  profit: number;
  timestamp: string;
  customerName?: string;
  paymentMethod: 'cash' | 'credit';
  status: 'paid' | 'pending';
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  timestamp: string;
  notes?: string;
}
