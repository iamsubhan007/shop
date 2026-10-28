'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Package,
  Layers,
  Sparkles,
  Receipt,
  Settings,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  DollarSign,
  TrendingUp,
  Clock,
  Bike,
  Building2,
  MapPin,
  Check,
  AlertCircle,
  Database,
  Upload,
  Loader2,
  X,
  Image as ImageIcon,
  Users,
  KeyRound,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  initialProducts,
  initialCategories,
  initialDeals,
  initialBankDetails,
  initialShopSettings,
} from '@/lib/data/initialData';

export default function AdminDashboardPage() {
  const {
    user,
    profile,
    isAdmin,
    isSuperAdmin,
    isOtpVerified,
    signOut,
    sendAdminOtp,
    verifyAdminOtp,
    changePassword,
  } = useAuth();

  // Active Tab: 'orders' | 'menu' | 'deals' | 'categories' | 'admins' | 'settings'
  const [activeTab, setActiveTab] = useState('orders');

  // Orders State
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');

  // Menu State
  const [products, setProducts] = useState(initialProducts);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [editingProduct, setEditingProduct] = useState(null);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);

  // Deals State
  const [deals, setDeals] = useState(initialDeals);
  const [editingDeal, setEditingDeal] = useState(null);

  // Categories State
  const [categories, setCategories] = useState(initialCategories);

  // Settings State
  const [shopSettings, setShopSettings] = useState(initialShopSettings);
  const [bankSettings, setBankSettings] = useState(initialBankDetails);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Admin & Staff Management State
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [isNewAdminModalOpen, setIsNewAdminModalOpen] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'admin',
  });
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionMsg, setAdminActionMsg] = useState('');
  const [adminActionError, setAdminActionError] = useState('');

  // Password Change Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeMsg, setPasswordChangeMsg] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Inline OTP state if loaded directly without auth screen
  const [otpInput, setOtpInput] = useState('');
  const [inlineOtpLoading, setInlineOtpLoading] = useState(false);
  const [inlineOtpError, setInlineOtpError] = useState('');
  const [inlineOtpSent, setInlineOtpSent] = useState(false);

  // Fetch orders
  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/orders?admin=true');
      const data = await res.json();
      if (data.orders) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('Error fetching admin orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch catalog from live API
  const fetchCatalog = async () => {
    try {
      const [prodRes, catRes, dealRes, setRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/categories'),
        fetch('/api/deals'),
        fetch('/api/settings'),
      ]);
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        if (prodData.products?.length) setProducts(prodData.products);
      }
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.categories?.length) setCategories(catData.categories);
      }
      if (dealRes.ok) {
        const dealData = await dealRes.json();
        if (dealData.deals?.length) setDeals(dealData.deals);
      }
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.shopSettings) setShopSettings(setData.shopSettings);
        if (setData.bankSettings) setBankSettings(setData.bankSettings);
      }
    } catch (e) {
      console.warn('Error loading catalog data:', e);
    }
  };

  // Fetch admin and user accounts (Super Admin only)
  const fetchAdminUsers = async () => {
    setAdminUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) {
        setAdminUsers(data.users);
      }
    } catch (err) {
      console.error('Error loading admin users:', err);
    } finally {
      setAdminUsersLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && isOtpVerified) {
      fetchOrders();
      fetchCatalog();
      fetchAdminUsers();
    }
  }, [isAdmin, isOtpVerified]);

  // Sync all local data and public images to Supabase database
  const handleSyncDatabase = async () => {
    setIsSyncing(true);
    setSyncStatus('Syncing to Supabase...');
    try {
      const res = await fetch('/api/db/shift', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncStatus('Database Synced Successfully!');
        await fetchCatalog();
      } else {
        setSyncStatus('Sync note: ' + (data.error || 'Check SQL'));
      }
    } catch (e) {
      setSyncStatus('Error syncing: ' + e.message);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(''), 5000);
    }
  };

  // Update order status handler
  const handleUpdateOrderStatus = async (orderId, newStatus, paymentStatus = null) => {
    try {
      const payload = { status: newStatus };
      if (paymentStatus) payload.paymentStatus = paymentStatus;

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId || o.order_number === orderId
              ? { ...o, status: newStatus, ...(paymentStatus ? { payment_status: paymentStatus } : {}) }
              : o
          )
        );
        if (selectedOrder && (selectedOrder.id === orderId || selectedOrder.order_number === orderId)) {
          setSelectedOrder((prev) => ({
            ...prev,
            status: newStatus,
            ...(paymentStatus ? { payment_status: paymentStatus } : {}),
          }));
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Toggle item availability
  const toggleProductAvailability = async (productId) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const newAvail = !prod.is_available;
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, is_available: newAvail } : p))
    );
    try {
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, is_available: newAvail }),
      });
    } catch (e) {
      console.error('Failed to update product availability:', e);
    }
  };

  // Save product edit/create
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct.id && !editingProduct.id.startsWith('new_')) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? editingProduct : p))
        );
        await fetch('/api/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingProduct),
        });
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingProduct),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.product) {
            setProducts((prev) => [data.product, ...prev]);
          }
        } else {
          setProducts((prev) => [{ ...editingProduct, id: 'p_' + Date.now() }, ...prev]);
        }
      }
    } catch (err) {
      console.error('Failed to save product to database:', err);
    }
    setEditingProduct(null);
    setIsNewProductModalOpen(false);
  };

  // Image upload handler for Supabase Storage
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'food-images');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload image');
      }

      if (data.url) {
        setEditingProduct((prev) => ({
          ...prev,
          image_url: data.url,
        }));
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      setUploadError(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Save Shop Settings to Database
  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopSettings, bankSettings }),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Create new Admin
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setAdminActionError('');
    setAdminActionMsg('');
    setAdminActionLoading(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdminForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create admin');

      setAdminActionMsg(data.message || 'Admin created successfully');
      setNewAdminForm({ email: '', password: '', fullName: '', phone: '', role: 'admin' });
      setIsNewAdminModalOpen(false);
      fetchAdminUsers();
    } catch (err) {
      setAdminActionError(err.message);
    } finally {
      setAdminActionLoading(false);
    }
  };

  // Change user role (Admin <-> Customer)
  const handleRoleChange = async (userId, newRole) => {
    setAdminActionError('');
    setAdminActionMsg('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');

      setAdminActionMsg(data.message || `Role updated to ${newRole}`);
      fetchAdminUsers();
      setTimeout(() => setAdminActionMsg(''), 4000);
    } catch (err) {
      setAdminActionError(err.message);
      setTimeout(() => setAdminActionError(''), 4000);
    }
  };

  // Delete admin
  const handleDeleteAdmin = async (userId, email) => {
    if (!confirm(`Are you sure you want to delete access for ${email}?`)) return;

    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setAdminActionMsg('User deleted successfully');
      fetchAdminUsers();
      setTimeout(() => setAdminActionMsg(''), 4000);
    } catch (err) {
      setAdminActionError(err.message);
      setTimeout(() => setAdminActionError(''), 4000);
    }
  };

  // Change Super Admin Password
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeMsg('');

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError('Passwords do not match');
      return;
    }

    if (newPasswordInput.length < 6) {
      setPasswordChangeError('Password must be at least 6 characters');
      return;
    }

    setPasswordChangeLoading(true);
    const res = await changePassword(newPasswordInput);
    setPasswordChangeLoading(false);

    if (res.success) {
      setPasswordChangeMsg('Your password has been updated successfully!');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordChangeMsg('');
      }, 2000);
    } else {
      setPasswordChangeError(res.error || 'Failed to change password');
    }
  };

  // Inline OTP verification handlers
  const handleInlineSendOtp = async () => {
    if (!user?.email) return;
    setInlineOtpLoading(true);
    setInlineOtpError('');
    const res = await sendAdminOtp(user.email);
    setInlineOtpLoading(false);
    if (res.success) {
      setInlineOtpSent(true);
    } else {
      setInlineOtpError(res.error || 'Failed to send OTP code');
    }
  };

  const handleInlineVerifyOtp = async (e) => {
    e.preventDefault();
    if (!user?.email || !otpInput) return;
    setInlineOtpLoading(true);
    setInlineOtpError('');
    const res = await verifyAdminOtp(user.email, otpInput);
    setInlineOtpLoading(false);
    if (!res.success) {
      setInlineOtpError(res.error || 'Invalid verification code');
    }
  };

  // Stats calculation
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const pendingPaymentsCount = orders.filter((o) => o.status === 'Payment Pending').length;
  const activeOrdersCount = orders.filter(
    (o) => !['Completed', 'Cancelled'].includes(o.status)
  ).length;

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter === 'All') return true;
    return o.status === orderStatusFilter;
  });

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      p.genre?.toLowerCase().includes(searchProduct.toLowerCase());
    const matchesCat =
      selectedCategoryFilter === 'All' || p.category_name === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // GUARD 1: If not authenticated as Super Admin or Admin, block completely (DEMO PREVIEW REMOVED)
  if (!user || (!isSuperAdmin && !isAdmin)) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-3xl bg-red-100 text-red-700 flex items-center justify-center mb-4 shadow-sm border border-red-200">
          <ShieldCheck size={36} />
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Super Admin Access Only</h1>
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
          This portal and all CRUD operations are strictly restricted to the Super Admin (<strong>bsubhan542@gmail.com</strong>). Regular customers and unauthorized users cannot access this dashboard.
        </p>

        <div className="mt-6 w-full space-y-3">
          <Link
            href="/auth"
            className="w-full block bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors"
          >
            Sign in as Super Admin
          </Link>
          <Link
            href="/"
            className="w-full block bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold py-2.5 rounded-xl text-xs transition-colors"
          >
            Return to Store
          </Link>
        </div>
      </div>
    );
  }

  // GUARD 2: Two-Factor OTP Verification required for Super Admin
  if (!isOtpVerified) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4 shadow-sm border border-amber-200">
          <KeyRound size={32} />
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Two-Factor Security Verification</h1>
        <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
          Logged in as <strong>{user.email}</strong>. A one-time verification code is required to unlock this admin session.
        </p>

        {inlineOtpError && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{inlineOtpError}</span>
          </div>
        )}

        <form onSubmit={handleInlineVerifyOtp} className="mt-5 w-full space-y-3">
          <input
            type="text"
            required
            maxLength={6}
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Enter 6-digit code"
            className="w-full text-center text-xl tracking-[0.4em] font-mono font-black py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
          />

          <button
            type="submit"
            disabled={inlineOtpLoading || otpInput.length !== 6}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {inlineOtpLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Verifying...
              </>
            ) : (
              'Verify & Unlock Dashboard'
            )}
          </button>

          <button
            type="button"
            onClick={handleInlineSendOtp}
            disabled={inlineOtpLoading}
            className="w-full text-xs text-red-700 hover:text-red-800 font-semibold py-1.5 transition-colors"
          >
            {inlineOtpSent ? 'Code Sent! Click to Resend' : 'Send Verification Code to Email'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100/70 pb-20">
      {/* Top Admin Header */}
      <div className="bg-zinc-950 text-white border-b border-zinc-800 sticky top-14 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm sm:text-base leading-none">
                  Haq Bahu Naan &bull; Super Admin Dashboard
                </h1>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  {isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                {profile?.full_name || 'Subhan Butt'} ({user?.email}) &bull; OTP Verified
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {syncStatus && (
              <span className="text-[11px] font-semibold text-amber-300 hidden md:inline px-2">
                {syncStatus}
              </span>
            )}
            <button
              onClick={handleSyncDatabase}
              disabled={isSyncing}
              className="text-xs text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-amber-500/40 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Sync local data & images to Supabase database"
            >
              <Database size={13} className={isSyncing ? 'animate-spin text-amber-400' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync DB'}</span>
            </button>
            <button
              onClick={() => {
                fetchOrders();
                fetchCatalog();
                if (isSuperAdmin) fetchAdminUsers();
              }}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw size={14} className={ordersLoading ? 'animate-spin text-red-500' : ''} />
            </button>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="text-xs text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center gap-1 transition-colors"
              title="Change Password"
            >
              <KeyRound size={13} />
              <span className="hidden sm:inline">Password</span>
            </button>
            <Link
              href="/"
              className="text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Shop
            </Link>
            <button
              onClick={signOut}
              className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-red-900/50 flex items-center gap-1 transition-colors"
              title="Sign Out (Expires OTP)"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto border-t border-zinc-800/80 pt-1 pb-1.5">
          {[
            { id: 'orders', label: 'Orders', icon: <Receipt size={14} />, badge: pendingPaymentsCount },
            { id: 'menu', label: 'Menu & Items', icon: <Package size={14} /> },
            { id: 'deals', label: 'Deals & Combos', icon: <Sparkles size={14} /> },
            { id: 'categories', label: 'Categories', icon: <Layers size={14} /> },
            { id: 'admins', label: 'Admin & Staff Access', icon: <Users size={14} /> },
            { id: 'settings', label: 'Shop Settings', icon: <Settings size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="bg-amber-400 text-zinc-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* TAB 1: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            {/* Orders Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
                <span className="text-xs text-zinc-500 font-semibold uppercase">Total Revenue</span>
                <p className="text-2xl font-black text-zinc-900 mt-1">Rs. {totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
                <span className="text-xs text-zinc-500 font-semibold uppercase">Pending Verification</span>
                <p className="text-2xl font-black text-amber-600 mt-1">{pendingPaymentsCount} Orders</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
                <span className="text-xs text-zinc-500 font-semibold uppercase">Active Orders</span>
                <p className="text-2xl font-black text-emerald-600 mt-1">{activeOrdersCount} In Progress</p>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
              {['All', 'Payment Pending', 'Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].map((st) => (
                <button
                  key={st}
                  onClick={() => setOrderStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl font-semibold border transition-all ${
                    orderStatusFilter === st
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase">
                    <tr>
                      <th className="p-4">Order #</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Payment</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-400">
                          No orders match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-zinc-50/80 transition-colors">
                          <td className="p-4 font-mono font-bold text-zinc-900">{ord.order_number}</td>
                          <td className="p-4">
                            <span className="font-semibold block text-zinc-900">{ord.customer_name}</span>
                            <span className="text-zinc-400 text-[11px]">{ord.customer_phone}</span>
                          </td>
                          <td className="p-4 font-bold text-zinc-900">Rs. {ord.total_amount}</td>
                          <td className="p-4">
                            <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-700">
                              {ord.order_type}
                            </span>
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                ord.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ord.status === 'Payment Pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : ord.status === 'Cancelled'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="p-4 capitalize text-zinc-600 font-medium">{ord.payment_status}</td>
                          <td className="p-4">
                            <div className="flex gap-1.5">
                              {ord.status === 'Payment Pending' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(ord.id, 'Preparing', 'verified')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px]"
                                >
                                  Verify & Prepare
                                </button>
                              )}
                              {ord.status === 'Preparing' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(ord.id, 'Ready')}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px]"
                                >
                                  Mark Ready
                                </button>
                              )}
                              {ord.status === 'Ready' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(ord.id, 'Completed')}
                                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg text-[11px]"
                                >
                                  Complete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MENU & ITEMS */}
        {activeTab === 'menu' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs"
                />
              </div>

              <button
                onClick={() => {
                  setEditingProduct({
                    name: '',
                    price: 300,
                    genre: 'Special',
                    description: '',
                    image_url: '',
                    is_available: true,
                  });
                  setIsNewProductModalOpen(true);
                }}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus size={16} /> Add Item
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase">
                    <tr>
                      <th className="p-4">Item</th>
                      <th className="p-4">Genre</th>
                      <th className="p-4">Price</th>
                      <th className="p-4">Availability</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="p-4 flex items-center gap-3">
                          <img
                            src={p.image_url || '/Nutella.jpg'}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover border border-zinc-200 bg-zinc-100"
                            onError={(e) => {
                              e.currentTarget.src = '/Nutella.jpg';
                            }}
                          />
                          <div>
                            <span className="font-bold text-zinc-900 block">{p.name}</span>
                            <span className="text-[11px] text-zinc-400 line-clamp-1">{p.description}</span>
                          </div>
                        </td>
                        <td className="p-4 text-zinc-600 font-medium">{p.genre}</td>
                        <td className="p-4 font-bold text-zinc-900">Rs. {p.price}</td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleProductAvailability(p.id)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                              p.is_available
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {p.is_available ? 'Available' : 'Sold Out'}
                          </button>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setIsNewProductModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                          >
                            <Edit size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEALS */}
        {activeTab === 'deals' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deals.map((d) => (
              <div key={d.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs space-y-3">
                <img
                  src={d.image_url || '/deal1.png'}
                  alt={d.title}
                  className="w-full h-36 rounded-xl object-cover border border-zinc-100 bg-zinc-50"
                  onError={(e) => {
                    e.currentTarget.src = '/deal1.png';
                  }}
                />
                <div>
                  <h3 className="font-bold text-zinc-900 text-sm">{d.title}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{d.description}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                  <span className="font-black text-red-700 text-base">Rs. {d.price}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                    {d.badge || 'Combo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {categories.map((c) => (
              <div key={c.id || c.slug} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-xs flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-zinc-900 text-xs">{c.name}</h4>
                  <span className="text-[10px] text-zinc-400 font-mono">slug: {c.slug}</span>
                </div>
                <span className="text-[11px] font-bold text-zinc-400">Order #{c.sort_order || 0}</span>
              </div>
            ))}
          </div>
        )}

        {/* TAB 5: ADMIN & STAFF ACCESS (Super Admin CRUD) */}
        {activeTab === 'admins' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Admin & Staff Access Management</h3>
                <p className="text-xs text-zinc-500">
                  Super Admin can manage authorized administrators and control access privileges.
                </p>
              </div>

              {isSuperAdmin && (
                <button
                  onClick={() => setIsNewAdminModalOpen(true)}
                  className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <UserPlus size={16} /> Add New Admin
                </button>
              )}
            </div>

            {adminActionMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <Check size={16} className="shrink-0 text-emerald-600" />
                <span>{adminActionMsg}</span>
              </div>
            )}

            {adminActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-600" />
                <span>{adminActionError}</span>
              </div>
            )}

            <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4">Date Added</th>
                      <th className="p-4">Role Control</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {adminUsersLoading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                          <Loader2 size={20} className="animate-spin inline mr-2 text-red-600" />
                          Loading authorized users...
                        </td>
                      </tr>
                    ) : adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      adminUsers.map((u) => {
                        const isPrimarySuper = u.email?.toLowerCase() === 'bsubhan542@gmail.com';
                        return (
                          <tr key={u.id} className="hover:bg-zinc-50/80 transition-colors">
                            <td className="p-4">
                              <span className="font-bold text-zinc-900 block flex items-center gap-1.5">
                                {u.full_name || 'Admin User'}
                                {isPrimarySuper && (
                                  <span className="bg-amber-400 text-zinc-950 font-black text-[9px] px-1.5 py-0.2 rounded-full uppercase">
                                    Primary Super Admin
                                  </span>
                                )}
                              </span>
                              <span className="text-zinc-500 text-[11px] font-mono">{u.email}</span>
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                  u.role === 'super_admin'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : u.role === 'admin'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-zinc-100 text-zinc-600'
                                }`}
                              >
                                {u.role === 'super_admin'
                                  ? 'SUPER ADMIN'
                                  : u.role === 'admin'
                                  ? 'ADMIN'
                                  : 'CUSTOMER'}
                              </span>
                            </td>
                            <td className="p-4 text-zinc-600">{u.phone || '—'}</td>
                            <td className="p-4 text-zinc-500 text-[11px]">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="p-4">
                              {isPrimarySuper ? (
                                <span className="text-[11px] text-zinc-400 font-semibold italic">
                                  Permanent Super Admin
                                </span>
                              ) : isSuperAdmin ? (
                                <select
                                  value={u.role === 'admin' ? 'admin' : 'customer'}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                  className="text-xs p-1.5 border border-zinc-300 rounded-lg bg-white font-medium"
                                >
                                  <option value="admin">Promote to Admin</option>
                                  <option value="customer">Demote to Customer</option>
                                </select>
                              ) : (
                                <span className="text-[11px] text-zinc-400">Restricted</span>
                              )}
                            </td>
                            <td className="p-4">
                              {!isPrimarySuper && isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteAdmin(u.id, u.email)}
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete Account"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Delivery Config */}
            <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
                <Bike size={18} className="text-red-700" />
                <h3 className="font-bold text-sm text-zinc-900">Delivery & Store Settings</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Shop Address</label>
                  <input
                    type="text"
                    value={shopSettings.shop_address}
                    onChange={(e) => setShopSettings({ ...shopSettings, shop_address: e.target.value })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Shop Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={shopSettings.latitude}
                      onChange={(e) =>
                        setShopSettings({ ...shopSettings, latitude: parseFloat(e.target.value) })
                      }
                      className="w-full p-2.5 border border-zinc-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Shop Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={shopSettings.longitude}
                      onChange={(e) =>
                        setShopSettings({ ...shopSettings, longitude: parseFloat(e.target.value) })
                      }
                      className="w-full p-2.5 border border-zinc-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Delivery Fee (Rs.)</label>
                  <input
                    type="number"
                    value={shopSettings.delivery_fee_rs}
                    onChange={(e) =>
                      setShopSettings({ ...shopSettings, delivery_fee_rs: parseInt(e.target.value, 10) })
                    }
                    className="w-full p-2.5 border border-zinc-300 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Bank Transfer Details */}
            <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
                <Building2 size={18} className="text-red-700" />
                <h3 className="font-bold text-sm text-zinc-900">Bank Transfer & Payment Info</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={bankSettings.bank_name}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank_name: e.target.value })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Account Title</label>
                  <input
                    type="text"
                    value={bankSettings.account_title}
                    onChange={(e) => setBankSettings({ ...bankSettings, account_title: e.target.value })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Account Number / IBAN</label>
                  <input
                    type="text"
                    value={bankSettings.account_number}
                    onChange={(e) => setBankSettings({ ...bankSettings, account_number: e.target.value })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl font-mono"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {settingsSaved ? (
                      <>
                        <Check size={14} /> Settings Saved Successfully
                      </>
                    ) : (
                      'Save Shop Settings to Supabase'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add Product Modal */}
      {isNewProductModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-base text-zinc-900">
              {editingProduct.id ? 'Edit Menu Product' : 'Add New Menu Item'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="e.g. Special Mutton Cheese Naan"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Price (Rs.)</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Genre / Category</label>
                  <select
                    value={editingProduct.genre || 'Special'}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        genre: e.target.value,
                        category_name: e.target.value,
                      })
                    }
                    className="w-full p-2.5 border border-zinc-300 rounded-xl"
                  >
                    <option value="Special">Special</option>
                    <option value="Chicken">Chicken</option>
                    <option value="Beef">Beef</option>
                    <option value="Mutton">Mutton</option>
                    <option value="Rogni">Rogni</option>
                    <option value="Aloo">Aloo</option>
                    <option value="Besaan">Besaan</option>
                    <option value="Pratha">Pratha</option>
                    <option value="Regular">Regular</option>
                    <option value="Side">Side</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Freshly prepared in traditional tandoor..."
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              {/* Product Photo Upload */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1.5 flex items-center justify-between">
                  <span>Product Photo</span>
                  <span className="text-[10px] text-zinc-400 font-normal">PNG, JPG, WEBP (Max 5MB)</span>
                </label>

                <div className="space-y-2">
                  {editingProduct.image_url ? (
                    <div className="relative border border-zinc-200 rounded-2xl p-2.5 bg-zinc-50 flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-zinc-200 shrink-0 relative">
                        <img
                          src={editingProduct.image_url}
                          alt={editingProduct.name || 'Preview'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/Nutella.jpg';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 size={13} /> Image Ready
                        </span>
                        <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5" title={editingProduct.image_url}>
                          {editingProduct.image_url}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, image_url: '' })}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove Image"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-zinc-200 hover:border-red-400 hover:bg-red-50/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                      {uploadingImage ? (
                        <div className="flex flex-col items-center gap-1.5 text-zinc-600 py-2">
                          <Loader2 size={24} className="animate-spin text-red-600" />
                          <span className="text-[11px] font-semibold text-zinc-800">Uploading to Supabase Storage...</span>
                          <span className="text-[10px] text-zinc-400">Please wait</span>
                        </div>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                            <Upload size={18} />
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-bold text-zinc-800 block">Click to upload food photo</span>
                            <span className="text-[10px] text-zinc-400">or browse from your device</span>
                          </div>
                        </>
                      )}
                    </label>
                  )}

                  {uploadError && (
                    <p className="text-[10px] text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {uploadError}
                    </p>
                  )}

                  <details className="text-[11px] text-zinc-500 pt-0.5">
                    <summary className="cursor-pointer hover:text-zinc-800 select-none">
                      Or paste an image URL / path manually
                    </summary>
                    <div className="pt-2">
                      <input
                        type="text"
                        value={editingProduct.image_url || ''}
                        onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                        placeholder="https://... or /Nutella.jpg"
                        className="w-full p-2 border border-zinc-300 rounded-xl text-xs"
                      />
                    </div>
                  </details>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl shadow-xs"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Admin Modal (Super Admin only) */}
      {isNewAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="font-bold text-base text-zinc-900 flex items-center gap-2">
                <UserPlus size={18} className="text-red-700" />
                Add New Administrator
              </h3>
              <button
                onClick={() => setIsNewAdminModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={18} />
              </button>
            </div>

            {adminActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{adminActionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newAdminForm.fullName}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, fullName: e.target.value })}
                  placeholder="e.g. Tariq Mehmood"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                  placeholder="admin@haqbahu.pk"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newAdminForm.password}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={newAdminForm.phone}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, phone: e.target.value })}
                  placeholder="0300 1234567"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsNewAdminModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminActionLoading}
                  className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {adminActionLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Creating...
                    </>
                  ) : (
                    'Create Admin'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="font-bold text-base text-zinc-900 flex items-center gap-2">
                <KeyRound size={18} className="text-red-700" />
                Change Password
              </h3>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={18} />
              </button>
            </div>

            {passwordChangeMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <Check size={14} className="shrink-0 text-emerald-600" />
                <span>{passwordChangeMsg}</span>
              </div>
            )}

            {passwordChangeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-red-600" />
                <span>{passwordChangeError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full p-2.5 border border-zinc-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordChangeLoading}
                  className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {passwordChangeLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
