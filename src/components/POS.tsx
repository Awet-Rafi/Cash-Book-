import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, query, where, doc, serverTimestamp, increment, orderBy, writeBatch, getDoc, updateDoc, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, SaleItem, Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Search, ShoppingCart, Plus, Minus, Trash2, Receipt, User, CheckCircle2, ChevronDown, AlertCircle, X, FileText, Calendar, ChevronRight, ArrowRight, Edit3 } from 'lucide-react';
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
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [originalTimestamp, setOriginalTimestamp] = useState<any>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkViewport = () => {
      const wide = window.innerWidth >= 1024;
      setIsDesktop(wide);
    };
    
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const [showMobileCustomerModal, setShowMobileCustomerModal] = useState(false);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales/recent');
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
      const state = location.state as { customerId?: string, currency?: 'USD' | 'SSP', editSaleId?: string, returnTo?: string, defaultPaymentMethod?: 'cash' | 'credit' } | null;
      if (state?.defaultPaymentMethod) {
        setPaymentMethod(state.defaultPaymentMethod);
      }
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
      if (state?.returnTo) {
        setReturnTo(state.returnTo);
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
              
              if (saleData.timestamp) {
                const date = saleData.timestamp.toDate ? saleData.timestamp.toDate() : new Date(saleData.timestamp);
                setTransactionDate(date.toISOString().split('T')[0]);
                setOriginalTimestamp(saleData.timestamp);
              }

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

      if (transactionDate) {
        // Use the selected date if provided
        const selectedDate = new Date(transactionDate);
        // Detect if the user changed the date day
        const originalDateString = originalTimestamp ? (originalTimestamp.toDate ? originalTimestamp.toDate() : new Date(originalTimestamp)).toISOString().split('T')[0] : null;
        
        if (editingSaleId && transactionDate === originalDateString && originalTimestamp) {
          // Keep original timestamp if date day hasn't changed
          saleData.timestamp = originalTimestamp;
        } else {
          // Set to current time for the chosen day (or new sale)
          const now = new Date();
          selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
          saleData.timestamp = selectedDate;
        }
      } else if (editingSaleId) {
        saleData.updatedAt = serverTimestamp();
        saleData.timestamp = originalTimestamp;
      } else {
        saleData.timestamp = serverTimestamp();
      }

      // 1. Record/Update Sale
      if (editingSaleId) {
        batch.update(saleRef, saleData);
        
        // 2. Clean up old stock movements to ensure "only one record"
        const oldMovementsQuery = query(collection(db, 'stockMovements'), where('referenceId', '==', editingSaleId));
        const oldMovementsSnapshot = await getDocs(oldMovementsQuery);
        oldMovementsSnapshot.forEach(mDoc => {
          batch.delete(mDoc.ref);
        });
        
        // 3. Restore Stock for original items (Silent restoration, new movements will be logged below)
        for (const item of originalCart) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stockQuantity: increment(item.quantity)
          });
        }
      } else {
        batch.set(saleRef, saleData);
      }
      
      // 4. Update Inventory for new items and log movement (This will be the "one record")
      for (const item of cart) {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stockQuantity: increment(-item.quantity)
        });

        // Use deterministic ID to prevent duplicates for the same sale/product
        const movementRef = doc(db, 'stockMovements', `${saleRef.id}_${item.productId}`);
        batch.set(movementRef, {
          businessId,
          productId: item.productId,
          productName: item.name,
          type: 'sale',
          quantity: -item.quantity,
          timestamp: saleData.timestamp || serverTimestamp(),
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
      
      // Navigate back if requested or if it was an update, otherwise stay on POS (cart is already cleared)
      if (returnTo === 'ledger') {
        navigate('/ledger', { replace: true, state: { customerId } });
      } else if (isUpdate) {
        navigate(-1);
      }
      // Note: setShowReceipt(true) removed as requested to avoid success modal
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
    <div className="h-full flex flex-col lg:flex-row gap-1 lg:gap-1 relative overflow-hidden p-0.5 lg:p-1 bg-gray-50 dark:bg-gray-900/50">
      {/* Product Selection */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300 min-h-0",
        !isDesktop && isCartOpenMobile && "blur-sm pointer-events-none scale-[0.98]"
      )}>
        <div className="relative mb-1.5 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input 
            type="text" 
            autoComplete="off"
            placeholder="Search products..."
            className="w-full pl-8 pr-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm text-[11px] dark:text-white dark:placeholder-gray-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm font-mono">
                <tr className="border-b border-gray-100 dark:border-gray-700 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest h-8">
                  <th className="px-1.5 py-1 w-[55%] sm:w-[30%]">Product</th>
                  <th className="hidden sm:table-cell px-2 py-1 w-[20%]">Category</th>
                  <th className="px-1.5 py-1 text-right w-[18%] sm:w-[20%]">Price</th>
                  <th className="px-1.5 py-1 text-center w-[13%] sm:w-[15%]">Stock</th>
                  <th className="px-1.5 py-1 text-right w-[14%] sm:w-[15%]">Add</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={cn(
                      "hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer",
                      product.stockQuantity <= 0 && "opacity-50 grayscale bg-gray-50/50 dark:bg-gray-900/50"
                    )}
                    onClick={() => product.stockQuantity > 0 && addToCart(product)}
                  >
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white text-[13px] whitespace-normal leading-tight">{product.name}</p>
                          <p className="text-[10px] text-gray-400 truncate opacity-70 leading-none">{product.category || 'No Category'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">{product.category}</td>
                    <td className="px-1.5 py-1 text-[13px] font-black text-indigo-600 dark:text-indigo-400 text-right font-mono">
                      {currency === 'USD' ? '$' : ''}
                      {(product.price * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-1.5 py-1 text-center">
                      <span className={cn(
                        "text-[10px] font-black px-1.5 py-0.5 rounded-full inline-block min-w-[16px]",
                        product.stockQuantity <= 5 ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      )}>
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      <button
                        disabled={product.stockQuantity <= 0}
                        onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        className="p-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-all shadow-sm active:scale-90"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                <Search className="w-8 h-8 mb-2" />
                <p className="text-gray-400 font-black text-[12px] uppercase tracking-[0.2em]">No products found</p>
              </div>
            )}
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
              "flex flex-col bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-xl overflow-hidden shrink-0 min-h-0",
              isDesktop 
                ? "w-[380px] h-full rounded-xl" 
                : "fixed inset-x-0 bottom-0 top-[12%] z-50 rounded-t-[24px] border-t-2 border-indigo-500/20"
            )}
          >
            {/* Mobile Grab Handle */}
            {!isDesktop && (
              <button 
                onClick={() => setIsCartOpenMobile(false)}
                className="w-full flex justify-center py-1.5 active:scale-95 transition-transform shrink-0"
              >
                <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
              </button>
            )}

            <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "p-1 rounded-md transition-colors",
                  paymentMethod === 'credit' ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" : "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                )}>
                  <ShoppingCart className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight font-mono leading-none">
                  {editingSaleId ? 'Edit' : 'Cart'}
                </h3>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                    isHistoryOpen 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white dark:bg-gray-700 text-gray-500 border border-gray-100 dark:border-gray-600"
                  )}
                >
                  {isHistoryOpen ? 'Basket' : 'Hist'}
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
                    className="px-1 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-[9px] font-black uppercase tracking-wider hover:bg-red-100"
                  >
                    Cancel
                  </button>
                )}
                {!isHistoryOpen && (
                  <span className="px-1 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-black">
                    {cart.length}
                  </span>
                )}
              </div>
            </div>
            
            <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 space-y-1.5">
              {/* Customer Selection Logic */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    {!isDesktop ? (
                      <button 
                        onClick={() => setShowMobileCustomerModal(true)}
                        className={cn(
                          "w-full h-8 px-2 rounded-md border flex items-center justify-between text-[10px] font-black transition-all",
                          paymentMethod === 'credit' && !selectedCustomer 
                            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-500" 
                            : "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400"
                        )}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="truncate">{selectedCustomer ? selectedCustomer.name : 'Select Account'}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />
                      </button>
                    ) : (
                      <div className="relative" ref={customerDropdownRef}>
                        <button 
                          onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                          className={cn(
                            "w-full h-8 px-2 rounded-md border flex items-center justify-between text-[10px] font-black transition-all",
                            paymentMethod === 'credit' && !selectedCustomer 
                              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-500" 
                              : "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400"
                          )}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{selectedCustomer ? selectedCustomer.name : 'Select Account'}</span>
                          </div>
                          <ChevronDown className={cn("w-3 h-3 transition-transform opacity-40", showCustomerDropdown && "rotate-180")} />
                        </button>
                        <AnimatePresence>
                          {showCustomerDropdown && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar"
                            >
                              <div className="p-1 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                <input 
                                  type="text"
                                  placeholder="Filter..."
                                  className="w-full px-2 py-1 bg-white dark:bg-gray-800 border-none rounded text-[10px] placeholder:text-gray-400"
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              <button onClick={() => { setSelectedCustomer(null); setShowCustomerDropdown(false); }} className="w-full px-3 py-2 text-left text-[10px] font-bold text-gray-400 hover:bg-gray-50">GUEST</button>
                              {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                                <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); }} className="w-full px-3 py-2 text-left text-[10px] font-black uppercase tracking-tight hover:bg-indigo-50 dark:hover:bg-indigo-900/40 border-b last:border-0 dark:border-gray-700 dark:text-white flex justify-between">
                                  <span>{c.name}</span>
                                  {selectedCustomer?.id === c.id && <CheckCircle2 className="w-3 h-3 text-indigo-500" />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                  <div className="w-[120px] relative">
                    <Calendar className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    <input 
                      type="date" 
                      value={transactionDate} 
                      onChange={(e) => setTransactionDate(e.target.value)}
                      className="w-full pl-6 pr-1 h-8 bg-gray-50 dark:bg-gray-900/50 border-none rounded-md text-[9px] font-black focus:ring-1 focus:ring-indigo-500 dark:text-white appearance-none" 
                    />
                  </div>
                </div>

                {!selectedCustomer && (
                  <div className="relative">
                    <Edit3 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Enter Guest Name..." 
                      className="w-full pl-7 pr-2 h-8 bg-gray-50 dark:bg-gray-900/50 border-none rounded-md text-[10px] font-bold focus:ring-1 focus:ring-indigo-500 dark:text-white" 
                      value={guestName} 
                      onChange={(e) => setGuestName(e.target.value)} 
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                  <button onClick={() => setPaymentMethod('cash')} className={cn("flex-1 py-1 px-2 rounded-md text-[10px] font-black transition-all", paymentMethod === 'cash' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400")}>Cash</button>
                  <button onClick={() => { setPaymentMethod('credit'); setCurrency('USD'); }} className={cn("flex-1 py-1 px-2 rounded-md text-[10px] font-black transition-all", paymentMethod === 'credit' ? "bg-white dark:bg-gray-800 text-amber-600 shadow-sm" : "text-gray-400")}>Credit Debt</button>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                  <button onClick={() => { setCurrency('USD'); setIsMixedPayment(false); }} className={cn("flex-1 py-1 px-2 rounded-md text-[10px] font-black transition-all", (currency === 'USD' && !isMixedPayment) ? "bg-white dark:bg-gray-800 text-green-600 shadow-sm" : "text-gray-400")}>USD</button>
                  <button onClick={() => { setCurrency('SSP'); setIsMixedPayment(false); }} disabled={paymentMethod === 'credit'} className={cn("flex-1 py-1 px-2 rounded-md text-[10px] font-black transition-all", (currency === 'SSP' && !isMixedPayment) ? "bg-white dark:bg-gray-800 text-green-600 shadow-sm" : "text-gray-400")}>SSP</button>
                </div>
              </div>

              {paymentMethod === 'cash' && (
                <button
                  onClick={() => setIsMixedPayment(!isMixedPayment)}
                  className={cn(
                    "w-full py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-1",
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
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block">USD Part</label>
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
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-bold dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block">SSP Part</label>
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
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-bold dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(currency === 'SSP' || isMixedPayment) && (
                <div className="relative">
                  <label className="text-[12px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Exchange Rate</label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-xs font-black focus:ring-1 focus:ring-green-500 transition-all dark:text-white"
                  />
                  <span className="absolute right-4 top-[32px] text-[12px] font-black text-gray-400">SSP</span>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-2 lg:px-3 py-1.5 space-y-1 custom-scrollbar">
                {isHistoryOpen ? (
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 mb-1">Recent Sales</h4>
                    {recentSales.map((sale) => (
                      <div key={sale.id} className="p-1 px-1.5 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-bold truncate dark:text-white">{sale.customerName}</p>
                          <p className="text-[10px] text-gray-400 font-mono tracking-tighter capitalize leading-none">{sale.paymentMethod} • {new Date(sale.timestamp?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-black text-indigo-600 dark:text-indigo-400 font-mono">
                            ${Math.round(sale.totalAmount).toLocaleString()}
                          </p>
                          <button onClick={() => { setLastSale(sale); setShowReceipt(true); }} className="p-1 text-gray-300 hover:text-indigo-500 transition-colors bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 shadow-sm"><Receipt className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                    {recentSales.length === 0 && <p className="text-[10px] text-gray-400 text-center py-4 uppercase font-black tracking-widest">No Sales</p>}
                  </div>
                ) : cart.length > 0 ? (
                  cart.map((item) => (
                    <div key={item.productId} className="flex items-center gap-2 bg-gray-50/50 dark:bg-gray-900/30 p-2 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
                       <div className="flex-1 min-w-0">
                         <p className="text-[13px] font-bold dark:text-white whitespace-normal leading-tight">{item.name}</p>
                         <p className="text-[11px] text-gray-400 font-mono font-medium">{Math.round(item.priceAtSale * rate).toLocaleString()} {currency}</p>
                       </div>
                       <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded-lg p-1 border border-gray-100 dark:border-gray-600 shrink-0 shadow-sm">
                         <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.productId, -1); }} className="p-1 px-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"><Minus className="w-3.5 h-3.5" /></button>
                         <input 
                           type="number" 
                           min="1"
                           value={item.quantity} 
                           onChange={(e) => setQuantity(item.productId, e.target.value)}
                           className="text-[13px] font-black w-8 text-center dark:text-white bg-transparent border-none focus:ring-0 p-0" 
                           onClick={(e) => e.stopPropagation()}
                         />
                         <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.productId, 1); }} className="p-1 px-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400"><Plus className="w-3.5 h-3.5" /></button>
                       </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.productId); }} className="text-gray-300 hover:text-red-500 p-1 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 py-8"><ShoppingCart className="w-8 h-8 mb-1" /><p className="text-[10px] font-bold uppercase tracking-widest text-center">Empty</p></div>
                )}
              </div>
            </div>

            <div className="p-2 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-700 space-y-1.5 shrink-0 shadow-[0_-8px_20px_rgba(0,0,0,0.05)] sticky bottom-0 z-10">
              {isAdmin && todayStats && (
                <div className="grid grid-cols-2 gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-inner mb-0.5">
                  <div className="text-center border-r border-gray-100 dark:border-gray-700">
                    <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-tighter">Business USD</p>
                    <p className="text-[12px] font-black text-green-600 dark:text-green-400 font-mono">${Math.round(todayStats.usd).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-tighter">Business SSP</p>
                    <p className="text-[12px] font-black text-indigo-600 dark:text-indigo-400 font-mono">{Math.round(todayStats.ssp).toLocaleString()}</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="p-1.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-1.5 text-red-600 dark:text-red-400 text-[11px] font-bold">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}
              <div className="space-y-0.5 bg-white dark:bg-gray-800/50 p-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium items-center">
                  <span>Subtotal</span>
                  <span className="dark:text-gray-200 font-mono font-bold tracking-tight">
                    {currency === 'USD' ? '$' : ''}
                    {Math.round(subtotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-red-500 font-bold">
                  <span className="text-[8.5px] font-black text-gray-400 uppercase tracking-widest leading-none">Disc</span>
                  <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded h-5 px-1">
                    <span className="text-[8.5px] font-black text-gray-400">{currency === 'USD' ? '$' : 'SSP'}</span>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      className="w-10 bg-transparent border-none focus:ring-0 p-0 text-right font-black text-[12px] dark:text-white" 
                      value={discount || ''} 
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} 
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1 mt-0.5 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "inline-block px-1 py-0.5 rounded-[3px] text-[7.5px] font-black uppercase tracking-widest leading-none",
                      paymentMethod === 'credit' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    )}>
                      {paymentMethod === 'credit' ? 'Debt' : 'Cash'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-indigo-600 dark:text-indigo-400 block font-mono leading-none tracking-tighter">
                      {isMixedPayment ? (
                        `$${Math.round(((parseFloat(mixedUSD) || 0) + (parseFloat(mixedSSP) || 0) / exchangeRate)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      ) : (
                        `${currency === 'USD' ? '$' : ''}${Math.round(totalAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}${currency === 'SSP' ? ' SSP' : ''}`
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                disabled={cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer)}
                onClick={handleCheckout}
                className={cn(
                  "w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-1.5 mt-auto shadow-md shadow-indigo-100 dark:shadow-none h-8",
                  (cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer))
                    ? "opacity-50 grayscale cursor-not-allowed shadow-none"
                    : paymentMethod === 'credit' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100" : ""
                )}
              >
                {isProcessing ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{editingSaleId ? 'Update' : 'Confirm Sale'}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Customer Selector Modal */}
      <AnimatePresence>
        {showMobileCustomerModal && (
          <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
            <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-b dark:border-gray-800 shrink-0 h-14">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowMobileCustomerModal(false)} className="p-1 -ml-1 text-gray-500">
                  <X className="w-6 h-6" />
                </button>
                <p className="font-black text-sm uppercase dark:text-white tracking-widest leading-none">Select Client</p>
              </div>
              <button 
                onClick={() => {
                  setShowMobileCustomerModal(false);
                  setIsCartOpenMobile(false);
                  navigate('/ledger');
                }}
                className="text-[10px] font-black text-indigo-500 uppercase tracking-widest h-8 flex items-center px-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg"
              >
                Add New
              </button>
            </div>

            <div className="p-4 bg-white dark:bg-gray-900 border-b dark:border-gray-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Filter accounts..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-950 border-none rounded-xl text-sm font-bold focus:ring-0 placeholder:text-gray-400 dark:text-white"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setGuestName('Guest');
                  setPaymentMethod('cash');
                  setShowMobileCustomerModal(false);
                }}
                className="w-full p-4 bg-white dark:bg-gray-900 rounded-2xl flex items-center gap-4 border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-black text-sm uppercase dark:text-white tracking-tight">Guest Checkout</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Single transaction only</p>
                </div>
              </button>

              <div className="pt-2 pb-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] pl-2">Registered Accounts</p>
              </div>

              {customers
                .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                .map(customer => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setPaymentMethod('credit');
                    setShowMobileCustomerModal(false);
                    setGuestName('');
                  }}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between border active:scale-[0.98] transition-all text-left",
                    selectedCustomer?.id === customer.id
                      ? "bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none"
                      : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-black transition-colors",
                      selectedCustomer?.id === customer.id ? "bg-white text-indigo-600" : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 border dark:border-transparent"
                    )}>
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={cn("font-black text-sm uppercase tracking-tight", selectedCustomer?.id === customer.id ? "text-white" : "dark:text-white")}>{customer.name}</p>
                      <p className={cn("text-[10px] font-bold uppercase font-mono", selectedCustomer?.id === customer.id ? "text-indigo-100" : "text-gray-400")}>Balance: ${Math.round(customer.totalOwed || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {selectedCustomer?.id === customer.id && <CheckCircle2 className="w-5 h-5 text-white" />}
                </button>
              ))}
            </div>
          </div>
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
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-indigo-600 animate-pulse">
            {cart.length}
          </span>
        </div>
        <div>
          <p className="text-[12px] font-black uppercase tracking-widest opacity-70">Review Order</p>
          <p className="font-black text-sm">
            {cart.length === 1 ? '1 Item' : `${cart.length} Items`} Selected
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[12px] font-black uppercase tracking-widest opacity-70">Total Amount</p>
        <p className="text-lg font-black">
          {isMixedPayment ? (
            `$${Math.round(((parseFloat(mixedUSD) || 0) + (parseFloat(mixedSSP) || 0) / exchangeRate)).toLocaleString('en-US')}`
          ) : (
            `${currency === 'USD' ? '$' : ''}${Math.round(totalAmount).toLocaleString('en-US')} ${currency === 'SSP' ? 'SSP' : ''}`
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
                    <span className="font-medium text-gray-700 whitespace-normal leading-tight flex-1">{item.name}</span>
                    <span className="font-bold text-gray-900">
                      {item.quantity} x {lastSale.currency === 'USD' ? '$' : ''}
                      {Math.round((item.priceAtSale * (lastSale.exchangeRate || 1))).toLocaleString('en-US')}
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
                    {Math.round(lastSale.subtotal).toLocaleString('en-US')}
                    {lastSale.currency === 'SSP' ? ' SSP' : ''}
                  </span>
                </div>
                {lastSale.exchangeRate && (
                  <div className="flex justify-between text-[12px] text-gray-400 font-bold uppercase tracking-widest">
                    <span>Rate</span>
                    <span>1 USD = {lastSale.exchangeRate} SSP</span>
                  </div>
                )}
                {lastSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Discount</span>
                    <span className="font-bold">
                      -{lastSale.currency === 'USD' ? '$' : ''}
                      {Math.round(lastSale.discount).toLocaleString('en-US')}
                      {lastSale.currency === 'SSP' ? ' SSP' : ''}
                    </span>
                  </div>
                )}
                  <div className="flex justify-between text-lg font-black pt-3 border-t border-gray-100 mt-2">
                    <span className="text-gray-900">{lastSale.paymentMethod === 'credit' ? 'Total Credit' : 'Total Paid'}</span>
                    <div className="text-right leading-none">
                      <span className={cn(
                        "block text-xl font-black",
                        lastSale.paymentMethod === 'credit' ? "text-amber-600" : "text-indigo-600"
                      )}>
                        {lastSale.isMixed ? (
                          `$${Math.round((lastSale.amountUSD + (lastSale.amountSSP / (lastSale.exchangeRate || 1000)))).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        ) : (
                          `${lastSale.currency === 'USD' ? '$' : ''}${Math.round(lastSale.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${lastSale.currency === 'SSP' ? 'SSP' : ''}`
                        )}
                      </span>
                      {lastSale.isMixed && (
                        <div className="flex flex-col items-end mt-1 text-[11px] font-black text-gray-400 uppercase tracking-tighter">
                          <span>${Math.round(lastSale.amountUSD).toLocaleString(undefined, { maximumFractionDigits: 0 })} Cash</span>
                          <span>{Math.round(lastSale.amountSSP).toLocaleString()} SSP Cash</span>
                        </div>
                      )}
                      {lastSale.paymentMethod === 'credit' && (
                        <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest block mt-1">Pending Payment</span>
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
