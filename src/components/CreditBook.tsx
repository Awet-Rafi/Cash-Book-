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
  ArrowRight
} from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

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
      
      // Only keep credit sales
      setSales(salesData.filter(s => s.paymentMethod === 'credit'));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    return () => unsubscribe();
  }, []);

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
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium animate-pulse">Loading Credit Records...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Book</h1>
          <p className="text-sm text-gray-500">Daily log of all credit sales and item details</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Credit Sales</p>
              <p className="text-lg font-black text-gray-900">{sales.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>
        <div className="relative group">
          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Sales List */}
      <div className="space-y-8">
        {groupedSales.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No credit sales found</h3>
            <p className="text-gray-500 max-w-xs mx-auto mt-1">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
        ) : (
          groupedSales.map(([date, daySales]) => (
            <div key={date} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-gray-200" />
                <div className="flex items-center gap-2 bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">
                    {format(parseISO(date), 'EEEE, MMMM do, yyyy')}
                  </span>
                </div>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="grid gap-3">
                {daySales.map((sale) => (
                  <motion.div
                    layout
                    key={sale.id}
                    className={cn(
                      "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200",
                      expandedSales.has(sale.id) ? "ring-2 ring-indigo-500/10 border-indigo-200" : "hover:border-gray-300"
                    )}
                  >
                    <div 
                      className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer"
                      onClick={() => toggleSale(sale.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 truncate">{sale.customerName || 'Guest'}</h3>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100">
                              Credit
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {format(parseISO(sale.timestamp), 'hh:mm a')}
                            </div>
                            <div className="flex items-center gap-1">
                              <Package className="w-3.5 h-3.5" />
                              {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Amount</p>
                          <p className="text-lg font-black text-indigo-600">
                            {formatCurrency(sale.totalAmount, sale.currency)}
                          </p>
                        </div>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                          expandedSales.has(sale.id) ? "bg-indigo-50 text-indigo-600" : "bg-gray-50 text-gray-400"
                        )}>
                          {expandedSales.has(sale.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedSales.has(sale.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50/50">
                            <div className="mt-4 space-y-2">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">Item Details</p>
                              {sale.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-100">
                                      {item.quantity}x
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-gray-900">{item.name}</p>
                                      <p className="text-[10px] text-gray-500 font-medium">
                                        {formatCurrency(item.priceAtSale, sale.currency)} per unit
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-black text-gray-900">
                                      {formatCurrency(item.priceAtSale * item.quantity, sale.currency)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="mt-4 p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                                <div className="flex items-center justify-between mb-2 opacity-80">
                                  <span className="text-xs font-bold uppercase tracking-widest">Subtotal</span>
                                  <span className="text-sm font-bold">{formatCurrency(sale.subtotal, sale.currency)}</span>
                                </div>
                                {sale.discount > 0 && (
                                  <div className="flex items-center justify-between mb-2 opacity-80">
                                    <span className="text-xs font-bold uppercase tracking-widest">Discount</span>
                                    <span className="text-sm font-bold">-{formatCurrency(sale.discount, sale.currency)}</span>
                                  </div>
                                )}
                                <div className="h-px bg-white/20 my-3" />
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold uppercase tracking-widest">Grand Total</span>
                                  <span className="text-xl font-black">{formatCurrency(sale.totalAmount, sale.currency)}</span>
                                </div>
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
