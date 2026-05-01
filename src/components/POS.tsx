import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, serverTimestamp, increment, orderBy, writeBatch, getDoc, updateDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, SaleItem, Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Search, ShoppingCart, Plus, Minus, Trash2, Receipt, User, CheckCircle2, ChevronDown, AlertCircle, X, FileText } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function POS() {
  const { isAdmin, businessId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [guestName, setGuestName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [currency, setCurrency] = useState<'USD' | 'SSP'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [discount, setDiscount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [originalCart, setOriginalCart] = useState<SaleItem[]>([]);
  const [isMixedPayment, setIsMixedPayment] = useState(false);
  const [mixedUSD, setMixedUSD] = useState<string>('');
  const [mixedSSP, setMixedSSP] = useState<string>('');
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    const checkDesktop = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    if (!businessId) return;

    const qRecent = query(
      collection(db, 'sales'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubRecent = onSnapshot(qRecent, (snapshot) => {
      setRecentSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qProducts = query(collection(db, 'products'), where('businessId', '==', businessId));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const qCustomers = query(collection(db, 'customers'), where('businessId', '==', businessId), orderBy('name', 'asc'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersList);
      
      // Check for pre-selected customer and currency from navigation state
      const state = location.state as { customerId?: string, currency?: 'USD' | 'SSP', editSaleId?: string } | null;
      if (state?.customerId) {
        const customer = customersList.find(c => c.id === state.customerId);
        if (customer) {
          setSelectedCustomer(customer);
          setPaymentMethod('credit'); // Default to credit if coming from Credit Book
        }
      }
      if (state?.currency) {
        setCurrency(state.currency);
      }

      // Handle Edit Mode
      if (state?.editSaleId && !editingSaleId) {
        const loadSale = async () => {
          try {
            const saleDoc = await getDoc(doc(db, 'sales', state.editSaleId!));
            if (saleDoc.exists()) {
              const saleData = saleDoc.data();
              setEditingSaleId(state.editSaleId!);
              setCart(saleData.items || []);
              setOriginalCart(saleData.items || []);
              setPaymentMethod(saleData.paymentMethod || 'cash');
              setCurrency(saleData.currency || 'USD');
              setDiscount(saleData.discount || 0);
              if (saleData.exchangeRate) setExchangeRate(saleData.exchangeRate);
              
              if (saleData.customerId) {
                const customer = customersList.find(c => c.id === saleData.customerId);
                if (customer) setSelectedCustomer(customer);
              } else {
                setGuestName(saleData.customerName || '');
              }
              
              // Clear state to avoid re-loading on every render
              navigate(location.pathname, { replace: true, state: {} });
            }
          } catch (err) {
            console.error("Error loading sale for edit:", err);
            setError("Failed to load sale for editing.");
          }
        };
        loadSale();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubRecent();
    };
  }, [businessId]);

  const todayStats = useMemo(() => {
    if (!isAdmin) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return recentSales.reduce((acc, sale) => {
      const saleDate = sale.timestamp?.toDate() || new Date();
      if (saleDate < today) return acc;

      if (sale.currency === 'SSP') {
        acc.ssp += sale.totalAmount;
      } else {
        acc.usd += sale.totalAmount;
      }
      return acc;
    }, { usd: 0, ssp: 0 });
  }, [recentSales, isAdmin]);

  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) return prev;
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        quantity: 1,
        priceAtSale: product.price,
        costAtSale: product.costPrice
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.id === productId);
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (product && newQty > product.stockQuantity) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setQuantity = (productId: string, value: string) => {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 0) return;
    
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.id === productId);
        if (product && qty > product.stockQuantity) {
          return { ...item, quantity: product.stockQuantity };
        }
        return { ...item, quantity: qty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const { baseSubtotal, baseTotalCost, subtotal, totalAmount, totalCost, profit, rate } = useMemo(() => {
    const baseSubtotal = cart.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
    const baseTotalCost = cart.reduce((acc, item) => acc + (item.costAtSale * item.quantity), 0);
    
    const rate = currency === 'SSP' ? exchangeRate : 1;
    
    const subtotal = baseSubtotal * rate;
    const totalAmount = Math.max(0, subtotal - discount);
    const totalCost = baseTotalCost * rate;
    const profit = totalAmount - totalCost;

    return { baseSubtotal, baseTotalCost, subtotal, totalAmount, totalCost, profit, rate };
  }, [cart, currency, exchangeRate, discount]);

  // Mixed Payment Logic
  useEffect(() => {
    if (!isMixedPayment) {
      setMixedUSD('');
      setMixedSSP('');
    } else {
      // Initialize with half and half or similar if empty
      if (!mixedUSD && !mixedSSP) {
        const halfUSD = totalAmount / (currency === 'SSP' ? exchangeRate : 1) / 2;
        setMixedUSD(halfUSD.toFixed(2));
        const remainingUSD = (totalAmount / (currency === 'SSP' ? exchangeRate : 1)) - halfUSD;
        setMixedSSP((remainingUSD * (currency === 'SSP' ? 1 : exchangeRate)).toFixed(0));
      }
    }
  }, [isMixedPayment, totalAmount]);

  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return;
    
    if (paymentMethod === 'credit' && !selectedCustomer) {
      setError('Please select a registered customer for credit sales.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const batch = writeBatch(db);
      const saleRef = editingSaleId ? doc(db, 'sales', editingSaleId) : doc(collection(db, 'sales'));
      
      const usdPart = isMixedPayment ? (parseFloat(mixedUSD) || 0) : (currency === 'USD' ? totalAmount : 0);
      const sspPart = isMixedPayment ? (parseFloat(mixedSSP) || 0) : (currency === 'SSP' ? totalAmount : 0);

      const saleData: any = {
        businessId,
        items: cart,
        subtotal: paymentMethod === 'credit' ? baseSubtotal : subtotal,
        discount: paymentMethod === 'credit' ? discount / (currency === 'SSP' ? exchangeRate : 1) : discount,
        totalAmount: paymentMethod === 'credit' 
          ? Math.max(0, baseSubtotal - (discount / (currency === 'SSP' ? exchangeRate : 1))) 
          : (isMixedPayment ? usdPart + (sspPart / exchangeRate) : totalAmount),
        totalCost: paymentMethod === 'credit' ? baseTotalCost : totalCost,
        profit: paymentMethod === 'credit' 
          ? Math.max(-baseTotalCost, (baseSubtotal - (discount / (currency === 'SSP' ? exchangeRate : 1))) - baseTotalCost) 
          : (isMixedPayment ? (usdPart + (sspPart / exchangeRate)) - totalCost : profit),
        customerName: selectedCustomer ? selectedCustomer.name : (guestName || 'Guest'),
        customerId: selectedCustomer?.id || null,
        paymentMethod,
        currency: (paymentMethod === 'credit' || isMixedPayment) ? 'USD' : currency,
        amountUSD: usdPart,
        amountSSP: sspPart,
        isMixed: isMixedPayment,
        exchangeRate: (paymentMethod === 'credit' || (currency === 'USD' && !isMixedPayment)) ? null : exchangeRate,
        status: paymentMethod === 'cash' ? 'paid' : 'pending'
      };

      if (editingSaleId) {
        saleData.updatedAt = serverTimestamp();
      } else {
        saleData.timestamp = serverTimestamp();
      }

      // 1. Record/Update Sale
      if (editingSaleId) {
        batch.update(saleRef, saleData);
        
        // 2. Restore Stock for original items and log movement
        for (const item of originalCart) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stockQuantity: increment(item.quantity)
          });

          const movementRef = doc(collection(db, 'stockMovements'));
          batch.set(movementRef, {
            businessId,
            productId: item.productId,
            productName: item.name,
            type: 'edit_sale',
            quantity: item.quantity,
            timestamp: serverTimestamp(),
            notes: `Restored stock from edited sale ${editingSaleId}`,
            referenceId: editingSaleId
          });
        }
      } else {
        batch.set(saleRef, saleData);
      }
      
      // 3. Update Inventory for new items and log movement
      for (const item of cart) {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stockQuantity: increment(-item.quantity)
        });

        const movementRef = doc(collection(db, 'stockMovements'));
        batch.set(movementRef, {
          businessId,
          productId: item.productId,
          productName: item.name,
          type: 'sale',
          quantity: -item.quantity,
          timestamp: serverTimestamp(),
          notes: editingSaleId ? `Updated quantity in sale ${editingSaleId}` : `Sold in transaction ${saleRef.id}`,
          referenceId: saleRef.id,
          customerName: selectedCustomer ? selectedCustomer.name : (guestName || 'Guest'),
          paymentMethod,
          amount: item.priceAtSale * item.quantity,
          currency: currency
        });
      }

      await batch.commit();

      // Update customer document's updatedAt to reflect activity if a customer was selected
      if (selectedCustomer?.id) {
        try {
          await updateDoc(doc(db, 'customers', selectedCustomer.id), {
            updatedAt: serverTimestamp()
          });
        } catch (updateError) {
          console.error("Error updating customer updatedAt:", updateError);
          // Don't fail the sale if only the customer update fails
        }
      }

      const customerId = selectedCustomer?.id;
      const isUpdate = !!editingSaleId;

      setLastSale({ ...saleData, id: saleRef.id, timestamp: new Date() });
      setCart([]);
      setDiscount(0);
      setSelectedCustomer(null);
      setGuestName('');
      setEditingSaleId(null);
      setOriginalCart([]);
      
      if (isUpdate) {
        // Automatically return to customer list if it was an update
        navigate('/', { replace: true });
      } else {
        setShowReceipt(true);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError('Failed to complete the order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 lg:gap-6 relative overflow-hidden">
      {/* Product Selection */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300 h-full",
        !isDesktop && isCartOpenMobile && "blur-sm pointer-events-none scale-[0.98]"
      )}>
        <div className="relative mb-2 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input 
            type="text" 
            autoComplete="off"
            placeholder="Search products..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm text-[13px] dark:text-white dark:placeholder-gray-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden h-full">
            <div className="overflow-x-auto h-full">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm">
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 lg:px-4 py-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Product</th>
                    <th className="hidden sm:table-cell px-3 lg:px-4 py-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Category</th>
                    <th className="px-3 lg:px-4 py-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Price</th>
                    <th className="px-3 lg:px-4 py-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Stock</th>
                    <th className="px-3 lg:px-4 py-1.5 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {filteredProducts.map((product) => (
                    <tr 
                      key={product.id} 
                      className={cn(
                        "hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors group animate-in fade-in duration-200",
                        product.stockQuantity <= 0 && "opacity-50 grayscale bg-gray-50/50 dark:bg-gray-900/50"
                      )}
                    >
                      <td className="px-3 lg:px-4 py-1 lg:py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex w-6 h-6 bg-gray-50 dark:bg-gray-700 rounded-lg items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/40 transition-colors">
                            <ShoppingCart className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-indigo-400" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-[11px] lg:text-xs truncate max-w-[120px] lg:max-w-[180px]">{product.name}</p>
                            <p className="sm:hidden text-[8px] text-gray-400 truncate">{product.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-3 lg:px-4 py-1 lg:py-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">{product.category}</td>
                      <td className="px-3 lg:px-4 py-1 lg:py-1.5 text-[11px] font-black text-indigo-600 dark:text-indigo-400 text-right font-mono">
                        {currency === 'USD' ? '$' : ''}
                        {(product.price * rate).toLocaleString('en-US', { minimumFractionDigits: currency === 'USD' ? 2 : 0 })}
                        {currency === 'SSP' ? ' SSP' : ''}
                      </td>
                      <td className="px-3 lg:px-4 py-1 lg:py-1.5 text-center">
                        <span className={cn(
                          "text-[8px] font-black px-1.5 py-0 rounded-full inline-block min-w-[20px]",
                          product.stockQuantity <= 5 ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        )}>
                          {product.stockQuantity}
                        </span>
                      </td>
                      <td className="px-3 lg:px-4 py-1 lg:py-1.5 text-right">
                        <button
                          disabled={product.stockQuantity <= 0}
                          onClick={() => addToCart(product)}
                          className="p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-all shadow-sm active:scale-90"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredProducts.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-400 font-medium text-sm">No products found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cart / Checkout Sidebar */}
      <AnimatePresence>
        {(isDesktop || isCartOpenMobile) && (
          <motion.div 
            initial={isDesktop ? { x: 20, opacity: 0 } : { y: '100%' }}
            animate={isDesktop ? { x: 0, opacity: 1 } : { y: 0 }}
            exit={isDesktop ? { x: 20, opacity: 0 } : { y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={cn(
              "flex flex-col bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-xl overflow-hidden shrink-0",
              isDesktop 
                ? "w-[400px] h-full rounded-3xl" 
                : "fixed inset-x-0 bottom-0 top-[10%] z-50 rounded-t-[32px] border-t-2 border-indigo-500/20"
            )}
          >
            {/* Mobile Grab Handle */}
            {!isDesktop && (
              <div className="w-full flex justify-center py-3">
                <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
              </div>
            )}

            <div className="p-2 lg:px-4 lg:py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg">
                  <ShoppingCart className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-tight font-mono">
                  {editingSaleId ? 'Edit Order' : 'Current Order'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all",
                    isHistoryOpen 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                  )}
                >
                  {isHistoryOpen ? 'Current Cart' : 'History'}
                </button>
                {editingSaleId && (
                  <button 
                    onClick={() => {
                      setEditingSaleId(null);
                      setCart([]);
                      setOriginalCart([]);
                      setSelectedCustomer(null);
                      setGuestName('');
                      setDiscount(0);
                    }}
                    className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[8px] font-black uppercase tracking-wider hover:bg-red-100 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {!isHistoryOpen && (
                  <span className="px-1.5 py-0 bg-indigo-600 text-white rounded-full text-[9px] font-black">
                    {cart.length}
                  </span>
                )}
                {!isDesktop && (
                  <button 
                    onClick={() => setIsCartOpenMobile(false)}
                    className="p-1 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="px-2 lg:px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 space-y-1">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="relative">
                  <button 
                    onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                    className="w-full flex items-center justify-between pl-7 pr-1.5 py-1 bg-gray-50 dark:bg-gray-900/50 border-none rounded-lg text-[9px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-left dark:text-white"
                  >
                    <User className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400" />
                    <span className={cn("truncate", selectedCustomer ? "text-gray-900 dark:text-white" : "text-gray-400")}>
                      {selectedCustomer ? selectedCustomer.name : 'Guest'}
                    </span>
                    <ChevronDown className={cn("w-2 h-2 text-gray-400 transition-transform", showCustomerDropdown && "rotate-180")} />
                  </button>
                  <AnimatePresence>
                    {showCustomerDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowCustomerDropdown(false)} />
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-2xl z-50 max-h-32 overflow-y-auto">
                          <button onClick={() => { setSelectedCustomer(null); setShowCustomerDropdown(false); }} className="w-full px-3 py-1 text-left text-[9px] hover:bg-gray-50 border-b font-black text-gray-400 uppercase">Guest</button>
                          {customers.map(customer => (
                            <button key={customer.id} onClick={() => { setSelectedCustomer(customer); setShowCustomerDropdown(false); }} className="w-full px-3 py-1 text-left text-[10px] font-bold hover:bg-indigo-50 border-b">{customer.name}</button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                {!selectedCustomer && (
                  <div className="relative">
                    <User className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400" />
                    <input type="text" placeholder="Guest" className="w-full pl-7 pr-1.5 py-1 bg-gray-50 dark:bg-gray-900/50 border-none rounded-lg text-[9px] font-bold focus:ring-1 dark:text-white" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex border dark:border-gray-700 rounded overflow-hidden">
                  <button onClick={() => setPaymentMethod('cash')} className={cn("flex-1 py-0.5 text-[8px] font-black", paymentMethod === 'cash' ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 text-gray-400")}>Cash</button>
                  <button onClick={() => { setPaymentMethod('credit'); setCurrency('USD'); }} className={cn("flex-1 py-0.5 text-[8px] font-black", paymentMethod === 'credit' ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 text-gray-400")}>Credit</button>
                </div>
                <div className="flex border dark:border-gray-700 rounded overflow-hidden">
                  <button onClick={() => { setCurrency('USD'); setIsMixedPayment(false); }} className={cn("flex-1 py-0.5 text-[8px] font-black", (currency === 'USD' && !isMixedPayment) ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 text-gray-400")}>USD</button>
                  <button onClick={() => { setCurrency('SSP'); setIsMixedPayment(false); }} disabled={paymentMethod === 'credit'} className={cn("flex-1 py-0.5 text-[8px] font-black", (currency === 'SSP' && !isMixedPayment) ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 text-gray-400", paymentMethod === 'credit' && "opacity-50")}>SSP</button>
                </div>
              </div>

              {paymentMethod === 'cash' && (
                <button
                  onClick={() => setIsMixedPayment(!isMixedPayment)}
                  className={cn(
                    "w-full py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-1",
                    isMixedPayment
                      ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                      : "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-700 text-gray-400"
                  )}
                >
                  Mixed Payment
                </button>
              )}

              {isMixedPayment && (
                <div className="space-y-1.5 p-1.5 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/20">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-0.5">
                      <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">USD Part</label>
                      <input
                        type="number"
                        value={mixedUSD}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMixedUSD(val);
                          const usdVal = parseFloat(val) || 0;
                          const totalInUSD = totalAmount / (currency === 'SSP' ? exchangeRate : 1);
                          const remainingUSD = totalInUSD - usdVal;
                          setMixedSSP((remainingUSD * exchangeRate).toFixed(0));
                        }}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs font-bold dark:text-white"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">SSP Part</label>
                      <input
                        type="number"
                        value={mixedSSP}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMixedSSP(val);
                          const sspVal = parseFloat(val) || 0;
                          const totalInSSP = totalAmount * (currency === 'USD' ? exchangeRate : 1);
                          const remainingSSP = totalInSSP - sspVal;
                          setMixedUSD((remainingSSP / exchangeRate).toFixed(2));
                        }}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs font-bold dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(currency === 'SSP' || isMixedPayment) && (
                <div className="relative">
                  <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5 block">Exchange Rate</label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-1 text-[11px] font-black focus:ring-1 focus:ring-green-500 transition-all dark:text-white"
                  />
                  <span className="absolute right-3 top-[16px] text-[7px] font-black text-gray-400">SSP</span>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800">
              <div className="flex-1 overflow-y-auto p-2 lg:px-4 py-1.5 space-y-1 custom-scrollbar">
                {isHistoryOpen ? (
                  <div className="space-y-1">
                    <h4 className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 mb-2">Recent Sales History</h4>
                    {recentSales.map((sale) => (
                      <div key={sale.id} className="p-1.5 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold truncate dark:text-white">{sale.customerName}</p>
                          <p className="text-[7px] text-gray-400 font-mono tracking-tighter capitalize">{sale.paymentMethod} • {new Date(sale.timestamp?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 font-mono">
                            {sale.currency === 'USD' ? '$' : ''}{sale.totalAmount.toLocaleString()}
                          </p>
                          <button onClick={() => { setLastSale(sale); setShowReceipt(true); }} className="p-1 text-gray-300 hover:text-indigo-500 transition-colors"><Receipt className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                    {recentSales.length === 0 && <p className="text-[8px] text-gray-400 text-center py-8 uppercase font-black tracking-widest">No Recent Sales</p>}
                  </div>
                ) : cart.length > 0 ? (
                  cart.map((item) => (
                    <div key={item.productId} className="flex items-center gap-1.5 bg-gray-50/50 dark:bg-gray-900/30 p-1 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold dark:text-white truncate">{item.name}</p>
                        <p className="text-[8px] text-gray-400 font-mono">{(item.priceAtSale * rate).toLocaleString()} {currency}</p>
                      </div>
                      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-700 rounded p-0.5 border border-gray-100 dark:border-gray-600">
                        <button onClick={() => updateQuantity(item.productId, -1)} className="p-0.5 hover:bg-gray-50 dark:hover:bg-gray-500 rounded"><Minus className="w-1.5 h-1.5" /></button>
                        <span className="text-[9px] font-black w-3.5 text-center dark:text-white">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, 1)} className="p-0.5 hover:bg-gray-50 dark:hover:bg-gray-500 rounded"><Plus className="w-1.5 h-1.5" /></button>
                      </div>
                      <button onClick={() => removeFromCart(item.productId)} className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20"><ShoppingCart className="w-4 h-4 mb-1" /><p className="text-[7px] font-bold uppercase tracking-widest text-center">Empty Basket</p></div>
                )}
              </div>
            </div>

            <div className="p-2 lg:p-3 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-700 space-y-1.5 shrink-0">
              {isAdmin && todayStats && (
                <div className="grid grid-cols-2 gap-1 bg-white dark:bg-gray-800 p-1 rounded border border-gray-100 dark:border-gray-700 shadow-inner">
                  <div className="text-center border-r border-gray-100 dark:border-gray-700">
                    <p className="text-[6px] font-black text-gray-400 uppercase tracking-tighter">Total USD</p>
                    <p className="text-[9px] font-black text-green-600 dark:text-green-400 font-mono">${todayStats.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[6px] font-black text-gray-400 uppercase tracking-tighter">Total SSP</p>
                    <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 font-mono">{todayStats.ssp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="p-1.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-1.5 text-red-600 dark:text-red-400 text-[9px] font-bold animate-in fade-in">
                  <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span className="dark:text-gray-200 font-mono font-bold">
                    {currency === 'USD' ? '$' : ''}
                    {subtotal.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[9px] text-red-500">
                  <span>Discount</span>
                  <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 py-0">
                    <span className="text-[7px] font-bold text-gray-400">{currency === 'USD' ? '$' : 'SSP'}</span>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      className="w-10 bg-transparent border-none focus:ring-0 p-0 text-right font-black text-[9px] dark:text-white" 
                      value={discount || ''} 
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} 
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1 mt-0.5 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-tighter">Total</span>
                  <div className="text-right">
                    <span className="text-sm lg:text-base font-black text-indigo-600 dark:text-indigo-400 block font-mono">
                      {isMixedPayment ? (
                        `$${((parseFloat(mixedUSD) || 0) + (parseFloat(mixedSSP) || 0) / exchangeRate).toLocaleString('en-US')}`
                      ) : (
                        `${currency === 'USD' ? '$' : ''}${totalAmount.toLocaleString('en-US')}${currency === 'SSP' ? ' SSP' : ''}`
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                disabled={cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer)}
                onClick={handleCheckout}
                className={cn(
                  "w-full py-1.5 text-white rounded-lg font-black text-[11px] shadow-lg transition-all flex items-center justify-center gap-1.5",
                  (cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer))
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98]"
                )}
              >
                {isProcessing ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {paymentMethod === 'credit' && !selectedCustomer ? 'Select Customer' : (editingSaleId ? 'Update' : 'Check Out')}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

  {/* Mobile Floating Bar */}
  {!isDesktop && !isCartOpenMobile && cart.length > 0 && (
    <motion.button
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      onClick={() => setIsCartOpenMobile(true)}
      className="fixed bottom-6 left-4 right-4 z-40 bg-indigo-600 text-white rounded-2xl p-4 shadow-2xl shadow-indigo-200 dark:shadow-none flex items-center justify-between group active:scale-95 transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <ShoppingCart className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-indigo-600 animate-pulse">
            {cart.length}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Review Order</p>
          <p className="font-black text-sm">
            {cart.length === 1 ? '1 Item' : `${cart.length} Items`} Selected
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Total Amount</p>
        <p className="text-lg font-black">
          {isMixedPayment ? (
            `$${((parseFloat(mixedUSD) || 0) + (parseFloat(mixedSSP) || 0) / exchangeRate).toLocaleString('en-US')}`
          ) : (
            `${currency === 'USD' ? '$' : ''}${totalAmount.toLocaleString('en-US')} ${currency === 'SSP' ? 'SSP' : ''}`
          )}
        </p>
      </div>
    </motion.button>
  )}

  {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 text-center border-b border-dashed border-gray-200">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">Sale Successful!</h3>
              <p className="text-gray-500 text-sm">Receipt #{lastSale.id.slice(-6).toUpperCase()}</p>
            </div>
            <div className="p-8 space-y-4">
              <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                <span>Item</span>
                <span>Qty x Price</span>
              </div>
              <div className="space-y-2">
                {lastSale.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700 truncate max-w-[150px]">{item.name}</span>
                    <span className="font-bold text-gray-900">
                      {item.quantity} x {lastSale.currency === 'USD' ? '$' : ''}
                      {(item.priceAtSale * (lastSale.exchangeRate || 1)).toLocaleString('en-US')}
                      {lastSale.currency === 'SSP' ? ' SSP' : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-dashed border-gray-200 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-bold text-gray-900">{lastSale.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-bold text-gray-900">
                    {lastSale.currency === 'USD' ? '$' : ''}
                    {lastSale.subtotal.toLocaleString('en-US')}
                    {lastSale.currency === 'SSP' ? ' SSP' : ''}
                  </span>
                </div>
                {lastSale.exchangeRate && (
                  <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    <span>Rate</span>
                    <span>1 USD = {lastSale.exchangeRate} SSP</span>
                  </div>
                )}
                {lastSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Discount</span>
                    <span className="font-bold">
                      -{lastSale.currency === 'USD' ? '$' : ''}
                      {lastSale.discount.toLocaleString('en-US')}
                      {lastSale.currency === 'SSP' ? ' SSP' : ''}
                    </span>
                  </div>
                )}
                  <div className="flex justify-between text-lg font-black pt-2 border-t border-gray-100">
                    <span>Total Paid</span>
                    <div className="text-right leading-tight">
                      <span className="text-indigo-600 block">
                        {lastSale.isMixed ? (
                          `$${(lastSale.amountUSD + (lastSale.amountSSP / (lastSale.exchangeRate || 1000))).toLocaleString('en-US')}`
                        ) : (
                          `${lastSale.currency === 'USD' ? '$' : ''}${lastSale.totalAmount.toLocaleString('en-US')} ${lastSale.currency === 'SSP' ? 'SSP' : ''}`
                        )}
                      </span>
                      {lastSale.isMixed && (
                        <div className="flex flex-col items-end mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                          <span>${lastSale.amountUSD.toLocaleString('en-US')} Paid</span>
                          <span>{lastSale.amountSSP.toLocaleString('en-US')} SSP Paid</span>
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 flex flex-col gap-2">
              <button 
                onClick={() => {
                  setShowReceipt(false);
                  navigate('/invoices', { state: { selectedSaleId: lastSale.id } });
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                View & Send Invoice
              </button>
              <button 
                onClick={() => {
                  setShowReceipt(false);
                  navigate('/', { replace: true });
                }}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                Close & Return Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
