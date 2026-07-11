import React, { useEffect, useState } from 'react';
import { EnvironmentalReport } from '../types';
import { getOfflineReports, deleteOfflineReport } from '../services/offlineService';
import { XMarkIcon } from './icons/XMarkIcon';
import { TrashIcon } from './icons/TrashIcon';
import { CloudIcon } from './icons/CloudIcon';

interface OfflineReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReportsChanged: () => void;
}

const OfflineReportsModal: React.FC<OfflineReportsModalProps> = ({ isOpen, onClose, onReportsChanged }) => {
  const [reports, setReports] = useState<EnvironmentalReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const data = await getOfflineReports();
      // Sort by newest first
      setReports(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (error) {
      console.error("Failed to load offline reports", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadReports();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    try {
      await deleteOfflineReport(id);
      await loadReports();
      onReportsChanged();
    } catch (error) {
      console.error("Failed to delete report", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center space-x-3">
             <div className="bg-amber-100 p-2 rounded-full">
                <CloudIcon className="w-5 h-5 text-amber-600" />
             </div>
             <div>
                <h3 className="font-bold text-lg text-slate-800">Báo cáo đang chờ ({reports.length})</h3>
                <p className="text-xs text-slate-500">Dữ liệu sẽ được gửi tự động khi có mạng</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-5 space-y-4 bg-slate-50/50 flex-grow">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Đang tải...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 flex flex-col items-center">
                <div className="bg-slate-100 p-4 rounded-full mb-3">
                    <CloudIcon className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500">Không có báo cáo nào đang chờ.</p>
            </div>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 group hover:shadow-md transition-all">
                {/* Thumbnail */}
                <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100 relative">
                  {report.mediaType === 'video' ? (
                     <video src={report.mediaUrl} className="w-full h-full object-cover" />
                  ) : (
                    <img src={report.mediaUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                </div>

                {/* Content */}
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-slate-700 text-sm truncate pr-2">
                        {report.userDescription || "Không có mô tả"}
                    </p>
                    <button 
                        onClick={() => handleDelete(report.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        title="Xóa báo cáo"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="mt-2 space-y-1">
                      <div className="flex items-center text-xs text-slate-500">
                        <span className="w-2 h-2 rounded-full bg-amber-400 mr-2"></span>
                        Chờ đồng bộ
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(report.timestamp).toLocaleString('vi-VN')}
                      </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineReportsModal;
