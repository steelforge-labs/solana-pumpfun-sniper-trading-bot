import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import buyToken from "./pumputils/utils/buyToken";
import { BotConfig } from "./config";
import { formatDate } from "./utils/commonFunc";

export interface MintEvent {
  signature: string;
  devWallet: string;
  mint: PublicKey;
}

const SLIPPAGE = 1;

async function fetchTokenSymbol(
  mint: PublicKey,
  connection: Connection
): Promise<string | null> {
  try {
    const metaplex = Metaplex.make(connection);
    const nft = await metaplex.nfts().findByMint({ mintAddress: mint });
    return nft.symbol;
  } catch {
    return null;
  }
}

async function passesFilters(
  event: MintEvent,
  config: BotConfig,
  connection: Connection
): Promise<boolean> {
  if (config.devMode) {
    console.log("Dev wallet =>", `https://solscan.io/address/${event.devWallet}`);
    if (event.devWallet !== config.devWalletAddress) {
      return false;
    }
  }

  if (config.tickerMode && config.tokenTicker) {
    const symbol = await fetchTokenSymbol(event.mint, connection);
    if (!symbol) {
      return false;
    }

    const needle = config.tokenTicker.toUpperCase();
    if (!symbol.toUpperCase().includes(needle)) {
      return false;
    }

    console.log(`Matched ticker: $${symbol}`);
  }

  return true;
}

export async function handleMintEvent(
  event: MintEvent,
  config: BotConfig,
  connection: Connection,
  payerKeypair: Keypair
): Promise<boolean> {
  console.log(
    "New mint tx =>",
    `https://solscan.io/tx/${event.signature}`,
    await formatDate()
  );

  if (!(await passesFilters(event, config, connection))) {
    return false;
  }

  console.log("New token =>", `https://solscan.io/token/${event.mint.toString()}`);

  const signature = await buyToken(
    event.mint,
    connection,
    payerKeypair,
    config.buyAmountSol,
    SLIPPAGE
  );

  if (!signature) {
    console.log("Buy failed — no signature returned");
    return false;
  }

  console.log("Buy tx =>", `https://solscan.io/tx/${signature}`);
  console.log("Buy success");
  console.log("Pump.fun =>", `https://pump.fun/${event.mint.toString()}`);
  return true;
}
