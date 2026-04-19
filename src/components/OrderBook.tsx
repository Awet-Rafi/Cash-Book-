import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Search, 
  Package, 
  X, 
  AlertCircle, 
  Truck, 
  ChevronRight, 
  CheckCircle2, 
  Clock,
  ArrowRight,
  Trash2,
  Save,
  Layers,
  FileSpreadsheet,
  Upload,
  DollarSign
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { useRef } from 'react';

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  costPrice: number;
  category: string;
  brand?: string;
}

interface OrderContainer {
  id: string;
  name: string;
  status: 'draft' | 'pushed';
  createdAt: any;
  pushedAt?: any;
  items: OrderItem[];
  totalCost: number;
  externalExpenses: number;
}

export default function OrderBook() {
  const { isAdmin, businessId } = useAuth();
  const [containers, setContainers] = useState<OrderContainer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<OrderContainer | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Container Form
  const [newContainerName, setNewContainerName] = useState('');

  // New Item Form
  const [selectedCategory, setSelectedCategory] = useState<'Battery' | 'Tires'>('Battery');
  const [selectedBrand, setSelectedBrand] = useState<'INCOE' | 'TAFFPOWER' | ''>('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemCost, setItemCost] = useState('');

  useEffect(() => {
    if (!businessId) return;

    const unsubContainers = onSnapshot(
      query(collection(db, 'order_containers'), where('businessId', '==', businessId), orderBy('createdAt', 'desc')), 
      (snapshot) => {
        setContainers(snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          createdAt: safeTimestamp(doc.data().createdAt),
          pushedAt: safeTimestamp(doc.data().pushedAt)
        } as OrderContainer)));
        setLoading(false);
      }
    );

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('businessId', '==', businessId)), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data()
      } as Product)));
    });

    return () => {
      unsubContainers();
      unsubProducts();
    };
  }, [businessId]);

  const handleCreateContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContainerName.trim() || !businessId) return;

    try {
      const docRef = await addDoc(collection(db, 'order_containers'), {
        businessId,
        name: newContainerName,
        status: 'draft',
        items: [],
        totalCost: 0,
        externalExpenses: 0,
        createdAt: serverTimestamp()
      });
      setNewContainerName('');
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error creating container:", error);
    }
  };

  const handleAddItem = async () => {
    if (!activeContainer || !selectedProductId || !itemQuantity || !itemCost) return;

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedProductId,
      name: product.name,
      quantity: parseInt(itemQuantity),
      costPrice: parseFloat(itemCost),
      category: selectedCategory,
      brand: selectedCategory === 'Battery' ? selectedBrand : undefined
    };

    const updatedItems = [...activeContainer.items, newItem];
    const updatedTotalCost = updatedItems.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);

    try {
      await updateDoc(doc(db, 'order_containers', activeContainer.id), {
        items: updatedItems,
        totalCost: updatedTotalCost
      });
      
      // Reset item form
      setSelectedProductId('');
      setItemQuantity('');
      setItemCost('');
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activeContainer) return;

    const updatedItems = activeContainer.items.filter(item => item.id !== itemId);
    const updatedTotalCost = updatedItems.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);

    try {
      await updateDoc(doc(db, 'order_containers', activeContainer.id), {
        items: updatedItems,
        totalCost: updatedTotalCost
      });
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  const handleUpdateExpenses = async (expenses: string) => {
    if (!activeContainer) return;
    const amount = parseFloat(expenses) || 0;

    try {
      await updateDoc(doc(db, 'order_containers', activeContainer.id), {
        externalExpenses: amount
      });
    } catch (error) {
      console.error("Error updating expenses:", error);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeContainer) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

        if (jsonData.length === 0) {
          alert("The Excel file appears to be empty.");
          return;
        }

        const newItems: OrderItem[] = jsonData.map((row: any) => {
          // Try to find a matching product by name
          const productName = (row.Name || row.name || row.Product || row.product || '').toString().trim();
          const product = products.find(p => p.name.toLowerCase().trim() === productName.toLowerCase());
          
          return {
            id: Math.random().toString(36).substr(2, 9),
            productId: product?.id || '',
            name: product?.name || productName || 'Unknown Product',
            quantity: parseInt(row.Quantity || row.quantity || row.Qty || row.qty || 0),
            costPrice: parseFloat(row.CostPrice || row.costPrice || row.Cost || row.cost || 0),
            category: row.Category || row.category || product?.category || 'Battery',
            brand: row.Brand || row.brand || ''
          };
        }).filter(item => item.name !== 'Unknown Product' && item.quantity > 0);

        if (newItems.length === 0) {
          alert("No valid data found in Excel. Please check the column names (Name, Quantity, CostPrice).");
          return;
        }

        const updatedItems = [...activeContainer.items, ...newItems];
        const updatedTotalCost = updatedItems.reduce((acc, item) => acc + (item.quantity * item.costPrice), 0);

        await updateDoc(doc(db, 'order_containers', activeContainer.id), {
          items: updatedItems,
          totalCost: updatedTotalCost
        });

        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Error parsing Excel file. Please ensure it is a valid .xlsx or .xls file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const templateData = [
      { Name: 'Example Product Name', Quantity: 10, CostPrice: 50.00, Category: 'Battery', Brand: 'INCOE' },
      { Name: 'Another Product', Quantity: 5, CostPrice: 120.00, Category: 'Tires', Brand: '' }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Order_Template.xlsx");
  };

  const handlePushToInventory = async () => {
    if (!activeContainer || activeContainer.status === 'pushed') return;
    if (!isAdmin) return;

    const totalQuantity = activeContainer.items.reduce((acc, item) => acc + item.quantity, 0);
    const overheadPerItem = totalQuantity > 0 ? activeContainer.externalExpenses / totalQuantity : 0;

    if (!window.confirm(`Are you sure you want to push this order to inventory? 
      
Total Items: ${totalQuantity}
External Expenses: ${formatCurrency(activeContainer.externalExpenses)}
Overhead per Item: ${formatCurrency(overheadPerItem)}

This will update stock quantities and landed cost prices.`)) {
      return;
    }

    const batch = writeBatch(db);

    try {
      // Update each product in inventory
      for (const item of activeContainer.items) {
        // Landed Cost = Original Cost + Overhead
        const landedCost = item.costPrice + overheadPerItem;

        if (item.productId) {
          // Update existing product
          const productRef = doc(db, 'products', item.productId);
          const product = products.find(p => p.id === item.productId);
          
          if (product) {
            const newQuantity = product.stockQuantity + item.quantity;
            batch.update(productRef, {
              stockQuantity: newQuantity,
              costPrice: landedCost,
              updatedAt: serverTimestamp()
            });
          }
        } else {
          // Create new product
          const productsRef = collection(db, 'products');
          const newProductRef = doc(productsRef);
          batch.set(newProductRef, {
            businessId,
            name: item.name,
            description: `Imported from ${activeContainer.name}`,
            price: landedCost * 1.3, // Default 30% markup
            costPrice: landedCost,
            stockQuantity: item.quantity,
            category: item.category,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Mark container as pushed
      const containerRef = doc(db, 'order_containers', activeContainer.id);
      batch.update(containerRef, {
        status: 'pushed',
        pushedAt: serverTimestamp()
      });

      await batch.commit();
      setActiveContainer(null);
    } catch (error) {
      console.error("Error pushing to inventory:", error);
      alert("Failed to update inventory. Please try again.");
    }
  };

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'Battery') {
      return p.category === 'Battery' && (selectedBrand ? p.name.toLowerCase().includes(selectedBrand.toLowerCase()) : true);
    }
    return p.category === 'Tires';
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Order Book</h2>
          <p className="text-sm text-gray-500 font-medium">Manage incoming containers and inventory updates</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Plus className="w-5 h-5" />
          New Container
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Container List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-gray-50/50">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Truck className="w-4 h-4" /> Recent Containers
              </h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {containers.map((container) => (
                <button
                  key={container.id}
                  onClick={() => setActiveContainer(container)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-gray-50 transition-all flex items-center justify-between gap-3",
                    activeContainer?.id === container.id ? "bg-indigo-50/50 border-l-4 border-indigo-600" : "border-l-4 border-transparent"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{container.name}</p>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {format(new Date(container.createdAt), 'MMM dd, yyyy')} • {container.items.length} items
                    </p>
                  </div>
                  <div className="shrink-0">
                    {container.status === 'pushed' ? (
                      <div className="bg-green-100 text-green-700 p-1 rounded-full">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="bg-amber-100 text-amber-700 p-1 rounded-full">
                        <Clock className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {containers.length === 0 && !loading && (
                <div className="p-8 text-center">
                  <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No containers found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Container Details */}
        <div className="lg:col-span-2">
          {activeContainer ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-black text-gray-900">{activeContainer.name}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                      activeContainer.status === 'pushed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {activeContainer.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Created on {format(new Date(activeContainer.createdAt), 'MMMM dd, yyyy HH:mm')}
                  </p>
                </div>
                {activeContainer.status === 'draft' && (
                  <div className="flex items-center gap-3">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleExcelUpload}
                      accept=".xlsx, .xls"
                      className="hidden"
                    />
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all border border-gray-200"
                      title="Download Excel Template"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Template
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                      <Upload className="w-4 h-4" />
                      Import Excel
                    </button>
                    <button
                      onClick={handlePushToInventory}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Push to Inventory
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Goods Cost</p>
                    <p className="text-xl font-black text-indigo-600">{formatCurrency(activeContainer.totalCost)}</p>
                  </div>
                  <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">External Expenses</p>
                      <DollarSign className="w-3 h-3 text-amber-500" />
                    </div>
                    {activeContainer.status === 'draft' ? (
                      <input 
                        type="number"
                        value={activeContainer.externalExpenses || ''}
                        onChange={(e) => handleUpdateExpenses(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-transparent text-xl font-black text-amber-600 outline-none placeholder:text-amber-200"
                      />
                    ) : (
                      <p className="text-xl font-black text-amber-600">{formatCurrency(activeContainer.externalExpenses)}</p>
                    )}
                  </div>
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Landed Cost</p>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(activeContainer.totalCost + activeContainer.externalExpenses)}</p>
                  </div>
                </div>

                {activeContainer.status === 'draft' && (
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Item to Container
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
                        <select 
                          value={selectedCategory}
                          onChange={(e) => {
                            setSelectedCategory(e.target.value as 'Battery' | 'Tires');
                            setSelectedBrand('');
                            setSelectedProductId('');
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="Battery">Battery</option>
                          <option value="Tires">Tires</option>
                        </select>
                      </div>
                      
                      {selectedCategory === 'Battery' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Brand</label>
                          <select 
                            value={selectedBrand}
                            onChange={(e) => {
                              setSelectedBrand(e.target.value as any);
                              setSelectedProductId('');
                            }}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="">All Brands</option>
                            <option value="INCOE">INCOE</option>
                            <option value="TAFFPOWER">TAFFPOWER</option>
                          </select>
                        </div>
                      )}

                      <div className="space-y-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Product</label>
                        <select 
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">Select Product</option>
                          {filteredProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity</label>
                        <input 
                          type="number"
                          value={itemQuantity}
                          onChange={(e) => setItemQuantity(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cost Price</label>
                        <input 
                          type="number"
                          value={itemCost}
                          onChange={(e) => setItemCost(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2 lg:col-span-2 flex items-end">
                        <button
                          onClick={handleAddItem}
                          disabled={!selectedProductId || !itemQuantity || !itemCost}
                          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add to Container
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Items in this Container</h4>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Overhead: {formatCurrency(activeContainer.items.reduce((acc, i) => acc + i.quantity, 0) > 0 ? activeContainer.externalExpenses / activeContainer.items.reduce((acc, i) => acc + i.quantity, 0) : 0)} / item
                      </p>
                    </div>
                  </div>
                  
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Qty</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Base Cost</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Landed Cost</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total</th>
                          {activeContainer.status === 'draft' && <th className="px-4 py-3 w-10"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {activeContainer.items.map((item) => {
                          const totalQty = activeContainer.items.reduce((acc, i) => acc + i.quantity, 0);
                          const overhead = totalQty > 0 ? activeContainer.externalExpenses / totalQty : 0;
                          const landedCost = item.costPrice + overhead;

                          return (
                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-gray-900">{item.name}</p>
                                  {!item.productId && (
                                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[8px] font-black uppercase tracking-widest">New</span>
                                  )}
                                </div>
                                {item.brand && <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{item.brand}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">
                                  {item.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm font-black text-gray-900 text-center">{item.quantity}</td>
                              <td className="px-4 py-3 text-sm font-bold text-gray-400 text-right">{formatCurrency(item.costPrice)}</td>
                              <td className="px-4 py-3 text-sm font-black text-emerald-600 text-right">{formatCurrency(landedCost)}</td>
                              <td className="px-4 py-3 text-sm font-black text-indigo-600 text-right">{formatCurrency(item.quantity * landedCost)}</td>
                              {activeContainer.status === 'draft' && (
                                <td className="px-4 py-3">
                                  <button 
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {activeContainer.items.length === 0 && (
                          <tr>
                            <td colSpan={activeContainer.status === 'draft' ? 6 : 5} className="px-4 py-12 text-center">
                              <Layers className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No items added yet</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center p-12 text-center h-full min-h-[600px]">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
                <Truck className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Select a Container</h3>
              <p className="text-gray-500 max-w-xs mx-auto font-medium">
                Choose a container from the list to view its items or create a new one to start listing goods.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Container Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-black text-gray-900">New Container</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleCreateContainer} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Container Name / ID</label>
                <input 
                  type="text"
                  required
                  value={newContainerName}
                  onChange={(e) => setNewContainerName(e.target.value)}
                  placeholder="e.g. Container #2024-001"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Create Container
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
