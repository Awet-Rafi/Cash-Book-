import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sale, Customer, Payment } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Search, User, Calendar, CheckCircle2, AlertCircle, Receipt, ArrowRight, ExternalLink, DollarSign, X, ShoppingCart, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function CreditBook() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  useEffect(() => {
    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('paymentMethod', '==', 'credit'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate().toISOString()
      } as Sale)));
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), orderBy('timestamp', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate().toISOString()
      } as Payment)));
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubPayments();
    };
  }, []);

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
        timestamp: serverTimestamp()
      });
      
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (error) {
      console.error("Error recording payment:", error);
    } finally {
      setIsSubmittingPayment(false);
    }
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
    
    // For this simple logic, we'll show the net balance
    // Net Owed = Total Pending Sales - Total Repayments
    const netOwed = Math.max(0, totalCreditSales - totalRepayments);

    return {
      ...customer,
      totalOwed: netOwed,
      sales: customerSales,
      payments: customerPayments
    };
  }).sort((a, b) => b.totalOwed - a.totalOwed);

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100" />)}
    </div>
  </div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search registered customers..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Link 
            to="/customers"
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            Manage Customers
            <ExternalLink className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-100">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-bold text-amber-700">
              Total Outstanding: {formatCurrency(customerCredits.reduce((acc, c) => acc + c.totalOwed, 0))}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Transactions</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Outstanding Balance</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customerCredits.map((customer) => (
                <React.Fragment key={customer.id}>
                  <tr className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{customer.name}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest truncate">ID: {customer.id.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded uppercase whitespace-nowrap">
                        {customer.sales.length + customer.payments.length} Records
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-base font-black",
                          customer.totalOwed > 0 ? "text-amber-600" : "text-green-600"
                        )}>
                          {formatCurrency(customer.totalOwed)}
                        </span>
                        {customer.totalOwed > 0 && (
                          <span className="text-[10px] text-amber-500 font-bold uppercase whitespace-nowrap">Pending Repayment</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => navigate('/pos', { state: { customerId: customer.id } })}
                          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                          title="New Sale"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedCustomerForPayment(customer);
                            setIsPaymentModalOpen(true);
                          }}
                          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                          title="Record Payment"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpandedCustomer(expandedCustomer === customer.id ? null : customer.id)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            expandedCustomer === customer.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          )}
                          title="View History"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedCustomer === customer.id && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={4} className="px-6 py-4">
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Transaction History</h4>
                          {[...customer.sales, ...customer.payments.map(p => ({ ...p, isPayment: true }))]
                            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((item: any) => (
                            <div key={item.id} className={cn(
                              "p-4 rounded-xl border flex items-center justify-between gap-4",
                              item.isPayment ? "bg-green-50/50 border-green-100" : "bg-white border-gray-100 shadow-sm"
                            )}>
                              <div className="flex items-center gap-4 min-w-0">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                  item.isPayment ? "bg-green-100" : "bg-gray-100"
                                )}>
                                  {item.isPayment ? <DollarSign className="w-5 h-5 text-green-600" /> : <ShoppingCart className="w-5 h-5 text-gray-400" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                                      item.isPayment 
                                        ? "bg-green-200 text-green-800" 
                                        : (item.status === 'paid' ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-700")
                                    )}>
                                      {item.isPayment ? 'Repayment' : item.status}
                                    </span>
                                    <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {format(new Date(item.timestamp), 'MMM dd, yyyy HH:mm')}
                                    </span>
                                  </div>
                                  {item.notes && <p className="text-xs text-gray-500 italic truncate max-w-[200px]">"{item.notes}"</p>}
                                  {!item.isPayment && <p className="text-[10px] text-gray-400">Sale ID: #{item.id.slice(-8).toUpperCase()}</p>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={cn(
                                  "text-lg font-black",
                                  item.isPayment ? "text-green-600" : "text-gray-900"
                                )}>
                                  {item.isPayment ? '-' : ''}{formatCurrency(item.amount || item.totalAmount)}
                                </p>
                                {!item.isPayment && item.status === 'pending' && (
                                  <button 
                                    onClick={() => handleMarkAsPaid(item.id)}
                                    className="mt-1 flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 ml-auto"
                                  >
                                    Mark Paid
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100">
          {customerCredits.map((customer) => (
            <div key={customer.id} className="p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{customer.name}</p>
                    <p className="text-[8px] text-gray-400 uppercase tracking-widest">
                      {customer.sales.length + customer.payments.length} Records
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-sm font-black",
                    customer.totalOwed > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {formatCurrency(customer.totalOwed)}
                  </p>
                  {customer.totalOwed > 0 && (
                    <p className="text-[8px] text-amber-500 font-bold uppercase">Owed</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between gap-2 pt-1">
                <button 
                  onClick={() => navigate('/pos', { state: { customerId: customer.id } })}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Sale
                </button>
                <button 
                  onClick={() => {
                    setSelectedCustomerForPayment(customer);
                    setIsPaymentModalOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Pay
                </button>
                <button
                  onClick={() => setExpandedCustomer(expandedCustomer === customer.id ? null : customer.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                    expandedCustomer === customer.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                  )}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  History
                </button>
              </div>

              {expandedCustomer === customer.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 max-h-[300px] overflow-y-auto">
                  {[...customer.sales, ...customer.payments.map(p => ({ ...p, isPayment: true }))]
                    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((item: any) => (
                    <div key={item.id} className={cn(
                      "p-3 rounded-xl border flex items-center justify-between gap-3",
                      item.isPayment ? "bg-green-50/50 border-green-100" : "bg-white border-gray-100"
                    )}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-1 py-0.5 rounded text-[8px] font-bold uppercase",
                            item.isPayment ? "bg-green-200 text-green-800" : "bg-amber-100 text-amber-700"
                          )}>
                            {item.isPayment ? 'Repay' : 'Credit'}
                          </span>
                          <span className="text-[8px] text-gray-400">
                            {format(new Date(item.timestamp), 'MMM dd')}
                          </span>
                        </div>
                        {item.notes && <p className="text-[10px] text-gray-500 truncate max-w-[120px]">"{item.notes}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-xs font-black", item.isPayment ? "text-green-600" : "text-gray-900")}>
                          {item.isPayment ? '-' : ''}{formatCurrency(item.amount || item.totalAmount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {customerCredits.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No credit records found</h3>
            <p className="text-gray-500">Registered customers with credit sales will appear here.</p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedCustomerForPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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

      {/* Bottom Action Button - Floating */}
      <div className="fixed bottom-8 right-8 z-50">
        <motion.button 
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
          whileHover={{ scale: 1.1, backgroundColor: "rgba(79, 70, 229, 1)" }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/customers', { state: { openAddModal: true } })}
          className="flex items-center gap-3 px-6 py-4 bg-indigo-600/70 backdrop-blur-md text-white rounded-2xl font-black text-lg shadow-2xl shadow-indigo-200/50 border border-white/20 transition-all"
        >
          <PlusCircle className="w-6 h-6" />
          <span className="hidden sm:inline">Add a Customer</span>
        </motion.button>
      </div>
    </div>
  );
}
