import { useState, useRef, useEffect, useCallback } from 'react';
import { Zap, Info, Loader2, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface AnalysisResult {
  nome_popular: string;
  nome_cientifico: string;
  categoria: string;
  morfologia_ou_detalhes: string;
  habitat_ou_ninho: string;
  curiosidade: string;
}

type CaptureState = 'idle' | 'analyzing' | 'result' | 'error';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRequesting = useRef(false); // Hardware-level lock
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Zoom State
  const [zoomValue, setZoomValue] = useState(1);
  const [zoomLimits, setZoomLimits] = useState({ min: 1, max: 1, step: 0.1 });
  const [isZoomSupported, setIsZoomSupported] = useState(false);
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Initialize Camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Setup Video Track and Capabilities
        const track = stream.getVideoTracks()[0];
        setVideoTrack(track);

        // Check capabilities (Zoom & Focus)
        // Note: casting to any because zoom is not yet in standard TS types for MediaTrackCapabilities
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.zoom) {
          setIsZoomSupported(true);
          setZoomLimits({
            min: capabilities.zoom.min,
            max: capabilities.zoom.max,
            step: capabilities.zoom.step
          });
          
          // Set initial zoom if settings available
          const settings = track.getSettings() as any;
          if (settings.zoom) {
            setZoomValue(settings.zoom);
          }
        }

        // Try to enable continuous focus (macro mode)
        try {
          await track.applyConstraints({ 
            advanced: [{ focusMode: "continuous" }] as any 
          });
        } catch (e) {
          console.log("Continuous focus not supported or failed to apply", e);
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsCameraReady(true);
            videoRef.current?.play().catch(console.error);
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Não foi possível acessar a câmera. Verifique as permissões.");
        setCaptureState('error');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    setZoomValue(newZoom);
    
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({ 
          advanced: [{ zoom: newZoom }] as any 
        });
      } catch (err) {
        console.error("Error applying zoom:", err);
      }
    }
  };

  const captureImage = useCallback(async () => {
    // 0. Hardware-level lock (Absolute priority)
    if (isRequesting.current) return;

    // Double check state to prevent race conditions
    if (isProcessing) return;
    if (captureState !== 'idle') return;
    if (!videoRef.current || !canvasRef.current) return;

    // 1. Set locks immediately
    isRequesting.current = true;
    setIsProcessing(true);

    try {
      // 2. Capture frame without stopping video
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageDataUrl);

      // 3. Set state to analyzing
      setCaptureState('analyzing');
      setDebugInfo(null); // Clear previous debug info
      
      // 4. Analyze
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `Você é um entomologista nível Ph.D., especialista absoluto em Meliponicultura (Abelhas Nativas Sem Ferrão - ASF do Brasil) e taxonomia geral. 
Sua tarefa é analisar a imagem e cravar a identificação com a maior precisão possível. 
REGRAS RÍGIDAS DE IDENTIFICAÇÃO:

NÃO fique em cima do muro. Se houver dúvida entre espécies (ex: Arapuá vs Tubuna), tome uma decisão baseada na morfologia visível (brilho do abdômen, proporção das asas, pilosidade, formato das pernas/corbícula). Escolha UMA única espécie.

Se for uma abelha, o foco DEVE ser na morfologia exata e no tipo de nidificação (ninho).

Se for outro animal, planta ou objeto cotidiano, identifique com precisão técnica e científica.

Você DEVE retornar ÚNICA e EXCLUSIVAMENTE um objeto JSON válido. NÃO use blocos de código markdown (como \`\`\`json). Comece com { e termine com }.

Estrutura OBRIGATÓRIA:
{
"nome_popular": "Nome popular (ex: Tubuna, Jataí, Caneca de Cerâmica)",
"nome_cientifico": "Nome científico exato (ex: Scaptotrigona bipunctata) ou 'N/A' se for objeto",
"categoria": "Classificação (ex: Inseto - Meliponíneo, Inseto - Apis, Objeto, etc.)",
"morfologia_ou_detalhes": "Se abelha: descreva cor, pelos, tamanho e asas. Se objeto: material e design.",
"habitat_ou_ninho": "Se abelha: descreva como é a entrada do ninho (tubo de cera, barro, etc). Se objeto: onde é usado.",
"curiosidade": "Uma curiosidade científica ou de uso muito específica."
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      setDebugInfo(text); // Capture raw response for debug

      // Robust JSON extraction
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error("JSON não encontrado na resposta.");
      }

      const jsonString = text.substring(jsonStart, jsonEnd + 1);
      const analysis = JSON.parse(jsonString) as AnalysisResult;

      setResult(analysis);

      // Busca na Wikipedia
      try {
        const termoDeBusca = analysis.nome_cientifico !== 'N/A' ? analysis.nome_cientifico : analysis.nome_popular;
        const wikiRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termoDeBusca)}`);
        const wikiData = await wikiRes.json();
        setReferenceImage(wikiData.thumbnail?.source || null);
      } catch (e) {
        console.error("Erro ao buscar imagem na Wikipedia", e);
        setReferenceImage(null);
      }

      setCaptureState('result');
    } catch (err) {
      console.error(err);
      setError("Não foi possível identificar o objeto.");
      setCaptureState('error');
      setDebugInfo(prev => (prev ? `${prev}\n\nERROR:\n${String(err)}` : String(err)));
    } finally {
      isRequesting.current = false;
      setIsProcessing(false);
    }
  }, [captureState, isProcessing]);

  // Handler wrapper to ensure strict event triggering
  const handleCaptureClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Block if already processing or hardware lock is active
    if (isProcessing || isRequesting.current || captureState !== 'idle') {
        console.log("Clique bloqueado: Processando ou travado.");
        return;
    }

    captureImage();
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
  };

  const reset = useCallback(() => {
    setCaptureState('idle');
    setResult(null);
    setError(null);
    setDebugInfo(null);
    setReferenceImage(null);
    setCapturedImage(null);
    // Ensure video is playing
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    }
  }, []);

  return (
    <div className="relative w-full h-[100dvh] bg-deep-black overflow-hidden text-white font-sans">
      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera View - Always rendered, never unmounted */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Dark overlay when analyzing or showing result to make text readable */}
        <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${captureState === 'idle' ? 'opacity-0' : 'opacity-100'}`} />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6 pt-12 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-between items-center pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-honey flex items-center justify-center shadow-lg shadow-honey/20">
              <Zap className="w-5 h-5 text-deep-black fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              BioBee <span className="text-honey font-light">AI</span>
            </h1>
          </div>
        </div>
      </header>

      {/* Main UI Layer */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end pb-12 px-6 pointer-events-none">
        
        {/* Install App Button */}
        {deferredPrompt && (
          <div className="pointer-events-auto w-full flex justify-center mb-auto mt-24 animate-bounce">
            <button
              onClick={handleInstallClick}
              className="bg-gradient-to-r from-honey to-yellow-400 text-black font-bold px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transform hover:scale-105 transition-transform border-2 border-white/20"
            >
              <Download className="w-6 h-6" />
              <span className="uppercase tracking-wider">Instalar Aplicativo</span>
            </button>
          </div>
        )}

        {/* Error State */}
        {captureState === 'error' && (
          <div className="pointer-events-auto bg-red-500/90 backdrop-blur-md p-6 rounded-2xl mb-auto mt-auto text-center shadow-xl mx-4 flex flex-col max-h-[70vh]">
            <p className="font-medium mb-4">{error}</p>
            
            {/* Debug Box */}
            {debugInfo && (
              <div className="mb-4 text-left bg-black/50 rounded p-3 overflow-auto flex-1 min-h-[100px] border border-white/10">
                <p className="text-[10px] text-white/50 mb-1 font-bold">DEBUG INFO:</p>
                <pre className="text-[10px] font-mono text-white/90 whitespace-pre-wrap break-all">
                  {debugInfo}
                </pre>
              </div>
            )}

            <button 
              onClick={reset}
              className="bg-white text-red-600 px-6 py-3 rounded-full font-bold text-sm hover:bg-gray-100 transition-colors shadow-lg"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Idle State: Capture Button & Zoom Controls */}
        {(captureState === 'idle' || captureState === 'analyzing') && (
          <div className="pointer-events-auto flex flex-col items-center gap-6">
            
            {/* Zoom Slider (Only if supported) */}
            {isZoomSupported && captureState === 'idle' && (
              <div className="w-full max-w-xs glass-panel rounded-full px-4 py-2 flex items-center gap-3">
                <ZoomOut className="w-4 h-4 text-white/70" />
                <input
                  type="range"
                  min={zoomLimits.min}
                  max={zoomLimits.max}
                  step={zoomLimits.step}
                  value={zoomValue}
                  onChange={handleZoomChange}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-honey"
                />
                <ZoomIn className="w-4 h-4 text-white/70" />
              </div>
            )}

            <div className="flex flex-col items-center gap-4">
              <p className="text-white/70 text-sm font-medium uppercase tracking-wider">
                {isProcessing ? 'Processando...' : 'Aponte e capture'}
              </p>
              <button
                onClick={handleCaptureClick}
                disabled={!isCameraReady || isProcessing}
                className={`group relative flex items-center justify-center transition-all shadow-lg shadow-black/50 ${
                  isProcessing 
                    ? 'w-48 h-16 rounded-full bg-white/10 border-2 border-white/20 cursor-not-allowed' 
                    : 'w-20 h-20 rounded-full border-4 border-white/30 active:scale-95'
                } disabled:opacity-80`}
              >
                {isProcessing ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-honey animate-spin" />
                    <span className="text-white font-bold text-sm tracking-wide">Analisando... ⏳</span>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-white group-hover:bg-honey transition-colors" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Analyzing State - Removed separate loader since button now handles it */}
        {/* captureState === 'analyzing' block removed */}
      </div>

      {/* Result Bottom Sheet */}
      <AnimatePresence>
        {captureState === 'result' && result && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-40 bg-deep-black/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
          >
            {/* Drag Handle */}
            <div className="w-full flex justify-center pt-4 pb-2" onClick={reset}>
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="p-6 pt-2 pb-10 space-y-6">
              {/* Image Comparison Section */}
              {capturedImage && (
                <div className={`grid gap-4 mb-2 ${referenceImage ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold ml-1">Sua Foto</span>
                    <img src={capturedImage} alt="Capturada" className="w-full h-36 object-cover rounded-2xl border border-white/10 shadow-lg" />
                  </div>
                  {referenceImage && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold ml-1">Referência (Wiki)</span>
                      <img src={referenceImage} alt="Referência" className="w-full h-36 object-cover rounded-2xl border border-white/10 shadow-lg" />
                    </div>
                  )}
                </div>
              )}

              {/* Header Info */}
              <div className="flex flex-col items-start">
                <h2 className="text-3xl font-bold text-white mb-1">{result.nome_popular}</h2>
                <p className="text-gray-400 italic font-serif text-lg mb-3">{result.nome_cientifico}</p>
                <span className="inline-block px-3 py-1 rounded-full bg-honey/20 text-honey text-xs font-bold uppercase tracking-wider">
                  {result.categoria}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid gap-3">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Morfologia / Detalhes
                  </h3>
                  <p className="text-white/80 text-sm leading-relaxed">{result.morfologia_ou_detalhes}</p>
                </div>

                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Habitat / Ninho
                  </h3>
                  <p className="text-white/80 text-sm leading-relaxed">{result.habitat_ou_ninho}</p>
                </div>

                <div className="bg-honey/10 border border-honey/20 p-4 rounded-2xl backdrop-blur-sm">
                  <h3 className="text-honey text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Curiosidade
                  </h3>
                  <p className="text-white/90 text-sm leading-relaxed italic">"{result.curiosidade}"</p>
                </div>
              </div>

              <button 
                onClick={reset}
                className="w-full py-4 rounded-2xl bg-white text-black font-bold text-lg hover:bg-gray-200 transition-colors shadow-xl mt-4"
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
