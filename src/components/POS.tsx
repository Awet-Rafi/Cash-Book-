import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, increment, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, SaleItem, Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Search, ShoppingCart, Plus, Minus, Trash2, Receipt, User, CheckCircle2, ChevronDown, AlertCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../App';

export default function POS() {
  const { role } = useAuth();
  const location = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [guestName, setGuestName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [discount, setDiscount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });

    const unsubCustomers = onSnapshot(query(collection(db, 'customers'), orderBy('name', 'asc')), (snapshot) => {
      const customersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersList);
      
      // Check for pre-selected customer from navigation state
      const state = location.state as { customerId?: string } | null;
      if (state?.customerId) {
        const customer = customersList.find(c => c.id === state.customerId);
        if (customer) {
          setSelectedCustomer(customer);
          setPaymentMethod('credit'); // Default to credit if coming from Credit Book
        }
      }
    });

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, []);

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

  const subtotal = cart.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
  const totalAmount = Math.max(0, subtotal - discount);
  const totalCost = cart.reduce((acc, item) => acc + (item.costAtSale * item.quantity), 0);
  const profit = totalAmount - totalCost;

  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return;
    
    if (paymentMethod === 'credit' && !selectedCustomer) {
      setError('Please select a registered customer for credit sales.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Add a small artificial delay to make the processing state visible and feel more robust
      await new Promise(resolve => setTimeout(resolve, 800));

      const batch = writeBatch(db);
      const saleRef = doc(collection(db, 'sales'));
      
      const saleData = {
        items: cart,
        subtotal,
        discount,
        totalAmount,
        totalCost,
        profit,
        customerName: selectedCustomer ? selectedCustomer.name : (guestName || 'Guest'),
        customerId: selectedCustomer?.id || null,
        paymentMethod,
        status: paymentMethod === 'cash' ? 'paid' : 'pending',
        timestamp: serverTimestamp()
      };

      // 1. Record Sale
      batch.set(saleRef, saleData);
      
      // 2. Update Inventory
      for (const item of cart) {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stockQuantity: increment(-item.quantity)
        });
      }

      await batch.commit();

      setLastSale({ ...saleData, id: saleRef.id, timestamp: new Date() });
      setCart([]);
      setDiscount(0);
      setSelectedCustomer(null);
      setGuestName('');
      setShowReceipt(true);
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
                {filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={cn(
                      "hover:bg-gray-50/50 transition-colors group",
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
                    <td className="px-2 lg:px-6 py-2 lg:py-3 text-xs font-black text-indigo-600 text-right">{formatCurrency(product.price)}</td>
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
              Current Order
            </h3>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
              {cart.length} Items
            </span>
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

          <div className="grid grid-cols-2 gap-2">
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
              onClick={() => setPaymentMethod('credit')}
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
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 min-h-[150px]">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 lg:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-indigo-600 font-medium">{formatCurrency(item.priceAtSale)}</p>
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
            ))
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
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax (0%)</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between items-center text-sm text-red-500">
              <span>Discount</span>
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                <span className="text-gray-400">$</span>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-16 bg-transparent border-none focus:ring-0 p-0 text-right font-bold"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-lg font-black text-gray-900">Total</span>
              <span className="text-2xl font-black text-indigo-600">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <button 
            disabled={cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer) || role === 'viewer'}
            onClick={handleCheckout}
            className={cn(
              "w-full py-4 text-white rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3",
              (cart.length === 0 || isProcessing || (paymentMethod === 'credit' && !selectedCustomer) || role === 'viewer')
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700"
            )}
          >
            {isProcessing ? (
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                {paymentMethod === 'credit' && !selectedCustomer ? 'Select Customer' : 'Complete Sale'}
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
                    <span className="font-bold text-gray-900">{item.quantity} x {formatCurrency(item.priceAtSale)}</span>
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
                  <span className="font-bold text-gray-900">{formatCurrency(lastSale.subtotal)}</span>
                </div>
                {lastSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Discount</span>
                    <span className="font-bold">-{formatCurrency(lastSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-black">
                  <span>Total Paid</span>
                  <span className="text-indigo-600">{formatCurrency(lastSale.totalAmount)}</span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50">
              <button 
                onClick={() => setShowReceipt(false)}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                Close & New Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
