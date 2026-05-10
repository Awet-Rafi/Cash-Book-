import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, Sale, Expense, Payment, CashTransaction, Customer } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  ShoppingCart, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  Layers
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';

import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { businessId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingSales, setPendingSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('businessId', '==', businessId)), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const unsubSales = onSnapshot(query(
      collection(db, 'sales'), 
      where('businessId', '==', businessId), 
      orderBy('timestamp', 'desc'),
      limit(5000)
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const unsubPendingSales = onSnapshot(query(
      collection(db, 'sales'),
      where('businessId', '==', businessId),
      where('paymentMethod', '==', 'credit'),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc'),
      limit(5000)
    ), (snapshot) => {
      setPendingSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const unsubExpenses = onSnapshot(query(
      collection(db, 'expenses'), 
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc'),
      limit(500)
    ), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Expense)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    const unsubPayments = onSnapshot(query(
      collection(db, 'payments'), 
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Payment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    });

    const unsubCashTransactions = onSnapshot(query(
      collection(db, 'cashTransactions'), 
      where('businessId', '==', businessId), 
      orderBy('timestamp', 'desc'),
      limit(200)
    ), (snapshot) => {
      setCashTransactions(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as CashTransaction)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cashTransactions');
    });

    const unsubCustomers = onSnapshot(query(
      collection(db, 'customers'),
      where('businessId', '==', businessId)
    ), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    return () => {
      unsubProducts();
      unsubSales();
      unsubPendingSales();
      unsubExpenses();
      unsubPayments();
      unsubCashTransactions();
      unsubCustomers();
    };
  }, [businessId]);

  const statsCalculations = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Revenue Tracking & Cash Tracking in one pass
    const aggregatedSales = sales.reduce((acc, s) => {
      const saleDate = new Date(s.timestamp);
      const amountUSD = s.currency === 'SSP' ? (s.totalAmount / (s.exchangeRate || 1000)) : s.totalAmount;
      
      if (isWithinInterval(saleDate, { start: thisMonthStart, end: thisMonthEnd })) {
        acc.currentMonthRevenue += amountUSD;
        if (s.paymentMethod === 'cash' || s.status === 'paid') {
          if (s.currency === 'USD') acc.cashUSD += s.totalAmount;
          else acc.cashSSP += s.totalAmount;
        }
      } else if (isWithinInterval(saleDate, { start: lastMonthStart, end: lastMonthEnd })) {
        acc.lastMonthRevenue += amountUSD;
      }

      if (isWithinInterval(saleDate, { start: thisWeekStart, end: thisWeekEnd })) {
        acc.weeklyRevenue += amountUSD;
      }

      return acc;
    }, { currentMonthRevenue: 0, lastMonthRevenue: 0, weeklyRevenue: 0, cashUSD: 0, cashSSP: 0 });

    const revenueGrowth = aggregatedSales.lastMonthRevenue === 0 ? 100 : ((aggregatedSales.currentMonthRevenue - aggregatedSales.lastMonthRevenue) / aggregatedSales.lastMonthRevenue) * 100;

    const repaymentTotals = payments.reduce((acc, p) => {
      if (p.status !== 'transferred' && p.status) return acc;
      if ((p.amountUSD || 0) > 0) acc.usd += p.amountUSD!;
      else if (p.currency === 'USD') acc.usd += p.amount;
      
      if ((p.amountSSP || 0) > 0) acc.ssp += p.amountSSP!;
      else if (p.currency === 'SSP') acc.ssp += p.amount;
      
      return acc;
    }, { usd: 0, ssp: 0 });

    const expenseTotals = expenses.reduce((acc, e) => {
      if (e.currency === 'SSP') acc.ssp += e.amount;
      else acc.usd += e.amount;
      return acc;
    }, { usd: 0, ssp: 0 });

    const manualTotals = cashTransactions.reduce((acc, t) => {
      const val = t.type === 'in' ? t.amount : -t.amount;
      if (t.currency === 'SSP') acc.ssp += val;
      else acc.usd += val;
      return acc;
    }, { usd: 0, ssp: 0 });

    const cashInHandUSD = (aggregatedSales.cashUSD + repaymentTotals.usd + manualTotals.usd) - expenseTotals.usd;
    const cashInHandSSP = (aggregatedSales.cashSSP + repaymentTotals.ssp + manualTotals.ssp) - expenseTotals.ssp;

    // Outstanding Tracking - Synchronized with CustomerLedger per-customer logic
    const outstandingUSD = customers.reduce((totalDebt, customer) => {
      const isCashSalesCustomer = customer.name === 'Cash Sales';
      
      const totalCreditSales = pendingSales
        .filter(s => {
          const isDirectSale = s.customerId === customer.id || s.customerName === customer.name;
          if (isCashSalesCustomer) {
            const isGuestSale = s.customerName === 'Guest' || !s.customerId;
            return isDirectSale || isGuestSale;
          }
          return isDirectSale;
        })
        .reduce((acc, s) => {
          const amountUSD = s.currency === 'SSP' ? (s.totalAmount / (s.exchangeRate || 1000)) : s.totalAmount;
          return acc + amountUSD;
        }, 0);

      const totalRepayments = payments
        .filter(p => {
          const isDirectPayment = p.customerId === customer.id;
          if (isCashSalesCustomer) {
            const isUnmappedPayment = !p.customerId;
            return isDirectPayment || isUnmappedPayment;
          }
          return isDirectPayment;
        })
        .filter(p => p.status === 'transferred' || (!p.status && p.isConfirmed))
        .reduce((acc, p) => {
          const reductionUSD = p.creditDeductionUSD ?? (p.currency === 'SSP' ? (p.amount / (p.exchangeRate || 1000)) : p.amount);
          return acc + reductionUSD;
        }, 0);

      const netOwed = totalCreditSales - totalRepayments;
      // Mirroring CustomerLedger summary logic which allows negative balances to offset
      return totalDebt + netOwed;
    }, 0);

    // Collections (Weekly/Monthly)
    const getCollections = (start: Date, end: Date) => {
      let collectedUSD = 0;
      let collectedSSP = 0;

      sales.filter(s => (s.paymentMethod === 'cash' || s.status === 'paid') && isWithinInterval(new Date(s.timestamp), { start, end })).forEach(s => {
        if (s.isMixed) {
          collectedUSD += (s.amountUSD || 0);
          collectedSSP += (s.amountSSP || 0);
        } else if (s.currency === 'USD') {
          collectedUSD += s.totalAmount;
        } else {
          collectedSSP += s.totalAmount;
        }
      });

      payments.filter(p => (!p.status || p.status === 'transferred') && isWithinInterval(new Date(p.timestamp), { start, end })).forEach(p => {
        collectedUSD += (p.amountUSD || (p.currency === 'USD' ? p.amount : 0));
        collectedSSP += (p.amountSSP || (p.currency === 'SSP' ? p.amount : 0));
      });

      return { collectedUSD, collectedSSP };
    };

    const weeklyCollections = getCollections(thisWeekStart, thisWeekEnd);
    const monthlyCollections = getCollections(thisMonthStart, thisMonthEnd);

    // Inventory
    const lowStockCount = products.filter(p => p.stockQuantity <= 5).length;

    // Chart Data
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'MMM dd');
    }).reverse();

    const chartData = last7Days.map(day => {
      const daySales = sales.filter(s => format(new Date(s.timestamp), 'MMM dd') === day);
      return {
        name: day,
        revenue: daySales.reduce((acc, s) => {
          if (s.currency === 'SSP') return acc + (s.totalAmount / (s.exchangeRate || 1000));
          return acc + s.totalAmount;
        }, 0),
        profit: daySales.reduce((acc, s) => {
           // Basic profit calculation
           return acc + s.profit;
        }, 0),
      };
    });

    return {
      currentMonthRevenueUSD: aggregatedSales.currentMonthRevenue,
      revenueGrowth,
      totalCashUSD: cashInHandUSD,
      totalCashSSP: cashInHandSSP,
      outstandingUSD,
      weeklyCollections,
      monthlyCollections,
      lowStockCount,
      currentMonthSalesCount: sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: thisMonthStart, end: thisMonthEnd })).length,
      lastMonthSalesCount: sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: lastMonthStart, end: lastMonthEnd })).length,
      chartData,
      lowStockProducts: products.filter(p => p.stockQuantity <= 5)
    };
  }, [sales, pendingSales, payments, expenses, products, cashTransactions, customers]);

  const {
    currentMonthRevenueUSD,
    revenueGrowth,
    totalCashUSD,
    totalCashSSP,
    outstandingUSD,
    weeklyCollections,
    monthlyCollections,
    lowStockCount,
    currentMonthSalesCount,
    lastMonthSalesCount,
    chartData,
    lowStockProducts
  } = statsCalculations;

  if (loading) return (
    <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700" />)}
      </div>
      <div className="h-96 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Monthly Revenue */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className={cn(
              "flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full",
              revenueGrowth >= 0 ? "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400" : "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400"
            )}>
              {revenueGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(Math.round(revenueGrowth))}%
            </div>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Monthly Revenue</h3>
          <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(currentMonthRevenueUSD)}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 uppercase tracking-wider font-bold">vs last month</p>
        </div>

        {/* Cash in Hand */}
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/20">
              <Wallet className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
              Credit Active
            </div>
          </div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Cash in Hand</h3>
          <div className="space-y-0.5">
            <p className="text-lg sm:text-xl font-black text-gray-900 dark:text-white leading-tight">
              {formatCurrency(totalCashUSD, 'USD')}
            </p>
            <p className="text-sm sm:text-base font-bold text-green-600 dark:text-green-400 leading-tight">
              {formatCurrency(totalCashSSP, 'SSP')}
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-black mb-0.5">Outstanding</p>
            <div className="flex items-center gap-1.5">
               <span className="text-[10px] sm:text-xs font-bold text-amber-600">{formatCurrency(Math.max(0, outstandingUSD))}</span>
            </div>
          </div>
        </div>

        {/* Weekly Collected */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">7 Days</span>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Weekly Collected</h3>
          <div className="space-y-1">
            <p className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              {formatCurrency(weeklyCollections.collectedUSD, 'USD')}
            </p>
            <p className="text-xs sm:text-base font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(weeklyCollections.collectedSSP, 'SSP')}
            </p>
          </div>
        </div>

        {/* Monthly Collected */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <Layers className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">Month</span>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Monthly Collected</h3>
          <div className="space-y-1">
            <p className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              {formatCurrency(monthlyCollections.collectedUSD, 'USD')}
            </p>
            <p className="text-xs sm:text-base font-bold text-indigo-600 dark:text-indigo-400">
              {formatCurrency(monthlyCollections.collectedSSP, 'SSP')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Revenue Overview</h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Daily performance for the last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] sm:text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 h-3 bg-indigo-600 rounded-full" />
                <span className="dark:text-gray-300">Revenue (USD)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 h-3 bg-indigo-200 dark:bg-indigo-900/50 rounded-full" />
                <span className="dark:text-gray-300">Profit</span>
              </div>
            </div>
          </div>
          <div className="h-[250px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" className="dark:stroke-gray-700" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(value) => `$${Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                  animationDuration={1500}
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#c7d2fe" 
                  strokeWidth={2}
                  fill="transparent" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Notifications & Low Stock */}
        <div className="space-y-6 sm:space-y-8">
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Low Stock</h3>
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
            </div>
            <div className="space-y-3 sm:space-y-4">
              {lowStockProducts.length > 0 ? (
                lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/30">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{product.name}</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-500 truncate">{product.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs sm:text-sm font-black text-amber-800 dark:text-amber-400">{product.stockQuantity}</p>
                      <p className="text-[8px] sm:text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-500">Left</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-xs sm:text-sm text-gray-400 font-medium">All items well stocked</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">Recent Activity</h3>
            <div className="space-y-3 sm:space-y-4">
              {sales.slice(0, 4).map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                      Sale: {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{format(new Date(sale.timestamp), 'MMM dd, HH:mm')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(sale.totalAmount, sale.currency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
