export class VoiceAgent {
  config: any;
  connected: boolean = false;

  constructor(config: { stt: any; llm: any; tts: any; instructions: string }) {
    this.config = config;
  }

  async start(params: { room: string; token: string }) {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.connected = true;
        resolve();
      }, 800);
    });
  }

  async stop() {
    this.connected = false;
  }
}
