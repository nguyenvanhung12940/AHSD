
import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as L from 'leaflet';
// FIX: Import `AIAnalysis` type to resolve reference errors.
import { EnvironmentalReport, ReportStatus, AIAnalysis } from '../types';
import { MapPinIcon } from './icons/MapPinIcon';
import AddIcon from './icons/AddIcon';
import { HomeIcon } from './icons/HomeIcon';
import MapSearch from './MapSearch';
import { LayersIcon } from './icons/LayersIcon';
import { AllIssuesIcon } from './icons/AllIssuesIcon';
import { TrashIcon } from './icons/TrashIcon';
import { LandslideIcon } from './icons/LandslideIcon';
import { FloodIcon } from './icons/FloodIcon';
import { WeatherOverlay } from './WeatherOverlay';
import { SunIcon } from './icons/SunIcon';
import { CloudIcon } from './icons/CloudIcon';


interface MainMapViewProps {
  reports: EnvironmentalReport[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectReport: (report: EnvironmentalReport) => void;
  onNavigateHome: () => void;
  onStartNewReport: () => void;
  selectedReport: EnvironmentalReport | null;
  initialViewState: { center: [number, number]; zoom: number };
  onViewChange: (center: L.LatLng, zoom: number) => void;
}

const statusColors: Record<ReportStatus, string> = {
  'Báo cáo mới': '#ef4444', // red-500 from Tailwind
  'Đang xử lý': '#f59e0b', // amber-500 from Tailwind (yellow was too light)
  'Đã xử lý': '#22c55e', // green-500 from Tailwind
};

// Định nghĩa các lớp bản đồ có sẵn
// SỬ DỤNG CartoDB Voyager để có tên địa danh trung lập và chính xác hơn cho Hoàng Sa/Trường Sa
const tileLayers = {
  Default: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  Light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  Satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community'
  }
};
type TileLayerKey = keyof typeof tileLayers;


// FIX: Changed JSX.Element to React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
const filterCategories: { name: string; icon: React.ReactElement; issueType: AIAnalysis['issueType'] | 'Tất cả' }[] = [
    { name: 'Tất cả', icon: <AllIssuesIcon className="w-5 h-5" />, issueType: 'Tất cả' },
    { name: 'Rác thải', icon: <TrashIcon className="w-5 h-5" />, issueType: 'Xả rác không đúng nơi quy định' },
    { name: 'Sạt lở', icon: <LandslideIcon className="w-5 h-5" />, issueType: 'Sạt lở đất' },
    { name: 'Ngập lụt', icon: <FloodIcon className="w-5 h-5" />, issueType: 'Ngập lụt' },
];


// Hàm tạo chuỗi SVG cho ghim bản đồ với màu động
const getIconSVG = (color: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="48px" height="48px" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
    <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 004.6-5.462c.983-1.627 1.83-3.368 2.388-5.142.558-1.773.83-3.647.83-5.542 0-4.418-3.582-8-8-8s-8 3.582-8 8c0 1.895.272 3.77.83 5.542.558 1.773 1.405 3.515 2.388 5.142a16.975 16.975 0 004.6 5.462zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clip-rule="evenodd" />
  </svg>
`;

// Hàm tạo icon Leaflet tùy chỉnh
const createCustomIcon = (status: ReportStatus) => {
  const color = statusColors[status] || '#6b7280'; // Mặc định màu xám
  return L.divIcon({
    html: getIconSVG(color),
    className: '', // Quan trọng để ghi đè các kiểu mặc định của leaflet
    iconSize: [48, 48],
    iconAnchor: [24, 48], // Điểm của icon sẽ tương ứng với vị trí của marker
    popupAnchor: [0, -50] // Điểm mà popup sẽ mở ra so với iconAnchor
  });
};


const MainMapView: React.FC<MainMapViewProps> = ({ reports, userLocation, onSelectReport, onNavigateHome, onStartNewReport, selectedReport, initialViewState, onViewChange }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const sovereigntyLayerRef = useRef<L.LayerGroup | null>(null);
  
  const [currentLayerKey, setCurrentLayerKey] = useState<TileLayerKey>('Default');
  const [activeFilter, setActiveFilter] = useState<AIAnalysis['issueType'] | 'Tất cả'>('Tất cả');
  const [showWeather, setShowWeather] = useState(false);
  const [mapCenter, setMapCenter] = useState<L.LatLng>(new L.LatLng(initialViewState.center[0], initialViewState.center[1]));

  // Update map center state when map moves
  useEffect(() => {
    if (mapRef.current) {
      const updateCenter = () => {
        setMapCenter(mapRef.current!.getCenter());
      };
      mapRef.current.on('moveend', updateCenter);
      return () => {
        mapRef.current?.off('moveend', updateCenter);
      };
    }
  }, []);

  const filteredReports = useMemo(() => {
    if (activeFilter === 'Tất cả') {
        return reports;
    }
    return reports.filter(r => r.aiAnalysis.issueType === activeFilter);
  }, [reports, activeFilter]);


  // Generate suggestions for autocomplete search
  const suggestionsData = useMemo(() => {
    const issueTypes = reports.map(r => r.aiAnalysis.issueType).filter(type => type !== 'Không có sự cố' && type !== 'Khác');
    const commonTerms = [
      'Rác thải',
      'Ô nhiễm',
      'Cầu Rồng',
      'Bãi biển Mỹ Khê',
      'Bán đảo Sơn Trà',
      'Sông Hàn',
      'Điểm nóng ô nhiễm',
      'Ngập lụt',
      'Sạt lở đất',
      'Cây xanh',
    ];
    // Combine and get unique values
    return [...new Set([...issueTypes, ...commonTerms])];
  }, [reports]);

  // Khởi tạo bản đồ
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: initialViewState.center, // Sử dụng state ban đầu từ props
        zoom: initialViewState.zoom,     // Sử dụng state ban đầu từ props
        zoomControl: false, // Tắt zoom control mặc định để đặt lại vị trí nếu cần
      });

      // Lắng nghe các chuyển động của bản đồ để lưu state
      map.on('moveend', () => {
        if (mapRef.current) { // Đảm bảo bản đồ tồn tại
          onViewChange(mapRef.current.getCenter(), mapRef.current.getZoom());
        }
      });

      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      sovereigntyLayerRef.current = L.layerGroup().addTo(map);

      // --- THÊM NHÃN CHỦ QUYỀN VIỆT NAM ---
      const sovereigntyLabels = [
        { lat: 16.4, lng: 112.0, name: "Quần đảo Hoàng Sa (Việt Nam)" },
        { lat: 10.0, lng: 114.0, name: "Quần đảo Trường Sa (Việt Nam)" }
      ];

      sovereigntyLabels.forEach(label => {
          const icon = L.divIcon({
              html: `<div class="flex flex-col items-center justify-center">
                        <div class="text-[10px] sm:text-xs font-bold text-red-700 uppercase tracking-widest text-center drop-shadow-sm whitespace-nowrap bg-white/60 backdrop-blur-[1px] px-2 py-0.5 rounded border border-white/20">
                           ${label.name}
                        </div>
                        <div class="w-1.5 h-1.5 bg-red-600 rounded-full mt-1 shadow-sm"></div>
                     </div>`,
              className: 'bg-transparent',
              iconSize: [200, 40],
              iconAnchor: [100, 20]
          });
          L.marker([label.lat, label.lng], { icon, interactive: false, zIndexOffset: -500 }).addTo(sovereigntyLayerRef.current!);
      });
    }

    // Dọn dẹp khi unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Mảng phụ thuộc rỗng đảm bảo điều này chỉ chạy một lần khi mount

  // Cập nhật vị trí người dùng
  useEffect(() => {
    if (!userLayerRef.current || !userLocation) return;
    userLayerRef.current.clearLayers();

    const userIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div>
          <div class="relative w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
        </div>
      `,
      className: 'bg-transparent',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker([userLocation.latitude, userLocation.longitude], { 
      icon: userIcon,
      zIndexOffset: 2000 
    });
    
    marker.bindPopup("<div class='text-xs font-bold text-blue-700'>Vị trí của bạn</div>");
    userLayerRef.current.addLayer(marker);
  }, [userLocation]);

  // Cập nhật lớp bản đồ khi state thay đổi
  useEffect(() => {
    if (!mapRef.current) return;

    // Xóa lớp cũ nếu có
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    // Tạo và thêm lớp mới
    const newLayer = L.tileLayer(tileLayers[currentLayerKey].url, {
      attribution: tileLayers[currentLayerKey].attribution
    });
    newLayer.addTo(mapRef.current).bringToBack();

    // Lưu tham chiếu đến lớp mới
    tileLayerRef.current = newLayer;

  }, [currentLayerKey]);

  // Cập nhật markers khi danh sách báo cáo hoặc bộ lọc thay đổi
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    filteredReports.forEach(report => {
      const marker = L.marker([report.latitude, report.longitude], {
        icon: createCustomIcon(report.status),
      });

      marker.bindPopup(`<b>${report.aiAnalysis.issueType}</b><br>${report.status}`);
      
      marker.on('click', () => {
        onSelectReport(report);
      });

      markersRef.current?.addLayer(marker);
    });
  }, [filteredReports, onSelectReport]);

  // Điều chỉnh chế độ xem bản đồ
  useEffect(() => {
    if (!mapRef.current) return;

    // Nếu một báo cáo cụ thể được chọn, hãy bay đến đó. Điều này được ưu tiên.
    if (selectedReport) {
      // Kiểm tra xem báo cáo được chọn có trong danh sách đã lọc không
      const isSelectedInFilter = filteredReports.some(r => r.id === selectedReport.id);
      if (isSelectedInFilter) {
          mapRef.current.flyTo(
            [selectedReport.latitude, selectedReport.longitude],
            16, // Một mức zoom tốt cho một vị trí cụ thể
            { animate: true, duration: 1 }
          );
      }
    } 
    // Nếu không, hãy điều chỉnh bản đồ để hiển thị tất cả các báo cáo đã được lọc.
    else if (filteredReports.length > 0) {
      const bounds = L.latLngBounds(filteredReports.map(r => [r.latitude, r.longitude]));
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }, [selectedReport, filteredReports]);

  const handleSearch = (latLng: L.LatLng) => {
    if (mapRef.current) {
      mapRef.current.flyTo(latLng, 16); // Mức zoom 16 là tốt cho các địa chỉ
    }
  };

  const handleToggleLayer = () => {
    const layerKeys = Object.keys(tileLayers) as TileLayerKey[];
    const currentIndex = layerKeys.indexOf(currentLayerKey);
    const nextIndex = (currentIndex + 1) % layerKeys.length;
    setCurrentLayerKey(layerKeys[nextIndex]);
  };

  const handleCenterOnUser = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.flyTo([userLocation.latitude, userLocation.longitude], 16);
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      
      <div className="absolute top-4 left-4 z-10 flex flex-col space-y-2">
         <button
            onClick={onNavigateHome}
            className="bg-white/80 backdrop-blur-sm text-gray-700 rounded-full p-3 sm:p-4 shadow-lg hover:bg-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Về trang chủ"
          >
            <HomeIcon className="w-5 h-5 sm:w-6 h-6" />
          </button>
          <button
            onClick={handleToggleLayer}
            className="bg-white/80 backdrop-blur-sm text-gray-700 rounded-full p-3 sm:p-4 shadow-lg hover:bg-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Thay đổi lớp bản đồ"
            title={`Bản đồ: ${currentLayerKey}`}
          >
            <LayersIcon className="w-5 h-5 sm:w-6 h-6" />
          </button>
          {userLocation && (
            <button
              onClick={handleCenterOnUser}
              className="bg-white/80 backdrop-blur-sm text-blue-600 rounded-full p-3 sm:p-4 shadow-lg hover:bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Định vị tôi"
              title="Vị trí của tôi"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowWeather(!showWeather)}
            className={`bg-white/80 backdrop-blur-sm rounded-full p-3 sm:p-4 shadow-lg hover:bg-white transition-all focus:outline-none focus:ring-2 ${showWeather ? 'bg-teal-500 text-white ring-teal-500' : 'text-teal-600 ring-teal-500'}`}
            aria-label="Xem thời tiết"
            title="Thời tiết khu vực này"
          >
            {showWeather ? <SunIcon className="w-5 h-5 sm:w-6 h-6" /> : <CloudIcon className="w-5 h-5 sm:w-6 h-6" />}
          </button>
      </div>
      
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end space-y-2 max-w-[calc(100%-80px)]">
        <MapSearch onSearch={handleSearch} suggestionsData={suggestionsData} />
        
        {/* Bảng điều khiển bộ lọc - Chuyển thành hàng ngang trên mobile cực nhỏ nếu cần, nhưng dọc vẫn ổn nếu gọn */}
        <div className="bg-white/80 backdrop-blur-sm p-1.5 sm:p-2 rounded-full shadow-lg flex flex-col space-y-1">
            {filterCategories.map((cat) => (
                <button
                    key={cat.name}
                    onClick={() => setActiveFilter(cat.issueType)}
                    className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 ${activeFilter === cat.issueType ? 'bg-teal-500 text-white shadow-md scale-105' : 'text-gray-600 hover:bg-gray-200/50'}`}
                    title={cat.name}
                    aria-label={`Lọc theo ${cat.name}`}
                >
                    {cat.icon}
                </button>
            ))}
        </div>
      </div>


      <div className="absolute bottom-20 left-4 flex flex-col space-y-4 z-10">
        {showWeather && (
          <WeatherOverlay 
            lat={mapCenter.lat} 
            lng={mapCenter.lng} 
            areaName="Khu vực hiện tại"
            onClose={() => setShowWeather(false)}
          />
        )}
        
        <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl shadow-md hidden md:block">
          <h4 className="font-bold text-sm mb-2 text-gray-700">Chú giải</h4>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <MapPinIcon className="w-5 h-5" style={{color: statusColors['Báo cáo mới']}} />
            <span className="text-xs text-gray-600">Báo cáo mới</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPinIcon className="w-5 h-5" style={{color: statusColors['Đang xử lý']}} />
            <span className="text-xs text-gray-600">Đang xử lý</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPinIcon className="w-5 h-5" style={{color: statusColors['Đã xử lý']}} />
            <span className="text-xs text-gray-600">Đã xử lý</span>
          </div>
        </div>
      </div>
      
       <div className="absolute bottom-20 right-4 z-10 flex flex-col items-center">
           <button
              onClick={onStartNewReport}
              className="bg-teal-600 text-white rounded-full p-4 sm:p-5 shadow-2xl hover:bg-teal-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-teal-500/50 flex items-center justify-center mb-2"
              aria-label="Báo cáo sự cố mới"
            >
              <AddIcon className="w-6 h-6 sm:w-8 h-8" />
            </button>
            <span className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold text-teal-700 shadow-sm border border-teal-100 uppercase tracking-wider">Báo cáo</span>
       </div>
    </div>
  </div>
  );
};

export default MainMapView;
