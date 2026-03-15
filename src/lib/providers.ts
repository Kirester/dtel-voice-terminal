export class DtelecomSTT {
  provider = 'Parakeet';
}

export class DtelecomTTS {
  provider = 'Kokoro';
}

export class GeminiLLM {
  apiKey: string;
  model: string;

  constructor(config: { apiKey: string; model: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }
}
