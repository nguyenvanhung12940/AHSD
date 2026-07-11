
import React, { useState, useCallback, useEffect } from 'react';
import * as L from 'leaflet';
import { analyzeEnvironmentalImage, askAIAboutEnvironment, generateAIImage } from './services/geminiService';
import { saveOfflineReport, getOfflineReports, deleteOfflineReport, compressImage } from './services/offlineService';
import { EnvironmentalReport, AIAnalysis, ReportStatus, ChatMessage, ToastMessage, EducationalTopic, EnvironmentalPOI, EnvironmentalNotification } from './types';
import MainMapView from './components/MainMapView';
import ReportForm from './components/ReportForm';
import ReportDetailModal from './components/ReportDetailModal';
import HomeView from './components/HomeView';
import ThankYouView from './components/ThankYouView';
import FloatingAIAssistant from './components/FloatingAIAssistant';
import ToastContainer from './components/ToastContainer';
import { LogoIcon } from './components/icons/LogoIcon';
import { TrophyIcon } from './components/icons/TrophyIcon';
import EducationDetailModal from './components/EducationDetailModal';
import EnvironmentalMapView from './components/EnvironmentalMapView';
import SOSView from './components/SOSView';
import OfflineReportsModal from './components/OfflineReportsModal';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import BottomNav from './components/BottomNav';
import NotificationCenter from './components/NotificationCenter';
import OrderForm from './components/OrderForm';
import { SOSIcon } from './components/icons/SOSIcon';
import { CloudIcon } from './components/icons/CloudIcon';
import { auth, isFirebaseConfigured } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { startNFCScan, isNFCSupported, writeNFCSOSTag } from './services/nfcService';

// Dữ liệu mẫu tĩnh (Static Data) - Chỉ dùng để hiển thị khi người dùng chưa nhập gì
const initialReports: EnvironmentalReport[] = [
  {
    id: 'rep-static-1',
    mediaUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    mediaType: 'image',
    latitude: 16.047,
    longitude: 108.220,
    userDescription: 'Rác thải nhựa tràn lan tại vỉa hè đường Bạch Đằng.',
    description: 'Phát hiện rác thải nhựa tập trung nhiều tại khu vực công cộng.',
    status: 'Báo cáo mới',
    timestamp: new Date(),
    area: 'Hải Châu',
    aiAnalysis: {
      issueType: 'Xả rác không đúng nơi quy định',
      description: 'Rác thải nhựa tập trung nhiều tại khu vực công cộng.',
      priority: 'Trung bình',
      solution: 'Cần đội vệ sinh môi trường thu gom trong ngày.',
      isIssuePresent: true
    }
  },
  {
    id: 'rep-static-2',
    mediaUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
    mediaType: 'image',
    latitude: 15.986,
    longitude: 108.067,
    userDescription: 'Nước dâng cao gây ngập úng cục bộ tại các tuyến đường liên thôn.',
    description: 'Tình trạng ngập lụt do mưa lớn kéo dài.',
    status: 'Đang xử lý',
    timestamp: new Date(),
    area: 'Hòa Vang',
    aiAnalysis: {
      issueType: 'Ngập lụt',
      description: 'Tình trạng ngập lụt do mưa lớn kéo dài.',
      priority: 'Cao',
      solution: 'Cảnh báo người dân và chuẩn bị phương án di dời nếu cần.',
      isIssuePresent: true
    }
  },
  {
    id: 'rep-static-3',
    mediaUrl: 'https://images.unsplash.com/photo-1590012314607-cda9d9b699ae?auto=format&fit=crop&w=800&q=80',
    mediaType: 'image',
    latitude: 15.567,
    longitude: 108.483,
    userDescription: 'Sạt lở đất tại khu vực đồi núi gần khu dân cư.',
    description: 'Sạt lở đất đá sau bão, gây nguy hiểm cho giao thông.',
    status: 'Đã xử lý',
    timestamp: new Date(),
    area: 'Tam Kỳ',
    aiAnalysis: {
      issueType: 'Sạt lở đất',
      description: 'Sạt lở đất đá sau bão, gây nguy hiểm cho giao thông.',
      priority: 'Cao',
      solution: 'Đã dọn dẹp hiện trường và gia cố taluy.',
      isIssuePresent: true
    }
  }
];

// Dữ liệu các điểm môi trường quan trọng (POIs)
const environmentalPOIs: EnvironmentalPOI[] = [
  {
    id: 'poi-1',
    type: 'NatureReserve',
    name: 'Khu bảo tồn thiên nhiên Sơn Trà',
    description: 'Một công viên quốc gia đa dạng sinh học, là nơi sinh sống của loài Voọc chà vá chân nâu quý hiếm. Nơi tuyệt vời để đi bộ đường dài và tìm hiểu về thiên nhiên.',
    latitude: 16.1333,
    longitude: 108.2833,
  },
  {
    id: 'poi-2',
    type: 'RecyclingCenter',
    name: 'Trung tâm Tái chế Đà Nẵng Xanh',
    description: 'Tiếp nhận các vật liệu có thể tái chế như nhựa, giấy, kim loại và thủy tinh. Giúp giảm thiểu rác thải và bảo vệ tài nguyên.',
    latitude: 16.031,
    longitude: 108.182,
  },
  {
    id: 'poi-3',
    type: 'CommunityCleanup',
    name: 'Điểm tập kết dọn dẹp Bãi biển Mỹ Khê',
    description: 'Điểm hẹn hàng tuần cho các tình nguyện viên tham gia các hoạt động làm sạch bãi biển, giữ gìn vẻ đẹp cho một trong những bãi biển đẹp nhất hành tinh.',
    latitude: 16.0585,
    longitude: 108.248,
  },
  {
    id: 'poi-4',
    type: 'WaterStation',
    name: 'Trạm nước uống công cộng Cầu Rồng',
    description: 'Trạm nạp nước miễn phí giúp giảm thiểu việc sử dụng chai nhựa dùng một lần. Hãy mang theo chai cá nhân của bạn!',
    latitude: 16.0615,
    longitude: 108.2275,
  },
  {
    id: 'poi-5',
    type: 'RiskPoint',
    name: 'Điểm nguy cơ ngập lụt - Hòa Vang',
    description: 'Khu vực thấp trũng, thường xuyên xảy ra ngập lụt khi có mưa lớn kéo dài. Cần theo dõi sát sao mực nước.',
    latitude: 15.985,
    longitude: 108.152,
  },
  {
    id: 'poi-6',
    type: 'RiskPoint',
    name: 'Điểm nguy cơ sạt lở - Bán đảo Sơn Trà',
    description: 'Đoạn đường có độ dốc lớn, kết cấu địa chất yếu, dễ xảy ra sạt lở đất đá trong mùa mưa bão.',
    latitude: 16.125,
    longitude: 108.275,
  },
  {
    id: 'poi-7',
    type: 'RiskPoint',
    name: 'Khu vực ô nhiễm không khí cao - KCN Hòa Khánh',
    description: 'Nơi tập trung nhiều nhà máy sản xuất, chỉ số AQI thường xuyên ở mức cảnh báo. Khuyến nghị đeo khẩu trang khi di chuyển qua đây.',
    latitude: 16.068,
    longitude: 108.145,
  },
];

const App: React.FC = () => {
  const [reports, setReports] = useState<EnvironmentalReport[]>(initialReports);
  const [view, setView] = useState<'home' | 'map' | 'form' | 'thankYou' | 'environmentalMap' | 'sos' | 'login' | 'dashboard'>('home');
  const [previousView, setPreviousView] = useState<'home' | 'map' | 'environmentalMap'>('home');
  const [selectedReport, setSelectedReport] = useState<EnvironmentalReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [lastAwardedPoints, setLastAwardedPoints] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [selectedEducationTopic, setSelectedEducationTopic] = useState<EducationalTopic | null>(null);
  const [mapViewState, setMapViewState] = useState({
    center: [15.85, 108.3] as [number, number],
    zoom: 10,
  });
  
  // Auth State
  const [user, setUser] = useState<any>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<EnvironmentalNotification[]>([]);

  // State cho Trợ lý AI nổi
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { 
      role: 'model', 
      content: 'Xin chào! Tôi là Trợ lý AI của DA NANG GREEN. Tôi có thể giúp gì cho bạn hôm nay?',
      suggestions: [
        "Cách phân loại rác đúng cách?",
        "Báo cáo một điểm xả rác trái phép.",
        "Một số mẹo tiết kiệm nước là gì?",
      ]
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  // Offline Mode State
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  // Auto Monitoring Mode State
  const [isAutoMonitoring, setIsAutoMonitoring] = useState<boolean>(false);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [isNFCLinking, setIsNFCLinking] = useState(false);

  // Handle URL parameters for deep linking (e.g., NFC tap)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'sos') {
      setView('sos');
      // Clear the param to avoid re-triggering on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Initialize NFC scanning
  useEffect(() => {
    let nfcReader: any = null;
    
    const initNFC = async () => {
      if (isNFCSupported()) {
        nfcReader = await startNFCScan(
          () => {
            setView('sos');
            addToast('NFC: Đã kích hoạt chế độ SOS khẩn cấp!', 'warning');
          },
          (msg) => console.log("NFC Info:", msg)
        );
      }
    };

    initNFC();

    return () => {
      // Web NFC doesn't have a standard stop() but we can ignore future events
    };
  }, []);

  // Initialize auto-monitoring for mobile on mount
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      setIsAutoMonitoring(true);
    }
  }, []);

  // Load user from local storage and listen for auth state changes
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          const basicUser = {
            username: firebaseUser.email,
            role: 'citizen',
            area: 'All',
            organizationName: firebaseUser.displayName || 'Người dùng',
            uid: firebaseUser.uid
          };
          setUser(basicUser);
          localStorage.setItem('user', JSON.stringify(basicUser));
        }
      } else {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch notifications for authorities
  const fetchNotifications = async (retries = 3) => {
    if (!user || user.role === 'citizen') return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      } else if (retries > 0) {
        setTimeout(() => fetchNotifications(retries - 1), 2000);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      if (retries > 0) {
        setTimeout(() => fetchNotifications(retries - 1), 2000);
      }
    }
  };

  useEffect(() => {
    if (user && user.role !== 'citizen') {
      fetchNotifications();
    }
  }, [user]);

  // Fetch reports from API
  const fetchReports = async (retries = 3) => {
    if (!isOnline) return;
    try {
      console.log("Fetching reports from /api/reports...");
      const response = await fetch('/api/reports');
      console.log(`Fetch reports status: ${response.status} ${response.statusText}`);
      
      const contentType = response.headers.get("content-type");
      console.log(`Fetch reports content-type: ${contentType}`);

      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          const parsedData = data.map((report: any) => ({
            ...report,
            timestamp: new Date(report.timestamp)
          }));
          setReports(parsedData);
        } catch (parseError) {
          console.error("Failed to parse reports JSON. Response text starts with:", text.substring(0, 100));
          throw parseError;
        }
      } else if (retries > 0) {
        console.warn(`Fetch reports failed with status ${response.status}. Retrying...`);
        setTimeout(() => fetchReports(retries - 1), 2000);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      if (retries > 0) {
        console.warn(`Fetch reports threw error. Retrying in 2s... (${retries} left)`);
        setTimeout(() => fetchReports(retries - 1), 2000);
      }
    }
  };

  useEffect(() => {
    fetchReports();
    
    // Setup WebSocket for real-time updates
    if (isOnline) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_REPORT') {
            addToast(`Có báo cáo mới tại ${data.report.area}`, 'success');
            const newReport = { ...data.report, timestamp: new Date(data.report.timestamp) };
            setReports(prev => [newReport, ...prev]);
          } else if (data.type === 'REPORT_UPDATED') {
            setReports(prev => prev.map(r => r.id === data.id ? { ...r, status: data.status } : r));
          } else if (data.type === 'NEW_NOTIFICATION') {
            if (user && data.userId === user.id) {
              setNotifications(prev => [data.notification, ...prev]);
              addToast('Bạn có thông báo mới từ hệ thống!', 'warning');
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.warn('WebSocket error (this is normal in some preview environments):', error);
      };

      return () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    }
  }, [isOnline]);

  // Effect to handle online/offline status and sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('Đã kết nối lại Internet. Đang đồng bộ dữ liệu...', 'success');
      syncOfflineReports();
      fetchReports(); // Refresh data
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast('Mất kết nối Internet. Chế độ Offline đã được kích hoạt.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check for pending reports
    updatePendingReportsCount();

    // Fetch approximate location via IP immediately on load (No permission needed)
    const fetchApproximateLocation = async () => {
      try {
        // Only fetch if we don't have a precise location yet
        if (!userLocation) {
            const response = await fetch('https://ipapi.co/json/');
            if (response.ok) {
                const data = await response.json();
                if (data.latitude && data.longitude) {
                    // Check if the location is within reasonable bounds of Vietnam to avoid VPN weirdness
                    if (data.latitude > 8 && data.latitude < 24 && data.longitude > 102 && data.longitude < 110) {
                        setUserLocation({ latitude: data.latitude, longitude: data.longitude });
                        // Don't show toast for IP location to keep it subtle, 
                        // or maybe a small info toast: "Đang hiển thị khu vực của bạn (theo IP)"
                    }
                }
            }
        }
      } catch (error) {
        console.warn("Could not fetch IP location:", error);
      }
    };
    
    fetchApproximateLocation();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto Monitoring Mode Effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isAutoMonitoring) {
      addToast('Đã bật Chế độ Giám sát Tự động. Hệ thống sẽ cập nhật dữ liệu mỗi 10 giây.', 'success');
      
      const generateMockReport = async () => {
        const districts = [
          // Đà Nẵng
          { name: 'Hải Châu', lat: 16.047, lng: 108.220, province: 'Đà Nẵng' },
          { name: 'Thanh Khê', lat: 16.061, lng: 108.180, province: 'Đà Nẵng' },
          { name: 'Sơn Trà', lat: 16.091, lng: 108.261, province: 'Đà Nẵng' },
          { name: 'Ngũ Hành Sơn', lat: 16.002, lng: 108.249, province: 'Đà Nẵng' },
          { name: 'Liên Chiểu', lat: 16.059, lng: 108.138, province: 'Đà Nẵng' },
          { name: 'Cẩm Lệ', lat: 15.998, lng: 108.191, province: 'Đà Nẵng' },
          { name: 'Hòa Vang', lat: 15.986, lng: 108.067, province: 'Đà Nẵng' },
          // Quảng Nam
          { name: 'Tam Kỳ', lat: 15.567, lng: 108.483, province: 'Quảng Nam' },
          { name: 'Hội An', lat: 15.883, lng: 108.333, province: 'Quảng Nam' },
          { name: 'Điện Bàn', lat: 15.883, lng: 108.233, province: 'Quảng Nam' },
          { name: 'Bắc Trà My', lat: 15.283, lng: 108.217, province: 'Quảng Nam' },
          { name: 'Duy Xuyên', lat: 15.817, lng: 108.250, province: 'Quảng Nam' },
          { name: 'Đại Lộc', lat: 15.883, lng: 107.983, province: 'Quảng Nam' },
          { name: 'Đông Giang', lat: 15.950, lng: 107.750, province: 'Quảng Nam' },
          { name: 'Hiệp Đức', lat: 15.550, lng: 108.083, province: 'Quảng Nam' },
          { name: 'Nam Giang', lat: 15.617, lng: 107.517, province: 'Quảng Nam' },
          { name: 'Nam Trà My', lat: 15.017, lng: 108.083, province: 'Quảng Nam' },
          { name: 'Nông Sơn', lat: 15.650, lng: 107.967, province: 'Quảng Nam' },
          { name: 'Núi Thành', lat: 15.417, lng: 108.617, province: 'Quảng Nam' },
          { name: 'Phú Ninh', lat: 15.517, lng: 108.417, province: 'Quảng Nam' },
          { name: 'Phước Sơn', lat: 15.350, lng: 107.783, province: 'Quảng Nam' },
          { name: 'Quế Sơn', lat: 15.633, lng: 108.150, province: 'Quảng Nam' },
          { name: 'Tây Giang', lat: 15.917, lng: 107.450, province: 'Quảng Nam' },
          { name: 'Thăng Bình', lat: 15.717, lng: 108.367, province: 'Quảng Nam' },
          { name: 'Tiên Phước', lat: 15.483, lng: 108.267, province: 'Quảng Nam' }
        ];

        const district = districts[Math.floor(Math.random() * districts.length)];
        const lat = district.lat + (Math.random() - 0.5) * 0.04;
        const lng = district.lng + (Math.random() - 0.5) * 0.04;

        const issueTypes: AIAnalysis['issueType'][] = [
          'Xả rác không đúng nơi quy định',
          'Ngập lụt',
          'Sạt lở đất',
          'Cần chăm sóc cây xanh',
          'Khác'
        ];
        const issueType = issueTypes[Math.floor(Math.random() * issueTypes.length)];
        
        const priority = (Math.random() > 0.7 ? 'Cao' : (Math.random() > 0.4 ? 'Trung bình' : 'Thấp')) as AIAnalysis['priority'];
        
        const researchSnippets = [
          "Dữ liệu cảm biến cho thấy sự thay đổi bất thường.",
          "Nghiên cứu thực địa ghi nhận tình trạng ô nhiễm cục bộ.",
          "Phân tích hình ảnh vệ tinh phát hiện biến đổi bề mặt.",
          "Báo cáo từ hệ thống giám sát tự động IoT.",
          "Kết quả quan trắc môi trường định kỳ.",
          "Dữ liệu từ trạm quan trắc khí tượng thủy văn khu vực.",
          "Phân tích từ mô hình dự báo rủi ro thiên tai."
        ];
        const snippet = researchSnippets[Math.floor(Math.random() * researchSnippets.length)];

        // Generate AI Image instead of loremflickr
        const prompt = `${issueType} tại khu vực ${district.name}, ${district.province}, Việt Nam`;
        let imageUrl = await generateAIImage(prompt);
        
        // Fallback to loremflickr if AI generation fails
        if (!imageUrl) {
          const imageKeywords: Record<string, string> = {
            'Xả rác không đúng nơi quy định': 'trash,waste,pollution',
            'Ngập lụt': 'flood,water,rain',
            'Sạt lở đất': 'landslide,mud,mountain',
            'Cần chăm sóc cây xanh': 'tree,garden,nature',
            'Khác': 'environment,city,landscape'
          };
          const keyword = `${imageKeywords[issueType] || 'environment'},vietnam`;
          const seed = Math.floor(Math.random() * 1000);
          imageUrl = `https://loremflickr.com/800/600/${keyword}?lock=${seed}`;
        }

        const newReport: EnvironmentalReport = {
          id: `rep-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          mediaUrl: imageUrl,
          mediaType: 'image',
          latitude: lat,
          longitude: lng,
          userDescription: `Phát hiện ${issueType.toLowerCase()} tại ${district.name}. ${snippet}`,
          description: `Phát hiện ${issueType.toLowerCase()} tại ${district.name}. ${snippet}`,
          status: 'Báo cáo mới',
          timestamp: new Date(),
          area: district.name,
          aiAnalysis: {
            issueType: issueType,
            description: `Phát hiện ${issueType.toLowerCase()} tại ${district.name}. ${snippet}`,
            priority: priority,
            solution: priority === 'Cao' ? 'Cử đội ứng phó khẩn cấp ngay lập tức.' : 'Lên lịch kiểm tra và xử lý trong 48 giờ tới.',
            isIssuePresent: true
          }
        };

        setReports(prev => [newReport, ...prev]);
        addToast(`Phát hiện sự cố: ${issueType} tại ${district.name}`, 'warning');
      };

      // Generate first report immediately
      generateMockReport();
      
      // Then every 10 seconds
      intervalId = setInterval(generateMockReport, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutoMonitoring]);

  const updatePendingReportsCount = () => {
    getOfflineReports().then(reports => {
      setPendingReportsCount(reports.length);
      if (navigator.onLine && reports.length > 0) {
        syncOfflineReports();
      }
    });
  };

  const syncOfflineReports = async () => {
    try {
      const offlineReports = await getOfflineReports();
      if (offlineReports.length === 0) return;

      // Send to server
      for (const report of offlineReports) {
        try {
          const response = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report),
          });
          
          if (response.ok) {
            await deleteOfflineReport(report.id);
          } else {
            console.error(`Failed to sync report ${report.id}: ${response.statusText}`);
          }
        } catch (err) {
          console.error(`Error syncing report ${report.id}:`, err);
        }
      }

      setPendingReportsCount(0);
      addToast(`Đã đồng bộ ${offlineReports.length} báo cáo offline thành công!`, 'success');
      fetchReports();

    } catch (error) {
      console.error("Sync failed:", error);
      addToast('Đồng bộ thất bại. Vui lòng thử lại sau.', 'error');
    }
  };

  // Effect để tải điểm từ localStorage khi render lần đầu
  useEffect(() => {
    try {
      const savedPoints = localStorage.getItem('daNangGreenUserPoints');
      if (savedPoints) {
        setUserPoints(parseInt(savedPoints, 10) || 0);
      }
    } catch (error) {
      console.error("Lỗi khi tải điểm từ localStorage:", error);
    }
  }, []);

  // Effect để theo dõi vị trí của người dùng liên tục với độ chính xác cao
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Trình duyệt không hỗ trợ định vị");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`Vị trí cập nhật: ${latitude}, ${longitude} (Độ chính xác: ${accuracy}m)`);
        
        setUserLocation({ latitude, longitude });
        
        // Cập nhật tâm bản đồ nếu chưa có vị trí hoặc độ chính xác tốt
        setMapViewState(prev => {
          // Nếu chưa có tâm bản đồ thực sự (đang ở mặc định), thì cập nhật
          if (prev.center[0] === 15.85 && prev.center[1] === 108.3) {
            return { ...prev, center: [latitude, longitude] };
          }
          return prev;
        });
      },
      (error) => {
        let errorMsg = "";
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Người dùng từ chối cấp quyền định vị.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Thông tin vị trí không khả dụng.";
            break;
          case error.TIMEOUT:
            errorMsg = "Hết thời gian chờ lấy vị trí.";
            break;
          default:
            errorMsg = "Lỗi định vị không xác định.";
        }
        console.warn("Lỗi định vị:", errorMsg);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 30000, 
        maximumAge: 0 
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []); // Chạy một lần khi mount, watchPosition sẽ tự lo phần cập nhật

  // Effect để lưu điểm vào localStorage mỗi khi chúng thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('daNangGreenUserPoints', userPoints.toString());
    } catch (error) {
      console.error("Lỗi khi lưu điểm vào localStorage:", error);
    }
  }, [userPoints]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
  }, []);

  // ĐÃ XÓA: useEffect tạo báo cáo giả tự động

  const removeToast = useCallback((id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  const handleStartNewReport = (currentView: 'home' | 'map' | 'environmentalMap') => {
    setPreviousView(currentView);
    setView('form');
  };

  const handleAddNewReport = async (
    mediaFile: File,
    userDescription: string,
    coords: { latitude: number; longitude: number },
    aiAnalysis: AIAnalysis // Nhận kết quả phân tích đã được xác thực
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Compress image first (for both online and offline)
      const compressedMediaUrl = await compressImage(mediaFile);
      
      const newReport: EnvironmentalReport = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        mediaUrl: compressedMediaUrl,
        mediaType: mediaFile.type.startsWith('video') ? 'video' : 'image',
        latitude: coords.latitude,
        longitude: coords.longitude,
        userDescription,
        description: aiAnalysis.description,
        aiAnalysis, // Sử dụng trực tiếp kết quả phân tích
        status: 'Báo cáo mới',
        timestamp: new Date(),
      };

      if (!isOnline) {
        // Save to IndexedDB if offline
        await saveOfflineReport(newReport);
        setPendingReportsCount(prev => prev + 1);
        addToast('Đã lưu báo cáo vào bộ nhớ tạm. Sẽ tự động gửi khi có mạng.', 'success');
        
        // SMS Fallback logic removed to avoid window.confirm in iframe
        console.log("Offline report saved. SMS fallback suggested but skipped due to iframe constraints.");

      } else {
        // Online: Send to API
        // Check payload size for Vercel (approx 4.5MB limit)
        const payloadSize = JSON.stringify(newReport).length;
        if (payloadSize > 4 * 1024 * 1024) {
          addToast('Dữ liệu quá lớn (vượt quá 4MB). Vui lòng chọn ảnh/video nhỏ hơn hoặc nén lại.', 'error');
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newReport),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const message = response.status === 413 ? 'Dữ liệu quá lớn cho máy chủ.' : (errorData.message || `Lỗi máy chủ (${response.status})`);
          throw new Error(message);
        }
        
        // Tặng điểm cho báo cáo mới
        const pointsAwarded = 10;
        setUserPoints(prevPoints => prevPoints + pointsAwarded);
        setLastAwardedPoints(pointsAwarded);
        
        addToast('Báo cáo đã được gửi thành công!', 'success');
        fetchReports(); // Refresh list
      }
      
      setView('thankYou');
      setIsLoading(false);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định.';
      setError(`Lỗi khi tạo báo cáo: ${errorMessage}`);
      setIsLoading(false);
      console.error(err);
    }
  };
  
  const handleUpdateReportStatus = async (reportId: string) => {
     const statusCycle: Record<ReportStatus, ReportStatus> = {
      'Báo cáo mới': 'Đang xử lý',
      'Đang xử lý': 'Đã xử lý',
      'Đã xử lý': 'Báo cáo mới',
    };
    
    const currentReport = reports.find(r => r.id === reportId);
    if (!currentReport) return;

    const newStatus = statusCycle[currentReport.status];

    try {
        const response = await fetch(`/api/reports/${reportId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
            setReports(prevReports =>
                prevReports.map(report =>
                  report.id === reportId
                    ? { ...report, status: newStatus }
                    : report
                )
              );
              setSelectedReport(prev => prev ? {...prev, status: newStatus} : null);
              addToast('Cập nhật trạng thái báo cáo thành công!');
        }
    } catch (error) {
        addToast('Lỗi cập nhật trạng thái', 'error');
    }
  };

  const handleExternalAnalysis = async (reportId: string, mediaUrl: string) => {
    try {
      const response = await fetch('/api/external-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, data: mediaUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Lỗi khi gọi mô hình ngoài');
      }

      return await response.json();
    } catch (error: any) {
      addToast(error.message || 'Lỗi kết nối mô hình ngoài', 'error');
      throw error;
    }
  };

  const handleSelectReport = (report: EnvironmentalReport | null) => {
    setSelectedReport(report);
  };

  const handleChatSubmit = async (userMessage: string) => {
    if (!userMessage.trim() || isChatLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', content: userMessage };
    setChatMessages(prev => [...prev, newUserMessage]);
    setIsChatLoading(true);

    try {
      const aiResponse = await askAIAboutEnvironment(userMessage, userLocation);
      const newAiMessage: ChatMessage = {
        role: 'model',
        content: aiResponse.text,
        groundingChunks: aiResponse.groundingChunks,
        imageUrl: aiResponse.imageUrl,
      };
      setChatMessages(prev => [...prev, newAiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = { role: 'model', content: "Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau." };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([
      { 
        role: 'model', 
        content: 'Xin chào! Tôi là Trợ lý AI của DA NANG GREEN. Tôi có thể giúp gì cho bạn hôm nay?',
        suggestions: [
          "Cách phân loại rác đúng cách?",
          "Báo cáo một điểm xả rác trái phép.",
          "Một số mẹo tiết kiệm nước là gì?",
        ]
      }
    ]);
  };

  const handleNavigateFromThankYou = (destination: 'home' | 'map') => {
    setView(destination);
    setLastAwardedPoints(0); // Đặt lại điểm để thông báo không hiển thị lại
  };

  const handleSelectReportAndNavigateToMap = (report: EnvironmentalReport) => {
    setView('map');
    // Đặt báo cáo được chọn sẽ làm cho modal xuất hiện trên chế độ xem bản đồ
    setSelectedReport(report);
  };

  const handleSelectEducationTopic = (topic: EducationalTopic) => {
    setSelectedEducationTopic(topic);
  };

  const handleCloseEducationModal = () => {
    setSelectedEducationTopic(null);
  };

  const handleMapViewChange = useCallback((center: L.LatLng, zoom: number) => {
    setMapViewState({ center: [center.lat, center.lng], zoom });
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
    setView('dashboard');
  };

  const handleLogout = async () => {
    try {
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setNotifications([]);
      setView('home');
      addToast('Đã đăng xuất thành công', 'success');
    } catch (error) {
      console.error("Logout error:", error);
      addToast('Lỗi khi đăng xuất', 'error');
    }
  };

  const handleLinkNFCTag = async () => {
    setIsNFCLinking(true);
    await writeNFCSOSTag(addToast);
    setIsNFCLinking(false);
  };

  const handleMarkNotificationAsRead = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const handleSelectReportFromNotification = (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (report) {
      setSelectedReport(report);
      setView('map');
    } else {
      // If report not in current state, fetch it or just go to map
      setView('map');
    }
  };

  const renderContent = () => {
    switch(view) {
      case 'home':
        return <HomeView 
                  reports={reports} 
                  onNavigateToMap={() => setView('map')} 
                  onStartNewReport={() => handleStartNewReport('home')}
                  onSelectReportAndNavigateToMap={handleSelectReportAndNavigateToMap}
                  onSelectEducationTopic={handleSelectEducationTopic}
                  onNavigateToEnvironmentalMap={() => setView('environmentalMap')}
                  onNavigateToSOS={() => setView('sos')}
                  onOpenOrderForm={() => {
                    if (!user) {
                      addToast('Vui lòng đăng nhập để đổi quà!', 'warning');
                      setView('login');
                    } else {
                      setIsOrderFormOpen(true);
                    }
                  }}
                />;
      case 'map':
        return <MainMapView 
                  reports={reports} 
                  userLocation={userLocation}
                  onSelectReport={handleSelectReport} 
                  onNavigateHome={() => setView('home')}
                  onStartNewReport={() => handleStartNewReport('map')}
                  selectedReport={selectedReport}
                  initialViewState={mapViewState}
                  onViewChange={handleMapViewChange}
                />;
      case 'form':
        return <ReportForm
                  onSubmit={handleAddNewReport}
                  onCancel={() => { setView(previousView); setError(null); }}
                  isLoading={isLoading}
                  error={error}
                  isOnline={isOnline}
                  initialCoords={userLocation}
                />;
      case 'thankYou':
        return <ThankYouView
                  awardedPoints={lastAwardedPoints}
                  onNavigateHome={() => handleNavigateFromThankYou('home')}
                  onNavigateToMap={() => handleNavigateFromThankYou('map')}
                />;
      case 'environmentalMap':
        return <EnvironmentalMapView
                  reports={reports}
                  pois={environmentalPOIs}
                  userLocation={userLocation}
                  onNavigateHome={() => setView('home')}
                  onSelectReport={handleSelectReport}
                  onStartReport={() => handleStartNewReport('environmentalMap')}
                  selectedReport={selectedReport}
                  initialViewState={mapViewState}
                />;
      case 'sos':
        return <SOSView onClose={() => setView('home')} />;
      case 'login':
        return <LoginView onLogin={handleLogin} />;
      case 'dashboard':
        return <DashboardView 
                  user={user} 
                  reports={reports} 
                  notifications={notifications}
                  onMarkNotificationAsRead={handleMarkNotificationAsRead}
                  onSelectReport={handleSelectReportFromNotification}
                  onLinkNFCTag={handleLinkNFCTag}
                  isNFCLinking={isNFCLinking}
                />;
      default:
        return <HomeView 
                  reports={reports} 
                  onNavigateToMap={() => setView('map')} 
                  onStartNewReport={() => handleStartNewReport('home')}
                  onSelectReportAndNavigateToMap={handleSelectReportAndNavigateToMap}
                  onSelectEducationTopic={handleSelectEducationTopic}
                   onNavigateToEnvironmentalMap={() => setView('environmentalMap')}
                   onNavigateToSOS={() => setView('sos')}
                   onOpenOrderForm={() => {
                     if (!user) {
                       addToast('Vui lòng đăng nhập để đổi quà!', 'warning');
                       setView('login');
                     } else {
                       setIsOrderFormOpen(true);
                     }
                   }}
                />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col selection:bg-brand-100 selection:text-brand-900 relative">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-100/40 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100/40 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      
      {/* Header - Glassmorphism style */}
      {!(view === 'map' || view === 'environmentalMap') && (
        <header className="glass-header sticky top-0 z-50 transition-all duration-300">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setView('home')}>
               <div className="p-2 bg-brand-600 rounded-xl shadow-lg shadow-brand-200 group-hover:scale-110 transition-transform duration-300">
                  <LogoIcon className="w-6 h-6 text-white" />
               </div>
              <div className="flex flex-col">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                  DA NANG <span className="text-brand-600">GREEN</span>
                </h1>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 hidden xs:block">AI Environmental Monitoring</span>
              </div>
            </div>
            
             <div className="flex items-center space-x-2 sm:space-x-4">
                {/* Offline Indicator */}
                {!isOnline && (
                  <button 
                    onClick={() => setIsOfflineModalOpen(true)}
                    className="flex items-center space-x-1 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold animate-pulse hover:bg-amber-200 transition-colors"
                  >
                    <CloudIcon className="w-4 h-4" />
                    <span className="hidden xs:inline">Offline ({pendingReportsCount})</span>
                  </button>
                )}

                {/* Points Display */}
                <div className="flex items-center space-x-2 bg-white border border-slate-100 text-slate-700 font-bold px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm shadow-sm hover:shadow-md transition-shadow">
                    <TrophyIcon className="w-4 h-4 text-amber-500" />
                    <span className="hidden xs:inline">Điểm:</span>
                    <span className="text-brand-600">{userPoints}</span>
                </div>

                {/* Notifications - Mobile & Desktop */}
                {user && user.role !== 'citizen' && (
                  <div className="flex items-center ml-2">
                    <NotificationCenter 
                      notifications={notifications}
                      onMarkAsRead={handleMarkNotificationAsRead}
                      onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                      onSelectReport={handleSelectReportFromNotification}
                    />
                  </div>
                )}

                {/* Auth - Desktop Only */}
                <div className="hidden md:flex items-center space-x-3 border-l border-slate-200 pl-4 ml-2">
                  {user ? (
                    <div className="flex items-center space-x-3">
                      <button 
                        onClick={() => setView('dashboard')}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-[10px] font-bold">
                          {(user.fullName || user.username || 'U').charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-slate-700">Dashboard</span>
                      </button>
                      <button 
                        onClick={handleLogout}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Đăng xuất"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setView('login')}
                      className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-200 active:scale-95"
                    >
                      Đăng nhập
                    </button>
                  )}
                </div>

                {/* Auto Monitoring Toggle - Desktop Only */}
                <button
                  onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                  className={`hidden lg:flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    isAutoMonitoring 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                  title="Tự động giám sát"
                >
                  <div className={`w-1.5 h-1.5 rounded-full mr-2 ${isAutoMonitoring ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                  {isAutoMonitoring ? 'Giám sát: Bật' : 'Giám sát: Tắt'}
                </button>
              </div>
          </div>
        </header>
      )}
      
      <main className={`flex-grow relative flex flex-col ${view === 'map' || view === 'environmentalMap' ? 'h-[calc(100vh-64px)] md:h-screen' : ''} pb-20 md:pb-0`}>
         {renderContent()}
        
        {selectedReport && (
          <ReportDetailModal
            report={selectedReport}
            onClose={() => handleSelectReport(null)}
            onUpdateStatus={handleUpdateReportStatus}
            onExternalAnalysis={handleExternalAnalysis}
          />
        )}

        {selectedEducationTopic && (
          <EducationDetailModal
            topic={selectedEducationTopic}
            onClose={handleCloseEducationModal}
          />
        )}

        <OfflineReportsModal 
          isOpen={isOfflineModalOpen}
          onClose={() => setIsOfflineModalOpen(false)}
          onReportsChanged={updatePendingReportsCount}
        />

        {isOrderFormOpen && (
          <OrderForm 
            onClose={() => setIsOrderFormOpen(false)} 
            onSuccess={() => {
              addToast('Đã nhận đơn hàng của bạn!', 'success');
            }}
          />
        )}
      </main>

      {/* Bottom Navigation for Mobile */}
      <BottomNav 
        activeView={view} 
        onNavigate={setView} 
        isLoggedIn={!!user} 
        unreadNotificationsCount={notifications.filter(n => !n.isRead).length}
      />

      {/* Trợ lý AI nổi */}
      <FloatingAIAssistant
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(prev => !prev)}
        messages={chatMessages}
        isLoading={isChatLoading}
        onSubmit={handleChatSubmit}
        onClearChat={handleClearChat}
      />
    </div>
  );
};

export default App;
