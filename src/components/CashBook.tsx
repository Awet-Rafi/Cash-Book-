import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sale, Payment } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Search, DollarSign, Calendar, ShoppingCart, ArrowUpRight, User, Receipt } from 'lucide-react';
import { format } from 'date-fns';

export default function CashBook() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'date' | 'month' | 'range'>('all');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth().toString());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('status', '==', 'paid'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    });

    const unsubPayments = onSnapshot(query(
      collection(db, 'payments'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Payment)));
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubPayments();
    };
  }, []);

  // Combine sales and payments for the cash book
  const allTransactions = [
    ...sales.map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      customerName: s.customerName,
      amount: s.totalAmount,
      type: s.paymentMethod === 'cash' ? 'Cash Sale' : 'Credit Paid',
      isSale: true,
      itemsCount: s.items.length
    })),
    ...payments.map(p => ({
      id: p.id,
      timestamp: p.timestamp,
      customerName: p.customerName,
      amount: p.amount,
      type: 'Repayment',
      isSale: false,
      itemsCount: 0
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredTransactions = allTransactions.filter(t => {
    const matchesSearch = t.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    const tDate = new Date(t.timestamp);
    
    if (filterType === 'date') {
      return format(tDate, 'yyyy-MM-dd') === selectedDate;
    } else if (filterType === 'month') {
      return tDate.getMonth().toString() === selectedMonth && 
             tDate.getFullYear().toString() === selectedYear;
    } else if (filterType === 'range') {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      return tDate >= start && tDate <= end;
    }
    
    return true;
  });

  const totalCash = filteredTransactions.reduce((acc, t) => acc + t.amount, 0);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100" />)}
    </div>
  </div>;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Filters Section */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setFilterType('all')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    filterType === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  All
                </button>
                <button 
                  onClick={() => setFilterType('date')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    filterType === 'date' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Date
                </button>
                <button 
                  onClick={() => setFilterType('month')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    filterType === 'month' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Month
                </button>
                <button 
                  onClick={() => setFilterType('range')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    filterType === 'range' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Range
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 px-4 py-2 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-[10px] sm:text-xs font-bold text-green-500 uppercase tracking-wider">Total Cash</span>
              </div>
              <span className="text-sm sm:text-base font-black text-green-700">
                {formatCurrency(totalCash)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {filterType !== 'all' && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                {filterType === 'date' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input 
                      type="date" 
                      className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                )}

                {filterType === 'month' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select 
                      className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                      {months.map((m, i) => (
                        <option key={m} value={i}>{m}</option>
                      ))}
                    </select>
                    <select 
                      className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                )}

                {filterType === 'range' && (
                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                    <input 
                      type="date" 
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span className="text-gray-400 text-[10px] font-bold uppercase">to</span>
                    <input 
                      type="date" 
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search customer or ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <p className="text-sm font-bold text-gray-900">{format(new Date(t.timestamp), 'MMM dd, yyyy')}</p>
                      <p className="text-[10px] text-gray-400">{format(new Date(t.timestamp), 'HH:mm')}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[10px] font-mono text-gray-400">#{t.id.slice(-6).toUpperCase()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-black text-green-600">{formatCurrency(t.amount)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                      t.type === 'Cash Sale' ? "bg-green-100 text-green-700" : 
                      t.type === 'Repayment' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {t.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100">
          {filteredTransactions.map((t) => (
            <div key={t.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{t.customerName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-gray-400">#{t.id.slice(-6).toUpperCase()}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                        t.type === 'Cash Sale' ? "bg-green-100 text-green-700" : 
                        t.type === 'Repayment' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {t.type.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-green-600">{formatCurrency(t.amount)}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Received</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(t.timestamp), 'MMM dd, yyyy')}
                </div>
                <div className="text-[10px] text-gray-400 font-medium">
                  {format(new Date(t.timestamp), 'HH:mm')}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredTransactions.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No cash records found</h3>
            <p className="text-gray-500">All paid transactions will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
