/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Zap, Info, RefreshCw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeImage, type AnalysisResult } from './services/gemini';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showShutter, setShowShutter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setIsCameraReady(true);
          videoRef.current?.play().catch(e => console.error("Error playing video:", e));
        };
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões e recarregue.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Visual feedback
    setShowShutter(true);
    setTimeout(() => setShowShutter(false), 200);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageDataUrl);
      
      // Analyze
      await analyze(imageDataUrl);
    }
  }, []);

  const analyze = async (imageData: string) => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const analysis = await analyzeImage(imageData);
      setResult(analysis);
    } catch (err) {
      console.error(err);
      setError("Erro ao analisar a imagem. Tente novamente.");
      // On error, we might want to keep the captured image so user sees what failed,
      // OR clear it to let them try again immediately. 
      // Let's keep it but show the error, and the reset button allows retry.
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setResult(null);
    setError(null);
    // Ensure video is playing when we return to camera view
    if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(e => console.error("Error resuming video:", e));
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-deep-black overflow-hidden text-white font-sans">
      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera View */}
      <div className="absolute inset-0 z-0">
        {!capturedImage ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <img 
            src={capturedImage} 
            alt="Captured" 
            className="w-full h-full object-cover"
          />
        )}
        
        {/* Shutter Effect Overlay */}
        {showShutter && (
          <div className="absolute inset-0 bg-white z-50 animate-pulse" />
        )}
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6 pt-12 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-honey flex items-center justify-center shadow-lg shadow-honey/20">
              <Zap className="w-5 h-5 text-deep-black fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              BioBee <span className="text-honey font-light">AI</span>
            </h1>
          </div>
          <button className="p-2 rounded-full glass-panel text-white/80 hover:bg-white/10 transition-colors">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-8 pb-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <div className="flex flex-col items-center gap-6">
          
          {/* Status/Error Messages */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-3 rounded-lg bg-red-500/90 backdrop-blur text-sm font-medium text-white shadow-lg max-w-[90%] text-center"
            >
              {error}
              <button onClick={reset} className="ml-2 underline font-bold">Tentar de novo</button>
            </motion.div>
          )}

          {/* Capture Button Area */}
          <div className="relative">
            {!capturedImage ? (
              <button
                onClick={captureImage}
                disabled={!isCameraReady || isAnalyzing}
                className="group relative w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-16 h-16 rounded-full bg-white group-hover:bg-honey transition-colors shadow-lg shadow-black/50" />
              </button>
            ) : (
              <button
                onClick={reset}
                className="w-16 h-16 rounded-full glass-panel flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-8 h-8 text-white" />
              </button>
            )}
          </div>
          
          <p className="text-white/60 text-sm font-medium tracking-wide uppercase">
            {isAnalyzing ? 'Analisando...' : capturedImage ? 'Resultado' : 'Toque para identificar'}
          </p>
        </div>
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center"
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-white/20 border-t-honey rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-honey animate-pulse" />
              </div>
            </div>
            <p className="mt-4 text-white font-medium animate-pulse">Identificando...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet Result */}
      <AnimatePresence>
        {result && !isAnalyzing && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-40 bg-deep-black/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
          >
            {/* Drag Handle */}
            <div className="w-full flex justify-center pt-4 pb-2" onClick={() => setResult(null)}>
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="p-6 pt-2 pb-10 space-y-6">
              {/* Header Info */}
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-bold text-honey mb-1">{result.nome}</h2>
                  <p className="text-white/60 italic font-serif text-lg">{result.categoria}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/40 mb-1">Confiança</span>
                  <span className="text-xl font-mono text-white">{result.confianca}%</span>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid gap-4">
                <div className="glass-panel p-4 rounded-xl">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Info className="w-3 h-3" /> Detalhes
                  </h3>
                  <p className="text-white/90 leading-relaxed">{result.detalhes}</p>
                </div>

                <div className="glass-panel p-4 rounded-xl">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2">Habitat / Utilidade</h3>
                  <p className="text-white/90 leading-relaxed">{result.utilidade_habitat}</p>
                </div>

                <div className="glass-panel p-4 rounded-xl bg-honey/5 border-honey/20">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2">Curiosidade</h3>
                  <p className="text-white/90 leading-relaxed italic">"{result.curiosidade}"</p>
                </div>
              </div>

              <button 
                onClick={reset}
                className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-honey transition-colors shadow-lg"
              >
                Nova Identificação
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
