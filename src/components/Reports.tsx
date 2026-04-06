import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sale, Expense } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Download,
  Filter,
  ChevronRight,
  ChevronLeft,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  ChevronDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  startOfMonth, 
  endOfMonth, 
  format, 
  subMonths, 
  isWithinInterval, 
  eachMonthOfInterval,
  startOfYear,
  endOfYear
} from 'date-fns';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'yearly' | 'monthly'>('yearly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

  useEffect(() => {
    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate().toISOString()
      } as Sale)));
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate().toISOString()
      } as Expense)));
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubExpenses();
    };
  }, []);

  const yearStart = startOfYear(new Date(selectedYear, 0, 1));
  const yearEnd = endOfYear(new Date(selectedYear, 0, 1));
  const monthStart = startOfMonth(new Date(selectedYear, selectedMonth, 1));
  const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth, 1));

  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  const yearlyData = months.map(month => {
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);

    const monthSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: mStart, end: mEnd }));
    const monthExpenses = expenses.filter(e => isWithinInterval(new Date(e.timestamp), { start: mStart, end: mEnd }));

    const revenue = monthSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const cost = monthSales.reduce((acc, s) => acc + s.totalCost, 0);
    const grossProfit = revenue - cost;
    const expenseTotal = monthExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - expenseTotal;

    return {
      name: format(month, 'MMM'),
      revenue,
      expenses: expenseTotal,
      profit: netProfit,
    };
  });

  // Daily data for monthly view
  const daysInMonth = Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1);
  const monthlyDailyData = daysInMonth.map(day => {
    const dStart = new Date(selectedYear, selectedMonth, day, 0, 0, 0);
    const dEnd = new Date(selectedYear, selectedMonth, day, 23, 59, 59);

    const daySales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: dStart, end: dEnd }));
    const dayExpenses = expenses.filter(e => isWithinInterval(new Date(e.timestamp), { start: dStart, end: dEnd }));

    const revenue = daySales.reduce((acc, s) => acc + s.totalAmount, 0);
    const cost = daySales.reduce((acc, s) => acc + s.totalCost, 0);
    const grossProfit = revenue - cost;
    const expenseTotal = dayExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - expenseTotal;

    return {
      name: day.toString(),
      revenue,
      expenses: expenseTotal,
      profit: netProfit,
    };
  });

  const currentData = viewType === 'yearly' ? yearlyData : monthlyDailyData;
  const currentIntervalStart = viewType === 'yearly' ? yearStart : monthStart;
  const currentIntervalEnd = viewType === 'yearly' ? yearEnd : monthEnd;

  const totalRevenue = currentData.reduce((acc, d) => acc + d.revenue, 0);
  const totalExpenses = currentData.reduce((acc, d) => acc + d.expenses, 0);
  const totalProfit = currentData.reduce((acc, d) => acc + d.profit, 0);

  const expenseByCategory = expenses
    .filter(e => isWithinInterval(new Date(e.timestamp), { start: currentIntervalStart, end: currentIntervalEnd }))
    .reduce((acc: any, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = viewType === 'yearly' 
      ? `Financial Report - ${selectedYear}` 
      : `Financial Report - ${format(new Date(selectedYear, selectedMonth), 'MMMM yyyy')}`;
    
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 30);

    // Summary section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Summary', 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Revenue', formatCurrency(totalRevenue)],
        ['Total Expenses', formatCurrency(totalExpenses)],
        ['Net Profit', formatCurrency(totalProfit)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }
    });

    // Detailed breakdown
    doc.text('Detailed Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
    
    const tableData = currentData.slice().reverse().map(data => {
      const margin = data.revenue === 0 ? 0 : (data.profit / data.revenue) * 100;
      const name = viewType === 'yearly' 
        ? `${data.name} ${selectedYear}` 
        : format(new Date(selectedYear, selectedMonth, parseInt(data.name)), 'MMM dd, yyyy');
      
      return [
        name,
        formatCurrency(data.revenue),
        formatCurrency(data.expenses),
        formatCurrency(data.profit),
        `${Math.round(margin)}%`
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[viewType === 'yearly' ? 'Month' : 'Day', 'Revenue', 'Expenses', 'Net Profit', 'Margin']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    setIsDownloadMenuOpen(false);
  };

  const downloadExcel = () => {
    const title = viewType === 'yearly' 
      ? `Financial_Report_${selectedYear}` 
      : `Financial_Report_${format(new Date(selectedYear, selectedMonth), 'MMMM_yyyy')}`;

    const summaryData = [
      ['Financial Report', title.replace(/_/g, ' ')],
      ['Generated on', format(new Date(), 'PPP p')],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Revenue', totalRevenue],
      ['Total Expenses', totalExpenses],
      ['Net Profit', totalProfit],
      [],
      ['Detailed Breakdown'],
      [viewType === 'yearly' ? 'Month' : 'Day', 'Revenue', 'Expenses', 'Net Profit', 'Margin %']
    ];

    const breakdownData = currentData.slice().reverse().map(data => {
      const margin = data.revenue === 0 ? 0 : (data.profit / data.revenue) * 100;
      const name = viewType === 'yearly' 
        ? `${data.name} ${selectedYear}` 
        : format(new Date(selectedYear, selectedMonth, parseInt(data.name)), 'MMM dd, yyyy');
      
      return [
        name,
        data.revenue,
        data.expenses,
        data.profit,
        Math.round(margin)
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([...summaryData, ...breakdownData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    
    XLSX.writeFile(workbook, `${title}.xlsx`);
    setIsDownloadMenuOpen(false);
  };

  const pieData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value: value as number }));
  const COLORS = ['#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="h-20 bg-white rounded-2xl border border-gray-100" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="h-96 bg-white rounded-2xl border border-gray-100" />
      <div className="h-96 bg-white rounded-2xl border border-gray-100" />
    </div>
  </div>;

  return (
    <div className="space-y-8">
      {/* Header & Filter */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="p-3 bg-indigo-50 rounded-xl shrink-0">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Financial Performance</h3>
            <p className="text-xs sm:text-sm text-gray-500">{viewType === 'yearly' ? 'Yearly overview' : 'Monthly breakdown'} and profit/loss</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          {/* View Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setViewType('yearly')}
              className={cn(
                "flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewType === 'yearly' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Yearly
            </button>
            <button
              onClick={() => setViewType('monthly')}
              className={cn(
                "flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewType === 'monthly' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Monthly
            </button>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100 w-full sm:w-auto justify-between sm:justify-start">
            <button 
              onClick={() => {
                if (viewType === 'yearly') {
                  setSelectedYear(prev => prev - 1);
                } else {
                  if (selectedMonth === 0) {
                    setSelectedMonth(11);
                    setSelectedYear(prev => prev - 1);
                  } else {
                    setSelectedMonth(prev => prev - 1);
                  }
                }
              }}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="px-2 sm:px-4 font-bold text-gray-900 text-sm">
              {viewType === 'yearly' ? selectedYear : format(new Date(selectedYear, selectedMonth), 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => {
                if (viewType === 'yearly') {
                  setSelectedYear(prev => prev + 1);
                } else {
                  if (selectedMonth === 11) {
                    setSelectedMonth(0);
                    setSelectedYear(prev => prev + 1);
                  } else {
                    setSelectedMonth(prev => prev + 1);
                  }
                }
              }}
              className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Revenue</p>
          <p className="text-xl sm:text-3xl font-black text-gray-900">{formatCurrency(totalRevenue)}</p>
          <div className="mt-2 sm:mt-4 flex items-center gap-2 text-[10px] sm:text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit">
            <TrendingUp className="w-3 h-3" />
            Income
          </div>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Expenses</p>
          <p className="text-xl sm:text-3xl font-black text-gray-900">{formatCurrency(totalExpenses)}</p>
          <div className="mt-2 sm:mt-4 flex items-center gap-2 text-[10px] sm:text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full w-fit">
            <TrendingDown className="w-3 h-3" />
            Outgoings
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Net Profit</p>
          <p className={cn(
            "text-xl sm:text-3xl font-black",
            totalProfit >= 0 ? "text-green-600" : "text-red-600"
          )}>{formatCurrency(totalProfit)}</p>
          <div className={cn(
            "mt-2 sm:mt-4 flex items-center gap-2 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full w-fit",
            totalProfit >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
          )}>
            <DollarSign className="w-3 h-3" />
            Final Balance
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monthly Performance Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-8">{viewType === 'yearly' ? 'Monthly P&L' : 'Daily P&L'}</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Legend iconType="circle" />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Net Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-8">Expense Distribution</h3>
          <div className="h-[350px] w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <FileText className="w-12 h-12 text-gray-200 mb-2" />
                <p className="text-gray-400 font-medium">No expense data for this year</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between relative">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">{viewType === 'yearly' ? 'Monthly Breakdown' : 'Daily Breakdown'}</h3>
          
          <div className="relative">
            <button 
              onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
              className="flex items-center gap-2 text-xs sm:text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download Report</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", isDownloadMenuOpen && "rotate-180")} />
            </button>

            {isDownloadMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsDownloadMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20 animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={downloadPDF}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <FileIcon className="w-4 h-4 text-red-500" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    onClick={downloadExcel}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    <span>Download Excel</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{viewType === 'yearly' ? 'Month' : 'Day'}</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Expenses</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Net Profit</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentData.slice().reverse().map((data, i) => {
                const margin = data.revenue === 0 ? 0 : (data.profit / data.revenue) * 100;
                return (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                      {viewType === 'yearly' ? `${data.name} ${selectedYear}` : `${format(new Date(selectedYear, selectedMonth, parseInt(data.name)), 'MMM dd, yyyy')}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatCurrency(data.revenue)}</td>
                    <td className="px-6 py-4 text-sm text-red-600">{formatCurrency(data.expenses)}</td>
                    <td className={cn(
                      "px-6 py-4 text-sm font-black",
                      data.profit >= 0 ? "text-green-600" : "text-red-600"
                    )}>{formatCurrency(data.profit)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        margin >= 20 ? "bg-green-50 text-green-600" : 
                        margin > 0 ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
                      )}>
                        {Math.round(margin)}% Margin
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100">
          {currentData
            .slice()
            .reverse()
            .filter(d => d.revenue > 0 || d.expenses > 0) // Only show items with activity on mobile
            .map((data, i) => {
              const margin = data.revenue === 0 ? 0 : (data.profit / data.revenue) * 100;
              return (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">
                      {viewType === 'yearly' ? `${data.name} ${selectedYear}` : `${format(new Date(selectedYear, selectedMonth, parseInt(data.name)), 'MMM dd')}`}
                    </p>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-bold uppercase",
                      margin >= 20 ? "bg-green-50 text-green-600" : 
                      margin > 0 ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
                    )}>
                      {Math.round(margin)}% Margin
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Revenue</p>
                      <p className="text-xs font-bold text-gray-900">{formatCurrency(data.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Expenses</p>
                      <p className="text-xs font-bold text-red-600">{formatCurrency(data.expenses)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Net Profit</p>
                      <p className={cn(
                        "text-xs font-black",
                        data.profit >= 0 ? "text-green-600" : "text-red-600"
                      )}>{formatCurrency(data.profit)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          {currentData.filter(d => d.revenue > 0 || d.expenses > 0).length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400">No activity recorded for this {viewType === 'yearly' ? 'year' : 'month'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
