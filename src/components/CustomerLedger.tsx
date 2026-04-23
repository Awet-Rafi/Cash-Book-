import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, Timestamp, addDoc, serverTimestamp, deleteDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sale, Customer, Payment, Expense, CashTransaction } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { 
  Search, 
  User, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Receipt, 
  ArrowRight, 
  ExternalLink, 
  DollarSign, 
  X, 
  ShoppingCart, 
  PlusCircle, 
  ChevronRight, 
  Users, 
  Shield, 
  Clock, 
  MoreVertical, 
  Edit3, 
  Copy, 
  UserPlus, 
  Move, 
  Trash, 
  TrendingUp, 
  TrendingDown, 
  Paperclip, 
  Eye, 
  FileText, 
  Image as ImageIcon, 
  Wallet,
  FileDown,
  FileSpreadsheet
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';

export default function CustomerLedger() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, businessId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { customerId?: string } | null;
    if (state?.customerId) {
      setExpandedCustomer(state.customerId);
    }
  }, [location.state]);
  const [paymentAmountUSD, setPaymentAmountUSD] = useState('');
  const [paymentAmountSSP, setPaymentAmountSSP] = useState('');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState('1,000');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentAttachment, setPaymentAttachment] = useState<string | null>(null);
  const [paymentAttachmentType, setPaymentAttachmentType] = useState<'image' | 'pdf' | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  // Helper to format input as user types
  const formatInputNumber = (value: string) => {
    // Remove all non-numeric characters except decimal point
    const cleanValue = value.replace(/[^\d.]/g, '');
    
    // Split into integer and decimal parts
    const parts = cleanValue.split('.');
    
    // Format integer part with commas
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    // Rejoin with decimal part if it exists
    return parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0];
  };

  // Helper to get raw numeric value for calculations
  const getRawNumber = (value: string) => {
    if (!value) return 0;
    return parseFloat(value.replace(/,/g, '')) || 0;
  };

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  
  // Add Customer State
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newInlineName, setNewInlineName] = useState('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [viewingCashCurrency, setViewingCashCurrency] = useState<'USD' | 'SSP' | null>(null);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);

  // Manual Cash Transaction State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualType, setManualType] = useState<'in' | 'out'>('in');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [manualCurrency, setManualCurrency] = useState<'USD' | 'SSP'>('USD');

  const [activeTransactionMenu, setActiveTransactionMenu] = useState<string | null>(null);
  const [activeCustomerTransactionMenu, setActiveCustomerTransactionMenu] = useState<string | null>(null);
  const [deleteTransactionInfo, setDeleteTransactionInfo] = useState<{ id: string, collection: string, type: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const transactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (transactionMenuRef.current && !transactionMenuRef.current.contains(event.target as Node)) {
        setActiveTransactionMenu(null);
        setActiveCustomerTransactionMenu(null);
      }
    };

    if (activeMenu || isExportMenuOpen || activeTransactionMenu || activeCustomerTransactionMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu, isExportMenuOpen, activeTransactionMenu, activeCustomerTransactionMenu]);

  useEffect(() => {
    if (!businessId) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('businessId', '==', businessId),
      where('paymentMethod', '==', 'credit'),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc'),
      limit(200)
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('businessId', '==', businessId)), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: safeTimestamp(doc.data().createdAt)
      } as Customer)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
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

    const unsubAllSales = onSnapshot(query(
      collection(db, 'sales'), 
      where('businessId', '==', businessId), 
      orderBy('timestamp', 'desc'),
      limit(500)
    ), (snapshot) => {
      setAllSales(snapshot.docs.map(doc => ({
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
      limit(200)
    ), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Expense)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
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
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cashTransactions');
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubPayments();
      unsubAllSales();
      unsubExpenses();
      unsubCashTransactions();
    };
  }, [businessId]);

  const handleInlineAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newInlineName.trim() || isSubmittingCustomer || !businessId) return;

    setIsSubmittingCustomer(true);
    try {
      await addDoc(collection(db, 'customers'), {
        businessId,
        name: newInlineName.trim(),
        phone: '',
        email: '',
        createdAt: serverTimestamp(),
        memberIds: []
      });
      setIsAddingInline(false);
      setNewInlineName('');
    } catch (error) {
      console.error('Error adding customer inline:', error);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleMarkAsPaid = async (saleId: string) => {
    if (window.confirm('Mark this specific invoice as fully paid?')) {
      await updateDoc(doc(db, 'sales', saleId), {
        status: 'paid'
      });
      setExpandedCustomer(null); // Return to customer list
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || (!paymentAmountUSD && !paymentAmountSSP) || isSubmittingPayment || !businessId) return;
    
    setIsSubmittingPayment(true);
    try {
      const usd = getRawNumber(paymentAmountUSD);
      const ssp = getRawNumber(paymentAmountSSP);
      const rate = getRawNumber(paymentExchangeRate) || 1000;
      const totalUSD = usd + (ssp / rate);

      const paymentData: any = {
        businessId,
        customerId: selectedCustomerForPayment.id,
        customerName: selectedCustomerForPayment.name,
        amount: (usd > 0 && ssp === 0) ? usd : (ssp > 0 && usd === 0) ? ssp : totalUSD,
        currency: (usd > 0 && ssp === 0) ? 'USD' : (ssp > 0 && usd === 0) ? 'SSP' : 'USD',
        creditDeductionUSD: totalUSD,
        amountUSD: usd,
        amountSSP: ssp,
        exchangeRate: rate,
        notes: paymentNotes,
        attachmentUrl: paymentAttachment,
        attachmentType: paymentAttachmentType,
        status: 'pending'
      };

      if (editingPaymentId) {
        paymentData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'payments', editingPaymentId), paymentData);
      } else {
        paymentData.timestamp = serverTimestamp();
        // Record as single document even if both currencies are used
        await addDoc(collection(db, 'payments'), paymentData);
      }
      
      setIsPaymentModalOpen(false);
      setPaymentAmountUSD('');
      setPaymentAmountSSP('');
      setPaymentNotes('');
      setPaymentAttachment(null);
      setPaymentAttachmentType(null);
      setEditingPaymentId(null);
      setExpandedCustomer(null); // Return to customer list
    } catch (error) {
      console.error("Error recording payment:", error);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleEditTransaction = (item: any, customer: any) => {
    if (item.collection === 'payments') {
      setSelectedCustomerForPayment(customer);
      setPaymentAmountUSD(item.amountUSD?.toString() || (item.currency === 'USD' ? item.amount.toString() : ''));
      setPaymentAmountSSP(item.amountSSP?.toString() || (item.currency === 'SSP' ? item.amount.toString() : ''));
      setPaymentExchangeRate(item.exchangeRate?.toString() || '1000');
      setPaymentNotes(item.notes || '');
      setPaymentAttachment(item.attachmentUrl || null);
      setPaymentAttachmentType(item.attachmentType || null);
      setEditingPaymentId(item.id);
      setIsPaymentModalOpen(true);
    } else if (item.collection === 'sales') {
      // Navigate to POS with the sale ID to edit it
      navigate('/pos', { state: { editSaleId: item.id } });
    } else if (item.collection === 'cashTransactions') {
      setManualType(item.type);
      setManualAmount(item.amount.toString());
      setManualNotes(item.notes);
      setEditingManualId(item.id);
      setIsManualModalOpen(true);
    } else if (item.collection === 'expenses') {
      // Navigate to expenses page and highlight this expense
      navigate('/expenses', { state: { highlightExpenseId: item.id } });
    }
    setActiveCustomerTransactionMenu(null);
    setExpandedCustomer(null); // Clean background
    setViewingCashCurrency(null); // Close cash book if open
  };

  const handleEditCashTransaction = (item: any) => {
    if (item.collection === 'sales') {
      navigate('/pos', { state: { editSaleId: item.id } });
    } else if (item.collection === 'payments') {
      const p = item.originalData;
      const customer = customers.find(c => c.id === p.customerId);
      if (customer) {
        setSelectedCustomerForPayment(customer);
        setPaymentAmountUSD(p.amountUSD?.toString() || (p.currency === 'USD' ? p.amount.toString() : ''));
        setPaymentAmountSSP(p.amountSSP?.toString() || (p.currency === 'SSP' ? p.amount.toString() : ''));
        setPaymentExchangeRate(p.exchangeRate?.toString() || '1000');
        setPaymentNotes(p.notes || '');
        setPaymentAttachment(p.attachmentUrl || null);
        setPaymentAttachmentType(p.attachmentType || null);
        setEditingPaymentId(p.id);
        setIsPaymentModalOpen(true);
      }
    } else if (item.collection === 'cashTransactions') {
      const data = item.originalData;
      setManualType(data.type);
      setManualAmount(data.amount.toString());
      setManualNotes(data.notes);
      setEditingManualId(item.id);
      setIsManualModalOpen(true);
    } else if (item.collection === 'expenses') {
      // Navigate to expenses page with the expense ID to highlight/edit
      navigate('/expenses', { state: { highlightExpenseId: item.id } });
    }
    setActiveTransactionMenu(null);
    setExpandedCustomer(null); // Clean background
    setViewingCashCurrency(null); // Close cash book if open
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) { // ~800KB limit to stay safe with Firestore 1MB limit
      alert('File is too large. Please select a file smaller than 800KB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPaymentAttachment(reader.result as string);
      setPaymentAttachmentType(file.type.includes('pdf') ? 'pdf' : 'image');
    };
    reader.readAsDataURL(file);
  };

  const exportToPDF = (customer: any, transactions: any[]) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Transaction History: ${customer.name}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Total Outstanding: ${formatCurrency(customer.totalOwed)}`, 14, 30);
    doc.text(`Report Date: ${format(new Date(), 'PPP')}`, 14, 38);

    const tableData = transactions.map(item => [
      format(new Date(item.timestamp), 'MMM dd, yyyy HH:mm'),
      item.isPayment ? 'Cash Out (Repayment)' : 'Cash In (Credit Sale)',
      item.isPayment ? '-' : '',
      formatCurrency(item.amount || item.totalAmount, item.currency || 'USD'),
      item.notes || '-'
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Date', 'Type', '', 'Amount', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`${customer.name}_transactions_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = (customer: any, transactions: any[]) => {
    const data = transactions.map(item => ({
      Date: format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm'),
      Type: item.isPayment ? 'Cash Out' : 'Cash In',
      Amount: item.amount || item.totalAmount,
      Notes: item.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `${customer.name}_history.xlsx`);
  };

  const exportCashBookToPDF = (currency: 'USD' | 'SSP', transactions: any[], balance: number) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Cash Book Statement (${currency})`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Current Balance: ${formatCurrency(balance, currency)}`, 14, 30);
    doc.text(`Report Date: ${format(new Date(), 'PPP')}`, 14, 38);

    const tableData = transactions.map(item => [
      format(new Date(item.timestamp), 'MMM dd, yyyy HH:mm'),
      item.customerName || '-',
      item.type,
      item.isCashIn ? '+' : '-',
      formatCurrency(item.amount, currency),
      item.notes || '-'
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Date', 'Entity', 'Type', '', 'Amount', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: currency === 'USD' ? [79, 70, 229] : [22, 163, 74] }
    });

    doc.save(`Cash_Book_${currency}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group sales and payments by customer
  const customerCredits = useMemo(() => {
    return filteredCustomers.map(customer => {
      const isCashSalesCustomer = customer.name === 'Cash Sales';
      
      const customerSales = sales.filter(s => {
        const isDirectSale = s.customerId === customer.id || s.customerName === customer.name;
        const isWithin24Hours = new Date().getTime() - new Date(s.timestamp).getTime() <= 24 * 60 * 60 * 1000;
        
        if (isCashSalesCustomer) {
          if (!isWithin24Hours) return false;
          if (s.paymentMethod === 'cash') return true;
          if (isDirectSale) return true;
          const isGuestSale = s.customerName === 'Guest' || !s.customerId;
          return isGuestSale;
        }
        
        return isDirectSale;
      });

      const customerPayments = payments.filter(p => {
        const isWithin24Hours = new Date().getTime() - new Date(p.timestamp).getTime() <= 24 * 60 * 60 * 1000;
        if (isCashSalesCustomer) {
          return p.customerId === customer.id && isWithin24Hours;
        }
        return p.customerId === customer.id;
      });
      
      const totalCreditSales = customerSales.filter(s => s.status === 'pending').reduce((acc, s) => {
        if (s.currency === 'SSP') {
          const rate = s.exchangeRate || 1000;
          return acc + (s.totalAmount / rate);
        }
        return acc + s.totalAmount;
      }, 0);
      const totalRepayments = customerPayments
        .filter(p => p.status === 'transferred' || (!p.status && p.isConfirmed))
        .reduce((acc, p) => acc + (p.creditDeductionUSD ?? p.amount), 0);
      
      const netOwed = totalCreditSales - totalRepayments;

      const customerCashTransactions = isCashSalesCustomer 
        ? cashTransactions.filter(t => {
            const isWithin24Hours = new Date().getTime() - new Date(t.timestamp).getTime() <= 24 * 60 * 60 * 1000;
            if (!isWithin24Hours) return false;
            const isTagged = t.customerId === customer.id;
            return isTagged || !t.customerId;
          })
        : cashTransactions.filter(t => t.customerId === customer.id);

      const allTransactions = [...customerSales, ...customerPayments, ...customerCashTransactions];
      const customerExpenses: any[] = []; 
      
      const latestTimestamp = [...allTransactions, ...customerExpenses].length > 0 
        ? Math.max(...[...allTransactions, ...customerExpenses].map(t => new Date(t.timestamp).getTime()))
        : new Date(customer.createdAt).getTime();

      return {
        ...customer,
        totalOwed: netOwed,
        sales: customerSales,
        payments: customerPayments,
        expenses: customerExpenses,
        cashTransactions: customerCashTransactions,
        lastUpdated: latestTimestamp,
        membersCount: customer.memberIds?.length || 0
      };
    }).sort((a, b) => {
      if (a.name === 'Cash Sales') return -1;
      if (b.name === 'Cash Sales') return 1;
      return b.lastUpdated - a.lastUpdated;
    });
  }, [filteredCustomers, sales, payments, cashTransactions]);

  const currentCashTransactions = useMemo(() => {
    if (!viewingCashCurrency) return [];
    return [
      ...allSales.filter(s => (s.paymentMethod === 'cash' || s.status === 'paid') && s.currency === viewingCashCurrency).map(s => ({
        id: s.id,
        timestamp: s.timestamp,
        customerName: s.customerName,
        amount: s.totalAmount,
        type: s.paymentMethod === 'cash' ? 'Cash Sale' : 'Credit Sale (Paid)',
        isCashIn: true,
        notes: `Sale #${s.id.slice(-6).toUpperCase()}`,
        collection: 'sales',
        status: 'transferred' as const,
        originalData: s
      })),
      ...payments.filter(p => {
        if (viewingCashCurrency === 'USD') return (p.amountUSD !== undefined ? p.amountUSD > 0 : p.currency === 'USD');
        if (viewingCashCurrency === 'SSP') return (p.amountSSP !== undefined ? p.amountSSP > 0 : p.currency === 'SSP');
        return false;
      }).map(p => ({
        id: p.id,
        timestamp: p.timestamp,
        customerName: p.customerName,
        amount: p.amount,
        type: 'Repayment',
        isCashIn: true,
        notes: `Repayment from ${p.customerName}`,
        collection: 'payments',
        status: p.status || 'transferred',
        originalData: p
      })),
      ...expenses.filter(e => (e.currency === viewingCashCurrency) || (viewingCashCurrency === 'USD' && !e.currency)).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        customerName: 'Expense',
        amount: e.amount,
        type: 'Expense',
        isCashIn: false,
        notes: e.description,
        collection: 'expenses',
        status: 'transferred' as const,
        originalData: e
      })),
      ...cashTransactions.filter(t => t.currency === viewingCashCurrency).map(t => ({
        id: t.id,
        timestamp: t.timestamp,
        customerName: 'Manual Entry',
        amount: t.amount,
        type: t.type === 'in' ? 'Cash In' : 'Cash Out',
        isCashIn: t.type === 'in',
        notes: t.notes,
        collection: 'cashTransactions',
        status: 'transferred' as const,
        originalData: t
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allSales, payments, expenses, cashTransactions, viewingCashCurrency]);

  const handleRename = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingCustomerId || !editingName.trim() || isRenaming) return;

    setIsRenaming(true);
    try {
      await updateDoc(doc(db, 'customers', editingCustomerId), {
        name: editingName.trim()
      });
      setEditingCustomerId(null);
    } catch (error) {
      console.error('Error renaming customer:', error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  };

  // Calculate Cash in Hand (Confirmed Today in South Sudan Time)
  const cashInHandSSP = (() => {
    const cashSalesSSP = allSales.filter(s => 
      (s.paymentMethod === 'cash' || s.status === 'paid') && 
      s.currency === 'SSP'
    ).reduce((acc, s) => acc + s.totalAmount, 0);

    const repaymentsSSP = payments.filter(p => 
      ((p.currency === 'SSP' || (p.amountSSP || 0) > 0)) && (p.status === 'transferred' || !p.status)
    ).reduce((acc, p) => {
      if ((p.amountSSP || 0) > 0) return acc + p.amountSSP!;
      return p.currency === 'SSP' ? acc + p.amount : acc;
    }, 0);

    const totalSSPExpenses = expenses.filter(e => 
      e.currency === 'SSP'
    ).reduce((acc, e) => acc + e.amount, 0);

    const manualSSP = cashTransactions.filter(t => 
      t.currency === 'SSP'
    ).reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);

    return (cashSalesSSP + repaymentsSSP + manualSSP) - totalSSPExpenses;
  })();

  const cashInHandUSD = (() => {
    const cashSalesUSD = allSales.filter(s => 
      (s.paymentMethod === 'cash' || s.status === 'paid') && 
      s.currency === 'USD'
    ).reduce((acc, s) => acc + s.totalAmount, 0);

    const repaymentsUSD = payments.filter(p => 
      ((p.currency === 'USD' || (p.amountUSD || 0) > 0)) && (p.status === 'transferred' || !p.status)
    ).reduce((acc, p) => {
      if ((p.amountUSD || 0) > 0) return acc + p.amountUSD!;
      return p.currency === 'USD' ? acc + p.amount : acc;
    }, 0);

    const totalUSDExpenses = expenses.filter(e => 
      (e.currency === 'USD' || !e.currency)
    ).reduce((acc, e) => acc + e.amount, 0);

    const manualUSD = cashTransactions.filter(t => 
      t.currency === 'USD'
    ).reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);

    return (cashSalesUSD + repaymentsUSD + manualUSD) - totalUSDExpenses;
  })();

  const handleDuplicateCustomer = async (customer: Customer) => {
    if (!businessId) return;
    try {
      await addDoc(collection(db, 'customers'), {
        businessId,
        name: `${customer.name} (Copy)`,
        phone: customer.phone || '',
        email: customer.email || '',
        createdAt: serverTimestamp(),
        memberIds: customer.memberIds || []
      });
      setActiveMenu(null);
    } catch (error) {
      console.error('Error duplicating customer:', error);
    }
  };

  const handleRecordManualTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAmount || !manualNotes.trim() || isSubmittingManual || !manualCurrency || !businessId) return;

    setIsSubmittingManual(true);
    try {
      const transactionData: any = {
        businessId,
        type: manualType,
        amount: getRawNumber(manualAmount),
        currency: manualCurrency,
        notes: manualNotes.trim()
      };

      // Tag with customer if recorded from a customer book
      if (expandedCustomer) {
        const customer = customers.find(c => c.id === expandedCustomer);
        if (customer) {
          transactionData.customerId = customer.id;
          transactionData.customerName = customer.name;
        }
      }

      if (editingManualId) {
        transactionData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'cashTransactions', editingManualId), transactionData);
      } else {
        transactionData.timestamp = serverTimestamp();
        await addDoc(collection(db, 'cashTransactions'), transactionData);
      }
      
      setIsManualModalOpen(false);
      setManualAmount('');
      setManualNotes('');
      setEditingManualId(null);
      setExpandedCustomer(null); // Return to main page
      setViewingCashCurrency(null); // Also close the cash book view if open
    } catch (error) {
      console.error('Error recording manual transaction:', error);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteTransactionInfo || !isAdmin) return;

    try {
      await deleteDoc(doc(db, deleteTransactionInfo.collection, deleteTransactionInfo.id));
      setDeleteTransactionInfo(null);
      setActiveTransactionMenu(null);
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100" />)}
    </div>
  </div>;

  return (
    <div className="space-y-6 pb-32">
      {/* Sticky Upper Level Balance Summary */}
      <div className="sticky top-0 z-30 pt-2 pb-2 sm:pt-3 sm:pb-3 bg-gray-50/95 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-gray-100">
        
        {/* Mobile Version - Compact Grid */}
        <div className="md:hidden flex flex-col gap-2 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 gap-2 flex-1">
            <button 
              onClick={() => setViewingCashCurrency('USD')}
              className="flex flex-col items-center justify-center bg-green-600 rounded-xl p-2 text-white shadow-lg shadow-green-100 hover:bg-green-700 transition-all active:scale-95 group"
            >
              <p className="text-[7px] font-black uppercase tracking-widest mb-0.5 opacity-80 group-hover:opacity-100 transition-opacity">Cash Sales (USD)</p>
              <h2 className="text-xs font-black tracking-tight leading-none">
                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cashInHandUSD)}
              </h2>
            </button>

            <button 
              onClick={() => setViewingCashCurrency('SSP')}
              className="flex flex-col items-center justify-center bg-green-600 rounded-xl p-2 text-white shadow-lg shadow-green-100 hover:bg-green-700 transition-all active:scale-95 group"
            >
              <p className="text-[7px] font-black uppercase tracking-widest mb-0.5 opacity-80 group-hover:opacity-100 transition-opacity">Cash Sales (SSP)</p>
              <h2 className="text-xs font-black tracking-tight leading-none">
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cashInHandSSP)}
              </h2>
            </button>

            <div className="flex flex-col items-center justify-center bg-red-600 rounded-xl p-2 text-white shadow-lg shadow-red-100 col-span-2">
              <p className="text-[7px] font-black uppercase tracking-widest mb-0.5 opacity-80">Outstanding Balance</p>
              <h2 className="text-xs font-black tracking-tight leading-none">
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
              </h2>
            </div>
          </div>

          {/* Search Bar in Header (Mobile) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search customers..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm placeholder:text-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop Version - Luxury / Prestige Bar */}
        <div className="hidden md:flex items-center justify-between bg-[#fdfcfb] rounded-3xl border border-[#e5e1da] p-1 shadow-sm max-w-7xl mx-auto w-full">
          <div className="flex items-center flex-1 divide-x divide-[#e5e1da]">
            {/* USD */}
            <button 
              onClick={() => setViewingCashCurrency('USD')}
              className="flex-1 px-10 py-6 hover:bg-[#f5f2ed] transition-all group text-left"
            >
              <p className="text-[10px] font-medium text-[#a8a29e] uppercase tracking-[0.25em] mb-2">Cash Holdings (USD)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-serif italic text-[#78716c]">$</span>
                <h2 className="text-3xl font-serif text-[#1c1917] tracking-tight group-hover:text-indigo-900 transition-colors">
                  {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cashInHandUSD)}
                </h2>
              </div>
            </button>

            {/* SSP */}
            <button 
              onClick={() => setViewingCashCurrency('SSP')}
              className="flex-1 px-10 py-6 hover:bg-[#f5f2ed] transition-all group text-left"
            >
              <p className="text-[10px] font-medium text-[#a8a29e] uppercase tracking-[0.25em] mb-2">Cash Holdings (SSP)</p>
              <div className="flex items-baseline gap-1">
                <h2 className="text-3xl font-serif text-[#1c1917] tracking-tight group-hover:text-indigo-900 transition-colors">
                  {new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cashInHandSSP)}
                </h2>
                <span className="text-[10px] font-serif italic text-[#78716c] ml-1">SSP</span>
              </div>
            </button>

            {/* Debt */}
            <div className="flex-1 px-10 py-6 text-left bg-[#fffaf5]">
              <p className="text-[10px] font-medium text-rose-400 uppercase tracking-[0.25em] mb-2">Total Outstanding</p>
              <h2 className="text-3xl font-serif text-rose-700 tracking-tight">
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
              </h2>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-80 mx-6 group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a29e] group-focus-within:text-indigo-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Search customers..."
              className="w-full pl-8 py-3 bg-transparent border-b border-[#e5e1da] text-sm font-serif italic focus:border-indigo-400 outline-none transition-all placeholder:text-[#d6d3d1]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {isAddingInline && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border-2 border-indigo-500 shadow-xl p-3 flex items-center gap-3 z-20 relative"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                <UserPlus className="w-5 h-5" />
              </div>
              <form 
                onSubmit={handleInlineAdd}
                className="flex-1 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Enter customer name..."
                  value={newInlineName}
                  onChange={(e) => setNewInlineName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setIsAddingInline(false)}
                  className="flex-1 px-2 py-1.5 text-sm font-black text-gray-900 border-b-2 border-indigo-500 outline-none bg-indigo-50/30 rounded-t transition-all"
                />
                <div className="flex items-center gap-1">
                  <button 
                    type="submit"
                    disabled={isSubmittingCustomer || !newInlineName.trim()}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingInline(false)}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {customerCredits.map((customer, index) => (
          <motion.div 
            key={customer.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01, y: -2, zIndex: 10 }}
            transition={{ 
              layout: { type: "spring", stiffness: 300, damping: 30 },
              delay: Math.min(index * 0.01, 0.2), // Further reduced delay
              duration: 0.2,
              type: "spring",
              stiffness: 260,
              damping: 25
            }}
            className={cn(
              "bg-white rounded-2xl border border-gray-100 shadow-sm relative group overflow-hidden",
              "hover:border-indigo-100 hover:shadow-md",
              expandedCustomer === customer.id ? "ring-1 ring-indigo-500" : ""
            )}
          >
            {/* List Item Content */}
            <div 
              onClick={() => {
                setExpandedCustomer(customer.id);
                window.scrollTo({ top: 0, behavior: 'instant' });
              }}
              className="p-2 sm:p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-2xl"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs sm:text-sm shadow-inner shrink-0">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {editingCustomerId === customer.id ? (
                      <form 
                        onSubmit={handleRename}
                        className="flex-1 flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => !isRenaming && setEditingCustomerId(null)}
                          className="flex-1 px-2 py-1 text-xs sm:text-sm font-black text-gray-900 border-b-2 border-indigo-500 outline-none bg-indigo-50/50 rounded-t"
                        />
                        <button 
                          type="submit"
                          disabled={isRenaming || !editingName.trim()}
                          className="text-green-600 hover:text-green-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => setEditingCustomerId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <h3 className="font-black text-gray-900 text-xs sm:text-sm tracking-tight truncate">{customer.name}</h3>
                        <p className={cn(
                          "text-sm font-black tracking-tighter",
                          customer.totalOwed > 0 ? "text-red-600" : "text-green-600"
                        )}>
                          {formatCurrency(customer.totalOwed)}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 flex items-center gap-1">
                      <Users className="w-2 h-2" />
                      {customer.membersCount} Members
                    </span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      Updated {formatDistanceToNow(new Date(customer.lastUpdated))} ago
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <div 
                  className="relative" 
                  ref={activeMenu === customer.id ? menuRef : null}
                  onMouseLeave={() => activeMenu === customer.id && setActiveMenu(null)}
                >
                  <button 
                    onClick={() => setActiveMenu(activeMenu === customer.id ? null : customer.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {activeMenu === customer.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 top-full pt-1 z-[120]"
                      >
                        <div className="w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 overflow-hidden">
                          <button 
                            onClick={() => { 
                              setActiveMenu(null); 
                              setEditingCustomerId(customer.id);
                              setEditingName(customer.name);
                            }} 
                            className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Rename Book
                          </button>
                          <button 
                            onClick={() => handleDuplicateCustomer(customer)} 
                            className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate Book
                          </button>
                          <button onClick={() => { setActiveMenu(null); navigate('/members'); }} className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <UserPlus className="w-3.5 h-3.5" /> Add Members
                          </button>
                          <button onClick={() => setActiveMenu(null)} className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <Move className="w-3.5 h-3.5" /> Move Book
                          </button>
                          <div className="h-px bg-gray-100 my-1" />
                          <button 
                            onClick={() => { setActiveMenu(null); handleDeleteCustomer(customer.id); }}
                            className="w-full px-4 py-2 text-left text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash className="w-3.5 h-3.5" /> Delete Book
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Mobile Balance - Removed as it's now in the header */}

          </motion.div>
        ))}
      </div>

      {/* Full Page Customer Detail Overlay */}
      <AnimatePresence>
        {expandedCustomer && (() => {
          const customer = customerCredits.find(c => c.id === expandedCustomer);
          if (!customer) return null;
          
          const transactions = [
            ...customer.sales.map(s => ({ ...s, collection: 'sales' })), 
            ...customer.payments.map(p => ({ ...p, isPayment: true, collection: 'payments', status: p.status || 'pending' })),
            ...(customer.expenses || []).map((e: any) => ({ 
              ...e, 
              isExpense: true, 
              isPayment: true, // Expenses are cash-out
              collection: 'expenses',
              status: 'transferred',
              notes: e.description 
            })),
            ...(customer.cashTransactions || []).map((t: any) => ({ 
              ...t, 
              isManual: true, 
              isPayment: t.type === 'out',
              collection: 'cashTransactions',
              status: 'transferred',
              notes: t.notes || (t.type === 'in' ? 'Manual Cash In' : 'Manual Cash Out')
            }))
          ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

          return (
            <motion.div 
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[200] bg-gray-50 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
                <button 
                  onClick={() => setExpandedCustomer(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-gray-900 truncate">{customer.name}</h3>
                  <p className={cn(
                    "text-[11px] font-black tracking-tighter",
                    customer.totalOwed > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    Balance: {formatCurrency(customer.totalOwed)}
                  </p>
                </div>
                <div className="flex gap-1 relative" ref={exportMenuRef}>
                  <button 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2"
                  >
                    <FileDown className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Extract</span>
                  </button>

                  <AnimatePresence>
                    {isExportMenuOpen && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-full mt-2 z-[210] w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 overflow-hidden"
                      >
                        <button 
                          onClick={() => {
                            setIsExportMenuOpen(false);
                            exportToPDF(customer, transactions);
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-red-500" /> Export PDF
                        </button>
                        <button 
                          onClick={() => {
                            setIsExportMenuOpen(false);
                            exportToExcel(customer, transactions);
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-green-500" /> Export Excel
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-32">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-1.5 rounded-lg border border-gray-100 shadow-sm text-center">
                    <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Credit</p>
                    <p className="text-xs font-black text-red-600">
                      {formatCurrency(customer.sales.filter(s => s.status === 'pending').reduce((acc, s) => {
                        if (s.currency === 'SSP') {
                          const rate = s.exchangeRate || 1000;
                          return acc + (s.totalAmount / rate);
                        }
                        return acc + s.totalAmount;
                      }, 0))}
                    </p>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-gray-100 shadow-sm text-center">
                    <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Paid</p>
                    <p className="text-xs font-black text-green-600">
                      {formatCurrency(customer.payments.reduce((acc, p) => acc + (p.creditDeductionUSD ?? p.amount), 0))}
                    </p>
                  </div>
                </div>

                {/* Transaction History */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-0.5">
                    <h4 className="text-[9px] font-black text-gray-900 uppercase tracking-widest">Transaction History</h4>
                    <span className="text-[7px] font-bold text-gray-400">{transactions.length} Records</span>
                  </div>
                  
                  <div className="space-y-1.5">
                    {transactions.map((item: any) => (
                      <div 
                        key={item.id} 
                        onClick={() => handleEditTransaction(item, customer)}
                        className="bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between gap-2 shadow-sm hover:border-indigo-100 transition-all cursor-pointer hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                            item.isPayment || item.isExpense ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            {item.isPayment || item.isExpense ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                              {format(new Date(item.timestamp), 'MMM dd, yyyy')}
                            </p>
                            <p className="font-bold text-gray-900 text-[11px] truncate leading-tight">
                              {item.notes || (item.isPayment ? 'Repayment' : item.isExpense ? 'Expense' : 'Credit Sale')}
                              {item.collection === 'payments' && item.status === 'pending' && (
                                <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[7px] font-black uppercase tracking-widest border border-amber-100">
                                  Pending Transfer
                                </span>
                              )}
                            </p>
                            {!item.isPayment && item.items && item.items.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.items.map((saleItem: any, idx: number) => (
                                  <span key={idx} className="text-[8px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded-md border border-gray-100">
                                    {saleItem.quantity}x {saleItem.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className="flex items-center gap-1">
                            <div className={cn(
                              "text-[10px] font-black flex flex-col items-end",
                              item.isPayment || item.isExpense ? "text-red-600" : "text-green-600"
                            )}>
                               {item.isPayment && (item.amountUSD !== undefined || item.amountSSP !== undefined) ? (
                                <div className="space-y-0.5">
                                  {item.amountUSD > 0 && <span>-${item.amountUSD.toLocaleString('en-US')}</span>}
                                  {item.amountSSP > 0 && (
                                    <div className="flex flex-col items-end">
                                      <span>-{item.amountSSP.toLocaleString('en-US')} SSP</span>
                                      <span className="text-[9px] text-gray-500 font-bold tracking-tight italic">
                                        (${item.creditDeductionUSD?.toFixed(2) || (item.amountSSP / (item.exchangeRate || 1000)).toFixed(2)})
                                      </span>
                                    </div>
                                  )}
                                  {(!item.amountUSD && !item.amountSSP) && <span>-$0.00</span>}
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span>
                                    {item.isPayment || item.isExpense ? '-' : '+'}
                                    {item.currency === 'USD' ? '$' : ''}
                                    {(item.amount || item.totalAmount).toLocaleString('en-US')}
                                    {item.currency === 'SSP' ? ' SSP' : ''}
                                  </span>
                                  {item.currency === 'SSP' && (
                                    <span className="text-[9px] text-gray-500 font-bold tracking-tight italic">
                                      ({item.isPayment || item.isExpense ? '-' : '+'}${item.creditDeductionUSD?.toFixed(2) || ((item.amount || item.totalAmount) / (item.exchangeRate || 1000)).toFixed(2)})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="relative">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCustomerTransactionMenu(activeCustomerTransactionMenu === item.id ? null : item.id);
                                }}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <MoreVertical className="w-3 h-3 text-gray-400" />
                              </button>
                              
                               {activeCustomerTransactionMenu === item.id && (
                                <div 
                                  ref={transactionMenuRef}
                                  className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-gray-100 z-[210] py-1 overflow-hidden"
                                >
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditTransaction(item, customer);
                                    }}
                                    className="w-full px-3 py-2 text-left text-[10px] font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 uppercase tracking-wider"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Edit
                                  </button>
                                  <button 
                                    disabled={!isAdmin}
                                    onClick={() => {
                                      setDeleteTransactionInfo({ 
                                        id: item.id, 
                                        collection: item.collection, 
                                        type: item.collection === 'payments' ? 'Repayment' : item.collection === 'sales' ? 'Credit Sale' : item.collection === 'expenses' ? 'Expense' : 'Manual Entry'
                                      });
                                      setActiveCustomerTransactionMenu(null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 uppercase tracking-wider disabled:opacity-50"
                                  >
                                    <Trash className="w-3 h-3" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {item.attachmentUrl && (
                              <button 
                                onClick={() => {
                                  setPreviewUrl(item.attachmentUrl);
                                  setPreviewType(item.attachmentType);
                                }}
                                className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1"
                                title="View Attachment"
                              >
                                {item.attachmentType === 'pdf' ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                <span className="text-[8px] font-black uppercase tracking-widest">View</span>
                              </button>
                            )}
                            {!item.isPayment && item.status === 'pending' && (
                              <button 
                                onClick={() => handleMarkAsPaid(item.id)}
                                className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                              >
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {transactions.length === 0 && (
                      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No transactions yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-4 bg-white border-t border-gray-200 space-y-3 shrink-0">
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => navigate('/pos', { state: { customerId: customer.id } })}
                    className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {customer.name === 'Cash Sales' ? 'Cash In (Sale)' : 'New Sale'}
                  </button>
                  <button 
                    onClick={() => {
                      if (customer.name === 'Cash Sales') {
                        setManualType('out');
                        setManualCurrency(viewingCashCurrency || 'USD'); // Follow context or default to USD
                        setIsManualModalOpen(true);
                      } else {
                        setSelectedCustomerForPayment(customer);
                        setIsPaymentModalOpen(true);
                      }
                    }}
                    className="flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    {customer.name === 'Cash Sales' ? 'Cash Out (Pay)' : 'Repayment'}
                  </button>
                </div>

                {customer.name === 'Cash Sales' && (
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => {
                        setManualType('in');
                        setManualCurrency(viewingCashCurrency || 'USD'); // Follow context
                        setIsManualModalOpen(true);
                      }}
                      className="flex items-center justify-center gap-2 py-2.5 bg-green-50 text-green-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-green-100 transition-all border border-green-100"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Manual In
                    </button>
                    <button 
                      onClick={() => {
                        setManualType('out');
                        setManualCurrency(viewingCashCurrency || 'USD'); // Follow context
                        setIsManualModalOpen(true);
                      }}
                      className="flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
                    >
                      <TrendingDown className="w-3.5 h-3.5" />
                      Manual Out
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => navigate('/customers')}
                    className="flex items-center justify-center gap-2 py-2.5 bg-gray-50 text-gray-500 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-all"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Customer File
                  </button>
                  <button 
                    onClick={() => exportToExcel(customer, transactions)}
                    className="flex items-center justify-center gap-2 py-2.5 bg-gray-50 text-gray-500 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel Export
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      {isPaymentModalOpen && selectedCustomerForPayment && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-base lg:text-lg font-bold text-gray-900">Record Repayment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-4 lg:p-6 space-y-4" autoComplete="off">
              <div className="p-3 lg:p-4 bg-indigo-50 rounded-xl mb-4">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Customer</p>
                <p className="text-base lg:text-lg font-black text-indigo-900">{selectedCustomerForPayment.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Amount USD</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</div>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-base"
                      value={paymentAmountUSD}
                      onChange={e => setPaymentAmountUSD(formatInputNumber(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Amount SSP</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-base"
                      value={paymentAmountSSP}
                      onChange={e => setPaymentAmountSSP(formatInputNumber(e.target.value))}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[10px]">SSP</div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Exchange Rate (1 USD = ? SSP)</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm"
                  value={paymentExchangeRate}
                  onChange={e => setPaymentExchangeRate(formatInputNumber(e.target.value))}
                />
              </div>

              <div className="p-3 bg-indigo-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Total Credit Deduction</p>
                  <p className="text-lg font-black text-indigo-900">
                    ${( (getRawNumber(paymentAmountUSD)) + ((getRawNumber(paymentAmountSSP)) / (getRawNumber(paymentExchangeRate) || 1000)) ).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Notes (Optional)</label>
                <textarea 
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs lg:text-sm h-16 lg:h-20 resize-none"
                  placeholder="e.g. Partial payment"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Attachment (Image or PDF)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="payment-attachment"
                  />
                  <label 
                    htmlFor="payment-attachment"
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                      paymentAttachment 
                        ? "bg-green-50 border-green-200 text-green-600" 
                        : "bg-gray-50 border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-400"
                    )}
                  >
                    {paymentAttachment ? (
                      <>
                        {paymentAttachmentType === 'pdf' ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                        <span className="text-xs font-bold">File Attached</span>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setPaymentAttachment(null);
                            setPaymentAttachmentType(null);
                          }}
                          className="ml-2 p-1 hover:bg-green-100 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Paperclip className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">Upload Receipt</span>
                      </>
                    )}
                  </label>
                </div>
                <p className="text-[9px] text-gray-400 mt-1 italic">Max size: 800KB (PNG, JPG, PDF)</p>
              </div>

              <div className="pt-2 lg:pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-2.5 lg:py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm lg:text-base"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingPayment || (!paymentAmountUSD && !paymentAmountSSP)}
                  className="flex-1 py-2.5 lg:py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50 text-sm lg:text-base"
                >
                  {isSubmittingPayment ? 'Recording...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {customerCredits.length === 0 && !loading && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No customers registered</h3>
          <p className="text-gray-500">Add customers in the "Customers" tab to track their credit.</p>
        </div>
      )}

      {/* Attachment Preview Modal */}
      <AnimatePresence>
        {previewUrl && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setPreviewUrl(null);
                setPreviewType(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-4xl h-[80vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-xs">Attachment Preview</h3>
                <button 
                  onClick={() => {
                    setPreviewUrl(null);
                    setPreviewType(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 bg-gray-100 overflow-hidden flex items-center justify-center">
                {previewType === 'pdf' ? (
                  <iframe 
                    src={previewUrl} 
                    className="w-full h-full border-none"
                    title="PDF Preview"
                  />
                ) : (
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="max-w-full max-h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <div className="p-4 bg-white border-t border-gray-100 flex justify-center shrink-0">
                <a 
                  href={previewUrl} 
                  download={`attachment_${Date.now()}.${previewType === 'pdf' ? 'pdf' : 'png'}`}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all"
                >
                  Download File
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Cash Book Detail View */}
      <AnimatePresence>
        {viewingCashCurrency && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[200] bg-gray-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
              <button 
                onClick={() => setViewingCashCurrency(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-gray-900 truncate">Cash Book ({viewingCashCurrency})</h3>
                <p className="text-[11px] font-black tracking-tighter text-green-600">
                  Balance: {viewingCashCurrency === 'USD' ? '$' : ''}{new Intl.NumberFormat('en-US').format(viewingCashCurrency === 'USD' ? cashInHandUSD : cashInHandSSP)}{viewingCashCurrency === 'SSP' ? ' SSP' : ''}
                </p>
              </div>
              <button 
                onClick={() => exportCashBookToPDF(viewingCashCurrency, currentCashTransactions, viewingCashCurrency === 'USD' ? cashInHandUSD : cashInHandSSP)}
                className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-2"
                title="Download Statement"
              >
                <FileText className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Statement</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-32">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h4 className="text-[9px] font-black text-gray-900 uppercase tracking-widest">Transaction History</h4>
                </div>
                
                <div className="space-y-1.5">
                  {(() => {
                    const allCashTransactions = currentCashTransactions;

                    if (allCashTransactions.length === 0) {
                      return (
                        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No transactions yet</p>
                        </div>
                      );
                    }

                    return allCashTransactions.map((item) => (
                      <div 
                        key={item.id} 
                        onClick={() => handleEditCashTransaction(item)}
                        className="bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between gap-2 shadow-sm relative group cursor-pointer hover:bg-gray-50 hover:border-indigo-100 transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                            item.isCashIn ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                          )}>
                            {item.isCashIn ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                                {format(new Date(item.timestamp), 'MMM dd, yyyy')}
                              </p>
                              <div className="relative">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTransactionMenu(activeTransactionMenu === item.id ? null : item.id);
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <MoreVertical className="w-3 h-3 text-gray-400" />
                                </button>
                                
                                {activeTransactionMenu === item.id && (
                                  <div 
                                    ref={transactionMenuRef}
                                    className="absolute right-0 top-full mt-1 w-38 bg-white rounded-xl shadow-xl border border-gray-100 z-[210] py-1 overflow-hidden"
                                  >
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditCashTransaction(item);
                                      }}
                                      className="w-full px-3 py-2 text-left text-[10px] font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 uppercase tracking-wider"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Edit
                                    </button>
                                    <button 
                                      disabled={!isAdmin}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTransactionInfo({ id: item.id, collection: item.collection, type: item.type });
                                        setActiveTransactionMenu(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 uppercase tracking-wider disabled:opacity-50"
                                    >
                                      <Trash className="w-3 h-3" />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="font-bold text-gray-900 text-[11px] truncate leading-tight">
                              {item.notes}
                            </p>
                            {item.collection === 'payments' && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {item.status === 'pending' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-tighter">
                                    Pending Transfer
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-black bg-green-50 text-green-600 border border-green-100 uppercase tracking-tighter">
                                    ✓ Transferred
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <p className="text-[8px] text-gray-400 font-mono uppercase tracking-tighter">
                                {item.type}
                              </p>
                              {item.customerName && (
                                <>
                                  <span className="text-[8px] text-gray-300">•</span>
                                  <p className="text-[8px] text-indigo-500 font-bold uppercase tracking-widest">
                                    {item.customerName}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn(
                            "text-xs font-black",
                            item.isCashIn ? "text-green-600" : "text-red-600"
                          )}>
                            {item.isCashIn ? '+' : '-'}
                            {viewingCashCurrency === 'USD' ? '$' : ''}
                            {item.amount.toLocaleString('en-US')}
                            {viewingCashCurrency === 'SSP' ? ' SSP' : ''}
                          </p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-white border-t border-gray-200 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    setManualType('in');
                    setManualCurrency(viewingCashCurrency || 'USD');
                    setIsManualModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                >
                  <PlusCircle className="w-4 h-4" />
                  Cash In
                </button>
                <button 
                  onClick={() => {
                    setManualType('out');
                    setManualCurrency(viewingCashCurrency || 'USD');
                    setIsManualModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
                >
                  <TrendingDown className="w-4 h-4" />
                  Cash Out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Cash Transaction Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-base lg:text-lg font-bold text-gray-900">
                Record Manual {manualType === 'in' ? 'Cash In' : 'Cash Out'}
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleRecordManualTransaction} className="p-4 lg:p-6 space-y-6" autoComplete="off">
              {!viewingCashCurrency ? (
                <div className="bg-gray-50/50 p-1.5 rounded-2xl border border-gray-100 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setManualCurrency('USD')}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all",
                      manualCurrency === 'USD' 
                        ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" 
                        : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualCurrency('SSP')}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all",
                      manualCurrency === 'SSP' 
                        ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" 
                        : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    SSP (S)
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-center">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Active Ledger</p>
                  <p className="text-base font-black text-indigo-900">{viewingCashCurrency} Holdings</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Amount</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm pointer-events-none transition-colors group-focus-within:text-indigo-500">
                    {manualCurrency === 'USD' ? '$' : 'SSP'}
                  </div>
                  <input 
                    required
                    type="text" 
                    inputMode="decimal"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50/30 border-2 border-gray-100 rounded-2xl text-lg font-black focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-300"
                    value={manualAmount}
                    onChange={e => setManualAmount(formatInputNumber(e.target.value))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Notes / Description</label>
                <textarea 
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm min-h-[100px]"
                  value={manualNotes}
                  onChange={e => setManualNotes(e.target.value)}
                  placeholder="e.g. Opening Balance, Cash Transfer, etc."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingManual}
                  className={cn(
                    "flex-1 py-3 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-50",
                    manualType === 'in' ? "bg-green-600 hover:bg-green-700 shadow-green-100" : "bg-red-600 hover:bg-red-700 shadow-red-100"
                  )}
                >
                  {isSubmittingManual ? 'Recording...' : `Record ${manualType === 'in' ? 'In' : 'Out'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirmation Modal */}
      {deleteTransactionInfo && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2 uppercase tracking-tight">Delete Transaction?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Are you sure you want to delete this <span className="font-black text-gray-900">{deleteTransactionInfo.type}</span>? This action cannot be undone and will affect your cash balance.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteTransactionInfo(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteTransaction}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button for Add */}
      <div className="fixed bottom-20 right-4 z-40">
        {!isAddingInline && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsAddingInline(true)}
            className="w-12 h-12 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center"
          >
            <UserPlus className="w-6 h-6" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
