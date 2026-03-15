export class InsufficientCreditsError extends Error {
  constructor(message = "Insufficient USDC for this operation.") {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

export class DtelecomGateway {
  private usdcBalance: number = 0.05;

  async getAccount() {
    return {
      address: "0x7F5...3A19",
      balanceUsdc: this.usdcBalance,
    };
  }

  async createSession() {
    return new Promise<{ roomName: string; webrtc: { agent: { token: string } } }>((resolve) => {
      setTimeout(() => {
        resolve({
          roomName: "cyber-room-" + Math.floor(Math.random() * 10000),
          webrtc: {
            agent: {
              token: "jwt-x402-" + Date.now(),
            }
          }
        });
      }, 500);
    });
  }

  async buyCredits({ amountUsdc }: { amountUsdc: number }) {
    return new Promise<{ success: boolean; newBalance: number }>((resolve) => {
      setTimeout(() => {
        this.usdcBalance += amountUsdc;
        resolve({ success: true, newBalance: this.usdcBalance });
      }, 1500);
    });
  }

  async charge(amountUsdc: number) {
    if (this.usdcBalance < amountUsdc) {
      throw new InsufficientCreditsError();
    }
    this.usdcBalance -= amountUsdc;
    return true;
  }
}
