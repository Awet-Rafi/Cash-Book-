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
  ChevronRight,
  Package, 
  User, 
  Clock,
  Filter,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  FileDown,
  FileSpreadsheet,
  Download,
  Plus
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
      const searchLower = searchTerm.toLowerCase();
      const matchesCustomer = (sale.customerName || 'Guest').toLowerCase().includes(searchLower);
      const matchesItems = sale.items.some(item => item.name.toLowerCase().includes(searchLower));
      const matchesSearch = matchesCustomer || matchesItems;
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

  const exportToPDF = (date: string, sales: Sale[]) => {
    const doc = new jsPDF();
    const formattedDate = format(parseISO(date), 'EEEE, MMMM do, yyyy');
    
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(`Credit Book Report`, 14, 22);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Date: ${formattedDate}`, 14, 32);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 38);
    doc.text(`Total Credit Value: $${Math.round(sales.reduce((acc, s) => acc + s.totalAmount, 0)).toLocaleString()}`, 14, 43);

    const tableData: any[] = [];
    sales.forEach(sale => {
      sale.items.forEach((item, index) => {
        tableData.push([
          index === 0 ? format(parseISO(sale.timestamp), 'HH:mm') : '',
          index === 0 ? (sale.customerName || 'Guest Session') : '',
          item.name,
          item.quantity,
          `$${Math.round(item.priceAtSale).toLocaleString()}`,
          `$${Math.round(item.priceAtSale * item.quantity).toLocaleString()}`,
          index === 0 ? `$${Math.round(sale.totalAmount).toLocaleString()}` : ''
        ]);
      });
    });

    autoTable(doc, {
      startY: 50,
      head: [['Time', 'Customer', 'Item', 'Qty', 'Price', 'Value', 'Sale Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { top: 50 }
    });

    doc.save(`Credit_Report_${date}.pdf`);
  };

  const exportToExcel = (date: string, sales: Sale[]) => {
    const tableData: any[] = [];
    
    sales.forEach(sale => {
      sale.items.forEach((item, index) => {
        tableData.push({
          'Time': index === 0 ? format(parseISO(sale.timestamp), 'HH:mm') : '',
          'Customer': index === 0 ? (sale.customerName || 'Guest') : '',
          'Item Name': item.name,
          'Quantity': item.quantity,
          'Unit Price': item.priceAtSale,
          'Item Value': item.priceAtSale * item.quantity,
          'Sale Total': index === 0 ? sale.totalAmount : '',
          'Currency': sale.currency
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Credits');
    
    // Set column widths
    const wscols = [
      { wch: 10 },
      { wch: 25 },
      { wch: 30 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 }
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `Credit_Report_${date}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse">Initializing Financial Audit...</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4 pb-32 p-2 lg:p-4 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* HUD Header */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[7px] sm:text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] truncate">Credit Exposure Protocol</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none uppercase">
                Credit <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-indigo-600">Analytics</span>
              </h1>
            </div>
            
            <div className="flex gap-4 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 pt-3 sm:pt-0 sm:pl-8">
              <div>
                <p className="text-[7px] sm:text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Active</p>
                <p className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white font-mono leading-none">{stats.count}</p>
              </div>
              <div>
                <p className="text-[7px] sm:text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">New (M)</p>
                <p className="text-lg sm:text-2xl font-black text-emerald-500 font-mono leading-none">+{stats.thisMonthCount}</p>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 opacity-[0.015] pointer-events-none" 
               style={{backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '16px 16px'}} />
        </div>

        <div className="lg:w-64 bg-indigo-600 dark:bg-indigo-500 p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col justify-center relative overflow-hidden group">
          <p className="text-[8px] sm:text-[9px] font-black text-indigo-100 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1.5 opacity-80 leading-none">Liability</p>
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-lg font-black text-indigo-200 font-mono opacity-50">$</span>
            <p className="text-2xl sm:text-3xl font-black text-white font-mono leading-none tracking-tighter">
              {stats.total.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </p>
          </div>
          <Wallet className="absolute -right-3 -bottom-3 sm:-right-4 sm:-bottom-4 w-16 h-16 sm:w-20 sm:h-20 text-white opacity-[0.05]" />
        </div>
      </div>



      {/* Control Strip */}
      <div className="flex flex-col gap-2.5 bg-white dark:bg-gray-800 p-3 sm:p-2 rounded-2xl sm:rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm sm:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search credits by account or item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 h-11 sm:h-10 bg-gray-50 dark:bg-gray-900 border-none rounded-xl sm:rounded-lg text-sm sm:text-xs font-bold dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:w-48 relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full pl-10 pr-4 h-11 sm:h-10 bg-gray-50 dark:bg-gray-900 border-none rounded-xl sm:rounded-lg text-sm sm:text-xs font-bold dark:text-white focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
          </div>
          <button className="px-4 sm:px-6 h-11 sm:h-10 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl sm:rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 active:scale-95 transition-all shadow-md shrink-0">
            Export
          </button>
        </div>
      </div>

      {/* Audit Registry */}
      <div className="space-y-6 sm:space-y-8 mt-4 sm:mt-6">
        {groupedSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-700 mx-2 sm:mx-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center mb-4">
              <Filter className="w-6 h-6 sm:w-8 sm:h-8 text-gray-200 dark:text-gray-600" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Zero Matching Records</p>
          </div>
        ) : (
          groupedSales.map(([date, daySales]) => (
            <div key={date} className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-2">
                <div className="flex flex-col">
                  <span className="text-[8px] sm:text-[9px] font-black text-indigo-500 uppercase tracking-[0.25em] leading-none mb-1">
                    {format(parseISO(date), 'MMMM yyyy')}
                  </span>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                      {format(parseISO(date), 'EEEE, do')}
                    </h2>
                    <div className="h-px w-8 sm:w-12 bg-gray-200 dark:bg-gray-800" />
                    <span className="px-1.5 py-0.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded text-[8px] font-black font-mono">
                      {daySales.length} TXN
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:ml-auto">
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => exportToPDF(date, daySales)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                    >
                      <FileDown className="w-3 h-3" />
                      PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel(date, daySales)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      Excel
                    </button>
                  </div>

                  <div className="text-right sm:ml-4">
                    <p className="text-[7px] sm:text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">Value</p>
                    <p className="text-lg sm:text-xl font-black text-gray-900 dark:text-white font-mono leading-none">
                      ${Math.round(daySales.reduce((acc, s) => acc + s.totalAmount, 0)).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                {daySales.map((sale) => (
                  <motion.div
                    key={sale.id}
                    layout
                    className={cn(
                      "group relative bg-white dark:bg-gray-900 border transition-all duration-300 rounded-xl overflow-hidden",
                      expandedSales.has(sale.id)
                        ? "border-indigo-500 ring-4 ring-indigo-500/5 shadow-xl z-10"
                        : "border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm"
                    )}
                  >
                    <div 
                      className="p-3 sm:p-4 cursor-pointer flex items-center gap-3 sm:gap-4"
                      onClick={() => toggleSale(sale.id)}
                    >
                      <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-950 text-gray-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-300">
                        <CreditCard className="w-4.5 h-4.5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                          <h3 className="text-xs sm:text-sm font-black text-gray-900 dark:text-white uppercase truncate tracking-tight">
                            {sale.customerName || 'Guest Session'}
                          </h3>
                          {sale.paymentMethod === 'credit' && (
                            <span className="flex items-center gap-0.5 text-[7px] font-black px-1 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded uppercase tracking-tighter shrink-0 border border-amber-100 dark:border-amber-900/30">
                              <Clock className="w-2 h-2" />
                              DUE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest font-mono">
                          <span>{format(parseISO(sale.timestamp), 'HH:mm')}</span>
                          <span className="hidden xs:inline truncate">ID: {sale.id.slice(0, 6)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tight leading-none">
                          ${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </p>
                        <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-tighter mt-1 leading-none">
                          {sale.items.length} {sale.items.length === 1 ? 'UNIT' : 'UNITS'}
                        </p>
                      </div>

                      <div className={cn(
                        "w-4 h-8 flex items-center justify-center transition-transform duration-500 opacity-20 sm:group-hover:opacity-100",
                        expandedSales.has(sale.id) && "rotate-180 opacity-100 text-indigo-500"
                      )}>
                        <ChevronDown className="w-3.5 h-3.5" />
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
                          <div className="p-3 sm:p-6 space-y-4">
                            <div className="space-y-3">
                              <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                                <span className="shrink-0">Audit Breakdown</span>
                                <div className="h-[1px] flex-1 bg-gray-200 dark:bg-gray-800" />
                              </p>
                              <div className="grid gap-1">
                                {sale.items.map((item, i) => (
                                  <div key={i} className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-6 h-6 flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-[9px] font-black text-gray-400 rounded">
                                        {item.quantity}
                                      </span>
                                      <div>
                                        <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none mb-1">{item.name}</p>
                                        <p className="text-[8px] font-bold text-gray-400 font-mono tracking-tighter">@{item.priceAtSale.toLocaleString()} {sale.currency}</p>
                                      </div>
                                    </div>
                                    <p className="text-[10px] font-black text-gray-900 dark:text-white font-mono">
                                      {(item.priceAtSale * item.quantity).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                              <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3 shadow-sm">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-baseline mb-2 pb-2 border-b border-gray-50 dark:border-gray-800">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Gross Credited</span>
                                    <span className="text-xs font-black font-mono text-gray-900 dark:text-white">${sale.totalAmount.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Outstanding</span>
                                    <span className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">${sale.totalAmount.toLocaleString()}</span>
                                  </div>
                                </div>
                                <Link 
                                  to="/ledger" 
                                  className="w-full h-10 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
                                >
                                  View Statements
                                  <ArrowUpRight className="w-3.5 h-3.5" />
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

