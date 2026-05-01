import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, doc, increment, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, StockMovement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Search, Package, ArrowUpRight, ArrowDownLeft, RotateCcw, Filter, Calendar, History, TrendingUp, AlertTriangle, X } from 'lucide-react';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, isSameDay } from 'date-fns';

export default function StoreBook() {
  const { businessId, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'status' | 'log'>('status');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
                        <button 
                          className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                        >
                          View History
                        </button>
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
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Values at Cost: {formatCurrency(product.costPrice * product.stockQuantity)}</span>
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Tap to see history →</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="log"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {dailyLogs.map(([date, items]) => (
              <div key={date} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-sm font-black text-gray-900 dark:text-white">{format(new Date(date), 'MMMM d, yyyy')}</h4>
                  </div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{Object.keys(items).length} Stock Changes</span>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {Object.entries(items).map(([pid, data]) => (
                    <div key={pid} className="px-6 py-4 flex items-center justify-between group hover:bg-gray-50/30 dark:hover:bg-gray-700/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{data.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {data.sold > 0 && (
                            <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1">
                              <ArrowDownLeft className="w-3 h-3" /> {data.sold} Sold
                            </span>
                          )}
                          {data.restock > 0 && (
                            <span className="text-[9px] font-black text-green-500 uppercase flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" /> {data.restock} Restocked
                            </span>
                          )}
                          {data.adjusted !== 0 && (
                            <span className="text-[9px] font-black text-indigo-500 uppercase flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" /> {data.adjusted > 0 ? '+' : ''}{data.adjusted} Adjusted
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className={cn(
                          "text-sm font-black",
                          (data.restock + data.adjusted - data.sold) >= 0 ? "text-green-600" : "text-red-500"
                        )}>
                          {(data.restock + data.adjusted - data.sold) > 0 ? '+' : ''}
                          {data.restock + data.adjusted - data.sold}
                        </p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Net Change</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {dailyLogs.length === 0 && (
              <div className="text-center py-20 bg-gray-50/50 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <History className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No stock movements recorded yet.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product History Modal */}
      {showHistoryModal && selectedProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                  <History className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">{selectedProduct.name}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stock Movement History</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowHistoryModal(false); setSelectedProduct(null); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {movements
                .filter(m => m.productId === selectedProduct.id)
                .map((m, i) => (
                  <motion.div 
                    key={m.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          m.type === 'sale' ? "bg-red-50 dark:bg-red-900/20 text-red-600" :
                          m.type === 'restock' ? "bg-green-50 dark:bg-green-900/20 text-green-600" :
                          "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600"
                        )}>
                          {m.type === 'sale' ? <ArrowDownLeft className="w-4 h-4" /> :
                           m.type === 'restock' ? <ArrowUpRight className="w-4 h-4" /> :
                           <RotateCcw className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                            {m.type === 'edit_sale' ? 'Sale Modified' : m.type.replace('_', ' ')}
                          </p>
                          <p className="text-[10px] text-gray-500 font-medium italic">
                            {m.timestamp ? format(m.timestamp, 'MMM d, yyyy • HH:mm') : 'Recently'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-black",
                          m.quantity > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity} Units
                        </p>
                      </div>
                    </div>

                    {m.type === 'sale' && (
                      <div className="pt-3 border-t border-gray-50 dark:border-gray-800 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Customer</p>
                          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{m.customerName || 'Guest'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Payment</p>
                          <span className={cn(
                            "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                            m.paymentMethod === 'credit' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            {m.paymentMethod || 'Cash'}
                          </span>
                        </div>
                        <div className="mt-1">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Transaction Total</p>
                          <p className="text-xs font-black text-indigo-600">
                            {m.currency === 'SSP' ? '' : '$'}
                            {m.amount?.toLocaleString('en-US')}
                            {m.currency === 'SSP' ? ' SSP' : ''}
                          </p>
                        </div>
                        <div className="mt-1 text-right">
                           <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Notes</p>
                           <p className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate">{m.notes || 'N/A'}</p>
                        </div>
                      </div>
                    )}

                    {(m.type === 'restock' || m.type === 'adjustment') && m.notes && (
                       <div className="pt-2 border-t border-gray-50 dark:border-gray-800">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Notes</p>
                         <p className="text-xs text-gray-600 dark:text-gray-400 italic">{m.notes}</p>
                       </div>
                    )}
                  </motion.div>
                ))}
              
              {movements.filter(m => m.productId === selectedProduct.id).length === 0 && (
                <div className="py-12 text-center">
                  <Package className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium italic">No history recorded for this item.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 shrink-0">
               <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Current Balance</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white">{selectedProduct.stockQuantity} Items</p>
                  </div>
                  <button 
                    onClick={() => { setShowHistoryModal(false); setSelectedProduct(null); }}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                  >
                    Done
                  </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
