import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, Timestamp, addDoc, serverTimestamp, deleteDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sale, Customer, Payment, Expense, CashTransaction, Currency, Attachment } from '../types';
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
  CornerUpRight,
  RefreshCcw,
  TrendingUp, 
  TrendingDown, 
  Paperclip, 
  Eye, 
  FileText, 
  Image as ImageIcon, 
  Wallet,
  FileDown,
  FileSpreadsheet,
  History,
  ChevronDown,
  ChevronLeft,
  Equal,
  Plus,
  Minus,
  TrendingUp as TrendingUpIcon,
  Filter
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, parseISO } from 'date-fns';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';

export default function CustomerLedger() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, businessId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [innerSearchTerm, setInnerSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdParam = searchParams.get('id');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);

  const toggleTransactionSelection = (id: string) => {
    setSelectedTransactions(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (ids: string[]) => {
    if (selectedTransactions.length === ids.length) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(ids);
    }
  };

  useEffect(() => {
    const state = location.state as { customerId?: string } | null;
    if (state?.customerId) {
      // If we have state (e.g., from POS), we want history to be /ledger -> /ledger?id=...
      // This ensures swiping back from the details goes to the list.
      navigate('/ledger', { replace: true, state: {} });
      setTimeout(() => {
        navigate(`/ledger?id=${state.customerId}`);
      }, 0);
    }
  }, [location.state]);

  useEffect(() => {
    setExpandedCustomer(customerIdParam);
    setSelectedTransactions([]); // Clear selection when switching customers
    setInnerSearchTerm(''); // Reset inner search when switching or closing
  }, [customerIdParam]);
  const [paymentAmountUSD, setPaymentAmountUSD] = useState('');
  const [paymentAmountSSP, setPaymentAmountSSP] = useState('');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState('1,000');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentAttachments, setPaymentAttachments] = useState<Attachment[]>([]);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
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

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingBalance, setEditingBalance] = useState('');
  const [editingCurrency, setEditingCurrency] = useState<Currency>('USD');
  const [isRenaming, setIsRenaming] = useState(false);
  
  // Add Customer State
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newInlineName, setNewInlineName] = useState('');
  const [newInlineBalance, setNewInlineBalance] = useState('');
  const [newInlineCurrency, setNewInlineCurrency] = useState<Currency>('USD');
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
  const [deleteTransactionInfo, setDeleteTransactionInfo] = useState<{ id: string, collection: string, type: string, customerId?: string } | null>(null);
  const [deleteCustomerInfo, setDeleteCustomerInfo] = useState<{ id: string, name: string } | null>(null);

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

    const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('businessId', '==', businessId)), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: safeTimestamp(doc.data().createdAt),
        updatedAt: safeTimestamp(doc.data().updatedAt)
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

  useEffect(() => {
    if (expandedCustomer || isPaymentModalOpen || viewingCashCurrency || previewUrl || isManualModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [expandedCustomer, isPaymentModalOpen, viewingCashCurrency, previewUrl, isManualModalOpen]);

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
        initialBalance: newInlineBalance ? parseFloat(newInlineBalance) : 0,
        initialBalanceCurrency: newInlineCurrency,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        memberIds: []
      });
      setIsAddingInline(false);
      setNewInlineName('');
      setNewInlineBalance('');
    } catch (error) {
      console.error('Error adding customer inline:', error);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleMarkAsPaid = async (saleId: string, customerId?: string) => {
    if (window.confirm('Mark this specific invoice as fully paid?')) {
      await updateDoc(doc(db, 'sales', saleId), {
        status: 'paid'
      });
      if (customerId) {
        await updateDoc(doc(db, 'customers', customerId), {
          updatedAt: serverTimestamp()
        });
      }
      // Stay on the same page
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmountUSD('');
    setPaymentAmountSSP('');
    setPaymentExchangeRate('1,000');
    setPaymentNotes('');
    setPaymentAttachments([]);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setEditingPaymentId(null);
    setPaymentError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || (!paymentAmountUSD && !paymentAmountSSP) || isSubmittingPayment || !businessId) return;
    
    setIsSubmittingPayment(true);
    setPaymentError(null);
    
    // Close modal immediately for "fast responsive" feel
    setIsPaymentModalOpen(false);

    try {
      const usd = getRawNumber(paymentAmountUSD);
      const ssp = getRawNumber(paymentAmountSSP);
      const rate = getRawNumber(paymentExchangeRate) || 1000;
      const totalUSD = usd + (ssp / rate);

      if (isNaN(totalUSD)) {
        throw new Error("Invalid amount values. Please check your currency inputs.");
      }

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
        notes: paymentNotes || '',
        attachments: paymentAttachments,
        timestamp: paymentDate ? new Date(paymentDate).getTime() : new Date().getTime(),
        status: 'pending',
        isConfirmed: false
      };

      if (editingPaymentId) {
        paymentData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'payments', editingPaymentId), paymentData);
      } else {
        await addDoc(collection(db, 'payments'), paymentData);
      }
      
      await updateDoc(doc(db, 'customers', selectedCustomerForPayment.id), {
        updatedAt: serverTimestamp()
      });
      
      // Reset fields but modal is already closed
      resetPaymentForm();
    } catch (error) {
      console.error("Error recording payment:", error);
      // Re-open and show error if it failed
      setPaymentError(error instanceof Error ? error.message : "An unknown error occurred");
      setIsPaymentModalOpen(true);
      handleFirestoreError(error, OperationType.WRITE, 'payments');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleBulkDelete = async (transactions: any[]) => {
    if (selectedTransactions.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedTransactions.length} transactions?`)) return;

    try {
      for (const id of selectedTransactions) {
        const transaction = transactions.find(t => t.id === id);
        if (transaction) {
          await deleteDoc(doc(db, transaction.collection, id));
        }
      }
      setSelectedTransactions([]);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      alert("Failed to delete some transactions.");
    }
  };

  useEffect(() => {
    if (!isPaymentModalOpen) {
      setPaymentError(null);
    }
  }, [isPaymentModalOpen]);

  const handleEditTransaction = (item: any, customer: any) => {
    if (item.collection === 'payments') {
      setSelectedCustomerForPayment(customer);
      setPaymentAmountUSD(item.amountUSD?.toString() || (item.currency === 'USD' ? item.amount.toString() : ''));
      setPaymentAmountSSP(item.amountSSP?.toString() || (item.currency === 'SSP' ? item.amount.toString() : ''));
      setPaymentExchangeRate(item.exchangeRate?.toString() || '1000');
      setPaymentNotes(item.notes || '');
      setPaymentDate(item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      setPaymentAttachments(item.attachments || []);
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
    // Removed setExpandedCustomer(null) to stay in history view
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
        setPaymentDate(p.timestamp ? new Date(p.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setPaymentAttachments(p.attachments || []);
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
    // Removed setExpandedCustomer(null) to stay in history view if navigation allows
    setViewingCashCurrency(null); // Close cash book if open
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (paymentAttachments.length + files.length > 4) {
      alert('You can only add up to 4 attachments.');
      return;
    }

    Array.from(files).forEach(file => {
      if (file.size > 800000) { // ~800KB limit
        alert(`File ${file.name} is too large. Please select a file smaller than 800KB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentAttachments(prev => [
          ...prev,
          {
            url: reader.result as string,
            type: file.type.includes('pdf') ? 'pdf' : 'image'
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setPaymentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const exportToPDF = (customer: any, transactions: any[]) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(`Statement of Account: ${customer.name}`, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Report Generated: ${format(new Date(), 'PPP p')}`, 14, 32);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Net Balance: ${formatCurrency(customer.totalOwed)}`, 14, 42);

    let runningBalance = customer.initialBalanceCurrency === 'SSP' 
      ? (customer.initialBalance || 0) / 1000 
      : (customer.initialBalance || 0);

    const tableData: any[] = [];
    
    // Add initial balance row FIRST
    if (customer.initialBalance && customer.initialBalance !== 0) {
      tableData.push([
        '-',
        'Initial Opening Balance',
        runningBalance > 0 ? `$${Math.round(runningBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-',
        runningBalance < 0 ? `$${Math.round(Math.abs(runningBalance)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-',
        `$${Math.round(runningBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      ]);
    }

    // Sort transactions by date (Oldest first)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    sortedTransactions.forEach(item => {
      const isSSP = item.currency === 'SSP';
      const rate = item.exchangeRate || 1000;
      
      if (!item.isPayment && !item.isExpense && item.items && item.items.length > 0) {
        // Itemize Sales
        item.items.forEach((subItem: any) => {
          const subTotalUSD = isSSP ? ((subItem.price * subItem.quantity) / rate) : (subItem.price * subItem.quantity);
          runningBalance += subTotalUSD;
          tableData.push([
            format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm'),
            `${subItem.name} (x${subItem.quantity})`,
            `$${Math.round(subTotalUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            '-',
            `$${Math.round(runningBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          ]);
        });
      } else {
        // Payments or expenses or sales without item array
        let amountUSD = 0;
        if (item.collection === 'payments') {
          amountUSD = item.creditDeductionUSD ?? (isSSP ? (item.amount / rate) : item.amount);
        } else {
          const rawAmount = item.amount || item.totalAmount;
          amountUSD = isSSP ? (rawAmount / rate) : rawAmount;
        }
        
        const isEntryPositive = !item.isPayment && !item.isExpense;
        const sales = isEntryPositive ? amountUSD : 0;
        const payments = !isEntryPositive ? amountUSD : 0;
        
        runningBalance += sales;
        runningBalance -= payments;

        tableData.push([
          format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm'),
          item.notes || (item.isPayment ? (item.collection === 'expenses' ? 'Expense' : 'Payment') : 'Sale'),
          sales > 0 ? `$${Math.round(sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-',
          payments > 0 ? `$${Math.round(payments).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '-',
          `$${Math.round(runningBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        ]);
      }
    });

    autoTable(doc, {
      startY: 50,
      head: [['Date', 'Description / Item', 'Sales (+)', 'Payments (-)', 'Balance']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
      },
      styles: { fontSize: 9 }
    });

    doc.save(`${customer.name}_statement_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = (customer: any, transactions: any[]) => {
    let runningBalance = customer.initialBalanceCurrency === 'SSP' 
      ? (customer.initialBalance || 0) / 1000 
      : (customer.initialBalance || 0);

    const worksheetData: any[] = [
      ['Statement of Account', customer.name],
      ['Generated On', format(new Date(), 'PPP p')],
      ['Net Balance', Math.round(customer.totalOwed)],
      [], // Spacer row
      ['Date', 'Description / Item', 'Sales (+)', 'Payments (-)', 'Balance']
    ];

    if (customer.initialBalance && customer.initialBalance !== 0) {
      worksheetData.push([
        format(new Date(customer.createdAt), 'yyyy-MM-dd'),
        'Initial Opening Balance',
        runningBalance > 0 ? Math.round(runningBalance) : '-',
        runningBalance < 0 ? Math.round(Math.abs(runningBalance)) : '-',
        Math.round(runningBalance)
      ]);
    }

    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    sortedTransactions.forEach(item => {
      const isSSP = item.currency === 'SSP';
      const rate = item.exchangeRate || 1000;
      
      if (!item.isPayment && !item.isExpense && item.items && item.items.length > 0) {
        item.items.forEach((subItem: any) => {
          const subTotalUSD = isSSP ? ((subItem.price * subItem.quantity) / rate) : (subItem.price * subItem.quantity);
          runningBalance += subTotalUSD;
          worksheetData.push([
            format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm'),
            `${subItem.name} (x${subItem.quantity})`,
            Math.round(subTotalUSD),
            '-',
            Math.round(runningBalance)
          ]);
        });
      } else {
        let amountUSD = 0;
        if (item.collection === 'payments') {
          amountUSD = item.creditDeductionUSD ?? (isSSP ? (item.amount / rate) : item.amount);
        } else {
          const rawAmount = item.amount || item.totalAmount;
          amountUSD = isSSP ? (rawAmount / rate) : rawAmount;
        }
        
        const isEntryPositive = !item.isPayment && !item.isExpense;
        const sales = isEntryPositive ? amountUSD : 0;
        const payments = !isEntryPositive ? amountUSD : 0;
        
        runningBalance += sales;
        runningBalance -= payments;

        worksheetData.push([
          format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm'),
          item.notes || (item.isPayment ? (item.collection === 'expenses' ? 'Expense' : 'Payment') : 'Sale'),
          sales > 0 ? Math.round(sales) : '-',
          payments > 0 ? Math.round(payments) : '-',
          Math.round(runningBalance)
        ]);
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
    XLSX.writeFile(workbook, `${customer.name}_statement.xlsx`);
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
    return customers.map(customer => {
      const isCashSalesCustomer = customer.name === 'Cash Sales';
      
      const customerSales = sales.filter(s => {
        const isDirectSale = s.customerId === customer.id || s.customerName === customer.name;
        const isWithin24Hours = new Date().getTime() - new Date(s.timestamp).getTime() <= 24 * 60 * 60 * 1000;
        
        if (isCashSalesCustomer) {
          if (!isWithin24Hours && s.status !== 'pending') return false;
          if (s.paymentMethod === 'cash') return true;
          if (isDirectSale) return true;
          const isGuestSale = s.customerName === 'Guest' || !s.customerId;
          return isGuestSale;
        }
        
        return isDirectSale;
      });

      const customerPayments = payments.filter(p => {
        const isDirectPayment = p.customerId === customer.id;
        if (isCashSalesCustomer) {
          const isUnmappedPayment = !p.customerId;
          return isDirectPayment || isUnmappedPayment;
        }
        return isDirectPayment;
      });
      
      const totalCreditSales = sales
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

      const totalRepayments = customerPayments
        .filter(p => !p.status || p.status === 'transferred' || p.status === 'pending' || p.isConfirmed)
        .reduce((acc, p) => {
          const reductionUSD = p.creditDeductionUSD ?? (p.currency === 'SSP' ? (p.amount / (p.exchangeRate || 1000)) : p.amount);
          return acc + reductionUSD;
        }, 0);
      
      const initialBalanceUSD = customer.initialBalanceCurrency === 'SSP' 
        ? (customer.initialBalance || 0) / 1000 
        : (customer.initialBalance || 0);

      const outstandingBalance = initialBalanceUSD + totalCreditSales;
      const netOwed = outstandingBalance - totalRepayments;

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
      
      const getTimestampValue = (ts: any) => {
        if (!ts) return 0;
        const date = new Date(ts);
        return isNaN(date.getTime()) ? 0 : date.getTime();
      };

      const latestTimestamp = Math.max(
        getTimestampValue(customer.createdAt),
        getTimestampValue(customer.updatedAt),
        ...allTransactions.map(t => getTimestampValue(t.timestamp)),
        ...customerExpenses.map(t => getTimestampValue(t.timestamp))
      );

      return {
        ...customer,
        totalOwed: netOwed,
        outstandingBalance,
        totalIn: totalRepayments,
        sales: customerSales,
        payments: customerPayments,
        expenses: customerExpenses,
        cashTransactions: customerCashTransactions,
        lastUpdated: latestTimestamp,
        membersCount: customer.memberIds?.length || 0
      };
    }).sort((a, b) => {
      const diff = b.lastUpdated - a.lastUpdated;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [customers, sales, payments, cashTransactions]);

  const filteredCustomerCredits = useMemo(() => {
    return customerCredits.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm))
    );
  }, [customerCredits, searchTerm]);

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
        customerId: s.customerId,
        status: 'transferred' as const,
        originalData: s
      })),
      ...payments.filter(p => {
        if (viewingCashCurrency === 'USD') return (p.amountUSD !== undefined ? p.amountUSD > 0 : p.currency === 'USD');
        if (viewingCashCurrency === 'SSP') return (p.amountSSP !== undefined ? p.amountSSP > 0 : p.currency === 'SSP');
        return false;
      }).map(p => {
        const isUSD = viewingCashCurrency === 'USD';
        const displayAmount = isUSD 
          ? (p.amountUSD || (p.currency === 'USD' ? p.amount : 0))
          : (p.amountSSP || (p.currency === 'SSP' ? p.amount : 0));
          
        return {
          id: p.id,
          timestamp: p.timestamp,
          customerName: p.customerName,
          amount: displayAmount,
          type: 'Repayment',
          isCashIn: true,
          notes: `Repayment from ${p.customerName}`,
          collection: 'payments',
          customerId: p.customerId,
          status: p.status || 'pending',
          originalData: p
        };
      }),
      ...expenses.filter(e => (e.currency === viewingCashCurrency) || (viewingCashCurrency === 'USD' && !e.currency)).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        customerName: 'Expense',
        amount: e.amount,
        type: 'Expense',
        isCashIn: false,
        notes: e.description,
        collection: 'expenses',
        customerId: undefined,
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
        customerId: t.customerId,
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
        name: editingName.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingCustomerId(null);
    } catch (error) {
      console.error('Error updating customer:', error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerInfo || !businessId) return;
    try {
      await deleteDoc(doc(db, 'customers', deleteCustomerInfo.id));
      setDeleteCustomerInfo(null);
      setActiveMenu(null);
      setSearchParams({});
    } catch (error) {
      console.error("Error deleting customer:", error);
      handleFirestoreError(error, OperationType.DELETE, `customers/${deleteCustomerInfo.id}`);
    }
  };

  // Calculate Cash in Hand (Confirmed Today in South Sudan Time)
  const cashInHandSSP = (() => {
    const cashSalesSSP = allSales.filter(s => 
      (s.paymentMethod === 'cash' || s.status === 'paid') && 
      s.currency === 'SSP' && s.isConfirmed
    ).reduce((acc, s) => acc + s.totalAmount, 0);

    const repaymentsSSP = payments.filter(p => 
      ((p.currency === 'SSP' || (p.amountSSP || 0) > 0)) && (p.status === 'transferred' || p.isConfirmed)
    ).reduce((acc, p) => {
      if ((p.amountSSP || 0) > 0) return acc + p.amountSSP!;
      return p.currency === 'SSP' ? acc + p.amount : acc;
    }, 0);

    const totalSSPExpenses = expenses.filter(e => 
      e.currency === 'SSP' && e.isConfirmed
    ).reduce((acc, e) => acc + e.amount, 0);

    const manualSSP = cashTransactions.filter(t => 
      t.currency === 'SSP' && t.isConfirmed
    ).reduce((acc, t) => t.type === 'in' ? acc + t.amount : acc - t.amount, 0);

    return (cashSalesSSP + repaymentsSSP + manualSSP) - totalSSPExpenses;
  })();

  const cashInHandUSD = (() => {
    const cashSalesUSD = allSales.filter(s => 
      (s.paymentMethod === 'cash' || s.status === 'paid') && 
      s.currency === 'USD' && s.isConfirmed
    ).reduce((acc, s) => acc + s.totalAmount, 0);

    const repaymentsUSD = payments.filter(p => 
      ((p.currency === 'USD' || (p.amountUSD || 0) > 0)) && (p.status === 'transferred' || p.isConfirmed)
    ).reduce((acc, p) => {
      if ((p.amountUSD || 0) > 0) return acc + p.amountUSD!;
      return p.currency === 'USD' ? acc + p.amount : acc;
    }, 0);

    const totalUSDExpenses = expenses.filter(e => 
      (e.currency === 'USD' || !e.currency) && e.isConfirmed
    ).reduce((acc, e) => acc + e.amount, 0);

    const manualUSD = cashTransactions.filter(t => 
      t.currency === 'USD' && t.isConfirmed
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
          // Update customer updatedAt to reflect activity
          await updateDoc(doc(db, 'customers', customer.id), {
            updatedAt: serverTimestamp()
          });
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
      // Stay in expanded view if we were already there
      setViewingCashCurrency(null); // Also close the cash book view if open
    } catch (error) {
      console.error('Error recording manual transaction:', error);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteTransactionInfo || !businessId) return;

    try {
      await deleteDoc(doc(db, deleteTransactionInfo.collection, deleteTransactionInfo.id));
      
      if (deleteTransactionInfo.customerId) {
        await updateDoc(doc(db, 'customers', deleteTransactionInfo.customerId), {
          updatedAt: serverTimestamp()
        });
      }

      setDeleteTransactionInfo(null);
      setActiveTransactionMenu(null);
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-48 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700" />)}
    </div>
  </div>;

  return (
    <div className="space-y-4 pb-32 transition-colors duration-300 max-w-full overflow-x-hidden overscroll-x-contain touch-pan-y">
      {/* Sticky Upper Level Balance Summary */}
      <div className="sticky top-0 z-30 pt-2 pb-2 sm:pt-3 sm:pb-3 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 sm:px-6">
        
        {/* Mobile Version - Compact Grid */}
        <div className="md:hidden flex flex-col gap-1.5 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden text-center">
            <button 
              onClick={() => setViewingCashCurrency('USD')}
              className="py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-r border-b border-gray-100 dark:border-gray-700"
            >
              <p className="text-[9px] font-black uppercase tracking-tighter text-gray-500 mb-0.5">USD Cash</p>
              <h2 className="text-sm font-black text-emerald-600 leading-none">
                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cashInHandUSD)}
              </h2>
            </button>

            <button 
              onClick={() => setViewingCashCurrency('SSP')}
              className="py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <p className="text-[9px] font-black uppercase tracking-tighter text-gray-500 mb-0.5">SSP Cash</p>
              <h2 className="text-sm font-black text-emerald-600 leading-none">
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cashInHandSSP)}
              </h2>
            </button>

            <div className="col-span-2 py-2 bg-rose-50/50 dark:bg-rose-900/20">
              <p className="text-[9px] font-black uppercase tracking-tighter text-rose-500 mb-0.5">Debt Balance</p>
              <h2 className="text-sm font-black text-rose-600 leading-none">
                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
              </h2>
            </div>
          </div>

          {/* Search Bar in Header (Mobile) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <input 
              type="text" 
              placeholder="Search customers..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop Version - Luxury / Prestige Bar */}
        <div className="hidden md:flex items-center justify-between bg-[#fdfcfb] dark:bg-gray-800 rounded-3xl border border-[#e5e1da] dark:border-gray-700 p-1 shadow-sm max-w-7xl mx-auto w-full">
          <div className="flex items-center flex-1 divide-x divide-[#e5e1da] dark:divide-gray-700">
            {/* USD */}
            <button 
              onClick={() => setViewingCashCurrency('USD')}
              className="flex-1 px-4 py-3 hover:bg-[#f5f2ed] dark:hover:bg-gray-700/50 transition-all group text-left"
            >
              <p className="text-xs font-bold text-[#a8a29e] dark:text-gray-400 uppercase tracking-widest mb-0.5">Holding (USD)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-serif italic text-[#78716c] dark:text-gray-500">$</span>
                <h2 className="text-2xl font-serif text-[#1c1917] dark:text-white tracking-tight group-hover:text-indigo-900 dark:group-hover:text-indigo-400 transition-colors">
                  {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cashInHandUSD)}
                </h2>
              </div>
            </button>

            {/* SSP */}
            <button 
              onClick={() => setViewingCashCurrency('SSP')}
              className="flex-1 px-4 py-3 hover:bg-[#f5f2ed] dark:hover:bg-gray-700/50 transition-all group text-left"
            >
              <p className="text-xs font-bold text-[#a8a29e] dark:text-gray-400 uppercase tracking-widest mb-0.5">Holding (SSP)</p>
              <div className="flex items-baseline gap-1">
                <h2 className="text-2xl font-serif text-[#1c1917] dark:text-white tracking-tight group-hover:text-indigo-900 dark:group-hover:text-indigo-400 transition-colors">
                  {new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cashInHandSSP)}
                </h2>
                <span className="text-xs font-serif italic text-[#78716c] dark:text-gray-500 ml-1">SSP</span>
              </div>
            </button>

            <div className="flex-1 px-4 py-3 text-left bg-[#fffaf5] dark:bg-red-900/10">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-0.5">Outstanding</p>
              <h2 className="text-2xl font-serif text-rose-700 dark:text-rose-400 tracking-tight">
                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
              </h2>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-80 mx-6 group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a29e] dark:text-gray-500 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Search customers..."
              className="w-full pl-8 py-3 bg-transparent border-b border-[#e5e1da] dark:border-gray-700 text-sm font-serif italic focus:border-indigo-400 dark:focus:border-indigo-500 outline-none transition-all placeholder:text-[#d6d3d1] dark:placeholder:text-gray-600 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <AnimatePresence>
          {isAddingInline && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-indigo-200 dark:border-indigo-800 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">New Customer</h3>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Registration</p>
                </div>
              </div>
              <form onSubmit={handleInlineAdd} className="space-y-3">
                <input
                  autoFocus
                  type="text"
                  placeholder="Enter customer name..."
                  value={newInlineName}
                  onChange={(e) => setNewInlineName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="pl-3 py-2 text-gray-400">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="Start Balance"
                      className="flex-1 px-3 py-2 bg-transparent text-xs font-bold text-gray-900 dark:text-white outline-none w-full min-w-0"
                      value={newInlineBalance}
                      onChange={e => setNewInlineBalance(e.target.value)}
                    />
                    <select
                      value={newInlineCurrency}
                      onChange={(e) => setNewInlineCurrency(e.target.value as Currency)}
                      className="px-3 py-2 text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 outline-none border-l border-gray-100 dark:border-gray-700 h-full"
                    >
                      <option value="USD">USD</option>
                      <option value="SSP">SSP</option>
                    </select>
                  </div>
                  <div className="flex gap-2 h-full">
                    <button
                      type="submit"
                      disabled={isSubmittingCustomer || !newInlineName.trim()}
                      className="flex-1 py-1.5 sm:py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      {isSubmittingCustomer ? 'Adding...' : 'Add Customer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingInline(false)}
                      className="px-4 sm:px-6 py-1.5 sm:py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredCustomerCredits.map((customer) => (
            <motion.div 
              key={customer.id}
              className={cn(
                "relative group transition-all",
                expandedCustomer === customer.id ? "bg-indigo-50/30 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/30",
                activeMenu === customer.id ? "z-[50]" : "z-0"
              )}
            >
              {/* List Item Content */}
              <div 
                onClick={() => {
                  setSearchParams({ id: customer.id });
                }}
                className="px-2 sm:px-4 py-1.5 sm:py-2.5 flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 transition-all group-hover:scale-105 shrink-0">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col">
                      {editingCustomerId === customer.id ? (
                        <form 
                          onSubmit={handleRename}
                          className="flex items-center gap-2 mb-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditingCustomerId(null);
                            }}
                            className="px-2 py-1 text-sm font-bold text-gray-900 dark:text-white border-b-2 border-indigo-500 outline-none bg-indigo-50/50 dark:bg-indigo-900/20 rounded-t"
                          />
                          <button 
                            type="submit"
                            disabled={isRenaming || !editingName.trim()}
                            className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </form>
                      ) : (
                        <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white tracking-tight truncate leading-tight">
                          {customer.name}
                        </h3>
                      )}
                      
                      <div className="flex items-center gap-1 mt-0.5 text-[9px] sm:text-[10px] font-medium text-gray-400 dark:text-gray-500">
                        <span>{customer.membersCount}M</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                        <span className="truncate">{formatDistanceToNow(new Date(customer.lastUpdated), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="text-right flex flex-col items-end">
                    <p className={cn(
                      "text-xs sm:text-sm font-bold tracking-tight",
                      customer.totalOwed > 0 ? "text-rose-500" : "text-emerald-500"
                    )}>
                      {customer.totalOwed > 0 ? '-' : ''}{Math.round(Math.abs(customer.totalOwed)).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <div 
                      className="relative" 
                      ref={activeMenu === customer.id ? menuRef : null}
                    >
                      <button 
                        onClick={() => setActiveMenu(activeMenu === customer.id ? null : customer.id)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                  <AnimatePresence>
                    {activeMenu === customer.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 top-full z-[120]"
                      >
                        <div className="p-12 -m-12 pt-1">
                          <div className="w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 overflow-hidden">
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation();
                                setActiveMenu(null); 
                                setEditingCustomerId(customer.id);
                                setEditingName(customer.name);
                              }} 
                              className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit Book
                            </button>
                            <button 
                              onClick={() => handleDuplicateCustomer(customer)} 
                              className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" /> Duplicate Book
                            </button>
                            <button onClick={() => { setActiveMenu(null); navigate('/members'); }} className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <UserPlus className="w-3.5 h-3.5" /> Add Members
                            </button>
                            <button onClick={() => setActiveMenu(null)} className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <Move className="w-3.5 h-3.5" /> Move Book
                            </button>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                setDeleteCustomerInfo({ id: customer.id, name: customer.name });
                              }}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                            >
                              <Trash className="w-3.5 h-3.5" /> Delete Book
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Balance - Removed as it's now in the header */}

            </motion.div>
          ))}
        </div>
      </div>
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
          ].filter(t => {
            if (!innerSearchTerm) return true;
            const searchLower = innerSearchTerm.toLowerCase();
            let dateStr = '';
            try {
              const tDate = new Date(t.timestamp);
              dateStr = format(tDate, 'MMM dd, yyyy h:mm a').toLowerCase();
            } catch (e) {
              dateStr = '';
            }
            const amountStr = (t.creditDeductionUSD ?? (t.amount || t.totalAmount || 0)).toString();
            const notes = (t.notes || (t.isPayment ? 'Repayment Settlement' : t.isExpense ? 'Operational Expense' : (t.items?.[0]?.name || 'Direct Credit Sale Account'))).toLowerCase();
            
            return notes.includes(searchLower) || 
                   amountStr.includes(searchLower) || 
                   dateStr.includes(searchLower);
          }).sort((a: any, b: any) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return (a.id || "").localeCompare(b.id || "");
          });

          return (
            <motion.div 
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[200] bg-[#f8f9fc] dark:bg-gray-900 flex flex-col h-full w-full overflow-hidden"
            >
              {/* Responsive Header */}
              {isDesktop ? (
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-4 shrink-0 shadow-sm">
                   <button 
                    onClick={() => setSearchParams({})}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all active:scale-95"
                  >
                    <ArrowRight className="w-5 h-5 text-gray-600 dark:text-gray-400 rotate-180" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white truncate tracking-tight">{customer.name}</h3>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-xs font-black tracking-tighter",
                        customer.totalOwed > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}>
                        {formatCurrency(customer.totalOwed)} Outstanding
                      </p>
                      <span className="text-[10px] text-gray-300">•</span>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {customer.sales.length} Invoices
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 relative" ref={exportMenuRef}>
                    <button 
                      onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                      className="p-3 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-all flex items-center gap-2 border border-indigo-100 dark:border-indigo-900/50"
                    >
                      <FileDown className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-[0.1em]">Export History</span>
                    </button>

                    <AnimatePresence>
                      {isExportMenuOpen && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute right-0 top-full mt-2 z-[210] w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 py-2 overflow-hidden"
                        >
                          <button 
                            onClick={() => {
                              setIsExportMenuOpen(false);
                              exportToPDF(customer, transactions);
                            }}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                          >
                            <div className="w-8 h-8 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4 text-red-500" />
                            </div>
                            <span>Save as PDF Report</span>
                          </button>
                          <button 
                            onClick={() => {
                              setIsExportMenuOpen(false);
                              exportToExcel(customer, transactions);
                            }}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                          >
                            <div className="w-8 h-8 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                              <FileSpreadsheet className="w-4 h-4 text-green-500" />
                            </div>
                            <span>Save as Excel Sheet</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                /* Mobile Header matching screenshot */
                <div className="bg-white dark:bg-gray-800 px-2 py-3 flex items-center gap-1 shrink-0 border-b border-gray-100 dark:border-gray-800">
                   <button 
                    onClick={() => setSearchParams({})}
                    className="p-2 text-gray-900 dark:text-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{customer.name}</h3>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate">You, Aron Asmerom, Teklehaimanot Afeworki</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-2 text-[#4c6ef5]"><UserPlus className="w-5 h-5" /></button>
                    <button 
                      onClick={() => exportToPDF(customer, transactions)}
                      className="p-2 text-[#4c6ef5]"
                    >
                      <div className="border-[1.5px] border-[#4c6ef5] rounded px-0.5 py-0">
                        <span className="text-[7px] font-black leading-none uppercase">PDF</span>
                      </div>
                    </button>
                    <button className="p-2 text-[#4c6ef5]"><MoreVertical className="w-5 h-5" /></button>
                  </div>
                </div>
              )}

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto pb-32">
                <div className={cn(
                  "mx-auto space-y-4",
                  isDesktop ? "max-w-[1500px] p-6" : "p-4"
                )}>
                  
                  {/* Desktop Only Filter Suite */}
                  {isDesktop && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                      {['Duration: All Time', 'Types: All', 'Contacts: All', 'Members: All', 'Payment Modes: All', 'Categories: All'].map((filter) => (
                        <div key={filter} className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 rounded-lg text-[9px] font-black text-gray-500 dark:text-gray-400 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm transition-all whitespace-nowrap uppercase tracking-widest">
                          {filter}
                          <ChevronDown className="w-2.5 h-2.5 opacity-30" />
                        </div>
                      ))}
                      <div className="ml-auto flex items-center gap-2">
                         <button className="p-1.5 text-gray-400 hover:text-indigo-500 transition-colors bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 rounded-lg shadow-sm"><Filter className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )}

                  {/* Search and Quick Filters (Mobile Only) */}
                  {!isDesktop && (
                    <div className="space-y-4">
                      <div className="relative mx-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          placeholder="Search by remark or amount" 
                          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border-none rounded-lg text-sm placeholder-gray-400 dark:placeholder:text-gray-500 dark:text-white focus:ring-0 shadow-sm outline-none"
                          value={innerSearchTerm}
                          onChange={(e) => setInnerSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide px-1">
                        <button className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm shrink-0 border border-gray-200 dark:border-gray-700">
                          <Filter className="w-4 h-4 text-[#4c6ef5]" />
                        </button>
                        <button className="px-4 py-2 bg-white dark:bg-gray-800 rounded-full shadow-sm text-[12px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 shrink-0 border border-gray-200 dark:border-gray-700">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          Select Date
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        <button className="px-4 py-2 bg-white dark:bg-gray-800 rounded-full shadow-sm text-[12px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 shrink-0 border border-gray-200 dark:border-gray-700">
                          Entry Type
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        <button className="px-4 py-2 bg-white dark:bg-gray-800 rounded-full shadow-sm text-[12px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 shrink-0 border border-gray-200 dark:border-gray-700">
                          Members
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Balance Summary Section */}
                  <div className="mb-4">
                    {isDesktop ? (
                      <div className="grid grid-cols-3 gap-3">
                        {/* Total Payments */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700/50 flex items-center gap-3 transition-all hover:shadow-md group">
                          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600 shrink-0 group-hover:scale-105 transition-all">
                            <Plus className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-0.5">Total Payments</p>
                            <p className="text-lg font-black text-gray-900 dark:text-white tracking-tight font-mono truncate">
                              {Math.round(customer.totalIn || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {/* Outstanding Balance */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700/50 flex items-center gap-3 transition-all hover:shadow-md group">
                          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 shrink-0 group-hover:scale-105 transition-all">
                            <Minus className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-0.5">Outstanding Balance</p>
                            <p className="text-lg font-black text-gray-900 dark:text-white tracking-tight font-mono truncate">
                              {Math.round(customer.outstandingBalance || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {/* Net Balance */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700/50 flex items-center gap-3 transition-all hover:shadow-md group">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-all">
                            <Equal className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-0.5">Net Balance</p>
                            <p className={cn(
                              "text-lg font-black tracking-tight font-mono truncate",
                              customer.totalOwed > 0 ? "text-red-600" : "text-green-600"
                            )}>
                              {Math.round(customer.totalOwed).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Mobile Summary Card (Matching Screenshot Design) */
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden divide-y dark:divide-gray-700">
                        <div className="flex justify-between items-center px-4 py-3 bg-white dark:bg-gray-800">
                          <span className="text-[14px] font-bold text-gray-900 dark:text-white">Net Balance</span>
                          <span className={cn(
                            "text-[14px] font-bold",
                            customer.totalOwed > 0 ? "text-gray-900" : "text-[#00875a]"
                          )}>
                            {customer.totalOwed > 0 ? '-' : ''}{Math.round(Math.abs(customer.totalOwed)).toLocaleString()}
                          </span>
                        </div>
                        <div className="px-4 py-3 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[14px] font-bold text-gray-900 dark:text-white">Total In (+)</span>
                            <span className="text-[#00875a] text-[14px] font-bold">
                              {Math.round(customer.totalIn || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[14px] font-bold text-gray-900 dark:text-white">Total Out (-)</span>
                            <span className="text-[#de350b] text-[14px] font-bold">
                              {Math.round(customer.outstandingBalance || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button className="w-full flex items-center justify-center gap-2 py-3 text-[#4c6ef5] text-[12px] font-black uppercase tracking-wider">
                          VIEW REPORTS <ChevronRight className="w-4 h-4 ml-1" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Operational Entry Bar (Desktop Only - Mobile used separate FABs) */}
                  {isDesktop && (
                    <div className="flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-800/30 p-2 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                      <div className="flex-1 relative group max-w-xl">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Search record details, items, or amount..." 
                          className="w-full pl-9 pr-12 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm focus:border-indigo-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-white"
                          value={innerSearchTerm}
                          onChange={(e) => setInnerSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => navigate('/pos', { state: { customerId: customer.id, returnTo: 'ledger' } })}
                          className="px-5 py-2 bg-[#00875a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#007049] transition-all shadow-lg shadow-green-500/10 active:scale-95 flex items-center gap-2"
                        >
                          <Plus className="w-3.5 h-3.5" /> New Sale
                        </button>
                        <button 
                          onClick={() => { 
                            resetPaymentForm();
                            setSelectedCustomerForPayment(customer); 
                            setIsPaymentModalOpen(true); 
                          }}
                          className="px-5 py-2 bg-[#de350b] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#bf2d09] transition-all shadow-lg shadow-red-500/10 active:scale-95 flex items-center gap-2"
                        >
                          <Minus className="w-3.5 h-3.5" /> Payment
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Bulk Actions Toolbar */}
                    {selectedTransactions.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 flex items-center gap-6 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3 pr-6 border-r border-gray-100 dark:border-gray-700">
                          <input 
                            type="checkbox" 
                            checked={selectedTransactions.length === transactions.length}
                            onChange={() => toggleSelectAll(transactions.map((t: any) => t.id))}
                            className="rounded-md border-gray-300 text-indigo-600 focus:ring-4 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer" 
                          />
                          <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300">Select All</span>
                        </div>
                        
                        <button 
                          onClick={() => handleBulkDelete(transactions)}
                          className="flex items-center gap-2 text-[12px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash className="w-4 h-4" />
                          Delete
                        </button>
                        
                        <div className="flex items-center gap-2 text-[12px] font-bold text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer group relative">
                          <CornerUpRight className="w-4 h-4" />
                          <span>Move or Copy</span>
                          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                        </div>

                        <div className="flex items-center gap-2 text-[12px] font-bold text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer group relative">
                          <RefreshCcw className="w-4 h-4" />
                          <span>Change Fields</span>
                          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                        </div>
                      </div>
                    )}

                    {isDesktop ? (
                      /* Desktop Table (Kept original logic) */
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
                          <table className="w-full text-left border-collapse min-w-[1100px]">
                            <thead>
                              <tr className="bg-[#f8f9fa] dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-widest h-12">
                                <th className="px-6 w-14 text-center border-r border-gray-50 dark:border-gray-800">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedTransactions.length === transactions.length && transactions.length > 0}
                                    onChange={() => toggleSelectAll(transactions.map((t: any) => t.id))}
                                    className="rounded-md border-gray-300 text-indigo-600 focus:ring-4 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer" 
                                  />
                                </th>
                                <th className="px-6">Date & Time</th>
                                <th className="px-6 w-[35%]">Details & Narrative</th>
                                <th className="px-6 text-center">Category</th>
                                <th className="px-6 text-center">Entry Method</th>
                                <th className="px-6 text-center">Receipt</th>
                                <th className="px-6 text-right">Debit / Credit</th>
                                <th className="px-8 text-right bg-[#fcfcfc] dark:bg-gray-900/10 whitespace-nowrap">Running Balance</th>
                                <th className="px-6 text-right w-20">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                              {(() => {
                                const initialBalanceUSD = customer.initialBalanceCurrency === 'SSP' 
                                  ? (customer.initialBalance || 0) / 1000 
                                  : (customer.initialBalance || 0);
                                let currentRunning = initialBalanceUSD;
                                const sorted = [...transactions].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                                const computed = sorted.map(item => {
                                  const val = (item.creditDeductionUSD ?? (item.amount || item.totalAmount));
                                  if (item.isPayment || item.isExpense) currentRunning -= val;
                                  else currentRunning += val;
                                  return { ...item, bal: currentRunning };
                                });
                                return computed.reverse().map((item: any) => (
                                  <tr 
                                    key={item.id} 
                                    className="group hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-all h-16 cursor-pointer"
                                    onClick={() => handleEditTransaction(item, customer)}
                                  >
                                    <td className="px-6 text-center border-r dark:border-gray-800" onClick={(e) => e.stopPropagation()}>
                                      <input 
                                        type="checkbox" 
                                        checked={selectedTransactions.includes(item.id)}
                                        onChange={() => toggleTransactionSelection(item.id)}
                                        className="rounded-md border-gray-300 text-indigo-600 focus:ring-4 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer" 
                                      />
                                    </td>
                                    <td className="px-6 whitespace-nowrap">
                                      <div className="flex flex-col">
                                        <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight mb-0.5">
                                          {isToday(parseISO(item.timestamp)) ? 'Today' : format(parseISO(item.timestamp), 'MMM dd, yyyy')}
                                        </span>
                                        <span className="text-[10px] font-medium text-gray-400 capitalize">{format(parseISO(item.timestamp), 'h:mm a')}</span>
                                      </div>
                                    </td>
                                    <td className="px-6">
                                      <div className="flex flex-col max-w-sm">
                                        <span className="text-[12px] font-medium text-gray-800 dark:text-gray-200 capitalize truncate mb-0.5">
                                          {item.notes || (item.isPayment ? 'Repayment Settlement' : item.isExpense ? 'Operational Expense' : (item.items?.[0]?.name || 'Direct Credit Sale Account'))}
                                        </span>
                                        <div className="flex items-center gap-1 font-medium text-[9px] text-gray-400 capitalize">
                                          By {user?.displayName || 'User'}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 text-center"><span className="text-[9px] font-black text-gray-400 uppercase bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded tracking-widest">{item.isPayment ? 'FINANCE' : item.isExpense ? 'OVERHEAD' : 'SALES'}</span></td>
                                    <td className="px-6 text-center">
                                      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase", item.isPayment || item.isExpense ? "bg-red-50 text-[#de350b]" : "bg-green-50 text-[#00875a]")}>
                                        {item.isPayment ? 'Payment' : item.isExpense ? 'Expense' : 'New Sale'}
                                      </div>
                                    </td>
                                    <td className="px-6 text-center">
                                      <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-[100px]">
                                        {(item.attachments || (item.attachmentUrl ? [{ url: item.attachmentUrl, type: item.attachmentType || (item.attachmentUrl.includes('pdf') ? 'pdf' : 'image') }] : [])).map((att: any, i: number) => (
                                          <button 
                                            key={i}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewUrl(att.url);
                                              setPreviewType(att.type);
                                            }}
                                            className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors group"
                                            title={`View Attachment ${i + 1}`}
                                          >
                                            {att.type === 'pdf' ? <FileText className="w-3.5 h-3.5 text-red-400 group-hover:text-red-600" /> : <ImageIcon className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600" />}
                                          </button>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="px-6 text-right"><span className={cn("text-[14px] font-bold font-mono", item.isPayment || item.isExpense ? "text-[#de350b]" : "text-[#00875a]")}>{item.isPayment || item.isExpense ? '-' : '+'}{Math.round(item.creditDeductionUSD ?? (item.amount || item.totalAmount)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></td>
                                    <td className="px-8 text-right bg-[#fcfcfc] dark:bg-gray-900/10">
                                      <div className="flex flex-col items-end">
                                        <span className="text-[13px] font-bold font-mono text-gray-500">{Math.round(item.bal).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                        {item.updatedAt && (
                                          <span className="text-[9px] font-bold text-gray-400 italic">(Edited)</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 text-right">
                                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditTransaction(item, customer);
                                          }}
                                          className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
                                          title="Edit Entry"
                                        >
                                          <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTransactionInfo({ 
                                              id: item.id, 
                                              collection: item.collection, 
                                              type: item.isPayment ? 'Payment' : item.isExpense ? 'Expense' : 'Sale',
                                              customerId: customer.id
                                            });
                                          }}
                                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                                          title="Delete Entry"
                                        >
                                          <Trash className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      /* Mobile List (Grouped by Date) */
                      <div className="space-y-2 mt-1 px-1 pb-4">
                        {/* Show entry count like in screenshot */}
                        <div className="text-center mb-1">
                          <p className="text-[12px] font-bold text-gray-400">Showing {transactions.length} entries</p>
                        </div>

                        {(() => {
                          const initialBalanceUSD = customer.initialBalanceCurrency === 'SSP' 
                            ? (customer.initialBalance || 0) / 1000 
                            : (customer.initialBalance || 0);
                          let currentRunning = initialBalanceUSD;
                          const sorted = [...transactions].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                          const computed = sorted.map(item => {
                            const val = (item.creditDeductionUSD ?? (item.amount || item.totalAmount));
                            if (item.isPayment || item.isExpense) currentRunning -= val;
                            else currentRunning += val;
                            return { ...item, bal: currentRunning };
                          });

                          const grouped = computed.reverse().reduce((acc: any, item) => {
                            const date = format(parseISO(item.timestamp), 'dd MMM yyyy');
                            if (!acc[date]) acc[date] = [];
                            acc[date].push(item);
                            return acc;
                          }, {});

                          return Object.entries(grouped).map(([date, items]: [string, any], gIdx: number) => (
                            <div key={date} className={cn("space-y-1", gIdx !== 0 && "pt-3 border-t-4 border-double border-gray-300 dark:border-gray-600")}>
                              <h4 className="text-[12px] font-bold text-gray-500 dark:text-gray-400 ml-1 mb-1">{date}</h4>
                              <div className="space-y-2">
                                {items.map((item: any, idx: number) => (
                                  <div 
                                    key={item.id}
                                    onClick={() => handleEditTransaction(item, customer)}
                                    className={cn(
                                      "px-1 py-0.5 flex flex-col gap-0.5 cursor-pointer transition-colors active:bg-gray-50 dark:active:bg-gray-700",
                                      idx !== items.length - 1 && "border-b border-gray-200 dark:border-gray-700 pb-2"
                                    )}
                                  >
                                    <div className="flex justify-between items-start">
                                      {/* Left Side: Remark */}
                                      <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight break-words flex-1 pr-4">
                                        {item.notes || (item.isPayment ? 'Repayment Settlement' : item.isExpense ? 'Operational Expense' : (item.items?.[0]?.name || 'Direct Credit Sale Account'))}
                                      </p>
                                      
                                      {/* Right Side: Amount */}
                                      <div className="text-right shrink-0">
                                        <p className={cn(
                                          "text-[13px] font-bold leading-none mb-0.5",
                                          item.isPayment || item.isExpense ? "text-[#00875a]" : "text-[#de350b]"
                                        )}>
                                          {item.isPayment || item.isExpense ? '+' : '-'}{Math.round(item.creditDeductionUSD ?? (item.amount || item.totalAmount)).toLocaleString()}
                                        </p>
                                        <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">
                                          Bal: {Math.round(item.bal).toLocaleString()}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Footer: Entry by */}
                                    <div className="flex items-center gap-2 mt-0">
                                      <div 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTransactionSelection(item.id);
                                        }}
                                        className="flex items-center shrink-0"
                                      >
                                        <input 
                                          type="checkbox" 
                                          checked={selectedTransactions.includes(item.id)}
                                          readOnly
                                          className="rounded border-gray-300 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer" 
                                        />
                                      </div>
                                      <p className="text-[11px] font-bold text-[#4c6ef5]">
                                        Entry by You <span className="text-gray-400 font-medium ml-1">at {format(parseISO(item.timestamp), 'h:mm a')}</span>
                                      </p>
                                    </div>


                                    {/* Attachments Section */}
                                    {(item.attachments || (item.attachmentUrl ? [{ url: item.attachmentUrl, type: item.attachmentType || (item.attachmentUrl.includes('pdf') ? 'pdf' : 'image') }] : [])).length > 0 && (
                                      <div className="flex flex-wrap gap-2 mt-1.5">
                                        {(item.attachments || (item.attachmentUrl ? [{ url: item.attachmentUrl, type: item.attachmentType || (item.attachmentUrl.includes('pdf') ? 'pdf' : 'image') }] : [])).map((att: any, i: number) => (
                                          <button 
                                            key={i}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewUrl(att.url);
                                              setPreviewType(att.type);
                                            }}
                                            className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider"
                                          >
                                            {att.type === 'pdf' ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                            {att.type === 'pdf' ? 'PDF' : 'BIll'}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                    <div className="flex items-center justify-center text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em] py-8">
                      <span>Showing {transactions.length} entries</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile FABs */}
              {!isDesktop && (
                <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t dark:border-gray-800 flex justify-center items-center gap-3 h-20">
                  <button 
                    onClick={() => navigate('/pos', { state: { customerId: customer.id, returnTo: 'ledger' } })}
                    className="flex-1 h-11 flex items-center justify-center gap-2 bg-[#00875a] text-white rounded-lg font-black text-[12px] uppercase tracking-widest shadow-md transition-transform active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> NEW SALE
                  </button>
                  
                  <button 
                    onClick={() => { 
                      resetPaymentForm();
                      setSelectedCustomerForPayment(customer); 
                      setIsPaymentModalOpen(true); 
                    }}
                    className="flex-1 h-11 flex items-center justify-center gap-2 bg-[#de350b] text-white rounded-lg font-black text-[12px] uppercase tracking-widest shadow-md transition-transform active:scale-95"
                  >
                    <Minus className="w-4 h-4" /> PAYMENT
                  </button>
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>
      {/* Payment Side Panel (Matching Screenshot Design) */}
      <AnimatePresence>
        {isPaymentModalOpen && selectedCustomerForPayment && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="fixed inset-0 z-[400] bg-black/30 backdrop-blur-sm"
            />
            
            {/* Side Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-[401] w-full max-w-[500px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col h-full border-l border-gray-100 dark:border-gray-700"
            >
              {/* Header */}
              <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
                <h2 className="text-[18px] font-black text-gray-900 dark:text-white tracking-tight">
                  ADD LEDGER ENTRY
                </h2>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors border border-gray-200 dark:border-gray-700"
                >
                  <X className="w-5 h-5 text-gray-400 dark:text-white" />
                </button>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-32 bg-white dark:bg-gray-800">
                <form onSubmit={handleRecordPayment} className="space-y-4" autoComplete="off">
                  {/* Minimalist Date & Time Row (Matching Screenshot Style) */}
                  <div className="flex items-center justify-between px-1 py-2 border-b border-gray-100 dark:border-gray-700 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center gap-1.5 cursor-pointer">
                        <Calendar className="w-4 h-4 text-gray-400 dark:text-white" />
                        <input 
                          type="date"
                          className="bg-transparent border-none p-0 focus:ring-0 outline-none font-black text-xs text-gray-900 dark:text-white appearance-none cursor-pointer uppercase"
                          value={paymentDate}
                          onChange={e => setPaymentDate(e.target.value)}
                        />
                        <ChevronDown className="w-3 h-3 text-gray-300 dark:text-gray-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center gap-1.5 opacity-80">
                        <Clock className="w-4 h-4 text-gray-400 dark:text-white" />
                        <span className="font-black text-xs text-gray-900 dark:text-white p-0">
                          {format(new Date(), 'hh:mm a')}
                        </span>
                        <ChevronDown className="w-3 h-3 text-gray-300 dark:text-gray-500" />
                      </div>
                    </div>
                  </div>

                  {/* Amount Field */}
                  <div className="space-y-1">
                    <div className="relative">
                      <label className="absolute -top-2 left-3 bg-white dark:bg-gray-800 px-2 text-[10px] font-black text-indigo-500 dark:text-indigo-400 z-10 tracking-widest border-x border-gray-100 dark:border-gray-700">
                        AMOUNT USD *
                      </label>
                      <input 
                        type="text" 
                        inputMode="decimal"
                        placeholder="0"
                        className="w-full px-4 h-12 bg-transparent border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:bg-gray-50 dark:focus:bg-gray-900 outline-none transition-all font-black text-lg text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        value={paymentAmountUSD}
                        onChange={e => setPaymentAmountUSD(formatInputNumber(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Exchange Rate & SSP Amount Row (Level Up) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="absolute -top-2 left-3 bg-white dark:bg-gray-800 px-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 z-10 whitespace-nowrap tracking-wide">
                        AMOUNT SSP (OPTIONAL)
                      </label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        placeholder="0"
                        className="w-full px-3 h-10 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-0 outline-none transition-all font-black text-xs text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        value={paymentAmountSSP}
                        onChange={e => setPaymentAmountSSP(formatInputNumber(e.target.value))}
                      />
                    </div>
                    <div className="relative">
                      <label className="absolute -top-2 left-3 bg-white dark:bg-gray-800 px-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 z-10 whitespace-nowrap tracking-wide">
                        EXCHANGE RATE (1USD=?)
                      </label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        className="w-full px-3 h-10 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-0 outline-none transition-all font-black text-xs text-gray-900 dark:text-white"
                        value={paymentExchangeRate}
                        onChange={e => setPaymentExchangeRate(formatInputNumber(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Contact Name (Read Only) */}
                  <div className="relative">
                    <label className="absolute -top-2 left-3 bg-white dark:bg-gray-800 px-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 z-10 uppercase tracking-widest">
                      Contact
                    </label>
                    <div className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg font-black text-xs text-gray-900 dark:text-white flex items-center justify-between opacity-80 mt-1">
                      {selectedCustomerForPayment.name.toUpperCase()}
                      <Shield className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="relative">
                    <label className="absolute -top-2 left-3 bg-white dark:bg-gray-800 px-1.5 text-[9px] font-black text-gray-500 dark:text-gray-500 z-10 uppercase tracking-widest">
                      Remarks
                    </label>
                    <textarea 
                      className="w-full px-4 py-3 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-0 outline-none transition-all text-xs h-20 resize-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-700 font-bold mt-1"
                      placeholder="Add transaction details..."
                      value={paymentNotes}
                      onChange={e => setPaymentNotes(e.target.value)}
                    />
                  </div>

                  {/* Attachment Section */}
                  <div className="pt-2">
                    <button 
                      type="button"
                      onClick={() => document.getElementById('payment-attachment')?.click()}
                      className="w-full py-2 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-400 dark:text-gray-600" />
                      <span className="text-[10px] font-black text-gray-500 dark:text-gray-500 uppercase tracking-widest">Attach Proof</span>
                    </button>
                    <input 
                      type="file" 
                      id="payment-attachment"
                      className="hidden"
                      multiple
                      onChange={handleFileChange}
                    />
                    
                    {/* Previews */}
                    {paymentAttachments.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        {paymentAttachments.map((att, index) => (
                          <div key={index} className="relative aspect-square rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                            {att.type === 'image' ? (
                              <img src={att.url} className="w-full h-full object-cover grayscale" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[8px]">PDF</div>
                            )}
                            <button 
                              onClick={() => removeAttachment(index)}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 rounded-full hover:bg-red-500 transition-colors"
                            >
                              <X className="w-2.5 h-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </form>
              </div>

              {/* Bottom Footer */}
              <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 mt-auto shadow-[0_-10px_25px_rgba(0,0,0,0.05)] z-20">
                <button 
                  onClick={() => handleRecordPayment({ preventDefault: () => {} } as any)}
                  disabled={isSubmittingPayment || (!paymentAmountUSD && !paymentAmountSSP)}
                  className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-30 active:scale-[0.98] shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2"
                >
                  {isSubmittingPayment ? 'SAVING...' : 'SAVE'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


      {customerCredits.length === 0 && !loading && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No customers registered</h3>
          <p className="text-gray-500">Add customers to track their credit and payment history.</p>
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
                        className={cn(
                          "bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between gap-2 shadow-sm relative group cursor-pointer hover:bg-gray-50 hover:border-indigo-100 transition-all",
                          activeTransactionMenu === item.id ? "z-[50]" : "z-0"
                        )}
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
                              <div 
                                className="relative"
                                onMouseLeave={() => activeTransactionMenu === item.id && setActiveTransactionMenu(null)}
                              >
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
                                    className="absolute right-0 top-full z-[210]"
                                  >
                                    <div className="p-12 -m-12 pt-1">
                                      <div className="w-38 bg-white rounded-xl shadow-xl border border-gray-100 z-[210] py-1 overflow-hidden">
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
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTransactionInfo({ 
                                              id: item.id, 
                                              collection: item.collection, 
                                              type: item.type,
                                              customerId: item.customerId
                                            });
                                            setActiveTransactionMenu(null);
                                          }}
                                          className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 uppercase tracking-wider"
                                        >
                                          <Trash className="w-3 h-3" />
                                          Delete
                                        </button>
                                      </div>
                                    </div>
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
                            {Math.round(item.amount).toLocaleString('en-US')}
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
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2 uppercase tracking-tight">Delete Transaction?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
              Are you sure you want to delete this <span className="font-black text-gray-900 dark:text-white">{deleteTransactionInfo.type}</span>? This action cannot be undone and will affect your cash balance.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteTransactionInfo(null)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteTransaction}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal */}
      {deleteCustomerInfo && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200 border border-red-100 dark:border-red-900/20">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-5 mx-auto">
              <Trash className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white text-center mb-2 uppercase tracking-tight">Delete Customer Book?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 leading-relaxed">
              Are you sure you want to delete <span className="font-black text-indigo-600 dark:text-indigo-400">"{deleteCustomerInfo.name}"</span>? This will permanently erase all sales, payments, and history.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDeleteCustomer}
                className="w-full py-4 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-xl shadow-red-200 dark:shadow-none"
              >
                Delete Everything
              </button>
              <button 
                onClick={() => setDeleteCustomerInfo(null)}
                className="w-full py-4 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gray-100 dark:hover:bg-gray-600 transition-all"
              >
                Keep Book
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
