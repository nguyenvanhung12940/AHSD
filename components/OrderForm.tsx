
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCartIcon } from './icons/ShoppingCartIcon';
import { XMarkIcon } from './icons/XMarkIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

interface OrderFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PRODUCTS = [
  { id: 'kit-1', name: 'Bộ dụng cụ dọn dẹp cơ bản', price: 'Miễn phí (100 điểm)', points: 100, description: 'Bao gồm găng tay, túi rác tự phân hủy và kẹp rác.' },
  { id: 'kit-2', name: 'Bộ trồng cây tại nhà', price: 'Miễn phí (200 điểm)', points: 200, description: 'Bao gồm hạt giống, chậu tự phân hủy và đất hữu cơ.' },
  { id: 'kit-3', name: 'Bình nước thủy tinh Da Nang Green', price: 'Miễn phí (500 điểm)', points: 500, description: 'Bình nước thủy tinh cao cấp giúp giảm thiểu rác thải nhựa.' },
];

const OrderForm: React.FC<OrderFormProps> = ({ onClose, onSuccess }) => {
  const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0]);
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Bạn cần đăng nhập để thực hiện đổi quà.');
      return;
    }

    if (!address || !phone) {
      setError('Vui lòng nhập đầy đủ thông tin giao hàng.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          productName: selectedProduct.name,
          quantity,
          address,
          phone
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Lỗi khi đặt hàng');
      }

      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[2.5rem] p-12 text-center max-w-md w-full shadow-2xl"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Đặt hàng thành công!</h2>
          <p className="text-slate-500">Đơn hàng của bạn đang được xử lý. Chúng tôi sẽ liên hệ sớm nhất.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors z-10"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Sidebar Info */}
          <div className="md:w-1/3 bg-brand-600 p-8 text-white">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
              <ShoppingCartIcon className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black mb-4 leading-tight">Đổi quà tặng Xanh</h2>
            <p className="text-brand-100 text-sm leading-relaxed mb-8">
              Sử dụng điểm tích lũy từ các báo cáo môi trường để đổi lấy những bộ dụng cụ hữu ích.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 text-xs font-bold">
                <div className="w-1.5 h-1.5 bg-brand-300 rounded-full"></div>
                <span>Giao hàng miễn phí tại Đà Nẵng</span>
              </div>
              <div className="flex items-center space-x-3 text-xs font-bold">
                <div className="w-1.5 h-1.5 bg-brand-300 rounded-full"></div>
                <span>Hỗ trợ cộng đồng 24/7</span>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="md:w-2/3 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Chọn sản phẩm</label>
                <div className="space-y-3">
                  {PRODUCTS.map((product) => (
                    <div 
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedProduct.id === product.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-black text-slate-900 text-sm">{product.name}</span>
                        <span className="text-[10px] font-black text-brand-600 bg-white px-2 py-1 rounded-lg shadow-sm">{product.price}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">{product.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Số lượng</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="5"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Số điện thoại</label>
                  <input 
                    type="tel" 
                    placeholder="0905 xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Địa chỉ nhận hàng</label>
                <textarea 
                  placeholder="Số nhà, tên đường, phường, quận..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none text-sm font-bold h-24 resize-none"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100">
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-brand-600 text-white font-black rounded-2xl shadow-xl shadow-brand-100 hover:bg-brand-700 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none uppercase tracking-widest text-xs"
              >
                {isLoading ? 'Đang xử lý...' : 'Xác nhận đặt hàng'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OrderForm;
