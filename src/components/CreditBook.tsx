import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, Timestamp, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sale, Customer, Payment } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Search, User, Calendar, CheckCircle2, AlertCircle, Receipt, ArrowRight, ExternalLink, DollarSign, X, ShoppingCart, PlusCircle, ChevronRight, Users, Shield, Clock, MoreVertical, Edit3, Copy, UserPlus, Move, Trash, TrendingUp, TrendingDown, Paperclip, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FileDown, FileSpreadsheet, Filter, MessageCircle, Share2 } from 'lucide-react';
import { useAuth } from '../App';

export default function CreditBook() {
  const navigate = useNavigate();
  const { role, isAdmin } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentAttachment, setPaymentAttachment] = useState<string | null>(null);
  const [paymentAttachmentType, setPaymentAttachmentType] = useState<'image' | 'pdf' | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  
  // Add Customer State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newInlineName, setNewInlineName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu]);

  useEffect(() => {
    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('paymentMethod', '==', 'credit'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: safeTimestamp(doc.data().createdAt)
      } as Customer)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), orderBy('timestamp', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Payment)));
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubPayments();
    };
  }, []);

  const handleInlineAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newInlineName.trim() || isSubmittingCustomer) return;

    setIsSubmittingCustomer(true);
    try {
      await addDoc(collection(db, 'customers'), {
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

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || isSubmittingCustomer) return;

    setIsSubmittingCustomer(true);
    try {
      await addDoc(collection(db, 'customers'), {
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        email: newCustomerEmail.trim(),
        createdAt: serverTimestamp(),
        memberIds: []
      });
      setIsAddModalOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
    } catch (error) {
      console.error('Error adding customer:', error);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleMarkAsPaid = async (saleId: string) => {
    if (window.confirm('Mark this specific invoice as fully paid?')) {
      await updateDoc(doc(db, 'sales', saleId), {
        status: 'paid'
      });
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || !paymentAmount || isSubmittingPayment) return;
    
    setIsSubmittingPayment(true);
    try {
      await addDoc(collection(db, 'payments'), {
        customerId: selectedCustomerForPayment.id,
        customerName: selectedCustomerForPayment.name,
        amount: parseFloat(paymentAmount),
        notes: paymentNotes,
        attachmentUrl: paymentAttachment,
        attachmentType: paymentAttachmentType,
        timestamp: serverTimestamp()
      });
      
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentAttachment(null);
      setPaymentAttachmentType(null);
    } catch (error) {
      console.error("Error recording payment:", error);
    } finally {
      setIsSubmittingPayment(false);
    }
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
      formatCurrency(item.amount || item.totalAmount),
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

  const shareToWhatsApp = (customer: any, transactions: any[]) => {
    const filtered = transactions.filter(item => !filterMonth || format(new Date(item.timestamp), 'yyyy-MM') === filterMonth);
    
    let message = `*Transaction Summary for ${customer.name}*\n`;
    message += `*Total Outstanding:* ${formatCurrency(customer.totalOwed)}\n`;
    message += `*Period:* ${filterMonth || 'All Time'}\n\n`;
    message += `*Recent Transactions:*\n`;
    
    filtered.slice(0, 10).forEach(item => {
      const type = item.isPayment ? 'Cash Out (Repayment)' : 'Cash In (Credit Sale)';
      const date = format(new Date(item.timestamp), 'MMM dd');
      const amount = formatCurrency(item.amount || item.totalAmount);
      message += `• ${date}: ${type} - ${amount}\n`;
    });

    if (filtered.length > 10) {
      message += `\n_...and ${filtered.length - 10} more records_`;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group sales and payments by customer
  const customerCredits = filteredCustomers.map(customer => {
    const customerSales = sales.filter(s => s.customerName === customer.name);
    const customerPayments = payments.filter(p => p.customerId === customer.id);
    
    const totalCreditSales = customerSales.filter(s => s.status === 'pending').reduce((acc, s) => acc + s.totalAmount, 0);
    const totalRepayments = customerPayments.reduce((acc, p) => acc + p.amount, 0);
    
    const netOwed = Math.max(0, totalCreditSales - totalRepayments);

    // Find the latest transaction timestamp
    const allTransactions = [...customerSales, ...customerPayments];
    const latestTimestamp = allTransactions.length > 0 
      ? Math.max(...allTransactions.map(t => new Date(t.timestamp).getTime()))
      : new Date(customer.createdAt).getTime();

    return {
      ...customer,
      totalOwed: netOwed,
      sales: customerSales,
      payments: customerPayments,
      lastUpdated: latestTimestamp,
      membersCount: customer.memberIds?.length || 0
    };
  }).sort((a, b) => b.lastUpdated - a.lastUpdated);

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

  const handleDuplicateCustomer = async (customer: Customer) => {
    try {
      await addDoc(collection(db, 'customers'), {
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

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100" />)}
    </div>
  </div>;

  return (
    <div className="space-y-6 pb-24">
      {/* Upper Level Balance Summary - Minimal Red Style with Search */}
      <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
        <div className="flex items-center justify-center bg-red-600 rounded-xl p-2 sm:p-2.5 text-white shadow-md shadow-red-100/30 min-w-[120px]">
          <h2 className="text-base sm:text-lg font-black tracking-tighter leading-none">
            {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
          </h2>
        </div>
        
        <div className="flex items-center">
          <AnimatePresence mode="wait">
            {isSearchExpanded ? (
              <motion.div 
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "200px", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="relative"
              >
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Search..."
                  className="w-full pl-3 pr-8 py-2 bg-white border border-gray-100 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => !searchTerm && setIsSearchExpanded(false)}
                />
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setIsSearchExpanded(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={() => setIsSearchExpanded(true)}
                className="p-2.5 bg-white border border-gray-100 rounded-xl shadow-sm text-gray-400 hover:text-indigo-600 hover:border-indigo-100 transition-all"
              >
                <Search className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>
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
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.015, y: -2, zIndex: 10 }}
            transition={{ 
              delay: index * 0.03,
              scale: { type: "spring", stiffness: 800, damping: 15 },
              y: { type: "spring", stiffness: 800, damping: 15 }
            }}
            className={cn(
              "bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300 group relative",
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
          
          const transactions = [...customer.sales, ...customer.payments.map(p => ({ ...p, isPayment: true }))]
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

          return (
            <motion.div 
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[200] bg-gray-50 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-4 shrink-0">
                <button 
                  onClick={() => setExpandedCustomer(null)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-black text-gray-900 truncate">{customer.name}</h3>
                  <p className={cn(
                    "text-sm font-black tracking-tighter",
                    customer.totalOwed > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    Balance: {formatCurrency(customer.totalOwed)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => shareToWhatsApp(customer, transactions)}
                    className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => exportToPDF(customer, transactions)}
                    className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                  >
                    <FileDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Credit</p>
                    <p className="text-base font-black text-gray-900">
                      {formatCurrency(customer.sales.reduce((acc, s) => acc + s.totalAmount, 0))}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Paid</p>
                    <p className="text-base font-black text-green-600">
                      {formatCurrency(customer.payments.reduce((acc, p) => acc + p.amount, 0))}
                    </p>
                  </div>
                </div>

                {/* Transaction History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-0.5">
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Transaction History</h4>
                    <span className="text-[8px] font-bold text-gray-400">{transactions.length} Records</span>
                  </div>
                  
                  <div className="space-y-2">
                    {transactions.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-2xl border border-gray-100 flex items-center justify-between gap-3 shadow-sm hover:border-indigo-100 transition-all">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                            item.isPayment ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            {item.isPayment ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              {format(new Date(item.timestamp), 'MMM dd, yyyy')}
                            </p>
                            <p className="font-bold text-gray-900 text-xs truncate">
                              {item.notes || (item.isPayment ? 'Repayment' : 'Credit Sale')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <p className={cn(
                            "text-sm font-black",
                            item.isPayment ? "text-red-600" : "text-green-600"
                          )}>
                            {item.isPayment ? '-' : '+'}{formatCurrency(item.amount || item.totalAmount)}
                          </p>
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
                            {!item.isPayment && item.status === 'pending' && role !== 'viewer' && (
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
                    disabled={role === 'viewer'}
                    onClick={() => navigate('/pos', { state: { customerId: customer.id } })}
                    className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Cash In
                  </button>
                  <button 
                    disabled={role === 'viewer'}
                    onClick={() => {
                      setSelectedCustomerForPayment(customer);
                      setIsPaymentModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    Cash Out
                  </button>
                </div>
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

              <div className="space-y-1">
                <label className="text-[10px] lg:text-xs font-bold text-gray-500 uppercase tracking-wider">Amount Paid</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-gray-400" />
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-9 lg:pl-10 pr-4 py-2 lg:py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-base lg:text-lg"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                  />
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
                  disabled={isSubmittingPayment || !paymentAmount}
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

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-black tracking-tight">Add New Book</h3>
                  <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-indigo-100 text-sm">Create a new credit record for a customer.</p>
              </div>

              <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required
                      type="text" 
                      placeholder="Full Name"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                      value={newCustomerName}
                      onChange={e => setNewCustomerName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Phone Number (Optional)</label>
                  <input 
                    type="tel" 
                    placeholder="+1 234 567 890"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                    value={newCustomerPhone}
                    onChange={e => setNewCustomerPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email (Optional)</label>
                  <input 
                    type="email" 
                    placeholder="email@example.com"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                    value={newCustomerEmail}
                    onChange={e => setNewCustomerEmail(e.target.value)}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingCustomer || !newCustomerName.trim()}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {isSubmittingCustomer ? 'Creating...' : 'Create Book'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Action Button - Floating */}
      <div className="fixed bottom-8 right-8 z-50">
        <motion.button 
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
          whileHover={{ scale: 1.1, backgroundColor: "rgba(79, 70, 229, 1)" }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setIsAddingInline(true);
            setNewInlineName('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-3 px-6 py-4 bg-indigo-600/70 backdrop-blur-md text-white rounded-2xl font-black text-lg shadow-2xl shadow-indigo-200/50 border border-white/20 transition-all"
        >
          <PlusCircle className="w-6 h-6" />
          <span className="hidden sm:inline">Add a Customer</span>
        </motion.button>
      </div>

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
    </div>
  );
}
