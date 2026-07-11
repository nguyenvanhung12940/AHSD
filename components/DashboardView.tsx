/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import BulkImportModal from './BulkImportModal';
import { EnvironmentalReport, EnvironmentalNotification } from '../types';
import { BellIcon } from './icons/BellIcon';
import { TrophyIcon } from './icons/TrophyIcon';
import { UsersIcon } from './icons/UsersIcon';
import { FileUpIcon } from './icons/FileUpIcon';
import { ShoppingCartIcon } from './icons/ShoppingCartIcon';
import { XCircleIcon as AlertCircleIcon } from './icons/XCircleIcon';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface DashboardStats {
  total: number;
  byPriority: { priority: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byArea: { area: string; count: number }[];
  recentActivity: any[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

interface DashboardViewProps {
  user?: any;
  reports: EnvironmentalReport[];
  notifications?: EnvironmentalNotification[];
  onMarkNotificationAsRead?: (id: number) => void;
  onSelectReport?: (reportId: string) => void;
  onLinkNFCTag?: () => void;
  isNFCLinking?: boolean;
}

const DashboardView: React.FC<DashboardViewProps> = ({ 
  user, 
  reports, 
  notifications = [], 
  onMarkNotificationAsRead,
  onSelectReport,
  onLinkNFCTag,
  isNFCLinking
}) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'looker'>('overview');

  const lookerUrl = import.meta.env.VITE_LOOKER_DASHBOARD_URL;
  const isAdmin = user && (user.role === 'admin' || user.role === 'environment_department');

  // Mock Leaderboard Data
  const leaderboard = [
      { name: 'Nguyễn Văn A', points: 1250, rank: 'Chiến binh Xanh', avatar: 'https://i.pravatar.cc/150?u=a' },
      { name: 'Trần Thị B', points: 980, rank: 'Người bảo vệ', avatar: 'https://i.pravatar.cc/150?u=b' },
      { name: 'Lê Văn C', points: 850, rank: 'Tình nguyện viên', avatar: 'https://i.pravatar.cc/150?u=c' },
      { name: 'Phạm Thị D', points: 720, rank: 'Tình nguyện viên', avatar: 'https://i.pravatar.cc/150?u=d' },
      { name: 'Hoàng Văn E', points: 600, rank: 'Thành viên mới', avatar: 'https://i.pravatar.cc/150?u=e' },
  ];

  const filteredReports = React.useMemo(() => {
    if (user && !isAdmin && user.area && user.area !== 'All') {
      return reports.filter((r: any) => r.area === user.area);
    }
    return reports;
  }, [reports, user, isAdmin]);

  const stats = React.useMemo(() => {
    const daNangDistricts = ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Liên Chiểu', 'Cẩm Lệ', 'Hòa Vang', 'Hoàng Sa'];
    
    const regionCounts = filteredReports.reduce((acc: any, curr: any) => {
      const region = daNangDistricts.includes(curr.area) ? 'Đà Nẵng' : 'Quảng Nam';
      acc[region] = (acc[region] || 0) + 1;
      return acc;
    }, {});
    
    const byRegion = Object.keys(regionCounts).map(region => ({ region, count: regionCounts[region] }));

    const total = filteredReports.length;
    
    const statusCounts = filteredReports.reduce((acc: any, curr: any) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
    }, {});
    const byStatus = Object.keys(statusCounts).map(status => ({ status, count: statusCounts[status] }));

    const priorityCounts = filteredReports.reduce((acc: any, curr: any) => {
        const priority = curr.aiAnalysis?.priority || curr.priority || 'Trung bình';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, {});
    const byPriority = Object.keys(priorityCounts).map(priority => ({ priority, count: priorityCounts[priority] }));

    return {
        total,
        byStatus,
        byPriority,
        byRegion
    };
  }, [filteredReports]);

  useEffect(() => {
    const fetchHealth = async (retries = 3) => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealthStatus(data);
        } else if (retries > 0) {
          setTimeout(() => fetchHealth(retries - 1), 2000);
        }
      } catch (err) {
        console.error("Health fetch failed:", err);
        if (retries > 0) {
          setTimeout(() => fetchHealth(retries - 1), 2000);
        }
      }
    };

    const fetchOrders = async (retries = 3) => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await fetch('/api/orders', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data);
        } else if (retries > 0) {
          setTimeout(() => fetchOrders(retries - 1), 2000);
        }
      } catch (err) {
        console.error("Orders fetch failed:", err);
        if (retries > 0) {
          setTimeout(() => fetchOrders(retries - 1), 2000);
        }
      }
    };

    fetchHealth();
    fetchOrders();
  }, []);

  if (!stats) return <div className="p-8 text-center">Không có dữ liệu.</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen pb-24 md:pb-6">
      {/* Profile Header Card */}
      <div className="glass-card p-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-50 rounded-full -mr-24 -mt-24 opacity-60 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-50 rounded-full -ml-16 -mb-16 opacity-60 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-xl shadow-brand-100 transform hover:rotate-3 transition-transform">
              <span className="text-3xl font-black uppercase">{(user?.organizationName || user?.username || 'U').charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{user?.organizationName || user?.username || 'Người dùng'}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-3 py-1 bg-brand-50 text-brand-700 text-[10px] font-black rounded-full border border-brand-100 uppercase tracking-wider">
                  {user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'environment_department' ? 'Cán bộ Môi trường' : 'Công dân Xanh'}
                </span>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full border border-slate-200 uppercase tracking-wider">
                  Khu vực: {user?.area || 'Toàn thành phố'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Điểm đóng góp</p>
              <p className="text-3xl font-black text-brand-600 tabular-nums">1,250</p>
            </div>
            <div className="h-12 w-[1px] bg-slate-200 mx-2 hidden sm:block"></div>
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all ${activeTab === 'overview' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Tổng quan
              </button>
              <button 
                onClick={() => setActiveTab('orders')}
                className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all ${activeTab === 'orders' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Đơn hàng
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveTab('looker')}
                  className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all ${activeTab === 'looker' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Phân tích
                </button>
              )}
            </div>
            
            {/* NFC Linking Button */}
            <button 
              onClick={onLinkNFCTag}
              disabled={isNFCLinking}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl font-black text-xs transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isNFCLinking 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
              title="Liên kết thẻ NFC SOS"
            >
              <svg className={`w-4 h-4 ${isNFCLinking ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span className="hidden sm:inline">{isNFCLinking ? 'Đang ghi...' : 'Liên kết NFC SOS'}</span>
            </button>

            {isAdmin && (
              <button 
                onClick={() => setIsImportModalOpen(true)}
                className="p-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm hover:shadow-md active:scale-95"
                title="Nhập dữ liệu Excel"
              >
                  <FileUpIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications Section for Authorities */}
      {user && user.role !== 'citizen' && notifications.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900 flex items-center text-xs uppercase tracking-widest">
              <BellIcon className="w-5 h-5 text-emerald-500 mr-3" />
              Thông báo khẩn cấp & Sự cố mới
            </h3>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              {notifications.filter(n => !n.isRead).length} MỚI
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notifications.slice(0, 6).map((notification) => (
              <div 
                key={notification.id}
                onClick={() => onSelectReport?.(notification.reportId)}
                className={`p-5 rounded-3xl border transition-all cursor-pointer hover:shadow-xl hover:shadow-emerald-50/50 ${
                  !notification.isRead 
                    ? 'bg-emerald-50/30 border-emerald-200' 
                    : 'bg-white border-slate-100'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider shadow-sm ${
                    notification.priority === 'Cao' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                  }`}>
                    {notification.priority || 'MỚI'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: vi })}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed line-clamp-2 mb-4 ${!notification.isRead ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                  {notification.message}
                </p>
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{notification.area}</span>
                  {!notification.isRead && onMarkNotificationAsRead && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkNotificationAsRead(notification.id);
                      }}
                      className="text-[10px] text-emerald-600 font-black hover:text-emerald-700 transition-colors"
                    >
                      ĐÁNH DẤU ĐÃ ĐỌC
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(healthStatus?.supabase === 'error' || healthStatus?.supabase === 'backing_off') && isAdmin && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3 text-red-700">
          <div className="p-2 bg-red-100 rounded-lg">
             <AlertCircleIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Lỗi kết nối Supabase</h4>
            <p className="text-xs mt-1 opacity-80">{healthStatus.supabaseError}</p>
            {healthStatus.supabaseAdvice && (
              <div className="mt-4 p-4 bg-white rounded-2xl border border-red-100 shadow-sm">
                <p className="text-xs font-black text-red-800 uppercase tracking-widest mb-2 flex items-center">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                  Hướng dẫn khắc phục:
                </p>
                <ul className="text-[11px] space-y-2 text-slate-600 list-disc pl-4">
                  <li>Truy cập <b>Supabase Dashboard</b> &gt; <b>Project Settings</b> &gt; <b>API</b>.</li>
                  <li>Sao chép <b>Project URL</b> (ví dụ: <code className="bg-slate-100 px-1 rounded">https://xyz.supabase.co</code>).</li>
                  <li>Vào menu <b>Settings</b> (biểu tượng bánh răng) của ứng dụng này.</li>
                  <li>Dán URL vào ô <b>VITE_SUPABASE_URL</b> và nhấn <b>Save</b>.</li>
                  <li>Nhấn nút <b>"Thử lại"</b> bên dưới.</li>
                </ul>
                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">URL hiện tại: <code className="bg-slate-50 px-1 rounded">{import.meta.env.VITE_SUPABASE_URL?.substring(0, 15)}...</code></span>
                </div>
              </div>
            )}
            <div className="mt-3 flex space-x-2">
              <button 
                onClick={async () => {
                  try {
                    await fetch('/api/supabase/reset-backoff', { method: 'POST' });
                    window.location.reload();
                  } catch (err) {
                    window.location.reload();
                  }
                }}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
              >
                Thử lại
              </button>
              <button 
                onClick={() => {
                  const sql = `-- 1. Xóa bảng cũ\nDROP TABLE IF EXISTS orders;\nDROP TABLE IF EXISTS notifications;\nDROP TABLE IF EXISTS reports;\nDROP TABLE IF EXISTS users;\n\n-- 2. Tạo bảng users\nCREATE TABLE users (\n  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n  username TEXT UNIQUE NOT NULL,\n  password TEXT NOT NULL,\n  role TEXT NOT NULL,\n  area TEXT,\n  "organizationName" TEXT,\n  email TEXT,\n  phone TEXT,\n  status TEXT DEFAULT 'active',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- 3. Tạo bảng reports\nCREATE TABLE reports (\n  id TEXT PRIMARY KEY,\n  "mediaUrl" TEXT,\n  "mediaType" TEXT,\n  latitude DOUBLE PRECISION,\n  longitude DOUBLE PRECISION,\n  "userDescription" TEXT,\n  "issueType" TEXT,\n  description TEXT,\n  priority TEXT,\n  "solution" TEXT,\n  "isIssuePresent" INTEGER,\n  status TEXT,\n  timestamp TEXT,\n  area TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- 4. Tạo bảng notifications\nCREATE TABLE notifications (\n  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n  "userId" BIGINT REFERENCES users(id),\n  "reportId" TEXT REFERENCES reports(id),\n  message TEXT,\n  type TEXT,\n  "isRead" INTEGER DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- 5. Tạo bảng orders\nCREATE TABLE orders (\n  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n  "userId" BIGINT REFERENCES users(id),\n  "productName" TEXT NOT NULL,\n  quantity INTEGER NOT NULL,\n  address TEXT NOT NULL,\n  phone TEXT NOT NULL,\n  status TEXT DEFAULT 'pending',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- 6. Tắt bảo mật (Để demo, hãy bật lại trong sản xuất)\nALTER TABLE users DISABLE ROW LEVEL SECURITY;\nALTER TABLE reports DISABLE ROW LEVEL SECURITY;\nALTER TABLE notifications DISABLE ROW LEVEL SECURITY;\nALTER TABLE orders DISABLE ROW LEVEL SECURITY;`;
                  navigator.clipboard.writeText(sql);
                  console.log('SQL code copied to clipboard');
                }}
                className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                Sao chép mã SQL tạo bảng
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImportSuccess={() => {
          window.location.reload();
        }} 
      />

      {activeTab === 'overview' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5 flex flex-col items-center text-center group hover:bg-brand-50/10 transition-colors">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <FileUpIcon className="w-6 h-6" />
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tổng báo cáo</p>
              <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{stats.total}</p>
            </div>
            <div className="glass-card p-5 flex flex-col items-center text-center group hover:bg-amber-50/10 transition-colors">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Đang xử lý</p>
              <p className="text-3xl font-black text-amber-500 mt-1 tabular-nums">
                {stats.byStatus.find(s => s.status === 'Đang xử lý')?.count || 0}
              </p>
            </div>
            <div className="glass-card p-5 flex flex-col items-center text-center group hover:bg-red-50/10 transition-colors">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <AlertCircleIcon className="w-6 h-6" />
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Ưu tiên Cao</p>
              <p className="text-3xl font-black text-red-500 mt-1 tabular-nums">
                {stats.byPriority.find(p => p.priority === 'Cao')?.count || 0}
              </p>
            </div>
            <div className="glass-card p-5 flex flex-col items-center text-center group hover:bg-emerald-50/10 transition-colors">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Đã hoàn thành</p>
              <p className="text-3xl font-black text-emerald-500 mt-1 tabular-nums">
                {stats.byStatus.find(s => s.status === 'Đã xử lý')?.count || 0}
              </p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 h-96">
              <h3 className="font-black text-slate-900 mb-8 flex items-center text-xs uppercase tracking-widest">
                <span className="w-1.5 h-5 bg-brand-500 rounded-full mr-3"></span>
                Phân bố theo Khu vực
              </h3>
              <div className="h-[calc(100%-3rem)]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(stats as any).byRegion}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="region" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 700 }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="glass-card p-6 h-96">
              <h3 className="font-black text-slate-900 mb-8 flex items-center text-xs uppercase tracking-widest">
                <span className="w-1.5 h-5 bg-blue-500 rounded-full mr-3"></span>
                Trạng thái Xử lý
              </h3>
              <div className="h-[calc(100%-3rem)]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.byStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={10}
                      dataKey="count"
                      stroke="none"
                    >
                      {stats.byStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 700 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 800, paddingTop: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Leaderboard & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Leaderboard */}
              <div className="glass-card p-6 lg:col-span-1">
                  <div className="flex items-center justify-between mb-8">
                      <h3 className="font-black text-slate-900 flex items-center text-xs uppercase tracking-widest">
                          <TrophyIcon className="w-5 h-5 text-yellow-500 mr-3" />
                          Bảng Xếp Hạng
                      </h3>
                      <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">THÁNG 3</span>
                  </div>
                  <div className="space-y-4">
                      {leaderboard.map((user, index) => (
                          <div key={index} className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 rounded-2xl transition-all group cursor-pointer border border-transparent hover:border-slate-100">
                              <div className="flex items-center space-x-4">
                                  <div className={`w-7 h-7 flex items-center justify-center rounded-xl font-black text-xs ${index === 0 ? 'bg-yellow-400 text-white shadow-lg shadow-yellow-100' : index === 1 ? 'bg-slate-300 text-white shadow-lg shadow-slate-100' : index === 2 ? 'bg-orange-400 text-white shadow-lg shadow-orange-100' : 'bg-slate-100 text-slate-400'}`}>
                                      {index + 1}
                                  </div>
                                  <div className="relative">
                                    <img src={user.avatar} alt={user.name} className="w-11 h-11 rounded-2xl border-2 border-white shadow-sm group-hover:scale-110 transition-transform object-cover" />
                                    {index < 3 && (
                                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                                        <span className="text-[8px]">👑</span>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                      <p className="font-black text-slate-900 text-xs">{user.name}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user.rank}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="font-black text-brand-600 text-sm tabular-nums">{user.points}</p>
                                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">điểm</p>
                              </div>
                          </div>
                      ))}
                  </div>
                  <button className="w-full mt-8 py-3 text-[10px] font-black text-brand-600 bg-brand-50/50 hover:bg-brand-50 rounded-2xl transition-all uppercase tracking-widest border border-brand-100/50">
                      Xem tất cả cộng đồng
                  </button>
              </div>

              {/* Recent Activity */}
              <div className="glass-card p-6 lg:col-span-2">
                   <h3 className="font-black text-slate-900 mb-8 flex items-center text-xs uppercase tracking-widest">
                      <UsersIcon className="w-5 h-5 text-blue-500 mr-3" />
                      Hoạt động Gần đây
                   </h3>
                   <div className="space-y-3">
                      {filteredReports.slice(0, 4).map((report) => (
                          <div key={report.id} className="flex items-center space-x-5 p-4 rounded-3xl hover:bg-slate-50/50 transition-all border border-transparent hover:border-slate-100 group cursor-pointer">
                              <div className="relative flex-shrink-0">
                                  <img 
                                    src={report.mediaUrl} 
                                    alt="Report" 
                                    className="w-16 h-16 rounded-2xl object-cover border border-slate-100 shadow-sm group-hover:scale-105 transition-transform"
                                    onError={(e) => {(e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=No+Image'}}
                                  />
                                  <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-xl border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow-md ${
                                      report.status === 'Báo cáo mới' ? 'bg-red-500' : 
                                      report.status === 'Đang xử lý' ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}>
                                      {report.status === 'Báo cáo mới' ? '!' : report.status === 'Đang xử lý' ? '...' : '✓'}
                                  </div>
                              </div>
                              <div className="flex-grow min-w-0">
                                  <div className="flex justify-between items-start mb-1">
                                      <h4 className="font-black text-slate-900 text-xs truncate pr-4 uppercase tracking-tight">{report.aiAnalysis?.issueType || 'Sự cố môi trường'}</h4>
                                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">{new Date(report.timestamp).toLocaleDateString('vi-VN')}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">{report.description || report.userDescription}</p>
                                  <div className="flex items-center mt-3 space-x-3">
                                      <span className="text-[9px] px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-black uppercase tracking-wider">
                                          {report.area || 'Chưa xác định'}
                                      </span>
                                      <span className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider ${
                                          (report.aiAnalysis?.priority) === 'Cao' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                                      }`}>
                                          {report.aiAnalysis?.priority || 'Trung bình'}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      ))}
                      {filteredReports.length === 0 && (
                          <div className="text-center py-12 text-slate-400 text-sm font-medium">Chưa có hoạt động nào.</div>
                      )}
                   </div>
                   <button className="w-full mt-6 py-3 text-[10px] font-black text-slate-400 hover:text-brand-600 transition-colors uppercase tracking-widest">
                      Xem tất cả báo cáo của tôi
                   </button>
              </div>
          </div>

          {/* Heatmap */}
          <div className="glass-card p-6 h-[500px] flex flex-col">
            <h3 className="font-black text-slate-900 mb-8 flex items-center text-xs uppercase tracking-widest">
              <span className="w-1.5 h-5 bg-red-500 rounded-full mr-3"></span>
              Bản đồ Rủi ro Môi trường
            </h3>
            <div className="flex-grow rounded-[2rem] overflow-hidden relative z-0 border border-slate-100 shadow-inner">
               <MapContainer center={[15.85, 108.3]} zoom={9} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {filteredReports.map((report) => (
                  <CircleMarker 
                    key={report.id}
                    center={[report.latitude, report.longitude]}
                    radius={(report.aiAnalysis?.priority) === 'Cao' ? 12 : 6}
                    pathOptions={{ 
                        color: (report.aiAnalysis?.priority) === 'Cao' ? '#ef4444' : ((report.aiAnalysis?.priority) === 'Trung bình' ? '#f59e0b' : '#10b981'),
                        fillColor: (report.aiAnalysis?.priority) === 'Cao' ? '#ef4444' : ((report.aiAnalysis?.priority) === 'Trung bình' ? '#f59e0b' : '#10b981'),
                        fillOpacity: 0.5
                    }}
                  >
                    <Popup>
                      <div className="text-xs p-1">
                        <p className="font-bold text-slate-800">{report.aiAnalysis?.issueType || 'Sự cố môi trường'}</p>
                        <p className="text-slate-500 mt-1">Mức độ: <span className="font-bold">{report.aiAnalysis?.priority || 'Trung bình'}</span></p>
                        <p className="text-slate-400 mt-0.5">{new Date(report.timestamp).toLocaleString()}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        </>
      ) : activeTab === 'orders' ? (
        <div className="glass-card p-6 min-h-[500px]">
          <h3 className="font-black text-slate-900 mb-8 flex items-center text-xs uppercase tracking-widest">
            <span className="w-1.5 h-5 bg-emerald-500 rounded-full mr-3"></span>
            Lịch sử Đổi quà Xanh
          </h3>
          
          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sản phẩm</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Số lượng</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày đặt</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map((order) => (
                    <tr key={order.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4">
                        <p className="text-sm font-bold text-slate-900">{order.productName}</p>
                        <p className="text-[10px] text-slate-400">{order.address}</p>
                      </td>
                      <td className="py-4 text-sm font-bold text-slate-600">{order.quantity}</td>
                      <td className="py-4 text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          order.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          order.status === 'shipped' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          {order.status === 'delivered' ? 'Đã giao' : order.status === 'shipped' ? 'Đang giao' : 'Chờ xử lý'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                <ShoppingCartIcon className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-1">Chưa có đơn hàng nào</h4>
              <p className="text-xs text-slate-400 max-w-xs">Hãy tích cực báo cáo sự cố môi trường để tích lũy điểm và đổi lấy những phần quà ý nghĩa!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[700px] flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center text-sm uppercase tracking-wider">
              <svg className="w-5 h-5 text-teal-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Phân tích Looker
            </h3>
            <a 
              href={lookerUrl} 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-teal-600 font-bold hover:underline flex items-center"
            >
              Mở trong tab mới
              <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          
          {lookerUrl ? (
            <iframe
              src={lookerUrl}
              className="w-full flex-grow border-0 rounded-2xl"
              title="Looker Dashboard"
              allowFullScreen
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
              <div className="bg-teal-100 p-4 rounded-full mb-4">
                <svg className="w-12 h-12 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-800 mb-2">Chưa cấu hình Looker</h4>
              <p className="text-slate-500 max-w-md mb-6">
                Bạn cần cung cấp URL Dashboard Looker Studio hoặc Looker Embed trong biến môi trường <code>VITE_LOOKER_DASHBOARD_URL</code>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardView;
