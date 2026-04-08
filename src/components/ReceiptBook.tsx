import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp, doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sale } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Search, Receipt, Calendar, User, CreditCard, DollarSign, Eye, X, Printer, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../App';

export default function ReceiptBook() {
  const { isAdmin } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const unsubSales = onSnapshot(query(
      collection(db, 'sales'),
      orderBy('timestamp', 'desc')
    ), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Sale)));
      setLoading(false);
    });

    return () => unsubSales();
  }, []);

  const filteredSales = sales.filter(s => 
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteSale = async () => {
    if (!isAdmin || !deleteId) return;
    const saleToDelete = sales.find(s => s.id === deleteId);
    if (!saleToDelete) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Restore Stock
      for (const item of saleToDelete.items) {
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stockQuantity: increment(item.quantity)
        });
      }

      // 2. Delete Sale Record
      const saleRef = doc(db, 'sales', deleteId);
      batch.delete(saleRef);

      await batch.commit();
      setDeleteId(null);
    } catch (error) {
      console.error("Error deleting sale:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="h-96 bg-white rounded-2xl border border-gray-100" />
  </div>;

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search receipts by customer or ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
          <Receipt className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-bold text-indigo-700">
            Total Receipts: {sales.length}
          </span>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Receipt ID</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {format(new Date(sale.timestamp), 'MMM dd, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-mono text-gray-400">#{sale.id.slice(-8).toUpperCase()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <p className="text-sm font-bold text-gray-900">{sale.customerName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {sale.paymentMethod === 'cash' ? (
                        <DollarSign className="w-4 h-4 text-green-500" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-indigo-500" />
                      )}
                      <span className="text-sm text-gray-600 capitalize">{sale.paymentMethod}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-gray-900">{formatCurrency(sale.totalAmount)}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase",
                      sale.status === 'paid' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setSelectedSale(sale)}
                        className="p-2 hover:bg-indigo-50 rounded-lg transition-all text-indigo-600"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => setDeleteId(sale.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-all text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                          title="Delete Receipt"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100">
          {filteredSales.map((sale) => (
            <div key={sale.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-gray-400">#{sale.id.slice(-8).toUpperCase()}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                      sale.status === 'paid' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {sale.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 truncate">{sale.customerName}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-gray-900">{formatCurrency(sale.totalAmount)}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {sale.paymentMethod === 'cash' ? (
                      <DollarSign className="w-3 h-3 text-green-500" />
                    ) : (
                      <CreditCard className="w-3 h-3 text-indigo-500" />
                    )}
                    <span className="text-[10px] text-gray-500 capitalize">{sale.paymentMethod}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(sale.timestamp), 'MMM dd, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedSale(sale)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => setDeleteId(sale.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredSales.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No receipts found</h3>
            <p className="text-gray-500">All sales transactions will appear here.</p>
          </div>
        )}
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-xl">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Receipt Details</h3>
                  <p className="text-xs text-gray-500">#{selectedSale.id.toUpperCase()}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSale(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-all"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                  <p className="text-sm font-bold text-gray-900">{selectedSale.customerName}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                  <p className="text-sm font-bold text-gray-900">{format(new Date(selectedSale.timestamp), 'MMM dd, yyyy HH:mm')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Items</p>
                <div className="space-y-2">
                  {selectedSale.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-[10px] font-bold text-gray-500">
                          {item.quantity}x
                        </span>
                        <span className="text-gray-900 font-medium">{item.name}</span>
                      </div>
                      <span className="text-gray-600">{formatCurrency(item.priceAtSale * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="text-sm font-bold text-gray-900 capitalize">{selectedSale.paymentMethod}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    selectedSale.status === 'paid' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {selectedSale.status}
                  </span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Discount</p>
                    <p className="text-sm font-bold text-red-600">-{formatCurrency(selectedSale.discount)}</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-4">
                  <p className="text-lg font-bold text-gray-900">Total Amount</p>
                  <p className="text-2xl font-black text-indigo-600">{formatCurrency(selectedSale.totalAmount)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex gap-3">
              {isAdmin && (
                <button 
                  onClick={() => {
                    setDeleteId(selectedSale.id);
                    setSelectedSale(null);
                  }}
                  className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                  title="Delete Receipt"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button 
                onClick={() => setSelectedSale(null)}
                className="flex-1 px-4 py-3 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Receipt?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This will permanently delete the receipt and <strong>restore the items back to stock</strong>.
            </p>
            <div className="flex gap-3">
              <button 
                disabled={isDeleting}
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                disabled={isDeleting}
                onClick={handleDeleteSale}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50 flex items-center justify-center"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
