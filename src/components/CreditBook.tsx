import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sale } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { 
  Calendar, 
  Search, 
  CreditCard, 
  ChevronDown, 
  ChevronUp, 
  Package, 
  User, 
  Clock,
  Filter,
  ArrowUpRight,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function CreditBook() {
  const { businessId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
  const [filterDate, setFilterDate] = useState<string>('');

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'sales'), where('businessId', '==', businessId), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: safeTimestamp(data.timestamp)
        };
      }) as Sale[];
      
      setSales(salesData.filter(s => s.paymentMethod === 'credit'));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    return () => unsubscribe();
  }, [businessId]);

  const toggleSale = (saleId: string) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleId)) {
      newExpanded.delete(saleId);
    } else {
      newExpanded.add(saleId);
    }
    setExpandedSales(newExpanded);
  };

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      const matchesSearch = (sale.customerName || 'Guest').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = filterDate ? sale.timestamp.startsWith(filterDate) : true;
      return matchesSearch && matchesDate;
    });
  }, [sales, searchTerm, filterDate]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
    
    const monthSales = sales.filter(s => {
      const d = parseISO(s.timestamp);
      return isWithinInterval(d, thisMonth);
    });

    return {
      total: sales.reduce((acc, s) => acc + s.totalAmount, 0),
      count: sales.length,
      thisMonthTotal: monthSales.reduce((acc, s) => acc + s.totalAmount, 0),
      thisMonthCount: monthSales.length
    };
  }, [sales]);

  const groupedSales = useMemo(() => {
    const groups: { [key: string]: Sale[] } = {};
    filteredSales.forEach(sale => {
      const dateKey = format(parseISO(sale.timestamp), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(sale);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredSales]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse">Initializing Financial Audit...</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4 pb-20 p-2 lg:p-4 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* HUD Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">Credit Exposure Protocol</span>
              </div>
              <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none uppercase">
                Credit <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-indigo-600">Analytics</span>
              </h1>
              <p className="text-gray-500 dark:text-gray-400 font-bold max-w-sm text-[10px] uppercase tracking-widest leading-relaxed opacity-70">
                Systematic tracking of non-liquid assets and deferred accounts receivable.
              </p>
            </div>
            
            <div className="flex gap-4 sm:border-l border-gray-100 dark:border-gray-800 sm:pl-8">
              <div className="space-y-1">
                <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Active Credits</p>
                <p className="text-3xl font-black text-gray-900 dark:text-white font-mono leading-none">{stats.count}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Growth (M)</p>
                <p className="text-3xl font-black text-emerald-500 font-mono leading-none">+{stats.thisMonthCount}</p>
              </div>
            </div>
          </div>
          {/* Subtle grid background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px'}} />
        </div>

        <div className="lg:w-80 bg-indigo-600 dark:bg-indigo-500 p-6 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none flex flex-col justify-center relative overflow-hidden group">
          <p className="text-[10px] font-black text-indigo-100 uppercase tracking-[0.3em] mb-2 opacity-80">Total Liability</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-indigo-200 font-mono opacity-50">$</span>
            <p className="text-4xl font-black text-white font-mono leading-none tracking-tighter">
              {stats.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <Wallet className="absolute -right-4 -bottom-4 w-32 h-32 text-white opacity-[0.07] group-hover:scale-110 transition-transform duration-700" />
        </div>
      </div>

      {/* Control Strip */}
      <div className="flex flex-col sm:flex-row gap-2 bg-white dark:bg-gray-900 p-2 rounded-xl border border-gray-100 dark:border-gray-800">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-950 border-none rounded-lg text-xs font-bold dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
          />
        </div>
        <div className="w-full sm:w-48 relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-950 border-none rounded-lg text-xs font-bold dark:text-white focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
          />
        </div>
        <button className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md">
          Export Log
        </button>
      </div>

      {/* Audit Registry */}
      <div className="space-y-8 mt-6">
        {groupedSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-950 rounded-2xl flex items-center justify-center mb-4 rotate-12 group-hover:rotate-0 transition-transform">
              <Filter className="w-8 h-8 text-gray-200 dark:text-gray-700" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Zero Matching Records</p>
          </div>
        ) : (
          groupedSales.map(([date, daySales]) => (
            <div key={date} className="space-y-4">
              <div className="flex items-center gap-4 px-2">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.25em] leading-none mb-1">
                    {format(parseISO(date), 'MMMM yyyy')}
                  </span>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                      {format(parseISO(date), 'EEEE, do')}
                    </h2>
                    <div className="h-px w-12 bg-gray-200 dark:bg-gray-800" />
                    <span className="px-2 py-0.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded text-[9px] font-black font-mono">
                      {daySales.length} TXN
                    </span>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Daily Value</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white font-mono leading-none">
                    ${daySales.reduce((acc, s) => acc + s.totalAmount, 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {daySales.map((sale) => (
                  <motion.div
                    key={sale.id}
                    layout
                    className={cn(
                      "group relative bg-white dark:bg-gray-900 border transition-all duration-300 rounded-xl overflow-hidden",
                      expandedSales.has(sale.id)
                        ? "border-indigo-500 ring-4 ring-indigo-500/5 shadow-2xl z-10"
                        : "border-gray-100 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-sm"
                    )}
                  >
                    <div 
                      className="p-3 sm:p-4 cursor-pointer flex items-center gap-4"
                      onClick={() => toggleSale(sale.id)}
                    >
                      <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-950 text-gray-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-300">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase truncate">
                            {sale.customerName || 'Guest Session'}
                          </h3>
                          {sale.paymentMethod === 'credit' && (
                            <span className="flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded border border-amber-100 dark:border-amber-900/30 uppercase tracking-tighter">
                              <Clock className="w-2.5 h-2.5" />
                              Deferred
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest font-mono">
                          <span>{format(parseISO(sale.timestamp), 'HH:mm')}</span>
                          <span className="hidden sm:inline opacity-30">/</span>
                          <span className="truncate">ID: {sale.id.slice(0, 8)}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[14px] font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tight">
                          ${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mt-0.5">
                          {sale.items.length} {sale.items.length === 1 ? 'Item' : 'Items'}
                        </p>
                      </div>

                      <div className={cn(
                        "w-5 h-8 flex items-center justify-center transition-transform duration-500 opacity-20 group-hover:opacity-100",
                        expandedSales.has(sale.id) && "rotate-180 opacity-100 text-indigo-500"
                      )}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedSales.has(sale.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-gray-50 dark:bg-gray-950/50 border-t border-gray-100 dark:border-gray-800 overflow-hidden"
                        >
                          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-8">
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                <span>Manifest Breakdown</span>
                                <div className="h-[1px] flex-1 bg-gray-200 dark:bg-gray-800" />
                              </p>
                              <div className="grid gap-1.5">
                                {sale.items.map((item, i) => (
                                  <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 group/item hover:border-indigo-300 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <span className="w-7 h-7 flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-[10px] font-black text-gray-400 group-hover/item:text-indigo-500 transition-colors rounded">
                                        {item.quantity}
                                      </span>
                                      <div>
                                        <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight leading-tight">{item.name}</p>
                                        <p className="text-[9px] font-bold text-gray-400 font-mono">@{item.priceAtSale.toLocaleString()} {sale.currency}</p>
                                      </div>
                                    </div>
                                    <p className="text-xs font-black text-gray-900 dark:text-white font-mono">
                                      {(item.priceAtSale * item.quantity).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="lg:col-span-4 space-y-4">
                              <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4 shadow-sm">
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Summary</p>
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Subtotal</span>
                                    <span className="text-sm font-black font-mono text-gray-900 dark:text-white">${sale.totalAmount.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-baseline pt-2 border-t border-gray-50 dark:border-gray-800">
                                    <span className="text-[10px] font-black text-indigo-500 uppercase">Balance Due</span>
                                    <span className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">${sale.totalAmount.toLocaleString()}</span>
                                  </div>
                                </div>
                                <Link 
                                  to="/ledger" 
                                  className="w-full py-2.5 bg-gray-950 dark:bg-white text-white dark:text-black rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 dark:hover:bg-indigo-400 hover:text-white transition-all shadow-md group/btn"
                                >
                                  Ledger Protocol
                                  <ArrowUpRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

