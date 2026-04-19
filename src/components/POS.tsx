import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, serverTimestamp, increment, orderBy, writeBatch, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, SaleItem, Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Search, ShoppingCart, Plus, Minus, Trash2, Receipt, User, CheckCircle2, ChevronDown, AlertCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [isProductListExpanded, setIsProductListExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [originalCart, setOriginalCart] = useState<SaleItem[]>([]);
  const [isMixedPayment, setIsMixedPayment] = useState(false);
  const [mixedUSD, setMixedUSD] = useState<string>('');
  const [mixedSSP, setMixedSSP] = useState<string>('');

  useEffect(() => {
    const checkDesktop = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setIsProductListExpanded(true);
        setIsCartExpanded(true);
      }
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    if (!businessId) return;

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
    };
  }, [businessId]);

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
        
        // 2. Restore Stock for original items
        for (const item of originalCart) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stockQuantity: increment(item.quantity)
          });
        }
      } else {
        batch.set(saleRef, saleData);
      }
      
      // 3. Update Inventory for new items
      for (const item of cart) {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stockQuantity: increment(-item.quantity)
        });
      }

      await batch.commit();

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
    <div className="h-full flex flex-col lg:flex-row gap-4 lg:gap-8">
      {/* Product Selection */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            autoComplete="off"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-2 lg:px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="hidden sm:table-cell px-2 lg:px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-2 lg:px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Price</th>
                  <th className="px-2 lg:px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Stock</th>
                  <th className="px-2 lg:px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(isProductListExpanded || isDesktop ? filteredProducts : filteredProducts.slice(0, 4)).map((product) => (
                  <tr 
                    key={product.id} 
                    className={cn(
                      "hover:bg-gray-50/50 transition-colors group animate-in fade-in slide-in-from-left-2 duration-200",
                      product.stockQuantity <= 0 && "opacity-50 grayscale bg-gray-50/50"
                    )}
                  >
                    <td className="px-2 lg:px-6 py-2 lg:py-3">
                      <div className="flex items-center gap-2">
                        <div className="hidden sm:flex w-8 h-8 bg-gray-50 rounded-lg items-center justify-center group-hover:bg-indigo-50 transition-colors">
                          <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-xs lg:text-sm truncate max-w-[80px] sm:max-w-none">{product.name}</p>
                          <p className="sm:hidden text-[10px] text-gray-400 truncate">{product.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-2 lg:px-6 py-2 lg:py-3 text-xs text-gray-500">{product.category}</td>
                    <td className="px-2 lg:px-6 py-2 lg:py-3 text-xs font-black text-indigo-600 text-right">
                      {currency === 'USD' ? '$' : ''}
                      {(product.price * rate).toLocaleString('en-US')}
                      {currency === 'SSP' ? ' SSP' : ''}
                    </td>
                    <td className="px-2 lg:px-6 py-2 lg:py-3 text-center">
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                        product.stockQuantity <= 5 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                      )}>
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="px-2 lg:px-6 py-2 lg:py-3 text-right">
                      <button
                        disabled={product.stockQuantity <= 0}
                        onClick={() => addToCart(product)}
                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredProducts.length > 4 && (
              <div className="p-4 border-t border-gray-50 bg-gray-50/30 lg:hidden">
                <button 
                  onClick={() => setIsProductListExpanded(!isProductListExpanded)}
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 rounded-xl transition-all border border-dashed border-indigo-200"
                >
                  {isProductListExpanded ? (
                    <>Show Less Products <ChevronDown className="w-3 h-3 rotate-180" /></>
                  ) : (
                    <>Show {filteredProducts.length - 4} More Products <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              </div>
            )}
            {filteredProducts.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-400 font-medium">No products found matching your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart / Checkout */}
      <div className="w-full lg:w-[380px] flex flex-col bg-white rounded-2xl lg:rounded-3xl border border-gray-100 shadow-xl overflow-hidden shrink-0">
        <div className="p-4 lg:p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              {editingSaleId ? 'Edit Order' : 'Current Order'}
            </h3>
            <div className="flex items-center gap-2">
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
                  className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-100 transition-colors"
                >
                  Cancel Edit
                </button>
              )}
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                {cart.length} Items
              </span>
            </div>
          </div>
          
          {/* Customer Selection */}
          <div className="relative mb-3">
            <button 
              onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
              className="w-full flex items-center justify-between pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-left"
            >
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <span className={cn(selectedCustomer ? "text-gray-900 font-medium" : "text-gray-400")}>
                {selectedCustomer ? selectedCustomer.name : 'Select Customer'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                <button 
                  onClick={() => { setSelectedCustomer(null); setShowCustomerDropdown(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-50 font-medium text-gray-500"
                >
                  Guest Customer
                </button>
                {customers.map(customer => (
                  <button 
                    key={customer.id}
                    onClick={() => { setSelectedCustomer(customer); setShowCustomerDropdown(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-50"
                  >
                    {customer.name}
                  </button>
                ))}
                {customers.length === 0 && (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No customers registered.
                  </div>
                )}
              </div>
            )}
          </div>

          {!selectedCustomer && (
            <div className="relative mb-3">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                autoComplete="off"
                placeholder="Guest Name (Optional)"
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-all border",
                paymentMethod === 'cash' 
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" 
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              Cash Payment
            </button>
            <button
              onClick={() => {
                setPaymentMethod('credit');
                setCurrency('USD');
                setDiscount(0); // Reset discount to prevent currency mismatch when switching from SSP
              }}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-all border",
                paymentMethod === 'credit' 
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" 
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              Credit Sale
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setCurrency('USD'); setIsMixedPayment(false); }}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-all border",
                (currency === 'USD' && !isMixedPayment)
                  ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-100" 
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              USD
            </button>
            <button
              onClick={() => { setCurrency('SSP'); setIsMixedPayment(false); }}
              disabled={paymentMethod === 'credit'}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-all border",
                (currency === 'SSP' && !isMixedPayment)
                  ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-100" 
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50",
                paymentMethod === 'credit' && "opacity-50 cursor-not-allowed grayscale"
              )}
            >
              SSP
            </button>
          </div>

          {paymentMethod === 'cash' && (
            <div className="mt-2">
              <button
                onClick={() => setIsMixedPayment(!isMixedPayment)}
                className={cn(
                  "w-full py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2",
                  isMixedPayment
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                )}
              >
                <div className={cn("w-3 h-3 rounded-full border-2", isMixedPayment ? "border-white bg-white" : "border-gray-300")} />
                Mixed Currency (USD + SSP)
              </button>
            </div>
          )}

          {isMixedPayment && (
            <div className="mt-3 space-y-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 animate-in fade-in zoom-in duration-200">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">USD Part</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={mixedUSD}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMixedUSD(val);
                        // Auto-calculate SSP part
                        const usdVal = parseFloat(val) || 0;
                        const totalInUSD = totalAmount / (currency === 'SSP' ? exchangeRate : 1);
                        const remainingUSD = totalInUSD - usdVal;
                        setMixedSSP((remainingUSD * exchangeRate).toFixed(0));
                      }}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">$</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">SSP Part</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={mixedSSP}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMixedSSP(val);
                        // Auto-calculate USD part
                        const sspVal = parseFloat(val) || 0;
                        const totalInSSP = totalAmount * (currency === 'USD' ? exchangeRate : 1);
                        const remainingSSP = totalInSSP - sspVal;
                        setMixedUSD((remainingSSP / exchangeRate).toFixed(2));
                      }}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {(currency === 'SSP' || isMixedPayment) && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Exchange Rate (1 USD = ? SSP)</label>
              <div className="relative">
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder="Enter rate..."
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">SSP</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 min-h-[150px]">
          {cart.length > 0 ? (
            <div className="space-y-4">
              {(isCartExpanded || isDesktop ? cart : cart.slice(0, 4)).map((item) => (
                <div key={item.productId} className="flex items-center gap-3 lg:gap-4 animate-in fade-in slide-in-from-right-2 duration-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-indigo-600 font-medium">
                      {currency === 'USD' ? '$' : ''}
                      {(item.priceAtSale * rate).toLocaleString('en-US')}
                      {currency === 'SSP' ? ' SSP' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 lg:gap-2 bg-gray-100 rounded-lg p-1">
                    <button 
                      onClick={() => updateQuantity(item.productId, -1)}
                      className="p-1 hover:bg-white rounded transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input 
                      type="number"
                      min="1"
                      className="text-xs font-bold w-8 text-center bg-transparent border-none focus:ring-0 p-0"
                      value={item.quantity}
                      onChange={(e) => setQuantity(item.productId, e.target.value)}
                    />
                    <button 
                      onClick={() => updateQuantity(item.productId, 1)}
                      className="p-1 hover:bg-white rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.productId)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {cart.length > 4 && (
                <button 
                  onClick={() => setIsCartExpanded(!isCartExpanded)}
                  className="w-full py-2 flex items-center justify-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 rounded-xl transition-all border border-dashed border-indigo-200 lg:hidden"
                >
                  {isCartExpanded ? (
                    <>Show Less <ChevronDown className="w-3 h-3 rotate-180" /></>
                  ) : (
                    <>Show {cart.length - 4} More Items <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <ShoppingCart className="w-6 h-6 text-gray-200" />
              </div>
              <p className="text-gray-400 font-medium text-sm">Your cart is empty</p>
            </div>
          )}
        </div>

        <div className="p-4 lg:p-6 bg-gray-50 border-t border-gray-100 space-y-3 lg:space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>
                {currency === 'USD' ? '$' : ''}
                {subtotal.toLocaleString('en-US')}
                {currency === 'SSP' ? ' SSP' : ''}
              </span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax (0%)</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between items-center text-sm text-red-500">
              <span>Discount</span>
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                <span className="text-[10px] font-bold text-gray-400">{currency === 'USD' ? '$' : 'SSP'}</span>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-20 bg-transparent border-none focus:ring-0 p-0 text-right font-bold"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-lg font-black text-gray-900">Total</span>
              <div className="text-right">
                <span className="text-2xl font-black text-indigo-600 block">
                  {isMixedPayment ? (
                    `$${((parseFloat(mixedUSD) || 0) + (parseFloat(mixedSSP) || 0) / exchangeRate).toLocaleString('en-US')}`
                  ) : (
                    `${currency === 'USD' ? '$' : ''}${totalAmount.toLocaleString('en-US')} ${currency === 'SSP' ? 'SSP' : ''}`
                  )}
                </span>
                {isMixedPayment && (
                  <div className="flex flex-col items-end text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-tighter leading-none">
                    <span>${(parseFloat(mixedUSD) || 0).toLocaleString('en-US')} + {(parseFloat(mixedSSP) || 0).toLocaleString('en-US')} SSP</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button 
            disabled={cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer)}
            onClick={handleCheckout}
            className={cn(
              "w-full py-4 text-white rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3",
              (cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer))
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700"
            )}
          >
            {isProcessing ? (
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                {paymentMethod === 'credit' && !selectedCustomer ? 'Select Customer' : (editingSaleId ? 'Update Sale' : 'Complete Sale')}
              </>
            )}
          </button>
        </div>
      </div>

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
            <div className="p-6 bg-gray-50">
              <button 
                onClick={() => {
                  setShowReceipt(false);
                  navigate('/', { replace: true });
                }}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                Close & Return to Customer List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
