import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Expense, Employee } from '../types';
import { formatCurrency, cn, safeTimestamp } from '../lib/utils';
import { Plus, Search, Trash2, Wallet, Calendar, Tag, X, Filter, DollarSign, Edit3, Users, UserPlus, Briefcase, Banknote } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function Expenses() {
  const { isAdmin, businessId } = useAuth();
  const location = useLocation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: 'General',
    currency: 'USD' as 'USD' | 'SSP'
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'expenses' | 'employees'>('expenses');
  
  // Clear search when switching tabs to prevent filtering issues
  useEffect(() => {
    setSearchTerm('');
  }, [activeTab]);

  // Employee state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeFormData, setEmployeeFormData] = useState({
    name: '',
    position: '',
    salary: '',
    salaryCurrency: 'USD' as 'USD' | 'SSP',
    hireDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'expenses'), where('businessId', '==', businessId), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timestamp: safeTimestamp(doc.data().timestamp)
      } as Expense)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });
    return unsub;
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'employees'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data()
      } as Employee)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    });
    return unsub;
  }, [businessId]);

  useEffect(() => {
    if (location.state?.currency) {
      setFormData(prev => ({ ...prev, currency: location.state.currency }));
      setIsModalOpen(true);
    }
    if (location.state?.highlightExpenseId && expenses.length > 0) {
      const expense = expenses.find(e => e.id === location.state.highlightExpenseId);
      if (expense) {
        setFormData({
          description: expense.description,
          amount: expense.amount.toString(),
          category: expense.category,
          currency: expense.currency
        });
        setEditingId(expense.id);
        setIsModalOpen(true);
      }
    }
  }, [location.state, expenses]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    try {
      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), {
          description: formData.description,
          amount: parseFloat(formData.amount),
          category: formData.category,
          currency: formData.currency,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'expenses'), {
          businessId,
          description: formData.description,
          amount: parseFloat(formData.amount),
          category: formData.category,
          currency: formData.currency,
          timestamp: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ description: '', amount: '', category: 'General', currency: 'USD' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !deleteId) return;
    try {
      await deleteDoc(doc(db, 'expenses', deleteId));
      setDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${deleteId}`);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!isAdmin || !deleteEmployeeId) return;
    try {
      await deleteDoc(doc(db, 'employees', deleteEmployeeId));
      setDeleteEmployeeId(null);
      setSuccessMessage('Employee removed successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${deleteEmployeeId}`);
    }
  };

  const filteredExpenses = expenses.filter(e => 
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    try {
      const data = {
        businessId,
        name: employeeFormData.name,
        position: employeeFormData.position,
        salary: parseFloat(employeeFormData.salary) || 0,
        salaryCurrency: employeeFormData.salaryCurrency,
        hireDate: employeeFormData.hireDate,
        status: employeeFormData.status,
        updatedAt: serverTimestamp()
      };

      if (editingEmployeeId) {
        await updateDoc(doc(db, 'employees', editingEmployeeId), data);
      } else {
        await addDoc(collection(db, 'employees'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setIsEmployeeModalOpen(false);
      setEditingEmployeeId(null);
      setSearchTerm(''); // Clear search to show the new employee
      setEmployeeFormData({
        name: '',
        position: '',
        salary: '',
        salaryCurrency: 'USD',
        hireDate: format(new Date(), 'yyyy-MM-dd'),
        status: 'active'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  };

  const handlePaySalary = async (employee: Employee) => {
    if (!businessId) return;
    try {
      await addDoc(collection(db, 'expenses'), {
        businessId,
        description: `Salary Payment - ${employee.name} (${format(new Date(), 'MMMM yyyy')})`,
        amount: employee.salary,
        category: 'Salaries',
        currency: employee.salaryCurrency,
        timestamp: serverTimestamp(),
        employeeId: employee.id // Link to employee
      });
      setSuccessMessage(`Salary recorded for ${employee.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  const viewEmployeePayments = (employee: Employee) => {
    setSearchTerm(employee.name);
    setActiveTab('expenses');
  };

  const isEmployeePaidThisMonth = (employeeId: string) => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    return expenses.some(e => 
      e.employeeId === employeeId && 
      e.category === 'Salaries' && 
      isWithinInterval(new Date(e.timestamp), { start, end })
    );
  };

  const totalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

  if (!businessId && !loading) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-100">
        <p className="text-red-600 font-bold">Business ID not found. Please ensure your profile is set up correctly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('expenses')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
            activeTab === 'expenses' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Wallet className="w-4 h-4" />
          Expenses
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
            activeTab === 'employees' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Users className="w-4 h-4" />
          Employee Salaries
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder={activeTab === 'expenses' ? "Search expenses..." : "Search employees..."}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        {activeTab === 'expenses' ? (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
          >
            <Plus className="w-5 h-5" />
            Record Expense
          </button>
        ) : (
          <button 
            onClick={() => setIsEmployeeModalOpen(true)}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <UserPlus className="w-5 h-5" />
            Add Employee
          </button>
        )}
      </div>

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-600 text-sm font-bold animate-in fade-in slide-in-from-top-2">
          {successMessage}
        </div>
      )}

      {activeTab === 'expenses' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {format(new Date(expense.timestamp), 'MMM dd, yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{expense.description}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-red-600">
                        {expense.currency === 'USD' ? '$' : ''}
                        {expense.amount.toLocaleString('en-US')}
                        {expense.currency === 'SSP' ? ' SSP' : ''}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setFormData({
                                description: expense.description,
                                amount: expense.amount.toString(),
                                category: expense.category,
                                currency: expense.currency
                              });
                              setEditingId(expense.id);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button 
                              onClick={() => setDeleteId(expense.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              {filteredExpenses.map((expense) => (
                <div key={expense.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {expense.category}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {format(new Date(expense.timestamp), 'MMM dd')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-red-600">
                        {expense.currency === 'USD' ? '$' : ''}
                        {expense.amount.toLocaleString('en-US')}
                        {expense.currency === 'SSP' ? ' SSP' : ''}
                      </p>
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button 
                          onClick={() => {
                            setFormData({
                              description: expense.description,
                              amount: expense.amount.toString(),
                              category: expense.category,
                              currency: expense.currency
                            });
                            setEditingId(expense.id);
                            setIsModalOpen(true);
                          }}
                          className="p-2 text-gray-400 hover:text-indigo-600 bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => setDeleteId(expense.id)}
                            className="p-2 text-gray-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredExpenses.length === 0 && !loading && (
              <div className="text-center py-20">
                <Wallet className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-medium">No expenses recorded</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Summary</h3>
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-xl border border-red-100 space-y-2">
                  <div>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">Total USD Expenses</p>
                    <p className="text-2xl font-black text-red-700">
                      ${filteredExpenses.filter(e => e.currency === 'USD').reduce((acc, e) => acc + e.amount, 0).toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-red-100">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">Total SSP Expenses</p>
                    <p className="text-2xl font-black text-red-700">
                      {filteredExpenses.filter(e => e.currency === 'SSP').reduce((acc, e) => acc + e.amount, 0).toLocaleString('en-US')} SSP
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">By Category</p>
                  {Array.from(new Set(expenses.map(e => e.category))).map(cat => {
                    const catTotal = expenses.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
                    const percentage = (catTotal / (totalExpenses || 1)) * 100;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-gray-700">{cat}</span>
                          <span className="font-bold text-gray-900">{formatCurrency(catTotal)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Salary Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-2xl shadow-lg shadow-indigo-100 text-white">
              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-1">Monthly USD Payroll</p>
              <p className="text-lg font-black">
                ${employees.filter(e => e.salaryCurrency === 'USD' && e.status === 'active').reduce((acc, e) => acc + e.salary, 0).toLocaleString('en-US')}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-indigo-100/80">
                <Users className="w-3 h-3" />
                {employees.filter(e => e.salaryCurrency === 'USD' && e.status === 'active').length} Active Staff
              </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-lg shadow-emerald-100 text-white">
              <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Monthly SSP Payroll</p>
              <p className="text-lg font-black">
                {employees.filter(e => e.salaryCurrency === 'SSP' && e.status === 'active').reduce((acc, e) => acc + e.salary, 0).toLocaleString('en-US')} SSP
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-emerald-100/80">
                <Users className="w-3 h-3" />
                {employees.filter(e => e.salaryCurrency === 'SSP' && e.status === 'active').length} Active Staff
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Monthly Salary</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase())).map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <p className="text-sm font-bold text-gray-900">{employee.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Briefcase className="w-4 h-4 text-gray-400" />
                        {employee.position}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-indigo-600">
                        {employee.salaryCurrency === 'USD' ? '$' : ''}
                        {employee.salary.toLocaleString('en-US')}
                        {employee.salaryCurrency === 'SSP' ? ' SSP' : ''}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        employee.status === 'active' ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                      )}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button 
                          onClick={() => handlePaySalary(employee)}
                          disabled={employee.status === 'inactive' || isEmployeePaidThisMonth(employee.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5",
                            (employee.status === 'inactive' || isEmployeePaidThisMonth(employee.id))
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                          )}
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          {employee.status === 'inactive' ? 'Inactive' : isEmployeePaidThisMonth(employee.id) ? 'Paid' : 'Pay'}
                        </button>
                        <button 
                          onClick={() => viewEmployeePayments(employee)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Payment History"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            setEmployeeFormData({
                              name: employee.name,
                              position: employee.position,
                              salary: employee.salary.toString(),
                              salaryCurrency: employee.salaryCurrency,
                              hireDate: employee.hireDate,
                              status: employee.status
                            });
                            setEditingEmployeeId(employee.id);
                            setIsEmployeeModalOpen(true);
                          }}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => setDeleteEmployeeId(employee.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
            {employees.filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase())).map((employee) => (
              <div key={employee.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{employee.name}</p>
                      <p className="text-[10px] text-gray-500 font-medium">{employee.position}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider",
                    employee.status === 'active' ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                  )}>
                    {employee.status}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Salary</p>
                    <p className="text-sm font-black text-indigo-600">
                      {employee.salaryCurrency === 'USD' ? '$' : ''}
                      {employee.salary.toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handlePaySalary(employee)}
                      disabled={employee.status === 'inactive' || isEmployeePaidThisMonth(employee.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all",
                        (employee.status === 'inactive' || isEmployeePaidThisMonth(employee.id))
                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-indigo-600 text-white"
                      )}
                    >
                      {employee.status === 'inactive' ? 'Inactive' : isEmployeePaidThisMonth(employee.id) ? 'Paid' : 'Pay'}
                    </button>
                    <button 
                      onClick={() => viewEmployeePayments(employee)}
                      className="p-2 text-gray-400 bg-white border border-gray-100 rounded-lg"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => {
                        setEmployeeFormData({
                          name: employee.name,
                          position: employee.position,
                          salary: employee.salary.toString(),
                          salaryCurrency: employee.salaryCurrency,
                          hireDate: employee.hireDate,
                          status: employee.status
                        });
                        setEditingEmployeeId(employee.id);
                        setIsEmployeeModalOpen(true);
                      }}
                      className="p-2 text-gray-400 bg-white border border-gray-100 rounded-lg"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => setDeleteEmployeeId(employee.id)}
                        className="p-2 text-red-400 bg-white border border-gray-100 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {employees.length === 0 && (
            <div className="text-center py-20">
              <Users className="w-12 h-12 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-medium">No employees added yet</p>
              <button 
                onClick={() => setIsEmployeeModalOpen(true)}
                className="mt-4 text-indigo-600 font-bold text-sm hover:underline"
              >
                Add your first employee
              </button>
            </div>
          )}
        </div>
      </div>
    )}

      {/* Employee Modal */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">{editingEmployeeId ? 'Edit Employee' : 'Add New Employee'}</h3>
              <button onClick={() => { setIsEmployeeModalOpen(false); setEditingEmployeeId(null); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleEmployeeSubmit} className="p-6 space-y-4" autoComplete="off">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={employeeFormData.name}
                  onChange={e => setEmployeeFormData({...employeeFormData, name: e.target.value})}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Position</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={employeeFormData.position}
                  onChange={e => setEmployeeFormData({...employeeFormData, position: e.target.value})}
                  placeholder="e.g. Sales Manager"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Salary Amount</label>
                  <input 
                    required
                    type="number" 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={employeeFormData.salary}
                    onChange={e => setEmployeeFormData({...employeeFormData, salary: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Currency</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={employeeFormData.salaryCurrency}
                    onChange={e => setEmployeeFormData({...employeeFormData, salaryCurrency: e.target.value as 'USD' | 'SSP'})}
                  >
                    <option value="USD">USD</option>
                    <option value="SSP">SSP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Hire Date</label>
                  <input 
                    required
                    type="date" 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={employeeFormData.hireDate}
                    onChange={e => setEmployeeFormData({...employeeFormData, hireDate: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={employeeFormData.status}
                    onChange={e => setEmployeeFormData({...employeeFormData, status: e.target.value as 'active' | 'inactive'})}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setIsEmployeeModalOpen(false); setEditingEmployeeId(null); }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  {editingEmployeeId ? 'Update Employee' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {(deleteId || deleteEmployeeId) && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
              {deleteId ? 'Delete Expense?' : 'Remove Employee?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This action cannot be undone. Are you sure you want to delete this record?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => { setDeleteId(null); setDeleteEmployeeId(null); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={deleteId ? handleDelete : handleDeleteEmployee}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Expense' : 'Record New Expense'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4" autoComplete="off">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                <input 
                  required
                  type="text" 
                  autoComplete="off"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="e.g. Electricity Bill, Rent, Supplies"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Currency</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, currency: 'USD'})}
                    className={cn(
                      "py-2 rounded-xl text-xs font-bold transition-all border",
                      formData.currency === 'USD' 
                        ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-100" 
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    USD
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, currency: 'SSP'})}
                    className={cn(
                      "py-2 rounded-xl text-xs font-bold transition-all border",
                      formData.currency === 'SSP' 
                        ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-100" 
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    SSP
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                    {formData.currency === 'USD' ? '$' : 'SSP'}
                  </div>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Category</label>
                <select 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  <option>General</option>
                  <option>Utilities</option>
                  <option>Rent</option>
                  <option>Supplies</option>
                  <option>Marketing</option>
                  <option>Salaries</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingId(null); }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                >
                  {editingId ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
