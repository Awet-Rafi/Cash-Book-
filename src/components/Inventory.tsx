import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Plus, Search, Edit2, Trash2, Package, X, AlertCircle, RotateCcw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Inventory() {
  const { isAdmin, businessId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    costPrice: '',
    stockQuantity: '',
    category: ''
  });

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'products'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: safeTimestamp(doc.data().createdAt),
        updatedAt: safeTimestamp(doc.data().updatedAt)
      } as Product)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return unsub;
  }, [businessId]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        costPrice: product.costPrice.toString(),
        stockQuantity: product.stockQuantity.toString(),
        category: product.category || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', costPrice: '', stockQuantity: '', category: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !businessId || isProcessing) return;

    setIsProcessing(true);
    const data = {
      businessId,
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price),
      costPrice: parseFloat(formData.costPrice),
      stockQuantity: parseInt(formData.stockQuantity),
      category: formData.category,
      updatedAt: serverTimestamp()
    };

    try {
      const newStockQty = parseInt(formData.stockQuantity);
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), data);
        
        // Log movement if stock changed
        const stockDiff = newStockQty - editingProduct.stockQuantity;
        if (stockDiff !== 0) {
          await addDoc(collection(db, 'stockMovements'), {
            businessId,
            productId: editingProduct.id,
            productName: editingProduct.name,
            type: stockDiff > 0 ? 'restock' : 'adjustment',
            quantity: stockDiff,
            timestamp: serverTimestamp(),
            notes: `Manual inventory update`,
            referenceId: editingProduct.id
          });
        }
      } else {
        const productRef = await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
        // Log initial stock as restock
        await addDoc(collection(db, 'stockMovements'), {
          businessId,
          productId: productRef.id,
          productName: data.name,
          type: 'restock',
          quantity: newStockQty,
          timestamp: serverTimestamp(),
          notes: `Initial stock entry`,
          referenceId: productRef.id
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving product:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    console.log("handleDelete called with ID:", id, "isAdmin:", isAdmin);
    
    if (!isAdmin) {
      console.error("Unauthorized: Only admins can delete products");
      setError("Unauthorized: Only admins can delete products");
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this product?')) {
      setError(null);
      console.log("Confirmed deletion of:", id);
      try {
        await deleteDoc(doc(db, 'products', id));
        console.log("Deletion successful for ID:", id);
      } catch (error) {
        console.error("Error deleting product:", error);
        setError(error instanceof Error ? error.message : "Failed to delete product");
        handleFirestoreError(error, OperationType.WRITE, `products/${id}`);
      }
    }
  };

  const handleQuickAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !adjustAmount || isProcessing || !businessId) return;

    setIsProcessing(true);
    try {
      const amount = parseInt(adjustAmount);
      const newStock = editingProduct.stockQuantity + amount;
      
      const productRef = doc(db, 'products', editingProduct.id);
      await updateDoc(productRef, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'stockMovements'), {
        businessId,
        productId: editingProduct.id,
        productName: editingProduct.name,
        type: amount > 0 ? 'restock' : 'adjustment',
        quantity: amount,
        timestamp: serverTimestamp(),
        notes: adjustNotes || 'Quick stock adjustment',
        referenceId: 'quick-adjust'
      });

      setIsAdjustModalOpen(false);
      setAdjustAmount('');
      setAdjustNotes('');
      setEditingProduct(null);
    } catch (error) {
      console.error("Adjustment error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">Inventory Management</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">All product prices are entered and maintained in <span className="font-bold text-indigo-600 dark:text-indigo-400">USD</span>.</p>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search products or categories..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none dark:text-white dark:placeholder-gray-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {isAdmin && (
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-600 dark:text-red-400">Error</p>
            <p className="text-xs text-red-500 dark:text-red-400/80 font-medium leading-relaxed">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors">
            <X className="w-4 h-4 text-red-400 font-bold" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[300px]">{product.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[400px]">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-bold">
                      {product.category || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-black",
                        product.stockQuantity <= 5 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
                      )}>
                        {product.stockQuantity}
                      </span>
                      {product.stockQuantity <= 5 && (
                        <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-medium">{formatCurrency(product.costPrice)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(product.price)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => { setEditingProduct(product); setIsAdjustModalOpen(true); }}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                            title="Quick Adjust Stock"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleOpenModal(product)}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
          {filteredProducts.map((product) => (
            <div key={product.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{product.category || 'Uncategorized'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1 mb-1">
                    <span className={cn(
                      "text-sm font-black",
                      product.stockQuantity <= 5 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
                    )}>
                      {product.stockQuantity}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">In Stock</span>
                  </div>
                  {product.stockQuantity <= 5 && (
                    <span className="text-[8px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-black uppercase">Low Stock</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-2 px-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div>
                  <p className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-0.5">Cost Price</p>
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400">{formatCurrency(product.costPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-0.5">Selling Price</p>
                  <p className="text-xs font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(product.price)}</p>
                </div>
              </div>

                  {isAdmin && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button 
                        onClick={() => { setEditingProduct(product); setIsAdjustModalOpen(true); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 rounded-lg text-xs font-bold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Adjust
                      </button>
                      <button 
                        onClick={() => handleOpenModal(product)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
            </div>
          ))}
        </div>
        {filteredProducts.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No products found</h3>
            <p className="text-gray-500 dark:text-gray-400">Try adjusting your search or add a new product.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4" autoComplete="off">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product Name</label>
                  <input 
                    required
                    type="text" 
                    autoComplete="off"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</label>
                  <input 
                    type="text" 
                    autoComplete="off"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost Price (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        className="w-full pl-8 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                        value={formData.costPrice}
                        onChange={e => setFormData({...formData, costPrice: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Selling Price (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        className="w-full pl-8 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                        value={formData.price}
                        onChange={e => setFormData({...formData, price: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock Quantity</label>
                  <input 
                    required
                    type="number" 
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                    value={formData.stockQuantity}
                    onChange={e => setFormData({...formData, stockQuantity: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</label>
                  <textarea 
                    rows={3}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none dark:text-white"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
                >
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Adjust Modal */}
      {isAdjustModalOpen && editingProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 dark:text-white">Quick Adjust Stock</h3>
              <button 
                onClick={() => { setIsAdjustModalOpen(false); setEditingProduct(null); }} 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleQuickAdjust} className="p-6 space-y-5">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Adjusting Balance for:</p>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <Package className="w-5 h-5 text-indigo-500" />
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-white">{editingProduct.name}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{editingProduct.stockQuantity} currently in stock</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Quantity Change</label>
                <div className="relative">
                  <input 
                    required
                    type="number"
                    placeholder="e.g. 10 or -5"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg font-black focus:ring-2 focus:ring-indigo-500 outline-none text-center dark:text-white"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 pointer-events-none opacity-30">
                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                    <ArrowDownLeft className="w-4 h-4 text-red-500" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 text-center font-medium">Use positive numbers to add stock, negative to subtract.</p>
              </div>

              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Adjustment Reason (Optional)</label>
                <textarea 
                  rows={2}
                  placeholder="e.g. Fresh stock arrival, damaged item..."
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none dark:text-white"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => { setIsAdjustModalOpen(false); setEditingProduct(null); }}
                  className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  disabled={!adjustAmount || isProcessing}
                  type="submit"
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-xl shadow-indigo-100 dark:shadow-none"
                >
                  {isProcessing ? 'Saving...' : 'Update Stock'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
