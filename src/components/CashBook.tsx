import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sale, Payment } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Search, DollarSign, Calendar, ShoppingCart, ArrowUpRight, User, Receipt, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

export default function CashBook() {
  const { businessId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [cashTransactions, setCashTransactions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'daily'>('daily');

  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'date' | 'month' | 'range'>('date');
  const [selectedDate, setSelectedDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', month: 'numeric' }).format(new Date()));
  const [selectedYear, setSelectedYear] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', year: 'numeric' }).format(new Date()));
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!businessId) return;

    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('businessId', '==', businessId),
      where('status', '==', 'paid'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
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

    const unsubExpenses = onSnapshot(query(
      collection(db, 'expenses'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    const unsubCash = onSnapshot(query(
      collection(db, 'cashTransactions'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setCashTransactions(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cashTransactions');
    });

    return () => {
      unsubSales();
      unsubPayments();
      unsubExpenses();
      unsubCash();
    };
  }, [businessId]);

  // Combine all transactions for the cash book
  const allTransactions = [
    ...sales.flatMap(s => {
      const parts = [];
      const amountUSD = s.amountUSD !== undefined ? s.amountUSD : (s.currency === 'USD' ? s.totalAmount : 0);
      const amountSSP = s.amountSSP !== undefined ? s.amountSSP : (s.currency === 'SSP' ? s.totalAmount : 0);

      if (amountUSD > 0) {
        parts.push({
          id: `${s.id}_usd`,
          timestamp: s.timestamp,
          customerName: s.customerName,
          amount: amountUSD,
          currency: 'USD' as const,
          exchangeRate: s.exchangeRate || 1000,
          amountUSD,
          amountSSP: 0,
          type: s.paymentMethod === 'cash' ? 'Cash Sale' : 'Credit Paid',
          isSale: true,
          isCashIn: true,
          itemsCount: s.items.length,
          isConfirmed: s.isConfirmed || false,
          collection: 'sales',
          status: 'transferred'
        });
      }

      if (amountSSP > 0) {
        parts.push({
          id: `${s.id}_ssp`,
          timestamp: s.timestamp,
          customerName: s.customerName,
          amount: amountSSP,
          currency: 'SSP' as const,
          exchangeRate: s.exchangeRate || 1000,
          amountUSD: 0,
          amountSSP,
          type: s.paymentMethod === 'cash' ? 'Cash Sale' : 'Credit Paid',
          isSale: true,
          isCashIn: true,
          itemsCount: s.items.length,
          isConfirmed: s.isConfirmed || false,
          collection: 'sales',
          status: 'transferred'
        });
      }
      return parts;
    }),
    ...payments.flatMap(p => {
      const parts = [];
      if (p.amountUSD && p.amountUSD > 0) {
        parts.push({
          id: `${p.id}_usd`,
          timestamp: p.timestamp,
          customerName: p.customerName,
          amount: p.amountUSD,
          currency: 'USD' as const,
          exchangeRate: p.exchangeRate || 1000,
          amountUSD: p.amountUSD,
          amountSSP: 0,
          type: 'Repayment',
          isSale: false,
          isCashIn: true,
          itemsCount: 0,
          status: p.status || 'pending',
          isConfirmed: p.isConfirmed || p.status === 'transferred',
          collection: 'payments'
        });
      }
      if (p.amountSSP && p.amountSSP > 0) {
        parts.push({
          id: `${p.id}_ssp`,
          timestamp: p.timestamp,
          customerName: p.customerName,
          amount: p.amountSSP,
          currency: 'SSP' as const,
          exchangeRate: p.exchangeRate || 1000,
          amountUSD: 0,
          amountSSP: p.amountSSP,
          type: 'Repayment',
          isSale: false,
          isCashIn: true,
          itemsCount: 0,
          status: p.status || 'pending',
          isConfirmed: p.isConfirmed || p.status === 'transferred',
          collection: 'payments'
        });
      } else if (!p.amountUSD && p.amount > 0) {
        // Fallback for single currency payments
        parts.push({
          id: p.id,
          timestamp: p.timestamp,
          customerName: p.customerName,
          amount: p.amount,
          currency: p.currency || 'SSP',
          exchangeRate: p.exchangeRate || 1000,
          amountUSD: p.currency === 'USD' ? p.amount : 0,
          amountSSP: p.currency === 'SSP' ? p.amount : 0,
          type: 'Repayment',
          isSale: false,
          isCashIn: true,
          itemsCount: 0,
          status: p.status || 'pending',
          isConfirmed: p.isConfirmed || p.status === 'transferred',
          collection: 'payments'
        });
      }
      return parts;
    }),
    ...expenses.flatMap(e => {
      const parts = [];
      const amountUSD = e.amountUSD !== undefined ? e.amountUSD : (e.currency === 'USD' ? e.amount : 0);
      const amountSSP = e.amountSSP !== undefined ? e.amountSSP : (e.currency === 'SSP' ? e.amount : 0);

      if (amountUSD > 0) {
        parts.push({
          id: `${e.id}_usd`,
          timestamp: e.timestamp,
          customerName: 'Expense',
          amount: amountUSD,
          currency: 'USD' as const,
          amountUSD,
          amountSSP: 0,
          type: 'Expense',
          isSale: false,
          isCashIn: false,
          itemsCount: 0,
          isConfirmed: e.isConfirmed || false,
          collection: 'expenses',
          status: 'transferred'
        });
      }
      if (amountSSP > 0) {
        parts.push({
          id: `${e.id}_ssp`,
          timestamp: e.timestamp,
          customerName: 'Expense',
          amount: amountSSP,
          currency: 'SSP' as const,
          amountUSD: 0,
          amountSSP,
          type: 'Expense',
          isSale: false,
          isCashIn: false,
          itemsCount: 0,
          isConfirmed: e.isConfirmed || false,
          collection: 'expenses',
          status: 'transferred'
        });
      }
      return parts;
    }),
    ...cashTransactions
      .filter(t => t.type === 'in')
      .map(t => ({
        id: t.id,
        timestamp: t.timestamp,
        customerName: t.customerName || 'Manual Entry',
        amount: t.amount,
        currency: t.currency || 'SSP',
        amountUSD: t.amountUSD !== undefined ? t.amountUSD : (t.currency === 'USD' ? t.amount : 0),
        amountSSP: t.amountSSP !== undefined ? t.amountSSP : (t.currency === 'SSP' ? t.amount : 0),
        type: 'Cash In' as const,
        isSale: false,
        isCashIn: true,
        itemsCount: 0,
        isConfirmed: t.isConfirmed || false,
        notes: t.notes || 'Manual Cash In',
        collection: 'cashTransactions',
        status: 'transferred'
      }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredTransactions = allTransactions.filter(t => {
    const matchesSearch = t.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    const tDate = new Date(t.timestamp);
    const jubaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tDate);
    
    if (filterType === 'date') {
      return jubaDateStr === selectedDate;
    } else if (filterType === 'month') {
      const jubaMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', month: 'numeric' }).format(tDate);
      const jubaYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Juba', year: 'numeric' }).format(tDate);
      return jubaMonth === selectedMonth && jubaYear === selectedYear;
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

  // Group by date for Daily Summary
  const groupedByDate = filteredTransactions.reduce((acc: any, t) => {
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Juba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(t.timestamp));

    if (!acc[dateKey]) {
      acc[dateKey] = {
        date: dateKey,
        transactions: [],
        totalCashSalesSSP: 0,
        totalRepaymentsSSP: 0,
        totalCashSalesUSD: 0,
        totalRepaymentsUSD: 0,
        totalDaySSP: 0,
        totalDayUSD: 0
      };
    }
    acc[dateKey].transactions.push(t);
    
    const isUSD = t.currency === 'USD';
    const isConfirmed = t.isConfirmed;
    
    // Handle split amounts for mixed payments
    const amountUSD = t.amountUSD !== undefined ? t.amountUSD : (isUSD ? t.amount : 0);
    const amountSSP = t.amountSSP !== undefined ? t.amountSSP : (!isUSD ? t.amount : 0);

    if (t.type === 'Cash Sale' || t.type === 'Credit Paid') {
      acc[dateKey].totalCashSalesUSD += amountUSD;
      acc[dateKey].totalCashSalesSSP += amountSSP;
    } else if (t.type === 'Repayment' || t.type === 'Cash In') {
      acc[dateKey].totalRepaymentsUSD += amountUSD;
      acc[dateKey].totalRepaymentsSSP += amountSSP;
    }
    
    if (t.isCashIn) {
      acc[dateKey].totalDayUSD += amountUSD;
      acc[dateKey].totalDaySSP += amountSSP;
    } else {
      acc[dateKey].totalDayUSD -= amountUSD;
      acc[dateKey].totalDaySSP -= amountSSP;
    }
    
    if (!isConfirmed && (t.collection !== 'payments' || t.status === 'pending')) {
      acc[dateKey].hasUnconfirmed = true;
    }
    
    return acc;
  }, {});

  const dailySummaries = Object.values(groupedByDate).sort((a: any, b: any) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  const handleConfirmDay = async (summary: any) => {
    if (isConfirming) return;
    setIsConfirming(summary.date);
    try {
      const batch = writeBatch(db);
      summary.transactions.forEach((t: any) => {
        if (!t.isConfirmed || (t.collection === 'payments' && t.status === 'pending')) {
          const ref = doc(db, t.collection, t.id);
          const updateData: any = { isConfirmed: true };
          if (t.collection === 'payments' && t.status === 'pending') {
            updateData.status = 'transferred';
            updateData.transferredAt = Timestamp.now();
          }
          batch.update(ref, updateData);
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Error confirming day:", error);
    } finally {
      setIsConfirming(null);
    }
  };

  const exportDailyToPDF = (summary: any) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Daily Cash Report: ${format(new Date(summary.date), 'MMMM dd, yyyy')}`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Total Payments (SSP): ${(summary.totalCashSalesSSP + summary.totalRepaymentsSSP).toLocaleString('en-US')} SSP`, 14, 30);
    doc.text(`Total Payments (USD): $${(summary.totalCashSalesUSD + summary.totalRepaymentsUSD).toLocaleString('en-US')}`, 14, 38);
    doc.text(`Grand Total SSP: ${summary.totalDaySSP.toLocaleString('en-US')} SSP`, 14, 46);
    doc.text(`Grand Total USD: $${summary.totalDayUSD.toLocaleString('en-US')}`, 14, 54);

    const sspTransactions = summary.transactions.filter((t: any) => t.currency === 'SSP');
    const usdTransactions = summary.transactions.filter((t: any) => t.currency === 'USD');

    let currentY = 65;

    if (sspTransactions.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text("SSP Transactions", 14, currentY);
      currentY += 5;

      const sspData = sspTransactions.map((t: any) => [
        format(new Date(t.timestamp), 'HH:mm'),
        t.customerName,
        t.type,
        `${t.isCashIn ? '+' : '-'}${t.amount.toLocaleString('en-US')} SSP`,
        t.notes || '',
        `#${t.id.slice(-6).toUpperCase()}`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Time', 'Customer', 'Type', 'Amount', 'Notes', 'ID']],
        body: sspData,
        theme: 'grid',
        headStyles: { fillColor: [34, 197, 94] }, // Green for SSP
        margin: { top: 10 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    if (usdTransactions.length > 0) {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text("USD Transactions", 14, currentY);
      currentY += 5;

      const usdData = usdTransactions.map((t: any) => [
        format(new Date(t.timestamp), 'HH:mm'),
        t.customerName,
        t.type,
        `${t.isCashIn ? '+' : '-'}$${t.amount.toLocaleString('en-US')}`,
        t.notes || '',
        `#${t.id.slice(-6).toUpperCase()}`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Time', 'Customer', 'Type', 'Amount', 'Notes', 'ID']],
        body: usdData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] }, // Indigo for USD
        margin: { top: 10 }
      });
    }

    doc.save(`CashReport_${summary.date}.pdf`);
  };

  const exportDailyToExcel = (summary: any) => {
    const sspData = summary.transactions
      .filter((t: any) => t.currency === 'SSP')
      .map((t: any) => ({
        Time: format(new Date(t.timestamp), 'HH:mm'),
        Customer: t.customerName,
        Type: t.type,
        Direction: t.isCashIn ? 'IN' : 'OUT',
        Amount: t.amount,
        Notes: t.notes || '',
        Currency: 'SSP',
        ID: t.id
      }));

    const usdData = summary.transactions
      .filter((t: any) => t.currency === 'USD')
      .map((t: any) => ({
        Time: format(new Date(t.timestamp), 'HH:mm'),
        Customer: t.customerName,
        Type: t.type,
        Direction: t.isCashIn ? 'IN' : 'OUT',
        Amount: t.amount,
        Notes: t.notes || '',
        Currency: 'USD',
        ID: t.id
      }));

    const wb = XLSX.utils.book_new();
    
    if (sspData.length > 0) {
      const wsSSP = XLSX.utils.json_to_sheet(sspData);
      XLSX.utils.book_append_sheet(wb, wsSSP, "SSP Transactions");
    }
    
    if (usdData.length > 0) {
      const wsUSD = XLSX.utils.json_to_sheet(usdData);
      XLSX.utils.book_append_sheet(wb, wsUSD, "USD Transactions");
    }

    XLSX.writeFile(wb, `CashReport_${summary.date}.xlsx`);
  };

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
                  onClick={() => setViewMode('daily')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    viewMode === 'daily' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Daily Summary
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                    viewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Transaction List
                </button>
              </div>
              <div className="h-6 w-px bg-gray-200 mx-2 hidden sm:block" />
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 py-3 bg-green-50 rounded-2xl border border-green-100 shadow-sm">
              <div className="flex items-center gap-2 border-b sm:border-b-0 sm:border-r border-green-200 pb-2 sm:pb-0 sm:pr-4">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Period Summary</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 pt-2 sm:pt-0 sm:pl-6">
                <div>
                  <p className="text-[8px] font-black text-green-500 uppercase tracking-widest mb-0.5">Total SSP (Payments)</p>
                  <p className="text-sm sm:text-base lg:text-lg font-black text-green-700">
                    {filteredTransactions.filter(t => t.currency === 'SSP').reduce((acc, t) => acc + t.amount, 0).toLocaleString('en-US')} SSP
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Total USD (Payments)</p>
                  <p className="text-sm sm:text-base lg:text-lg font-black text-indigo-700">
                    ${filteredTransactions.filter(t => t.currency === 'USD').reduce((acc, t) => acc + t.amount, 0).toLocaleString('en-US')} USD
                  </p>
                </div>
              </div>
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

      <div className="space-y-6">
        {viewMode === 'daily' ? (
          dailySummaries.map((summary: any) => (
            <div key={summary.date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-gray-50/80 px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 shrink-0">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-black text-gray-900 truncate">
                      {format(new Date(summary.date), 'EEEE, MMM dd, yyyy')}
                    </h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{summary.transactions.length} Transactions</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => exportDailyToPDF(summary)}
                      className="p-2.5 bg-white text-red-600 rounded-xl border border-gray-100 hover:bg-red-50 transition-all shadow-sm active:scale-95"
                      title="Export PDF"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => exportDailyToExcel(summary)}
                      className="p-2.5 bg-white text-green-600 rounded-xl border border-gray-100 hover:bg-green-50 transition-all shadow-sm active:scale-95"
                      title="Export Excel"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                    </button>
                  </div>
                  <button 
                    onClick={() => handleConfirmDay(summary)}
                    disabled={!summary.hasUnconfirmed || isConfirming === summary.date}
                    className={cn(
                      "flex-1 sm:flex-none px-6 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                      summary.hasUnconfirmed ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100" : "bg-green-600 shadow-green-100"
                    )}
                  >
                    {isConfirming === summary.date ? 'Transferring...' : summary.hasUnconfirmed ? 'Transfer' : 'Transferred'}
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* 2-Column Summary List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-100 shadow-sm">
                    <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Payments of SSP</p>
                    <p className="text-base font-black text-green-700">{(summary.totalCashSalesSSP + summary.totalRepaymentsSSP).toLocaleString('en-US')} SSP</p>
                  </div>
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 shadow-sm">
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Payments (USD)</p>
                    <p className="text-base font-black text-indigo-700">${(summary.totalCashSalesUSD + summary.totalRepaymentsUSD).toLocaleString('en-US')}</p>
                  </div>
                </div>

                <div className="bg-gray-50/30 rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                    {/* SSP Transactions Section */}
                    <div className="p-4 space-y-4">
                      <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest border-b border-green-100 pb-2 flex items-center justify-between">
                        <span>SSP Transactions</span>
                        <span className="font-black">{(summary.totalDaySSP).toLocaleString('en-US')} SSP</span>
                      </h4>
                      
                      <div className="space-y-2">
                        {summary.transactions.filter((t: any) => t.currency === 'SSP').map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-50 group hover:border-green-100 transition-all shadow-sm">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                t.isCashIn ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                              )}>
                                {t.type === 'Cash Sale' ? <ShoppingCart className="w-3 h-3" /> : 
                                 t.type === 'Repayment' ? <User className="w-3 h-3" /> :
                                 t.type === 'Expense' ? <Receipt className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-gray-900 truncate">{t.customerName}</p>
                                <p className="text-[8px] text-gray-400 font-mono uppercase tracking-tighter">
                                  #{t.id.split('_')[0].slice(-6).toUpperCase()}
                                  {t.isConfirmed && <span className="ml-1 text-green-500">✓</span>}
                                </p>
                              </div>
                            </div>
                            
                            <div className="text-right shrink-0 ml-2">
                              <span className={cn("text-[11px] font-black", t.isCashIn ? "text-green-600" : "text-red-600")}>
                                {t.isCashIn ? '+' : '-'}{t.amount.toLocaleString('en-US')}
                              </span>
                            </div>
                          </div>
                        ))}
                        {summary.transactions.filter((t: any) => t.currency === 'SSP').length === 0 && (
                          <p className="text-[10px] text-gray-400 text-center py-4 italic">No SSP transactions</p>
                        )}
                      </div>
                    </div>

                    {/* USD Transactions Section */}
                    <div className="p-4 space-y-4">
                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2 flex items-center justify-between">
                        <span>USD Payments</span>
                        <span className="font-black">${(summary.totalDayUSD).toLocaleString('en-US')}</span>
                      </h4>
                      
                      <div className="space-y-2">
                        {summary.transactions.filter((t: any) => t.currency === 'USD').map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-50 group hover:border-indigo-100 transition-all shadow-sm">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                t.isCashIn ? "bg-indigo-50 text-indigo-600" : "bg-red-50 text-red-600"
                              )}>
                                {t.type === 'Cash Sale' ? <ShoppingCart className="w-3 h-3" /> : 
                                 t.type === 'Repayment' ? <User className="w-3 h-3" /> :
                                 t.type === 'Expense' ? <Receipt className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-gray-900 truncate">{t.customerName}</p>
                                <p className="text-[8px] text-gray-400 font-mono uppercase tracking-tighter">
                                  #{t.id.split('_')[0].slice(-6).toUpperCase()}
                                  {t.isConfirmed && <span className="ml-1 text-indigo-500">✓</span>}
                                </p>
                              </div>
                            </div>
                            
                            <div className="text-right shrink-0 ml-2">
                              <span className={cn("text-[11px] font-black", t.isCashIn ? "text-indigo-600" : "text-red-600")}>
                                {t.isCashIn ? '+' : '-'}${t.amount.toLocaleString('en-US')}
                              </span>
                            </div>
                          </div>
                        ))}
                        {summary.transactions.filter((t: any) => t.currency === 'USD').length === 0 && (
                          <p className="text-[10px] text-gray-400 text-center py-4 italic">No USD transactions</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                      <td className="px-6 py-4 font-medium">
                        <div className="flex flex-col">
                          <p className="text-sm font-bold text-gray-900">{format(new Date(t.timestamp), 'MMM dd, yyyy')}</p>
                          <p className="text-[10px] text-gray-400">{format(new Date(t.timestamp), 'HH:mm')}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4"><p className="text-[10px] font-mono text-gray-400 tracking-tighter">#{t.id.split('_')[0].slice(-6).toUpperCase()}</p></td>
                      <td className="px-6 py-4"><p className="text-sm font-bold text-gray-900">{t.customerName}</p></td>
                      <td className="px-6 py-4 text-right">
                        <p className={cn("text-sm font-black", t.isCashIn ? "text-green-600" : "text-red-600")}>
                          {t.isCashIn ? '+' : '-'}{t.currency === 'USD' ? '$' : ''}{t.amount.toLocaleString('en-US')}{t.currency === 'SSP' ? ' SSP' : ''}
                        </p>
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
            <div className="md:hidden divide-y divide-gray-100">
              {filteredTransactions.map((t) => (
                <div key={t.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-black">{t.type} • #{t.id.split('_')[0].slice(-6).toUpperCase()}</p>
                    </div>
                    <p className={cn("text-sm font-black", t.isCashIn ? "text-green-600" : "text-red-600")}>
                      {t.isCashIn ? '+' : '-'}{t.currency === 'USD' ? '$' : ''}{t.amount.toLocaleString('en-US')}{t.currency === 'SSP' ? ' SSP' : ''}
                    </p>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400 font-bold uppercase">
                    <span>{format(new Date(t.timestamp), 'MMM dd')}</span>
                    <span>{format(new Date(t.timestamp), 'HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {filteredTransactions.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
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
