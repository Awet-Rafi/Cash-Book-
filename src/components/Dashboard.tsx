import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Sale, Expense, Payment } from '../types';
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
  Wallet
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval } from 'date-fns';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Expense)));
    });

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Payment)));
      setLoading(false);
    });

    return () => {
      unsubProducts();
      unsubSales();
      unsubExpenses();
      unsubPayments();
    };
  }, []);

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const currentMonthSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: thisMonthStart, end: thisMonthEnd }));
  const lastMonthSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: lastMonthStart, end: lastMonthEnd }));
  const currentMonthPayments = payments.filter(p => isWithinInterval(new Date(p.timestamp), { start: thisMonthStart, end: thisMonthEnd }));

  const currentMonthRevenue = currentMonthSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const currentMonthRepayments = currentMonthPayments.reduce((acc, p) => acc + p.amount, 0);
  
  const currentMonthCash = currentMonthSales.filter(s => s.paymentMethod === 'cash').reduce((acc, s) => acc + s.totalAmount, 0) + currentMonthRepayments;
  
  const currentMonthExpenses = expenses.filter(e => isWithinInterval(new Date(e.timestamp), { start: thisMonthStart, end: thisMonthEnd }))
    .reduce((acc, e) => acc + e.amount, 0);

  const cashInHand = currentMonthCash - currentMonthExpenses;
  
  const outstandingCredit = sales.filter(s => s.status === 'pending').reduce((acc, s) => acc + s.totalAmount, 0) - payments.reduce((acc, p) => acc + p.amount, 0);

  const lowStockProducts = products.filter(p => p.stockQuantity <= 5);

  const lastMonthRevenue = lastMonthSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const revenueGrowth = lastMonthRevenue === 0 ? 100 : ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;

  // Chart Data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'MMM dd');
  }).reverse();

  const chartData = last7Days.map(day => {
    const daySales = sales.filter(s => format(new Date(s.timestamp), 'MMM dd') === day);
    const dayPayments = payments.filter(p => format(new Date(p.timestamp), 'MMM dd') === day);
    return {
      name: day,
      revenue: daySales.reduce((acc, s) => acc + s.totalAmount, 0),
      profit: daySales.reduce((acc, s) => acc + s.profit, 0),
      cash: daySales.filter(s => s.paymentMethod === 'cash' || s.status === 'paid').reduce((acc, s) => acc + s.totalAmount, 0) + dayPayments.reduce((acc, p) => acc + p.amount, 0),
    };
  });

  const stats = [
    { 
      label: 'Monthly Revenue', 
      value: formatCurrency(currentMonthRevenue), 
      icon: DollarSign, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      trend: revenueGrowth,
      trendLabel: 'vs last month'
    },
    { 
      label: 'Cash in Hand', 
      value: formatCurrency(cashInHand), 
      icon: Wallet, 
      color: 'text-green-600', 
      bg: 'bg-green-50',
      trend: outstandingCredit,
      trendLabel: 'outstanding credit',
      trendColor: 'text-amber-600'
    },
    { 
      label: 'Total Inventory', 
      value: products.length.toString(), 
      icon: Package, 
      color: 'text-purple-600', 
      bg: 'bg-purple-50',
      trend: lowStockProducts.length,
      trendLabel: 'low stock items',
      trendColor: 'text-amber-600'
    },
    { 
      label: 'Monthly Sales', 
      value: currentMonthSales.length.toString(), 
      icon: ShoppingCart, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-50',
      trend: lastMonthSales.length === 0 ? 100 : ((currentMonthSales.length - lastMonthSales.length) / lastMonthSales.length) * 100,
      trendLabel: 'vs last month'
    },
  ];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100" />)}
    </div>
    <div className="h-96 bg-white rounded-2xl border border-gray-100" />
  </div>;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className={cn("p-2 sm:p-3 rounded-xl", stat.bg)}>
                <stat.icon className={cn("w-5 h-5 sm:w-6 sm:h-6", stat.color)} />
              </div>
              {stat.trend !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full",
                  stat.trendColor || (stat.trend >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50")
                )}>
                  {stat.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(Math.round(stat.trend))}{stat.trendLabel.includes('items') ? '' : '%'}
                </div>
              )}
            </div>
            <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">{stat.label}</h3>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{stat.trendLabel}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Revenue Overview</h3>
              <p className="text-xs sm:text-sm text-gray-500">Daily performance for the last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] sm:text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 h-3 bg-indigo-600 rounded-full" />
                Revenue
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 h-3 bg-indigo-200 rounded-full" />
                Profit
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
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
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#c7d2fe" 
                  strokeWidth={2}
                  fill="transparent" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock & Recent Activity */}
        <div className="space-y-6 sm:space-y-8">
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Low Stock</h3>
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
            </div>
            <div className="space-y-3 sm:space-y-4">
              {lowStockProducts.length > 0 ? (
                lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-2.5 sm:p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{product.name}</p>
                      <p className="text-[10px] text-amber-700 truncate">{product.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs sm:text-sm font-black text-amber-800">{product.stockQuantity}</p>
                      <p className="text-[8px] sm:text-[10px] uppercase tracking-wider font-bold text-amber-600">Left</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs sm:text-sm text-gray-400 font-medium">All items well stocked</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Recent Sales</h3>
            <div className="space-y-3 sm:space-y-4">
              {sales.slice(0, 4).map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-50 rounded-full flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                      {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500">{format(new Date(sale.timestamp), 'MMM dd, HH:mm')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-bold text-indigo-600">{formatCurrency(sale.totalAmount)}</p>
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
