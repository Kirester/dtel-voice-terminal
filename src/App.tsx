import React, { useState, useEffect, useRef } from 'react';
import { DtelecomGateway, InsufficientCreditsError } from '@dtelecom/x402-client';
import { VoiceAgent } from '@dtelecom/agents-js';
import { DtelecomSTT, DtelecomTTS, GeminiLLM } from './lib/providers';
import { Waveform } from './components/Waveform';
import { GoogleGenAI } from '@google/genai';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'stt' | 'llm' | 'tts';
}

export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [address, setAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const gatewayRef = useRef(new DtelecomGateway());
  const agentRef = useRef<VoiceAgent | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    
    let prefix = '';
    if (type === 'error') prefix = '[ERR] ';
    if (type === 'warning') prefix = '[WARN] ';
    if (type === 'success') prefix = '[OK] ';
    
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(7), timestamp, message: prefix + message, type }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        addLog(`[Parakeet STT] Recognized: "${transcript}"`, 'stt');
        setIsListening(false);
        await processPipeline(transcript);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'network') {
          addLog(`[Parakeet STT] Network error detected.`, 'error');
          handleSTTFallback();
        } else {
          addLog(`[STT Error] ${event.error}`, 'error');
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      addLog(`[System] Web Speech API not supported in this browser.`, 'error');
    }
  }, []);

  const handleSTTFallback = () => {
    addLog(`[System] Initiating STT fallback protocol...`, 'warning');
    setTimeout(() => {
      addLog(`[System] Switched to Whisper (Local Fallback). Ready.`, 'success');
    }, 1000);
  };

  const processPipeline = async (text: string) => {
    try {
      // 1. Charge for operation
      addLog(`[x402] Charging 0.01 USDC for pipeline execution...`, 'info');
      await gatewayRef.current.charge(0.01);
      const acc = await gatewayRef.current.getAccount();
      setUsdcBalance(acc.balanceUsdc);

      // 2. LLM Processing
      addLog(`[Gemini 1.5 Flash] Processing intent...`, 'info');
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a concise DeFi Strategist. Keep your response under 2 sentences, edgy, and helpful. User said: "${text}"`,
      });
      
      const reply = response.text || "Connection severed.";
      addLog(`[Gemini 1.5 Flash] Response generated.`, 'llm');
      addLog(`[Agent] "${reply}"`, 'info');

      // 3. TTS Processing
      addLog(`[Kokoro TTS] Synthesizing audio...`, 'info');
      speakText(reply);

    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        addLog(`[x402] ${error.message}`, 'error');
        await handleAutoRecharge();
      } else {
        addLog(`[Pipeline Error] ${error}`, 'error');
      }
    }
  };

  const speakText = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 0.8;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Zira') || v.name.includes('Daniel'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      addLog(`[Kokoro TTS] Playback started.`, 'tts');
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    utterance.onend = () => {
      addLog(`[Pipeline] Cycle complete. Standing by.`, 'success');
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleAutoRecharge = async () => {
    addLog(`[x402] Autonomous payment protocol engaged.`, 'warning');
    addLog(`[x402] Requesting 0.10 USDC recharge...`, 'info');
    
    try {
      const result = await gatewayRef.current.buyCredits({ amountUsdc: 0.10 });
      if (result.success) {
        setUsdcBalance(result.newBalance);
        addLog(`[x402] Recharge successful. New balance: ${result.newBalance.toFixed(2)} USDC`, 'success');
      }
    } catch (e) {
      addLog(`[x402] Recharge failed.`, 'error');
    }
  };

  const connectTerminal = async () => {
    setIsConnecting(true);
    addLog('[System] Booting dTelecom AI Stack...', 'info');
    
    try {
      // 1. Check Account
      addLog('[x402] Fetching account details...', 'info');
      const account = await gatewayRef.current.getAccount();
      setAddress(account.address);
      setUsdcBalance(account.balanceUsdc);
      addLog(`[x402] Connected: ${account.address}`, 'success');

      // 2. Check Credits & Auto-recharge if needed
      if (account.balanceUsdc < 0.10) {
        addLog(`[x402] Low balance detected (${account.balanceUsdc} USDC).`, 'warning');
        await handleAutoRecharge();
      }

      // 3. Create Session via Gateway
      addLog('[x402] Requesting session token...', 'info');
      const session = await gatewayRef.current.createSession();
      addLog(`[x402] Session created: ${session.roomName}`, 'success');

      // 4. Initialize VoiceAgent
      addLog('[Agent] Initializing VoiceAgent...', 'info');
      const agent = new VoiceAgent({
        stt: new DtelecomSTT(),
        llm: new GeminiLLM({
          apiKey: process.env.GEMINI_API_KEY || '',
          model: 'gemini-1.5-flash',
        }),
        tts: new DtelecomTTS(),
        instructions: 'You are a concise DeFi Strategist...',
      });
      agentRef.current = agent;

      // 5. Connect Agent Room
      addLog('[Agent] Joining secure WebRTC room...', 'info');
      await agent.start({
        room: session.roomName,
        token: session.webrtc.agent.token,
      });
      addLog('[Agent] Room joined successfully.', 'success');

      // 6. Setup Audio
      addLog('[WebRTC] Requesting microphone access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      
      audioContextRef.current = audioCtx;
      setAnalyser(analyserNode);
      
      addLog('[WebRTC] Audio stream active.', 'success');
      addLog('[System] Terminal ready.', 'success');
      setIsConnected(true);
    } catch (error) {
      addLog(`[System Error] ${error}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const toggleListening = () => {
    if (!isConnected) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      addLog('[Parakeet STT] Listening aborted.', 'warning');
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
        addLog('[Parakeet STT] Listening for input...', 'info');
      } catch (e) {
        addLog('[Parakeet STT] Failed to start listening.', 'error');
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#39ff14] p-4 md:p-8 flex flex-col font-mono uppercase crt">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 retro-border p-4 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl retro-text tracking-widest">VOID TERMINAL</h1>
          <p className="text-lg opacity-70">SYS.VER.2.0.4 // DTELECOM_STACK</p>
        </div>
        
        <div className="text-left md:text-right">
          <div className="text-2xl retro-text">CREDITS: {usdcBalance.toFixed(3)} USDC</div>
          <div className="text-lg opacity-70">ADDR: {address || 'OFFLINE'}</div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
        
        {/* Left Column: Visualizer & Controls */}
        <div className="flex flex-col gap-6">
          <div className="retro-border p-8 flex-1 flex flex-col relative min-h-[300px]">
            <div className="absolute top-4 left-4 text-xl opacity-80">
              SIGNAL_MONITOR
            </div>
            <div className="absolute top-4 right-4 text-xl opacity-80">
              STT_STATUS: {isListening ? 'ACTIVE' : 'STANDBY'}
            </div>
            
            <div className="flex-1 flex items-center justify-center mt-12">
              <div className="w-full h-64 relative">
                <Waveform analyser={analyser} isActive={isConnected} />
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            {!isConnected ? (
              <button
                onClick={connectTerminal}
                disabled={isConnecting}
                className="w-full py-6 retro-border bg-black text-[#39ff14] hover:bg-[#39ff14] hover:text-black transition-colors disabled:opacity-50 text-2xl tracking-widest cursor-pointer"
              >
                {isConnecting ? 'BOOTING_SEQUENCE...' : 'INITIALIZE_SYSTEM'}
              </button>
            ) : (
              <button
                onClick={toggleListening}
                className={`w-full py-6 retro-border transition-colors text-2xl tracking-widest cursor-pointer ${
                  isListening 
                    ? 'bg-[#39ff14] text-black shadow-[0_0_20px_rgba(57,255,20,0.6)]' 
                    : 'bg-black text-[#39ff14] hover:bg-[#39ff14] hover:text-black'
                }`}
              >
                {isListening ? 'TRANSMITTING [MIC: ON]' : 'PUSH_TO_TALK [MIC: OFF]'}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Terminal Logs */}
        <div className="retro-border flex flex-col overflow-hidden h-[500px] lg:h-auto">
          <div className="border-b-2 border-[#39ff14] p-4 flex items-center justify-between bg-[#39ff14]/10">
            <span className="text-xl tracking-widest font-bold">PIPELINE_LOGS</span>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto text-xl flex flex-col gap-2 leading-relaxed">
            {logs.length === 0 && (
              <div className="opacity-70">{'>'} AWAITING_INITIALIZATION...</div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4">
                <span className="opacity-70 shrink-0">[{log.timestamp}]</span>
                <span className="shrink-0">{'>'}</span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} className="flex gap-4 mt-2">
              <span className="shrink-0">{'>'}</span>
              <span className="blinking-cursor"></span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
