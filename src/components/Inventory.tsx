import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Plus, Search, Edit2, Trash2, Package, X, AlertCircle, RotateCcw, ArrowUpRight, ArrowDownLeft, FileText, FileSpreadsheet, PlusCircle, CheckCircle2, Calculator } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { exportStockStatusPDF, exportStockStatusExcel } from '../lib/exportUtils';

export default function Inventory() {
  const { isAdmin, businessId, businessName } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'arrived' | 'subtract'>('arrived');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [arrivedStock, setArrivedStock] = useState('');
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
    setArrivedStock('');
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

  const handleArrivedStockChange = (val: string) => {
    setArrivedStock(val);
    const baseStock = editingProduct ? editingProduct.stockQuantity : 0;
    if (val === '') {
      setFormData(prev => ({
        ...prev,
        stockQuantity: baseStock.toString()
      }));
      return;
    }
    const addUnits = parseInt(val, 10);
    if (!isNaN(addUnits)) {
      const total = Math.max(0, baseStock + addUnits);
      setFormData(prev => ({
        ...prev,
        stockQuantity: total.toString()
      }));
    }
  };

  const handleQuickAddArrived = (amount: number) => {
    const currentArrived = parseInt(arrivedStock, 10) || 0;
    const newArrived = Math.max(0, currentArrived + amount);
    handleArrivedStockChange(newArrived > 0 ? newArrived.toString() : '');
  };

  const handleStockQuantityChange = (val: string) => {
    setFormData(prev => ({ ...prev, stockQuantity: val }));
    if (editingProduct) {
      const newQty = parseInt(val, 10);
      if (!isNaN(newQty)) {
        const diff = newQty - editingProduct.stockQuantity;
        if (diff > 0) {
          setArrivedStock(diff.toString());
        } else {
          setArrivedStock('');
        }
      } else {
        setArrivedStock('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !businessId || isProcessing) return;

    setIsProcessing(true);
    const newStockQty = parseInt(formData.stockQuantity, 10) || 0;
    const arrivedUnits = parseInt(arrivedStock, 10) || 0;
    const data = {
      businessId,
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price),
      costPrice: parseFloat(formData.costPrice),
      stockQuantity: newStockQty,
      category: formData.category,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), data);
        
        // Log movement if stock changed
        const stockDiff = newStockQty - editingProduct.stockQuantity;
        if (stockDiff !== 0) {
          const movementNote = arrivedUnits > 0
            ? `New stock arrival: +${arrivedUnits} units (Total: ${newStockQty})`
            : (stockDiff > 0 ? `Restocked +${stockDiff} units (Total: ${newStockQty})` : `Manual stock adjustment: ${stockDiff} units (Total: ${newStockQty})`);

          await addDoc(collection(db, 'stockMovements'), {
            businessId,
            productId: editingProduct.id,
            productName: editingProduct.name,
            type: stockDiff > 0 ? 'restock' : 'adjustment',
            quantity: stockDiff,
            timestamp: serverTimestamp(),
            notes: movementNote,
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
          notes: `Initial stock entry (${newStockQty} units)`,
          referenceId: productRef.id
        });
      }
      setIsModalOpen(false);
      setArrivedStock('');
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
      const parsed = parseInt(adjustAmount, 10);
      const effectiveAmount = adjustMode === 'subtract' ? -Math.abs(parsed) : Math.abs(parsed);
      const newStock = Math.max(0, editingProduct.stockQuantity + effectiveAmount);
      
      const productRef = doc(db, 'products', editingProduct.id);
      await updateDoc(productRef, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp()
      });

      const defaultNote = effectiveAmount > 0 
        ? `New stock arrival: +${effectiveAmount} units` 
        : `Stock reduced: ${effectiveAmount} units`;

      await addDoc(collection(db, 'stockMovements'), {
        businessId,
        productId: editingProduct.id,
        productName: editingProduct.name,
        type: effectiveAmount > 0 ? 'restock' : 'adjustment',
        quantity: effectiveAmount,
        timestamp: serverTimestamp(),
        notes: adjustNotes.trim() || defaultNote,
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
            <button
              onClick={() => exportStockStatusPDF(filteredProducts, businessName)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
              title="Print/Download PDF Inventory Report"
            >
              <FileText className="w-4 h-4" />
              <span>PDF</span>
            </button>
            <button
              onClick={() => exportStockStatusExcel(filteredProducts, businessName)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors cursor-pointer"
              title="Download Excel Inventory Report"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel</span>
            </button>
          </div>
          {isAdmin && (
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none shrink-0"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          )}
        </div>
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
                    <div className="flex items-center justify-end gap-1.5">
                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => { 
                              setEditingProduct(product); 
                              setAdjustMode('arrived'); 
                              setAdjustAmount(''); 
                              setAdjustNotes('New stock arrival');
                              setIsAdjustModalOpen(true); 
                            }}
                            className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200/60 dark:border-emerald-800/60 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                            title="Add New Stock Arrived"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Stock</span>
                          </button>
                          <button 
                            onClick={() => handleOpenModal(product)}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors cursor-pointer"
                            title="Delete Product"
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
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button 
                    onClick={() => { 
                      setEditingProduct(product); 
                      setAdjustMode('arrived'); 
                      setAdjustAmount(''); 
                      setAdjustNotes('New stock arrival');
                      setIsAdjustModalOpen(true); 
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Stock
                  </button>
                  <button 
                    onClick={() => handleOpenModal(product)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(product.id)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[calc(100dvh-2rem)] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/80 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                  {editingProduct ? 'Update item details & receive stock' : 'Create new product in catalogue'}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)} 
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors cursor-pointer text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body & Form */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden" autoComplete="off">
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
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
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
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

                  {/* Stock Management & New Stock Arrival */}
                  {editingProduct ? (
                    <div className="p-3.5 sm:p-4 bg-emerald-50/40 dark:bg-emerald-950/20 border-2 border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-emerald-950 dark:text-emerald-200 uppercase tracking-wider block">
                              Stock & Arrival
                            </label>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Add new arrived stock to sum with current balance</span>
                          </div>
                        </div>
                        <div className="px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-right shrink-0">
                          <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider block">Current</span>
                          <span className="text-xs font-black text-gray-900 dark:text-white">{editingProduct.stockQuantity} units</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                        {/* Current In Stock (Reference) */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Current Stock</span>
                            <span className="text-[10px] text-gray-400 font-normal">in store</span>
                          </label>
                          <div className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-black text-gray-800 dark:text-gray-200 flex items-center justify-between">
                            <span className="text-base">{editingProduct.stockQuantity}</span>
                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Base</span>
                          </div>
                        </div>

                        {/* New Stock Arrived (+) Input */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" />
                              <span>New Stock Arrived</span>
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100/70 dark:bg-emerald-900/40 px-1.5 py-0.2 rounded">
                              + Sums
                            </span>
                          </label>
                          <div className="relative">
                            <input 
                              type="number" 
                              min="0"
                              placeholder="Enter arrived stock (e.g. 20)"
                              className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-emerald-500 dark:border-emerald-500 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none transition-all dark:text-white font-black text-emerald-700 dark:text-emerald-300 placeholder:text-gray-400 placeholder:font-normal text-base shadow-sm"
                              value={arrivedStock}
                              onChange={e => handleArrivedStockChange(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quick increment chips for arrived stock */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Quick Add:</span>
                        {[5, 10, 20, 50, 100].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => handleQuickAddArrived(amt)}
                            className="px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-gray-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700/60 rounded-lg transition-colors cursor-pointer"
                          >
                            +{amt}
                          </button>
                        ))}
                        {arrivedStock && (
                          <button
                            type="button"
                            onClick={() => handleArrivedStockChange('')}
                            className="px-2 py-0.5 text-xs font-bold text-gray-500 hover:text-red-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors ml-auto cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Live Calculation Banner */}
                      {parseInt(arrivedStock, 10) > 0 && (
                        <div className="p-2.5 sm:p-3 bg-emerald-100/80 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-emerald-950 dark:text-emerald-200 flex-wrap">
                            <span>Current: <strong className="text-gray-900 dark:text-white">{editingProduct.stockQuantity}</strong></span>
                            <span>+</span>
                            <span>Arrived: <strong className="text-emerald-700 dark:text-emerald-300">+{parseInt(arrivedStock, 10)}</strong></span>
                            <span>=</span>
                            <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md font-black text-xs sm:text-sm shadow-sm">
                              {editingProduct.stockQuantity + parseInt(arrivedStock, 10)} Total
                            </span>
                          </div>
                          <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300 shrink-0">
                            Summed ✓
                          </span>
                        </div>
                      )}

                      {/* Total Resulting Stock Quantity */}
                      <div className="space-y-1 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/50">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                            Total Resulting Stock Quantity
                          </label>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            Editable total in inventory
                          </span>
                        </div>
                        <input 
                          required
                          type="number" 
                          min="0"
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-black text-base"
                          value={formData.stockQuantity}
                          onChange={e => handleStockQuantityChange(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial Stock Quantity</label>
                      <input 
                        required
                        type="number" 
                        min="0"
                        placeholder="e.g. 50"
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-bold"
                        value={formData.stockQuantity}
                        onChange={e => setFormData({...formData, stockQuantity: e.target.value})}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</label>
                    <textarea 
                      rows={2}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none dark:text-white text-sm"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Footer with Actions */}
              <div className="p-4 sm:px-6 bg-gray-50/80 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-700 shrink-0 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none cursor-pointer text-sm"
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl sm:rounded-[32px] overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[calc(100dvh-2rem)] my-auto"
          >
            <div className="p-5 sm:p-6 pb-3 sm:pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  {adjustMode === 'arrived' ? 'Receive New Stock' : 'Adjust Stock'}
                </h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                  {adjustMode === 'arrived' ? 'Add arrived stock to inventory' : 'Manually adjust balance'}
                </p>
              </div>
              <button 
                onClick={() => { setIsAdjustModalOpen(false); setEditingProduct(null); }} 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="p-1.5 mx-5 sm:mx-6 mt-3 bg-gray-100 dark:bg-gray-900 rounded-xl sm:rounded-2xl flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAdjustMode('arrived');
                  setAdjustNotes('New stock arrival');
                }}
                className={cn(
                  "flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  adjustMode === 'arrived'
                    ? "bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                New Stock Arrived (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjustMode('subtract');
                  setAdjustNotes('Manual reduction / correction');
                }}
                className={cn(
                  "flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  adjustMode === 'subtract'
                    ? "bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Reduce (-)
              </button>
            </div>

            <form onSubmit={handleQuickAdjust} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 sm:p-6 pt-3 space-y-3.5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Target Product</p>
                  <div className="flex items-center gap-3 p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-900 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700">
                    <Package className="w-5 h-5 text-indigo-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900 dark:text-white truncate">{editingProduct.name}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Current in stock: <strong className="text-gray-900 dark:text-white">{editingProduct.stockQuantity}</strong> units
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 block">
                    {adjustMode === 'arrived' ? 'New Stock Arrived Quantity (+)' : 'Quantity to Deduct (-)'}
                  </label>
                  <div className="relative">
                    <input 
                      required
                      type="number"
                      min="1"
                      placeholder="e.g. 15"
                      className={cn(
                        "w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-2 rounded-xl sm:rounded-2xl text-lg font-black focus:ring-2 outline-none text-center dark:text-white transition-all",
                        adjustMode === 'arrived'
                          ? "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "border-red-400/50 focus:border-red-500 focus:ring-red-500/20 text-red-600 dark:text-red-400"
                      )}
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                      {adjustMode === 'arrived' ? (
                        <Plus className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ArrowDownLeft className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </div>

                  {/* Quick chip buttons */}
                  <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
                    {[5, 10, 20, 50, 100].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAdjustAmount(amt.toString())}
                        className="px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Summed Preview */}
                {adjustAmount && !isNaN(parseInt(adjustAmount, 10)) && parseInt(adjustAmount, 10) > 0 && (
                  <div className={cn(
                    "p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border text-xs flex items-center justify-between font-bold animate-in fade-in zoom-in-95",
                    adjustMode === 'arrived'
                      ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200"
                      : "bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-950 dark:text-red-200"
                  )}>
                    <div>
                      <span>Current: <strong>{editingProduct.stockQuantity}</strong></span>
                      <span className="mx-1">{adjustMode === 'arrived' ? '+' : '-'}</span>
                      <span>{adjustMode === 'arrived' ? 'Arrived' : 'Deducted'}: <strong>{Math.abs(parseInt(adjustAmount, 10))}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>=</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-lg text-white font-black text-xs sm:text-sm",
                        adjustMode === 'arrived' ? "bg-emerald-600" : "bg-red-600"
                      )}>
                        {adjustMode === 'arrived' 
                          ? editingProduct.stockQuantity + Math.abs(parseInt(adjustAmount, 10))
                          : Math.max(0, editingProduct.stockQuantity - Math.abs(parseInt(adjustAmount, 10)))
                        } Total
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Note / Reason</label>
                  <input 
                    type="text"
                    placeholder="e.g. Fresh stock arrival, container #1..."
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Fixed Footer with Actions */}
              <div className="p-4 sm:px-6 bg-gray-50/80 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-700 shrink-0 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setIsAdjustModalOpen(false); setEditingProduct(null); }}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  disabled={!adjustAmount || isProcessing}
                  type="submit"
                  className={cn(
                    "flex-1 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-wider disabled:bg-gray-300 transition-all shadow-md cursor-pointer",
                    adjustMode === 'arrived' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none"
                  )}
                >
                  {isProcessing ? 'Saving...' : adjustMode === 'arrived' ? 'Add & Sum Stock' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
