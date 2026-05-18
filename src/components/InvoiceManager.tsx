import React, { useState, useEffect, useMemo } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sale, Customer, Business, Product, SaleItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { 
  Search, 
  FileText, 
  Send, 
  Printer, 
  ChevronRight, 
  User, 
  Calendar,
  DollarSign,
  Package,
  Share2,
  Clock,
  ArrowLeft,
  X,
  Phone,
  Mail,
  Copy,
  CheckCircle2,
  Download,
  Plus,
  Trash2 as TrashIcon,
  Save
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function InvoiceManager() {
  const { businessId } = useAuth();
  const location = useLocation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Guest Invoice State
  const [guestData, setGuestData] = useState({
    guestName: '',
    paymentMethod: 'cash' as 'cash' | 'credit',
    currency: 'USD' as 'USD' | 'SSP',
    items: [] as SaleItem[],
    discount: 0,
    amountUSD: 0,
    isMixed: false
  });
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    if (!businessId) return;

    // Fetch Products for guest invoice
    const unsubProducts = onSnapshot(query(
      collection(db, 'products'),
      where('businessId', '==', businessId)
    ), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });

    return () => unsubProducts();
  }, [businessId]);

  useEffect(() => {
    const state = location.state as { selectedSaleId?: string } | null;
    if (state?.selectedSaleId && sales.length > 0) {
      const sale = sales.find(s => s.id === state.selectedSaleId);
      if (sale) {
        setSelectedSale(sale);
      }
    }
  }, [location.state, sales]);

  useEffect(() => {
    if (!businessId) return;

    // Fetch Business Info
    getDoc(doc(db, 'businesses', businessId)).then(docSnap => {
      if (docSnap.exists()) {
        setBusiness({ id: docSnap.id, ...docSnap.data() } as Business);
      }
    });

    // Fetch Customers (to get contact info)
    const unsubCustomers = onSnapshot(query(
      collection(db, 'customers'),
      where('businessId', '==', businessId)
    ), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    // Fetch Sales (Invoices)
    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    return () => {
      unsubCustomers();
      unsubSales();
    };
  }, [businessId]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => 
      s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sales, searchTerm]);

  const getCustomerInfo = (customerId: string | null | undefined) => {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId);
  };

  const handleCopyInvoice = () => {
    if (!selectedSale) return;
    const customer = getCustomerInfo(selectedSale.customerId);
    
    let text = `*INVOICE from ${business?.name || 'Our Store'}*\n`;
    text += `Invoice #: ${selectedSale.id.slice(-8).toUpperCase()}\n`;
    text += `Date: ${format(new Date(selectedSale.timestamp), 'MMM dd, yyyy')}\n`;
    text += `Customer: ${selectedSale.customerName}\n\n`;
    text += `*Items:*\n`;
    selectedSale.items.forEach(item => {
      text += `- ${item.name} (${item.quantity}x): ${formatCurrency(item.priceAtSale * item.quantity)}\n`;
    });
    text += `\n*Total: ${formatCurrency(selectedSale.totalAmount)}*\n`;
    text += `Status: ${selectedSale.status.toUpperCase()}\n`;
    text += `Payment Method: ${selectedSale.paymentMethod.toUpperCase()}\n\n`;
    text += `Thank you for your business!`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!selectedSale) return;
    const customer = getCustomerInfo(selectedSale.customerId);
    const phone = customer?.phone || '';
    
    let text = `*INVOICE from ${business?.name || 'Our Store'}*\n`;
    text += `Invoice #: ${selectedSale.id.slice(-8).toUpperCase()}\n`;
    text += `Date: ${format(new Date(selectedSale.timestamp), 'MMM dd, yyyy')}\n`;
    text += `Customer: ${selectedSale.customerName}\n\n`;
    text += `*Items:*\n`;
    selectedSale.items.forEach(item => {
      text += `- ${item.name} (${item.quantity}x): ${formatCurrency(item.priceAtSale * item.quantity)}\n`;
    });
    text += `\n*Total: ${formatCurrency(selectedSale.totalAmount)}*\n`;
    text += `Status: ${selectedSale.status.toUpperCase()}\n`;
    text += `Payment Method: ${selectedSale.paymentMethod.toUpperCase()}\n\n`;
    text += `Thank you for your business!`;

    const url = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const downloadPDF = async () => {
    if (!selectedSale || downloading) return;
    const element = document.getElementById('printable-invoice');
    if (!element) return;

    setDownloading(true);
    try {
      // Ensure all fonts and images are ready
      await document.fonts.ready;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('printable-invoice');
          if (clonedElement) {
            // Aggressively replace oklch colors with hex equivalents
            const cleanColor = (colorStr: string) => {
              if (!colorStr || !colorStr.includes('oklch')) return colorStr;
              // Fallback map for common oklch patterns in Tailwind 4
              if (colorStr.includes('0.627 0.265 254.622')) return '#4f46e5'; // indigo-600
              if (colorStr.includes('0.145 0 0')) return '#111827'; // gray-900
              if (colorStr.includes('0.985 0 0')) return '#f9fafb'; // gray-50
              return '#111827'; // Default fallback to dark
            };

            const allElements = clonedElement.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              const computed = window.getComputedStyle(el);
              
              // Only override if necessary to avoid massive performance hit
              if (computed.color.includes('oklch')) el.style.color = '#111827';
              if (computed.backgroundColor.includes('oklch')) el.style.backgroundColor = '#ffffff';
              if (computed.borderColor.includes('oklch')) el.style.borderColor = '#e5e7eb';
              
              // Handle specific brand colors
              if (el.classList.contains('text-indigo-600')) el.style.color = '#4f46e5';
              if (el.classList.contains('bg-indigo-600')) el.style.backgroundColor = '#4f46e5';
              if (el.classList.contains('text-white')) el.style.color = '#ffffff';
            }
            
            clonedElement.style.backgroundColor = '#ffffff';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`invoice-${selectedSale.id.slice(-8).toUpperCase()}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. You can still use the Print button as an alternative.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateGuestInvoice = async () => {
    if (!businessId || !guestData.guestName || guestData.items.length === 0) return;

    setIsSaving(true);
    try {
      const totalCost = guestData.items.reduce((sum, item) => sum + (item.costAtSale * item.quantity), 0);
      const subtotal = guestData.items.reduce((sum, item) => sum + (item.priceAtSale * item.quantity), 0);
      const totalAmount = subtotal - guestData.discount;
      
      const saleData = {
        businessId,
        customerId: 'guest',
        customerName: guestData.guestName + " (Guest)",
        items: guestData.items,
        totalAmount,
        subtotal,
        discount: guestData.discount,
        paymentMethod: guestData.paymentMethod,
        status: guestData.paymentMethod === 'credit' ? 'pending' : 'paid',
        timestamp: serverTimestamp(),
        isMixed: guestData.isMixed,
        amountUSD: guestData.currency === 'USD' ? totalAmount : guestData.amountUSD,
        amountSSP: guestData.currency === 'SSP' ? totalAmount : 0,
        currency: guestData.currency,
        totalCost,
        profit: totalAmount - totalCost,
        exchangeRate: 1,
        isConfirmed: guestData.paymentMethod === 'cash'
      };

      const docRef = await addDoc(collection(db, 'sales'), saleData);
      
      // Select the new invoice
      const newSale: Sale = {
        id: docRef.id,
        ...saleData,
        timestamp: new Date().toISOString()
      } as Sale;
      
      setSelectedSale(newSale);
      setShowCreateModal(false);
      setGuestData({
        guestName: '',
        paymentMethod: 'cash',
        currency: 'USD',
        items: [],
        discount: 0,
        amountUSD: 0,
        isMixed: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    } finally {
      setIsSaving(false);
    }
  };

  const addItemToGuest = (product: Product) => {
    const existingIndex = guestData.items.findIndex(i => i.productId === product.id);
    if (existingIndex > -1) {
      const newItems = [...guestData.items];
      newItems[existingIndex].quantity += 1;
      setGuestData({ ...guestData, items: newItems });
    } else {
      setGuestData({
        ...guestData,
        items: [...guestData.items, {
          productId: product.id,
          name: product.name,
          quantity: 1,
          priceAtSale: product.price,
          costAtSale: product.costPrice || 0
        }]
      });
    }
    setProductSearch('');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Invoice</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Manage and send invoices to your customers</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none"
          >
            <Plus className="w-5 h-5" />
            Guest Invoice
          </button>
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search invoices..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm text-gray-900 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Invoice List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[600px]">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">All Invoices</span>
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-bold">
                {filteredSales.length} Total
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
              {filteredSales.map(sale => (
                <button
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all group relative",
                    selectedSale?.id === sale.id && "bg-indigo-50 dark:bg-indigo-900/10 border-l-4 border-indigo-600 dark:border-indigo-400"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-gray-400 font-medium">#{sale.id.slice(-8).toUpperCase()}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                      sale.status === 'paid' ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                    )}>
                      {sale.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{sale.customerName || 'Walk-in Customer'}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(sale.timestamp), 'MMM dd, yyyy')}</p>
                    <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                      {sale.isMixed ? (
                        `$${Math.round(sale.amountUSD).toLocaleString('en-US')}`
                      ) : (
                        formatCurrency(sale.totalAmount)
                      )}
                    </p>
                  </div>
                </button>
              ))}
              {filteredSales.length === 0 && (
                <div className="p-8 text-center">
                  <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium tracking-tight">No invoices found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Invoice Preview */}
        <div className="lg:col-span-2">
          {selectedSale ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden min-h-[600px] flex flex-col">
                {/* Preview Toolbar */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedSale(null)}
                      className="lg:hidden p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Invoice Preview</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => window.print()}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm"
                      title="Print"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button 
                      onClick={downloadPDF}
                      disabled={downloading}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm disabled:opacity-50"
                      title="Download PDF"
                    >
                      {downloading ? (
                        <Clock className="w-4 h-4 animate-spin text-indigo-500" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      PDF
                    </button>
                    <button 
                      onClick={() => setShowShareModal(true)}
                      className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                </div>

                {/* Actual Invoice Content */}
                <div className="flex-1 p-8 md:p-12" id="printable-invoice">
                  <div className="max-w-2xl mx-auto space-y-12">
                    {/* Invoice Header */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 pb-8 border-b border-gray-100 dark:border-gray-700">
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-indigo-100 dark:shadow-none">
                          {business?.name?.[0] || 'S'}
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{business?.name || 'Our Store'}</h2>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-xs">{business?.description || 'Your partner in quality service and products.'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-widest mb-1">Invoice</h1>
                        <p className="text-sm font-mono text-gray-400 font-bold">#{selectedSale.id.slice(-8).toUpperCase()}</p>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Billed To</h3>
                        <div className="space-y-1">
                          <p className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{selectedSale.customerName}</p>
                          {getCustomerInfo(selectedSale.customerId)?.phone && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-bold">{getCustomerInfo(selectedSale.customerId)?.phone}</p>
                          )}
                          {getCustomerInfo(selectedSale.customerId)?.email && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{getCustomerInfo(selectedSale.customerId)?.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-4 text-right">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Invoice Date</h3>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{format(new Date(selectedSale.timestamp), 'MMMM dd, yyyy')}</p>
                          </div>
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Payment Method</h3>
                            <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight italic">{selectedSale.paymentMethod}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="relative rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-900 dark:bg-gray-700">
                            <th className="px-6 py-4 text-[10px] font-black text-gray-100 uppercase tracking-widest">Description</th>
                            <th className="px-4 py-4 text-[10px] font-black text-gray-100 uppercase tracking-widest text-center">Qty</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-100 uppercase tracking-widest text-right">Price</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-100 uppercase tracking-widest text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {selectedSale.items.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="px-6 py-5">
                                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{item.name}</p>
                              </td>
                              <td className="px-4 py-5 text-center">
                                <span className="text-sm font-bold text-gray-600 dark:text-gray-400 font-mono">{item.quantity}</span>
                              </td>
                              <td className="px-6 py-5 text-right font-mono text-sm text-gray-600 dark:text-gray-400">
                                {formatCurrency(item.priceAtSale)}
                              </td>
                              <td className="px-6 py-5 text-right font-mono font-black text-gray-900 dark:text-white text-sm">
                                {formatCurrency(item.priceAtSale * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="flex flex-col items-end gap-3 pt-6">
                      <div className="w-full max-w-xs space-y-3">
                        <div className="flex justify-between items-center px-2">
                          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
                          <span className="text-sm font-black text-gray-900 dark:text-white">{formatCurrency(selectedSale.subtotal)}</span>
                        </div>
                        {selectedSale.discount > 0 && (
                          <div className="flex justify-between items-center px-2">
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Discount</span>
                            <span className="text-sm font-black text-red-600 text-right">-{formatCurrency(selectedSale.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center bg-gray-900 dark:bg-indigo-600 p-4 rounded-xl shadow-lg shadow-gray-200 dark:shadow-none translate-x-2">
                          <span className="text-xs font-black text-gray-100 uppercase tracking-[0.2em]">Total Due</span>
                          <span className="text-2xl font-black text-white italic">
                            {selectedSale.isMixed ? (
                              `$${Math.round(selectedSale.amountUSD).toLocaleString('en-US')}`
                            ) : (
                              formatCurrency(selectedSale.totalAmount)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-20 text-center space-y-4">
                      <div className="inline-flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        <p className="text-lg font-black text-gray-900 dark:text-white tracking-tight italic uppercase">Thank you for your business!</p>
                      </div>
                      <div className="pt-8 flex items-center justify-center gap-8 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status: {selectedSale.status}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Authorized Signature ________________</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 border-dashed min-h-[600px] flex flex-col items-center justify-center p-12 text-center group">
              <div className="w-24 h-24 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mb-6 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-all duration-500">
                <FileText className="w-12 h-12 text-gray-300 dark:text-gray-500 group-hover:text-indigo-400 transition-colors" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">No Invoice Selected</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-xs mx-auto">Select an invoice from the list to preview, print or send it to your customer.</p>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Send Invoice</h3>
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={handleShareWhatsApp}
                    className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-2xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-all group"
                  >
                    <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                      <Phone className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="font-black uppercase text-sm tracking-tight">WhatsApp</p>
                      <p className="text-xs font-medium opacity-70">Send directly to customer's WhatsApp</p>
                    </div>
                  </button>

                  <button 
                    onClick={handleCopyInvoice}
                    className="flex items-center gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all group"
                  >
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                      {copied ? <CheckCircle2 className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                    </div>
                    <div className="text-left">
                      <p className="font-black uppercase text-sm tracking-tight">{copied ? 'Copied!' : 'Copy Text'}</p>
                      <p className="text-xs font-medium opacity-70 italic text-indigo-500">Copy invoice summary to clipboard</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => {
                        if (navigator.share) {
                            navigator.share({
                                title: `Invoice from ${business?.name}`,
                                text: `Invoice #${selectedSale?.id.slice(-8).toUpperCase()} for ${selectedSale?.customerName}. Total: ${formatCurrency(selectedSale?.totalAmount || 0)}`,
                            }).catch(console.error);
                        }
                    }}
                    className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group"
                  >
                    <div className="w-12 h-12 bg-gray-900 dark:bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                      <Share2 className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="font-black uppercase text-sm tracking-tight">Other Apps</p>
                      <p className="text-xs font-medium opacity-70">Share using system share sheet</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="w-full py-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm font-black text-gray-900 dark:text-white uppercase tracking-[0.2em] shadow-sm active:scale-[0.98] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Guest Invoice Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-gray-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Create Guest Invoice</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Guest Name</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="Enter guest name..."
                      value={guestData.guestName}
                      onChange={(e) => setGuestData({ ...guestData, guestName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={guestData.paymentMethod}
                      onChange={(e) => setGuestData({ ...guestData, paymentMethod: e.target.value as any })}
                    >
                      <option value="cash">Cash/Transfer</option>
                      <option value="credit">On Credit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Currency</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={guestData.currency}
                      onChange={(e) => setGuestData({ ...guestData, currency: e.target.value as any })}
                    >
                      <option value="USD">USD</option>
                      <option value="SSP">RTGS/SSP</option>
                    </select>
                  </div>
                </div>

                {/* Item Search */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Add Items</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                    {productSearch && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-700 rounded-xl shadow-xl border border-gray-100 dark:border-gray-600 z-[110] max-h-48 overflow-y-auto">
                        {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                          <button 
                            key={p.id}
                            onClick={() => addItemToGuest(p)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center justify-between border-b last:border-b-0 border-gray-100 dark:border-gray-600"
                          >
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{p.name}</p>
                              <p className="text-[10px] text-gray-400">{formatCurrency(p.price)} • Stock: {p.stockQuantity}</p>
                            </div>
                            <Plus className="w-4 h-4 text-indigo-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Items */}
                <div className="space-y-3">
                   {guestData.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-xl">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{formatCurrency(item.priceAtSale)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            const newItems = [...guestData.items];
                            if (newItems[index].quantity > 1) {
                              newItems[index].quantity -= 1;
                              setGuestData({ ...guestData, items: newItems });
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-600"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-sm text-gray-900 dark:text-white">{item.quantity}</span>
                        <button 
                          onClick={() => {
                            const newItems = [...guestData.items];
                            newItems[index].quantity += 1;
                            setGuestData({ ...guestData, items: newItems });
                          }}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-600"
                        >
                          +
                        </button>
                      </div>
                      <button 
                        onClick={() => {
                          const newItems = guestData.items.filter((_, i) => i !== index);
                          setGuestData({ ...guestData, items: newItems });
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {guestData.items.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-2xl">
                      <p className="text-xs text-gray-400 font-medium">No items added yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-4">
                <div className="flex flex-col justify-center">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Invoice Amount</p>
                   <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 italic">
                    {formatCurrency(guestData.items.reduce((sum, i) => sum + (i.priceAtSale * i.quantity), 0) - guestData.discount)}
                   </p>
                </div>
                <button 
                  onClick={handleCreateGuestInvoice}
                  disabled={isSaving || !guestData.guestName || guestData.items.length === 0}
                  className="py-4 bg-gray-900 dark:bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-[0.2em] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <Clock className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Invoice
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-invoice, #printable-invoice * {
            visibility: visible;
          }
          #printable-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .lg\\:col-span-1, .lg\\:col-span-2 > div > div:first-child {
            display: none !important;
          }
           @page {
            margin: 2cm;
          }
        }

        /* Fix for html2canvas oklch error */
        #printable-invoice {
          --tw-bg-opacity: 1 !important;
          background-color: #ffffff !important;
          color: #111827 !important;
        }
        #printable-invoice .text-indigo-600 { color: #4f46e5 !important; }
        #printable-invoice .bg-indigo-600 { background-color: #4f46e5 !important; }
        #printable-invoice .text-gray-900 { color: #111827 !important; }
        #printable-invoice .text-gray-500 { color: #6b7280 !important; }
        #printable-invoice .text-gray-400 { color: #9ca3af !important; }
        #printable-invoice .border-gray-100 { border-color: #f3f4f6 !important; }
        #printable-invoice .bg-gray-900 { background-color: #111827 !important; }
        #printable-invoice .bg-gray-50 { background-color: #f9fafb !important; }
      `}</style>
    </div>
  );
}
