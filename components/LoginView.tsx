import React, { useState } from 'react';
import { LogoIcon } from './icons/LogoIcon';
import { auth, isFirebaseConfigured } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  updateProfile
} from 'firebase/auth';

interface LoginViewProps {
  onLogin: (user: any) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [role, setRole] = useState('district_manager');
  const [area, setArea] = useState('Hải Châu');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const districts = [
    // Đà Nẵng
    'Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Liên Chiểu', 'Cẩm Lệ', 'Hòa Vang', 'Hoàng Sa',
    // Quảng Nam
    'Tam Kỳ', 'Hội An', 'Điện Bàn', 'Đại Lộc', 'Duy Xuyên', 'Thăng Bình', 'Quế Sơn', 'Núi Thành', 'Phú Ninh', 'Tiên Phước', 'Bắc Trà My', 'Nam Trà My', 'Phước Sơn', 'Hiệp Đức', 'Nông Sơn', 'Đông Giang', 'Nam Giang', 'Tây Giang'
  ];

  const roles = [
    { id: 'district_manager', label: 'Ban bộ địa phương (Quận/Huyện)' },
    { id: 'ward_manager', label: 'Cán bộ Xã/Phường' },
    { id: 'school_manager', label: 'Đại diện Trường học' },
    { id: 'department_manager', label: 'Sở/Ban ngành Thành phố' },
    { id: 'environment_department', label: 'Ban Môi trường (Giám sát Tổng thể)' },
  ];

  const districtCoords: Record<string, { lat: number, lng: number }> = {
    // Đà Nẵng
    'Hải Châu': { lat: 16.0474, lng: 108.2197 },
    'Thanh Khê': { lat: 16.0614, lng: 108.1801 },
    'Sơn Trà': { lat: 16.0911, lng: 108.2616 },
    'Ngũ Hành Sơn': { lat: 16.0025, lng: 108.2492 },
    'Liên Chiểu': { lat: 16.0592, lng: 108.1384 },
    'Cẩm Lệ': { lat: 15.9988, lng: 108.1916 },
    'Hòa Vang': { lat: 15.9867, lng: 108.0671 },
    // Quảng Nam
    'Tam Kỳ': { lat: 15.5647, lng: 108.4811 },
    'Hội An': { lat: 15.8801, lng: 108.3380 },
    'Điện Bàn': { lat: 15.8912, lng: 108.2415 },
    'Đại Lộc': { lat: 15.8854, lng: 108.0054 },
    'Duy Xuyên': { lat: 15.8197, lng: 108.2492 },
    'Thăng Bình': { lat: 15.7412, lng: 108.3715 },
    'Quế Sơn': { lat: 15.6812, lng: 108.1512 },
    'Núi Thành': { lat: 15.4212, lng: 108.6512 },
    'Phú Ninh': { lat: 15.5112, lng: 108.4512 },
    'Tiên Phước': { lat: 15.4812, lng: 108.3112 },
    'Bắc Trà My': { lat: 15.28, lng: 108.23 },
    'Nam Trà My': { lat: 15.05, lng: 108.08 },
    'Phước Sơn': { lat: 15.35, lng: 107.85 },
    'Hiệp Đức': { lat: 15.55, lng: 108.05 },
    'Nông Sơn': { lat: 15.65, lng: 107.95 },
    'Đông Giang': { lat: 15.95, lng: 107.85 },
    'Nam Giang': { lat: 15.65, lng: 107.65 },
    'Tây Giang': { lat: 15.9, lng: 107.45 }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleGetLocation = (retryWithLowAccuracy = true) => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ định vị');
      return;
    }

    setIsLoading(true);
    setError('');

    const options = { 
      enableHighAccuracy: retryWithLowAccuracy, 
      timeout: retryWithLowAccuracy ? 10000 : 30000, 
      maximumAge: retryWithLowAccuracy ? 0 : 300000 
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        let minDistance = Infinity;
        let detectedArea = 'Hải Châu';

        Object.entries(districtCoords).forEach(([name, coords]) => {
          const dist = calculateDistance(latitude, longitude, coords.lat, coords.lng);
          if (dist < minDistance) {
            minDistance = dist;
            detectedArea = name;
          }
        });
        
        setArea(detectedArea);
        setIsLoading(false);
        setSuccess(`Đã xác định vị trí: ${detectedArea} (Độ chính xác: ${position.coords.accuracy.toFixed(0)}m)`);
      },
      (err) => {
        if (retryWithLowAccuracy && (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE)) {
          console.warn("High accuracy GPS failed in Login, retrying with low accuracy...");
          handleGetLocation(false);
        } else {
          let msg = err.message;
          if (err.code === err.TIMEOUT) msg = "Hết thời gian chờ. Hãy bật GPS và thử lại.";
          setError(`Lỗi định vị: ${msg}`);
          setIsLoading(false);
        }
      },
      options
    );
  };

  const handleGoogleLogin = async () => {
    if (!isFirebaseConfigured) {
      setError('Firebase chưa được cấu hình. Vui lòng thiết lập API Key.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Sync with server to get JWT token
      try {
        const syncRes = await fetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
          })
        });
        
        if (syncRes.ok) {
          const { token, user: serverUser } = await syncRes.json();
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(serverUser));
          onLogin(serverUser);
          return;
        }
      } catch (syncErr) {
        console.error('Server sync failed:', syncErr);
      }

      const userData = {
        username: user.email,
        role: 'citizen',
        area: 'All',
        organizationName: user.displayName || 'Người dùng Google',
        uid: user.uid
      };
      localStorage.setItem('user', JSON.stringify(userData));
      onLogin(userData);
    } catch (err: any) {
      setError(err.message || 'Đăng nhập Google thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isRegistering) {
        if (!isFirebaseConfigured) {
          setError('Firebase chưa được cấu hình. Vui lòng thiết lập API Key.');
          setIsLoading(false);
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, username, password);
        const user = userCredential.user;
        
        await updateProfile(user, {
          displayName: organizationName
        });

        // Sync with server
        try {
          const syncRes = await fetch('/api/auth/firebase-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: user.uid,
              email: user.email,
              displayName: organizationName
            })
          });
          
          if (syncRes.ok) {
            const { token, user: serverUser } = await syncRes.json();
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(serverUser));
            setSuccess('Đăng ký thành công!');
            onLogin(serverUser);
            return;
          }
        } catch (syncErr) {
          console.error('Server sync failed:', syncErr);
        }

        const userData = {
          username: user.email,
          role,
          area,
          organizationName,
          uid: user.uid
        };
        localStorage.setItem('user', JSON.stringify(userData));
        setSuccess('Đăng ký thành công!');
        onLogin(userData);
      } else {
        if (!isFirebaseConfigured) {
          // Fallback to local login for demo if Firebase is missing
          if ((username === 'admin@dananggreen.vn' || username === 'quanly@dananggreen.vn') && password === '123456') {
            // Call server login for local accounts
            try {
              const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
              });
              if (loginRes.ok) {
                const { token, user: serverUser } = await loginRes.json();
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(serverUser));
                onLogin(serverUser);
                return;
              }
            } catch (err) {}

            const userData = {
              username,
              role: username === 'admin@dananggreen.vn' ? 'admin' : 'environment_department',
              area: 'All',
              organizationName: username === 'admin@dananggreen.vn' ? 'Quản trị hệ thống' : 'Sở Tài nguyên Môi trường',
              uid: 'demo-uid'
            };
            localStorage.setItem('user', JSON.stringify(userData));
            onLogin(userData);
            return;
          }
          setError('Firebase chưa được cấu hình. Vui lòng thiết lập API Key.');
          setIsLoading(false);
          return;
        }
        const userCredential = await signInWithEmailAndPassword(auth, username, password);
        const user = userCredential.user;
        
        // Sync with server
        try {
          const syncRes = await fetch('/api/auth/firebase-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName
            })
          });
          
          if (syncRes.ok) {
            const { token, user: serverUser } = await syncRes.json();
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(serverUser));
            onLogin(serverUser);
            return;
          }
        } catch (syncErr) {
          console.error('Server sync failed:', syncErr);
        }

        const userData = {
          username: user.email,
          role: 'citizen', // Default, should be fetched from DB in real app
          area: 'All',
          organizationName: user.displayName || 'Người dùng',
          uid: user.uid
        };
        localStorage.setItem('user', JSON.stringify(userData));
        onLogin(userData);
      }
    } catch (err: any) {
      setError(err.message || 'Thao tác thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-200/30 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/30 rounded-full blur-[120px]"></div>
      </div>

      <div className="glass-card w-full max-w-md overflow-hidden relative z-10 border-white/60 shadow-2xl shadow-slate-200">
        <div className="p-10 text-center bg-gradient-to-br from-brand-600 to-brand-800 text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="relative z-10">
            <div className="inline-block bg-white/20 p-5 rounded-[2rem] mb-6 backdrop-blur-md border border-white/30 shadow-xl">
               <LogoIcon className="w-14 h-14 text-white" />
            </div>
            <h2 className="text-4xl font-black tracking-tighter uppercase mb-2">DA NANG GREEN</h2>
            <p className="text-brand-100 text-xs font-bold uppercase tracking-widest opacity-80">Hệ thống Quản lý Môi trường Thông minh</p>
            {!isFirebaseConfigured && (
              <div className="mt-4 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-xl backdrop-blur-sm">
                <p className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">
                  ⚠️ Chế độ Demo (Firebase chưa cấu hình)
                </p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-10">
          <div className="flex mb-10 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-100">
            <button 
              onClick={() => { setIsRegistering(false); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${!isRegistering ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Đăng nhập
            </button>
            <button 
              onClick={() => { setIsRegistering(true); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${isRegistering ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {isRegistering && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên Đơn vị / Tổ chức</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all outline-none text-sm font-bold"
                  placeholder="Ví dụ: UBND Phường Hòa Cường Bắc"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email đăng nhập</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all outline-none text-sm font-bold"
                placeholder="admin@dananggreen.vn"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all outline-none text-sm font-bold"
                placeholder="••••••••"
                required
              />
            </div>

            {isRegistering && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vai trò</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all outline-none text-sm font-bold appearance-none"
                  >
                    {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>

                <div className="flex items-end gap-3">
                  <div className="flex-grow space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Địa bàn quản lý</label>
                    <select
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all outline-none text-sm font-bold appearance-none"
                    >
                      {districts.map(d => <option key={d} value={d}>{d}</option>)}
                      <option value="All">Toàn vùng (ĐN - QN)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGetLocation()}
                    className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all shadow-sm active:scale-95"
                    title="Xác định vị trí qua GPS"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </>
            )}
            
            {error && (
              <div className="bg-red-50 text-red-600 p-5 rounded-[1.5rem] text-xs border border-red-100 flex items-center animate-shake font-bold">
                <div className="bg-red-500 text-white rounded-full p-1.5 mr-4 flex-shrink-0 shadow-lg shadow-red-100">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 text-emerald-600 p-5 rounded-[1.5rem] text-xs border border-emerald-100 flex items-center font-bold">
                <div className="bg-emerald-500 text-white rounded-full p-1.5 mr-4 flex-shrink-0 shadow-lg shadow-emerald-100">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-brand-100 hover:bg-brand-700 hover:shadow-brand-200 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
            >
              {isLoading ? 'Đang xử lý...' : (isRegistering ? 'Đăng ký tài khoản' : 'Đăng nhập Hệ thống')}
            </button>

            {!isRegistering && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 font-bold py-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all duration-300 shadow-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                <span>Tiếp tục với Google</span>
              </button>
            )}

            {!isRegistering && (
              <div className="mt-10 p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Tài khoản Cán bộ Hệ thống</p>
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    type="button"
                    onClick={() => { setUsername('admin@dananggreen.vn'); setPassword('123456'); }}
                    className="text-left px-4 py-3 rounded-2xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100 group"
                  >
                    <div className="text-[11px] font-black text-slate-700 group-hover:text-brand-600 transition-colors uppercase tracking-tight">Admin: admin@dananggreen.vn</div>
                    <div className="text-[10px] font-bold text-slate-400">Mật khẩu: 123456</div>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setUsername('quanly@dananggreen.vn'); setPassword('123456'); }}
                    className="text-left px-4 py-3 rounded-2xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100 group"
                  >
                    <div className="text-[11px] font-black text-slate-700 group-hover:text-brand-600 transition-colors uppercase tracking-tight">Quản lý: quanly@dananggreen.vn</div>
                    <div className="text-[10px] font-bold text-slate-400">Mật khẩu: 123456</div>
                  </button>
                </div>
              </div>
            )}

            {!isRegistering && (
              <button
                type="button"
                onClick={() => onLogin({ username: 'guest', role: 'citizen', area: 'All', organizationName: 'Người dân' })}
                className="w-full mt-4 bg-white text-brand-600 font-black py-4 rounded-2xl border-2 border-brand-50 hover:bg-brand-50 transition-all duration-300 uppercase tracking-widest text-[10px]"
              >
                Tiếp tục với vai trò Người dân
              </button>
            )}
          </form>
          
          <div className="mt-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
            <p>Hệ thống dành cho cán bộ quản lý, trường học và ban ngành.</p>
            <p className="mt-1">Mọi đăng ký sẽ được giám sát bởi quản trị viên.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
