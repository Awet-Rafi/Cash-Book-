import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, doc, increment, writeBatch, serverTimestamp, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, StockMovement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Search, Package, ArrowUpRight, ArrowDownLeft, RotateCcw, Filter, Calendar, History, TrendingUp, AlertTriangle, X, Paperclip, FileText, Edit3, Trash, ChevronDown, ChevronRight, DollarSign, ShoppingBag, Save, Loader2 } from 'lucide-react';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, isSameDay, parseISO } from 'date-fns';

export default function StoreBook() {
  const { businessId, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'status' | 'log' | 'daily'>('status');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Edit Product Modal
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({ name: '', category: '', stockQuantity: 0 });

  // Edit Movement Modal
  const [isEditMovementModalOpen, setIsEditMovementModalOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [movementFormData, setMovementFormData] = useState({ quantity: 0, notes: '' });

  useEffect(() => {
    if (!businessId) return;

    const qProducts = query(collection(db, 'products'), where('businessId', '==', businessId));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const qMovements = query(
      collection(db, 'stockMovements'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as StockMovement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockMovements');
    });

    return () => {
      unsubProducts();
      unsubMovements();
    };
  }, [businessId]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = useMemo(() => {
    return {
      totalItems: products.length,
      lowStock: products.filter(p => p.stockQuantity <= 5 && p.stockQuantity > 0).length,
      outOfStock: products.filter(p => p.stockQuantity <= 0).length,
      totalValue: products.reduce((acc, p) => acc + (p.costPrice * p.stockQuantity), 0)
    };
  }, [products]);

  const dailyLogs = useMemo(() => {
    const logs: { [key: string]: { [prodId: string]: { name: string, sold: number, restock: number, adjusted: number } } } = {};
    
    movements.forEach(m => {
      if (!m.timestamp) return;
      const dateKey = format(m.timestamp, 'yyyy-MM-dd');
      if (!logs[dateKey]) logs[dateKey] = {};
      if (!logs[dateKey][m.productId]) logs[dateKey][m.productId] = { name: m.productName || 'Unknown', sold: 0, restock: 0, adjusted: 0 };
      
      const qty = Math.abs(m.quantity);
      if (m.type === 'sale') logs[dateKey][m.productId].sold += qty;
      else if (m.type === 'restock') logs[dateKey][m.productId].restock += qty;
      else logs[dateKey][m.productId].adjusted += m.quantity;
    });

    return Object.entries(logs).sort((a, b) => b[0].localeCompare(a[0]));
  }, [movements]);

  const movementsWithBalance = useMemo(() => {
    const productMovements: { [pid: string]: StockMovement[] } = {};
    movements.forEach(m => {
      if (!productMovements[m.productId]) productMovements[m.productId] = [];
      productMovements[m.productId].push(m);
    });

    const result: (StockMovement & { runningBalance: number })[] = [];

    Object.entries(productMovements).forEach(([pid, prods]) => {
      const product = products.find(p => p.id === pid);
      if (!product) return;

      const sorted = [...prods].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      let currentBal = product.stockQuantity;
      sorted.forEach(m => {
        result.push({ ...m, runningBalance: currentBal });
        currentBal -= m.quantity;
      });
    });

    return result.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [movements, products]);

  const selectedProductMovements = useMemo(() => {
    if (!selectedProduct) return [];
    return movementsWithBalance.filter(m => m.productId === selectedProduct.id);
  }, [movementsWithBalance, selectedProduct]);

  const dailySalesSummary = useMemo(() => {
    const daily: { [date: string]: { 
      items: { [name: string]: { qty: number, amount: number, currency: string, movements: StockMovement[] } },
      totalItems: number,
      totalAmountUSD: number,
      totalAmountSSP: number
    } } = {};

    movements.filter(m => m.type === 'sale').forEach(m => {
      if (!m.timestamp) return;
      const dateKey = format(new Date(m.timestamp), 'yyyy-MM-dd');
      if (!daily[dateKey]) {
        daily[dateKey] = { items: {}, totalItems: 0, totalAmountUSD: 0, totalAmountSSP: 0 };
      }
      
      const qty = Math.abs(m.quantity);
      const name = m.productName || 'Unknown';
      if (!daily[dateKey].items[name]) {
        daily[dateKey].items[name] = { qty: 0, amount: 0, currency: m.currency || 'USD', movements: [] };
      }
      
      daily[dateKey].items[name].qty += qty;
      daily[dateKey].items[name].amount += (m.amount || 0);
      daily[dateKey].items[name].movements.push(m);
      
      daily[dateKey].totalItems += qty;
      if (m.currency === 'SSP') {
        daily[dateKey].totalAmountSSP += (m.amount || 0);
      } else {
        daily[dateKey].totalAmountUSD += (m.amount || 0);
      }
    });

    return Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0]));
  }, [movements]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const toggleProduct = (date: string, productName: string) => {
    const key = `${date}-${productName}`;
    setExpandedProducts(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !businessId || isProcessing) return;

    setIsProcessing(true);
    try {
      const productRef = doc(db, 'products', editingProduct.id);
      await updateDoc(productRef, {
        name: productFormData.name,
        category: productFormData.category,
        stockQuantity: productFormData.stockQuantity,
        updatedAt: serverTimestamp()
      });
      setIsEditProductModalOpen(false);
      setEditingProduct(null);
    } catch (error) {
      console.error("Error updating product:", error);
      alert("Failed to update product. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!isAdmin) return;
    if (!confirm("Are you sure you want to delete this product? All stock history for this product will lose its reference.")) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product.");
    }
  };

  const handleEditMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement || !businessId || isProcessing) return;

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const movementRef = doc(db, 'stockMovements', editingMovement.id);
      const productRef = doc(db, 'products', editingMovement.productId);

      const qtyDiff = movementFormData.quantity - editingMovement.quantity;

      batch.update(movementRef, {
        quantity: movementFormData.quantity,
        notes: movementFormData.notes,
        updatedAt: serverTimestamp()
      });

      batch.update(productRef, {
        stockQuantity: increment(qtyDiff)
      });

      await batch.commit();
      setIsEditMovementModalOpen(false);
      setEditingMovement(null);
    } catch (error) {
      console.error("Error updating movement:", error);
      alert("Failed to update movement.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMovement = async (movement: StockMovement) => {
    if (!isAdmin) return;
    if (!confirm("Are you sure you want to delete this stock movement? This will reverse the stock change.")) return;

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const movementRef = doc(db, 'stockMovements', movement.id);
      const productRef = doc(db, 'products', movement.productId);

      // Reverse the impact on stock
      batch.update(productRef, {
        stockQuantity: increment(-movement.quantity)
      });

      batch.delete(movementRef);

      await batch.commit();
    } catch (error) {
      console.error("Error deleting movement:", error);
      alert("Failed to delete movement.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">Stock Movements</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Inventory tracking & stock movement logs.</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('status')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'status' ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Stock Status
          </button>
          <button 
            onClick={() => setActiveTab('log')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'log' ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Stock Ledger
          </button>
          <button 
            onClick={() => setActiveTab('daily')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'daily' ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Daily Sales
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: stats.totalItems, icon: Package, color: 'indigo' },
          { label: 'Low Stock', value: stats.lowStock, icon: AlertTriangle, color: 'orange' },
          { label: 'Out of Stock', value: stats.outOfStock, icon: X, color: 'red' },
          { label: 'Stock Value', value: formatCurrency(stats.totalValue), icon: TrendingUp, color: 'green' }
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className={`w-8 h-8 rounded-lg bg-${s.color}-50 dark:bg-${s.color}-900/20 flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 text-${s.color}-600 dark:text-${s.color}-400`} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
            <p className="text-xl font-black text-gray-900 dark:text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'status' ? (
          <motion.div 
            key="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search inventory..."
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="hidden lg:block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Stock</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {filteredProducts.map(product => (
                    <tr 
                      key={product.id} 
                      onClick={() => { setSelectedProduct(product); setShowHistoryModal(true); }}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-black",
                            product.stockQuantity <= 5 ? "text-red-500" : "text-gray-900 dark:text-white"
                          )}>
                            {product.stockQuantity}
                          </span>
                          {product.stockQuantity <= 5 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase rounded-md">
                          {product.category || 'Standard'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProduct(product);
                              setProductFormData({ name: product.name, category: product.category || '', stockQuantity: product.stockQuantity });
                              setIsEditProductModalOpen(true);
                            }}
                            className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProduct(product.id);
                            }}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProduct(product);
                              setShowHistoryModal(true);
                            }}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="lg:hidden space-y-3">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => { setSelectedProduct(product); setShowHistoryModal(true); }}
                  className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Package className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-900 dark:text-white">{product.name}</h4>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{product.category || 'Standard'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-lg font-black",
                        product.stockQuantity <= 5 ? "text-red-500" : "text-gray-900 dark:text-white"
                      )}>
                        {product.stockQuantity}
                      </p>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">In Stock</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProduct(product);
                          setProductFormData({ name: product.name, category: product.category || '', stockQuantity: product.stockQuantity });
                          setIsEditProductModalOpen(true);
                        }}
                        className="p-1.5 text-indigo-400"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProduct(product.id);
                        }}
                        className="p-1.5 text-rose-400"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Tap to see history →</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : activeTab === 'log' ? (
          <motion.div 
            key="log"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f8f9fa] dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                      <th className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded border-gray-300" disabled />
                          <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Date & Time</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest">Details</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest">Category</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest">Mode</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-center">Bill</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Amount</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Balance</th>
                      <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {movementsWithBalance.map((m) => {
                      const product = products.find(p => p.id === m.productId);
                      return (
                        <tr key={m.id} className="hover:bg-[#fcfcfc] dark:hover:bg-gray-700/30 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <input type="checkbox" className="rounded border-gray-300" disabled />
                              <div>
                                <p className="text-[13px] font-black text-gray-900 dark:text-white">
                                  {m.timestamp ? format(new Date(m.timestamp), 'dd MMM, yyyy') : 'N/A'}
                                </p>
                                <p className="text-[10px] font-bold text-gray-400">
                                  {m.timestamp ? format(new Date(m.timestamp), 'hh:mm a') : 'N/A'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-[13px] font-black text-gray-900 dark:text-white truncate max-w-[200px]">
                                {m.productName || 'Unknown Product'}
                                {m.notes && <span className="ml-2 font-normal text-gray-400 italic">({m.notes})</span>}
                              </span>
                              <span className="text-[11px] font-medium text-gray-500 italic">by You</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[11px] font-bold text-gray-400 uppercase">
                              {product?.category || 'Standard'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[11px] font-black text-gray-900 dark:text-white">
                              {m.type === 'sale' ? (m.paymentMethod === 'credit' ? 'Credit' : 'Cash') : m.type.charAt(0).toUpperCase() + m.type.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[9px] font-black text-gray-400 uppercase leading-none">0</span>
                                <span className="text-[8px] font-bold text-gray-400 uppercase leading-none">Attachment</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn(
                              "text-[14px] font-bold font-mono",
                              m.quantity > 0 ? "text-[#00875a]" : "text-[#de350b]"
                            )}>
                              {m.quantity.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[13px] font-bold font-mono text-gray-500">
                                {m.runningBalance.toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingMovement(m);
                                  setMovementFormData({ quantity: m.quantity, notes: m.notes || '' });
                                  setIsEditMovementModalOpen(true);
                                }}
                                className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteMovement(m)}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {movementsWithBalance.length === 0 && (
                <div className="text-center py-20">
                  <History className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No stock movements found.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="daily"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {dailySalesSummary.map(([date, data]) => (
              <div key={date} className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {/* Day Header */}
                <button 
                  onClick={() => toggleDay(date)}
                  className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-base font-black text-gray-900 dark:text-white">
                        {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          {data.totalItems} Items Sold
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-[10px] font-black text-emerald-600 uppercase">
                          {data.totalAmountUSD > 0 && `$${data.totalAmountUSD.toLocaleString()}`}
                          {data.totalAmountUSD > 0 && data.totalAmountSSP > 0 && ' + '}
                          {data.totalAmountSSP > 0 && `${data.totalAmountSSP.toLocaleString()} SSP`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Receipts</p>
                      <p className="text-sm font-black text-gray-900 dark:text-white">
                        {Object.values(data.items).reduce((acc, item) => acc + item.movements.length, 0)}
                      </p>
                    </div>
                    <div className={cn(
                      "p-2 rounded-full transition-transform",
                      expandedDays.includes(date) ? "rotate-180 bg-gray-100" : "bg-gray-50"
                    )}>
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    </div>
                  </div>
                </button>

                {/* Day Details */}
                <AnimatePresence>
                  {expandedDays.includes(date) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                    >
                      <div className="p-4 sm:p-6 space-y-4">
                        {/* Table Style for Details */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <th className="px-6 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Product</th>
                                <th className="px-6 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Category</th>
                                <th className="px-6 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Qty</th>
                                <th className="px-6 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Revenue</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                              {Object.entries(data.items).map(([name, item]) => {
                                const product = products.find(p => p.name === name);
                                const isExpanded = expandedProducts.includes(`${date}-${name}`);
                                return (
                                  <React.Fragment key={name}>
                                    <tr 
                                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                                      onClick={() => toggleProduct(date, name)}
                                    >
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                          <div className={cn(
                                            "w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 transition-all",
                                            isExpanded ? "rotate-90 bg-indigo-600 text-white" : "text-indigo-600 group-hover:scale-110"
                                          )}>
                                            <ChevronRight className="w-4 h-4" />
                                          </div>
                                          <span className="text-[13px] font-black text-gray-900 dark:text-white truncate max-w-[200px]">{name}</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="text-[11px] font-bold text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full uppercase">
                                          {product?.category || 'Standard'}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className={cn("text-[13px] font-bold", isExpanded ? "text-indigo-600" : "text-gray-900")}>{item.qty}</span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                        <span className="text-[14px] font-black text-emerald-600 font-mono">
                                          {item.currency === 'SSP' ? '' : '$'}
                                          {item.amount.toLocaleString()}
                                          {item.currency === 'SSP' ? ' SSP' : ''}
                                        </span>
                                      </td>
                                    </tr>

                                    {/* Detailed Movements for this product on this day */}
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={4} className="px-6 py-0 pb-4 bg-gray-50/30">
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            className="overflow-hidden bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-inner"
                                          >
                                            <div className="divide-y divide-gray-50 dark:divide-gray-800">
                                              {item.movements.map((m) => (
                                                <div key={m.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                  <div className="flex items-center gap-6">
                                                    <div>
                                                      <p className="text-[11px] font-black text-gray-900 dark:text-white">
                                                        {m.timestamp ? format(new Date(m.timestamp), 'hh:mm a') : 'N/A'}
                                                      </p>
                                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Time of sale</p>
                                                    </div>
                                                    <div className="h-8 w-px bg-gray-100 hidden sm:block" />
                                                    <div>
                                                      {m.customerName ? (
                                                        <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest leading-none">{m.customerName}</p>
                                                      ) : (
                                                        <p className="text-[11px] font-bold text-gray-400 italic">Walk-in Customer</p>
                                                      )}
                                                      {m.notes && <p className="text-[10px] text-gray-500 mt-1 max-w-[200px] truncate">{m.notes}</p>}
                                                    </div>
                                                    <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-900/30">
                                                      <ArrowDownLeft className="w-3 h-3 text-rose-500" />
                                                      <span className="text-[11px] font-black text-rose-600">-{Math.abs(m.quantity)} Units</span>
                                                    </div>
                                                  </div>
                                                  
                                                  <div className="flex items-center gap-3">
                                                    <div className="text-right mr-2">
                                                       <p className="text-[12px] font-black text-emerald-600 font-mono">
                                                         {m.currency === 'SSP' ? '' : '$'}
                                                         {m.amount?.toLocaleString()}
                                                         {m.currency === 'SSP' ? ' SSP' : ''}
                                                       </p>
                                                       <p className="text-[8px] font-black text-gray-300 uppercase tracking-[0.2em] leading-none">Net Amount</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                      <button 
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setEditingMovement(m);
                                                          setMovementFormData({ quantity: m.quantity, notes: m.notes || '' });
                                                          setIsEditMovementModalOpen(true);
                                                        }}
                                                        className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-gray-100 rounded-xl transition-all"
                                                      >
                                                        <Edit3 className="w-4 h-4" />
                                                      </button>
                                                      <button 
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleDeleteMovement(m);
                                                        }}
                                                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-gray-100 rounded-xl transition-all"
                                                      >
                                                        <Trash className="w-4 h-4" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </motion.div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary Footer for the day */}
                        <div className="flex flex-wrap items-center justify-end gap-6 pt-2">
                           <div className="text-right">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Total Sales</p>
                             <p className="text-sm font-black text-gray-900">{data.totalItems} Units</p>
                           </div>
                           <div className="text-right">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Daily Revenue</p>
                             <p className="text-lg font-black text-emerald-600">
                               {data.totalAmountUSD > 0 && `$${data.totalAmountUSD.toLocaleString()}`}
                               {data.totalAmountUSD > 0 && data.totalAmountSSP > 0 && ' / '}
                               {data.totalAmountSSP > 0 && `${data.totalAmountSSP.toLocaleString()} SSP`}
                             </p>
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {dailySalesSummary.length === 0 && (
              <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-[32px] border-2 border-dashed border-gray-100 dark:border-gray-700">
                <DollarSign className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest">No Sales History</p>
                <p className="text-xs text-gray-300 mt-1 italic">When you make sales, they will appear here grouped by day.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product History Full-Page Overlay */}
      <AnimatePresence>
        {showHistoryModal && selectedProduct && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-white dark:bg-gray-950 flex flex-col pt-[var(--header-height)] sm:pt-0"
          >
            {/* Header */}
            <div className="px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => { setShowHistoryModal(false); setSelectedProduct(null); }}
                  className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                    <History className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white leading-tight">{selectedProduct.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Movement History</span>
                      <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-1.5 py-0.5 rounded font-black uppercase">{selectedProduct.category || 'Standard'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Current Stock</p>
                  <p className={cn("text-xl font-black", selectedProduct.stockQuantity <= 5 ? "text-rose-500" : "text-gray-900 dark:text-white")}>
                    {selectedProduct.stockQuantity}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#f8f9fa] dark:bg-black/20">
              <div className="flex-1 overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <table className="hidden sm:table min-w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
                        <th className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" className="rounded-lg border-gray-300 bg-gray-50" disabled />
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Date & Time</span>
                          </div>
                        </th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest">Description</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-center">Ref</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-center">Mode</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Qty Change</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right bg-[#fcfcfc] dark:bg-gray-900/10">Running Balance</th>
                        <th className="px-8 py-4 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                      {selectedProductMovements.map((m) => {
                        const qty = Math.abs(m.quantity);
                        const unitPrice = m.amount ? m.amount / qty : 0;
                        return (
                          <tr key={m.id} className="hover:bg-[#fcfcfc] dark:hover:bg-gray-800/40 transition-colors group">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <input type="checkbox" className="rounded-lg border-gray-300 bg-gray-50 group-hover:border-indigo-400 transition-colors" disabled />
                                <div>
                                  <p className="text-[13px] font-black text-gray-900 dark:text-white">
                                    {m.timestamp ? format(new Date(m.timestamp), 'dd MMM, yyyy') : 'Recently'}
                                  </p>
                                  <p className="text-[10px] font-black text-gray-400">
                                    {m.timestamp ? format(new Date(m.timestamp), 'hh:mm a') : 'N/A'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-[13px] font-black text-gray-900 dark:text-white">
                                  {m.type === 'edit_sale' ? 'Sale Modified' : m.type.replace('_', ' ').charAt(0).toUpperCase() + m.type.replace('_', ' ').slice(1)}
                                </span>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center mt-0.5">
                                  <span className="text-[11px] text-gray-500 font-medium italic">by You</span>
                                  {m.customerName && (
                                    <span className="text-[11px] font-bold text-indigo-600">
                                      • {m.customerName}
                                    </span>
                                  )}
                                  {m.type === 'sale' && m.amount && (
                                    <span className="text-[11px] text-gray-400">
                                      • {qty} {qty === 1 ? 'unit' : 'units'} @ {m.currency === 'SSP' ? '' : '$'}{unitPrice.toLocaleString()}{m.currency === 'SSP' ? ' SSP' : ''}
                                    </span>
                                  )}
                                  {m.notes && <span className="text-[11px] text-gray-500 italic">• {m.notes}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <FileText className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[9px] font-black text-gray-400 uppercase leading-none">REF-{m.id.slice(-4).toUpperCase()}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={cn(
                                "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm border",
                                m.type === 'sale' ? (m.paymentMethod === 'credit' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100") : "bg-indigo-50 text-indigo-600 border-indigo-100"
                              )}>
                                {m.type === 'sale' ? (m.paymentMethod || 'Cash') : 'Inventory'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={cn(
                                "text-[14px] font-black font-mono",
                                m.quantity > 0 ? "text-[#00875a]" : "text-[#de350b]"
                              )}>
                                {m.quantity > 0 ? '+' : ''}{m.quantity}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right bg-[#fcfcfc] dark:bg-gray-900/10">
                              <span className="text-[13px] font-black font-mono text-gray-500">{m.runningBalance.toLocaleString()}</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    setEditingMovement(m);
                                    setMovementFormData({ quantity: m.quantity, notes: m.notes || '' });
                                    setIsEditMovementModalOpen(true);
                                  }}
                                  className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteMovement(m)}
                                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Records */}
                  <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {selectedProductMovements.map((m) => {
                      const qty = Math.abs(m.quantity);
                      const unitPrice = m.amount ? m.amount / qty : 0;
                      return (
                        <div key={m.id} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[13px] font-black text-gray-900 dark:text-white">
                                {m.timestamp ? format(new Date(m.timestamp), 'dd MMM, yyyy') : 'Recently'}
                              </p>
                              <p className="text-[10px] font-black text-gray-400">
                                {m.timestamp ? format(new Date(m.timestamp), 'hh:mm a') : 'N/A'}
                              </p>
                            </div>
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter border",
                              m.type === 'sale' ? (m.paymentMethod === 'credit' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100") : "bg-indigo-50 text-indigo-600 border-indigo-100"
                            )}>
                              {m.type === 'sale' ? (m.paymentMethod || 'Cash') : 'Inventory'}
                            </span>
                          </div>
                          
                          <div>
                            <p className="text-[13px] font-black text-gray-900 dark:text-white">
                              {m.type === 'edit_sale' ? 'Sale Modified' : m.type.replace('_', ' ').charAt(0).toUpperCase() + m.type.replace('_', ' ').slice(1)}
                            </p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center mt-1">
                              <span className="text-[11px] text-gray-500 font-medium italic">by You</span>
                              {m.customerName && <span className="text-[11px] font-bold text-indigo-600">• {m.customerName}</span>}
                              {m.type === 'sale' && m.amount && (
                                <span className="text-[11px] text-gray-400">• {qty} × {m.currency === 'SSP' ? '' : '$'}{unitPrice.toLocaleString()}</span>
                              )}
                            </div>
                            {m.notes && <p className="text-[11px] text-gray-500 italic mt-1">• {m.notes}</p>}
                          </div>

                          <div className="flex justify-between items-end pt-3 border-t border-gray-50 dark:border-gray-800">
                            <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Running Balance</p>
                              <p className="text-sm font-black font-mono text-gray-500 leading-none">{m.runningBalance.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Change</p>
                              <p className={cn(
                                "text-lg font-black font-mono leading-none",
                                m.quantity > 0 ? "text-[#00875a]" : "text-[#de350b]"
                              )}>
                                {m.quantity > 0 ? '+' : ''}{m.quantity}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-end gap-3 pt-1">
                            <button 
                              onClick={() => {
                                setEditingMovement(m);
                                setMovementFormData({ quantity: m.quantity, notes: m.notes || '' });
                                setIsEditMovementModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg group active:scale-95 transition-all"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteMovement(m)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 dark:hover:bg-rose-100 rounded-lg group active:scale-95 transition-all"
                            >
                              <Trash className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {movements.filter(m => m.productId === selectedProduct.id).length === 0 && (
                  <div className="py-32 text-center">
                    <Package className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">No Movement History</p>
                    <p className="text-xs text-gray-400 mt-1 italic">No transactions or stock changes found for this item.</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer Summary */}
            <div className="px-6 py-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
               <div className="flex items-center justify-between max-w-5xl mx-auto">
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Total Entries</p>
                      <p className="text-xl font-black text-gray-900 dark:text-white leading-none">
                        {movements.filter(m => m.productId === selectedProduct.id).length}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 hidden sm:block" />
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Stock Valuation</p>
                      <p className="text-xl font-black text-indigo-600 leading-none">
                        {formatCurrency(selectedProduct.costPrice * selectedProduct.stockQuantity)}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setShowHistoryModal(false); setSelectedProduct(null); }}
                    className="h-12 px-8 bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white rounded-[18px] font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-black/10 active:scale-[0.98]"
                  >
                    Close History
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Product Modal */}
      <AnimatePresence>
        {isEditProductModalOpen && editingProduct && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">Edit Product</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Update inventory details</p>
                </div>
                <button onClick={() => setIsEditProductModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleEditProduct} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Product Name</label>
                    <input
                      type="text"
                      required
                      value={productFormData.name}
                      onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                      className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
                    <input
                      type="text"
                      value={productFormData.category}
                      onChange={(e) => setProductFormData({ ...productFormData, category: e.target.value })}
                      className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 text-indigo-600">Stock Quantity</label>
                    <div className="relative">
                      <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
                      <input
                        type="number"
                        required
                        value={productFormData.stockQuantity}
                        onChange={(e) => setProductFormData({ ...productFormData, stockQuantity: parseInt(e.target.value) || 0 })}
                        className="w-full pl-12 pr-4 py-3.5 bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-black text-lg"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 ml-1 italic">Warning: Manual adjustment bypasses movement logs.</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isProcessing ? 'Saving...' : 'Update Product'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Movement Modal */}
      <AnimatePresence>
        {isEditMovementModalOpen && editingMovement && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">Edit Record</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Movement ID: {editingMovement.id.slice(-6).toUpperCase()}</p>
                </div>
                <button onClick={() => setIsEditMovementModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleEditMovement} className="p-8 space-y-6">
                <div className="space-y-4">
                   <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Target Product</p>
                    <p className="text-sm font-black text-gray-900 dark:text-white">{editingMovement.productName}</p>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity Change</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2">
                        {movementFormData.quantity >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald-500" /> : <ArrowDownLeft className="w-5 h-5 text-rose-500" />}
                      </div>
                      <input
                        type="number"
                        required
                        value={movementFormData.quantity}
                        onChange={(e) => setMovementFormData({ ...movementFormData, quantity: parseInt(e.target.value) || 0 })}
                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-black text-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Internal Notes</label>
                    <textarea
                      value={movementFormData.notes}
                      onChange={(e) => setMovementFormData({ ...movementFormData, notes: e.target.value })}
                      placeholder="Reason for adjustment..."
                      className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-medium text-sm min-h-[100px] resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isProcessing ? 'Saving Changes...' : 'Save Movement'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
