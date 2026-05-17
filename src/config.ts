import dotenv from "dotenv";

dotenv.config();

export interface BotConfig {
  rpcEndpoint: string;
  privateKey: string;
  buyAmountSol: number;
  isGeyser: boolean;
  geyserRpc?: string;
  devMode: boolean;
  devWalletAddress?: string;
  tickerMode: boolean;
  tokenTicker?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveNumber(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got: ${raw}`);
  }
  return value;
}

export function loadConfig(): BotConfig {
  const rpcEndpoint = requireEnv("RPC_ENDPOINT");
  const privateKey = requireEnv("PRIVATE_KEY");
  const buyAmountSol = parsePositiveNumber("BUY_AMOUNT", requireEnv("BUY_AMOUNT"));

  const isGeyser = process.env.IS_GEYSER === "true";
  const geyserRpc = process.env.GEYSER_RPC?.trim();

  if (isGeyser && !geyserRpc) {
    throw new Error("GEYSER_RPC is required when IS_GEYSER=true");
  }

  const devMode = process.env.DEV_MODE === "true";
  const devWalletAddress = process.env.DEV_WALLET_ADDRESS?.trim();

  if (devMode && !devWalletAddress) {
    throw new Error("DEV_WALLET_ADDRESS is required when DEV_MODE=true");
  }

  const tickerMode = process.env.TICKER_MODE === "true";
  const tokenTicker = process.env.TOKEN_TICKER?.trim();

  if (tickerMode && !tokenTicker) {
    throw new Error("TOKEN_TICKER is required when TICKER_MODE=true");
  }

  return {
    rpcEndpoint,
    privateKey,
    buyAmountSol,
    isGeyser,
    geyserRpc,
    devMode,
    devWalletAddress,
    tickerMode,
    tokenTicker,
  };
}

export function logConfigSummary(config: BotConfig): void {
  console.log("RPC:", config.rpcEndpoint);
  console.log("Wallet:", `${config.privateKey.slice(0, 6)}...`);
  console.log("Buy amount (SOL):", config.buyAmountSol);

  if (config.devMode) {
    console.log("Dev wallet filter:", config.devWalletAddress);
  }
  if (config.tickerMode) {
    console.log("Ticker filter:", config.tokenTicker);
  }
}
