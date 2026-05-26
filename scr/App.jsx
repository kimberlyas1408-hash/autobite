import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Phone, Lock, Unlock, DoorClosed, DoorOpen, Smartphone, Camera, RefreshCw, Plus, CheckCircle, AlertTriangle } from 'lucide-react';

// URL Model Teachable Machine Terbaru Anda
const TM_MODEL_URL = "https://teachablemachine.withgoogle.com/models/C2KkVI6aN/";

// Daftar Produk Resmi Autobite
const products = [
  { id: 'pucuk', name: 'Teh Pucuk Less Sugar', price: 10000, desc: 'Teh melati dengan gula lebih sedikit.' },
  { id: 'mineral', name: 'Air Mineral', price: 5000, desc: 'Air mineral murni dingin dan segar.' }
];

export default function App() {
  const [role, setRole] = useState(null); // 'kamera' atau 'konsumen'
  const [gasUrl, setGasUrl] = useState(''); // URL Google Apps Script
  const [isGasConnected, setIsGasConnected] = useState(false);
  
  // Status Halaman & Transaksi Aplikasi
  const [currentScreen, setCurrentScreen] = useState('qr-splash'); // qr-splash, login, catalog, scanning, success
  const [balance, setBalance] = useState(25000);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detectedProduct, setDetectedProduct] = useState('empty');
  const [lockStatus, setLockStatus] = useState('LOCKED');
  const [doorStatus, setDoorStatus] = useState('CLOSED');
  
  // Bar Probabilitas AI Teachable Machine
  const [probPucuk, setProbPucuk] = useState(0);
  const [probMineral, setProbMineral] = useState(0);
  const [probEmpty, setProbEmpty] = useState(100);
  
  // State untuk Dialog Modal Kustom (Pengganti Browser Alert)
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' });

  // Referensi Kamera Web & Model AI
  const videoRef = useRef(null);
  const modelRef = useRef(null);
  const isWebcamActive = useRef(false);

  // Efek Polling Dua Arah (Bi-Directional Syncing via Google Sheets)
  useEffect(() => {
    if (!isGasConnected || !gasUrl) return;

    const interval = setInterval(async () => {
      try {
        if (role === 'kamera') {
          // HP 1 (Kamera): Membaca jika Konsumen di HP 2 sudah memilih barang di katalog
          const res = await fetch(`${gasUrl}?action=read`);
          const data = await res.json();
          if (data.product && data.product !== 'empty' && lockStatus === 'LOCKED') {
            const found = products.find(p => p.id === data.product);
            if (found) {
              setLockStatus('UNLOCKED');
              setDoorStatus('OPEN');
              setDetectedProduct(found);
            }
          }
        } else if (role === 'konsumen' && currentScreen === 'scanning') {
          // HP 2 (Konsumen): Membaca barang apa yang sedang diambil/dilihat oleh Kamera HP 1 secara realtime
          const res = await fetch(`${gasUrl}?action=read`);
          const data = await res.json();
          if (data.product === 'empty') {
            setDetectedProduct('empty');
          } else {
            const found = products.find(p => p.id === data.product);
            if (found) setDetectedProduct(found);
          }
        }
      } catch (err) {
        console.error("Polling Network Error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isGasConnected, gasUrl, role, lockStatus, currentScreen]);

  // Memuat Script Teachable Machine secara Dinamis (Mencegah Crash saat Build)
  const loadTMAndStartWebcam = async () => {
    setModal({ 
      show: true, 
      title: "Memuat Sistem AI", 
      message: "Sedang mengunduh pustaka TensorFlow & Teachable Machine dari server Google...", 
      type: "info" 
    });
    
    if (!window.tmImage) {
      const tfScript = document.createElement('script');
      tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0/dist/tf.min.js";
      document.head.appendChild(tfScript);
      await new Promise((resolve) => { tfScript.onload = resolve; });

      const tmScript = document.createElement('script');
      tmScript.src = "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.3/dist/teachablemachine-image.min.js";
      document.head.appendChild(tmScript);
      await new Promise((resolve) => { tmScript.onload = resolve; });
    }

    // Mengaktifkan Akses Kamera Belakang HP
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        isWebcamActive.current = true;
        
        // Memuat File Model Teachable Machine Anda
        modelRef.current = await window.tmImage.load(TM_MODEL_URL + "model.json", TM_MODEL_URL + "metadata.json");
        setModal({ show: false, title: '', message: '', type: 'info' });
        predictLoop();
      }
    } catch (err) {
      setModal({ 
        show: true, 
        title: "Kamera Gagal", 
        message: "Tidak bisa mengakses modul kamera fisik HP. Pastikan izin kamera di browser Anda sudah aktif dan menggunakan protokol HTTPS.", 
        type: "error" 
      });
    }
  };

  // Loop Prediksi Gambar Realtime oleh AI
  const predictLoop = async () => {
    if (!isWebcamActive.current || !modelRef.current || !videoRef.current) return;

    const prediction = await modelRef.current.predict(videoRef.current);
    let maxClass = 'empty';
    let maxVal = 0;

    prediction.forEach(pred => {
      // Normalisasi nama kelas ke huruf kecil (mengatasi ketidakcocokan huruf kapital di Teachable Machine)
      const label = pred.className.toLowerCase(); 
      const prob = Math.round(pred.probability * 100);

      if (label.includes('pucuk')) setProbPucuk(prob);
      else if (label.includes('mineral')) setProbMineral(prob);
      else if (label.includes('empty') || label.includes('background')) setProbEmpty(prob);

      if (pred.probability > maxVal) {
        maxVal = pred.probability;
        maxClass = label;
      }
    });

    // Jika AI mendeteksi objek dengan tingkat keyakinan (Confidence) di atas 85%
    if (maxVal > 0.85) {
      let currentId = 'empty';
      if (maxClass.includes('pucuk')) currentId = 'pucuk';
      else if (maxClass.includes('mineral')) currentId = 'mineral';

      if (isGasConnected && gasUrl) {
        // Mode 'no-cors' disematkan agar pengiriman data ke Google Sheets dari HP tidak diblokir browser
        fetch(`${gasUrl}?action=write&product=${currentId}`, { mode: 'no-cors' }).catch(() => {});
      }
    }

    window.requestAnimationFrame(predictLoop);
  };

  // Pengiriman Data Manual (Untuk Pengujian Tanpa Kamera Fisik)
  const handleSimulateWrite = async (id) => {
    setProbPucuk(id === 'pucuk' ? 100 : 0);
    setProbMineral(id === 'mineral' ? 100 : 0);
    setProbEmpty(id === 'empty' ? 100 : 0);

    if (isGasConnected && gasUrl) {
      try {
        await fetch(`${gasUrl}?action=write&product=${id}`, { mode: 'no-cors' });
      } catch (e) {}
    }
  };

  // Aksi Ketika Konsumen Memilih Barang dari Katalog Aplikasi (HP 2)
  const handleSelectProduct = async (prod) => {
    setSelectedProduct(prod);
    setDetectedProduct(prod);
    setCurrentScreen('scanning');

    if (isGasConnected && gasUrl) {
      try {
        await fetch(`${gasUrl}?action=write&product=${prod.id}`, { mode: 'no-cors' });
      } catch (e) {}
    }
    setLockStatus('UNLOCKED');
    setDoorStatus('OPEN');
  };

  // Aksi Menutup Pintu Kulkas dan Mengalkulasi Sisa Saldo Akun
  const handleCloseDoor = async () => {
    if (detectedProduct === 'empty') {
      setLockStatus('LOCKED');
      setDoorStatus('CLOSED');
      setCurrentScreen('catalog');
      if (isGasConnected && gasUrl) await fetch(`${gasUrl}?action=write&product=empty`, { mode: 'no-cors' });
      return;
    }

    if (balance >= detectedProduct.price) {
      setBalance(prev => prev - detectedProduct.price);
      setLockStatus('LOCKED');
      setDoorStatus('CLOSED');
      setCurrentScreen('success');
      if (isGasConnected && gasUrl) await fetch(`${gasUrl}?action=write&product=empty`, { mode: 'no-cors' });
    } else {
      setModal({ 
        show: true, 
        title: "Saldo Kurang", 
        message: `Saldo Anda tidak mencukupi untuk membeli ${detectedProduct.name}. Harap kembalikan produk ke dalam kulkas atau lakukan Top Up saldo!`, 
        type: "error" 
      });
    }
  };

  // TAMPILAN AWAL: PEMILIHAN PERAN (ROLE SELECTOR)
  if (!role) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center shadow-2xl">
          <h1 className="text-3xl font-black tracking-tight text-white">AUTOBITE <span className="text-[#00ff66]">FRIDGE</span></h1>
          <p className="text-xs text-neutral-400 mt-2">Silakan pilih peran untuk perangkat smartphone ini</p>
          
          <div className="mt-8 space-y-4">
            <button onClick={() => setRole('kamera')} className="w-full bg-white text-black hover:bg-neutral-200 font-bold p-4 rounded-xl flex items-center justify-between transition">
              <div className="flex items-center gap-3 text-left">
                <Camera className="text-black" size={24} />
                <div>
                  <p className="text-sm font-black">HP 1: Kamera Kulkas</p>
                  <p className="text-[11px] text-neutral-600">Scan objek lewat AI Teachable Machine</p>
                </div>
              </div>
            </button>

            <button onClick={() => setRole('konsumen')} className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-bold p-4 rounded-xl flex items-center justify-between transition">
              <div className="flex items-center gap-3 text-left">
                <Smartphone className="text-[#00ff66]" size={24} />
                <div>
                  <p className="text-sm font-black text-white">HP 2: Aplikasi Konsumen</p>
                  <p className="text-[11px] text-neutral-400">Pilih katalog barang & bayar digital instan</p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-800 text-left">
            <label className="text-[11px] font-bold text-neutral-400 block mb-1">URL Google Apps Script Deployment Web App:</label>
            <input 
              type="text" 
              placeholder="https://script.google.com/.../exec" 
              value={gasUrl}
              onChange={(e) => { setGasUrl(e.target.value); setIsGasConnected(!!e.target.value); }}
              className="w-full bg-black text-xs p-2.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-[#00ff66] font-mono text-neutral-300"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center p-4">
      
      {/* ANTARMUKA MODAL DIALOG KUSTOM */}
      {modal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            {modal.type === 'error' ? <AlertTriangle className="text-rose-500 mx-auto mb-3" size={36} /> : <CheckCircle className="text-[#00ff66] mx-auto mb-3" size={36} />}
            <h4 className="text-md font-bold text-white">{modal.title}</h4>
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{modal.message}</p>
            <button onClick={() => setModal({ show: false, title: '', message: '', type: 'info' })} className="mt-5 w-full bg
