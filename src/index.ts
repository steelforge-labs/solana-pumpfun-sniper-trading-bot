import {
  Connection,
  Keypair,
  LogsCallback,
  PublicKey,
} from "@solana/web3.js";
import base58 from "bs58";
import WebSocket from "ws";
import { BotConfig, loadConfig, logConfigSummary } from "./config";
import { commitment, PUMP_FUN_PROGRAM } from "./constants";
import { handleMintEvent, MintEvent } from "./mintHandler";
import { convertHttpToWebSocket } from "./utils/commonFunc";

const PUMP_FUN_PROGRAM_ID = PUMP_FUN_PROGRAM.toBase58();
const GEYSER_MINT_LOG = "Program log: Instruction: InitializeMint2";

interface GeyserAccountKey {
  pubkey: string;
}

interface GeyserTransactionMessage {
  accountKeys: GeyserAccountKey[];
}

function createRpcConnection(
  rpcEndpoint: string,
  commitmentLevel: "confirmed" | "processed"
): Connection {
  return new Connection(rpcEndpoint, {
    wsEndpoint: convertHttpToWebSocket(rpcEndpoint),
    commitment: commitmentLevel,
  });
}

function loadKeypair(privateKey: string): Keypair {
  return Keypair.fromSecretKey(base58.decode(privateKey));
}

async function runRpcMode(
  config: BotConfig,
  payerKeypair: Keypair
): Promise<void> {
  const connection = createRpcConnection(config.rpcEndpoint, "confirmed");
  const logConnection = createRpcConnection(config.rpcEndpoint, "processed");

  let logListenerId: number | undefined;
  let isProcessing = false;

  const stopLogListener = async (): Promise<void> => {
    if (logListenerId === undefined) {
      return;
    }
    try {
      await logConnection.removeOnLogsListener(logListenerId);
      logListenerId = undefined;
    } catch (err) {
      console.error("Error stopping log listener:", err);
    }
  };

  const onLogs: LogsCallback = async ({ logs, err, signature }) => {
    if (err || isProcessing) {
      return;
    }

    const isMint = logs.some((log) => log.includes("MintTo"));
    if (!isMint) {
      return;
    }

    isProcessing = true;

    try {
      const parsed = await logConnection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (!parsed) {
        isProcessing = false;
        return;
      }

      const accountKeys = parsed.transaction.message.accountKeys;
      const devWallet = accountKeys[0].pubkey.toString();
      const mint = accountKeys[1].pubkey;

      const event: MintEvent = { signature, devWallet, mint };
      const bought = await handleMintEvent(
        event,
        config,
        connection,
        payerKeypair
      );

      if (bought) {
        await stopLogListener();
      } else {
        isProcessing = false;
      }
    } catch (error) {
      console.error("RPC listener error:", error);
      isProcessing = false;
    }
  };

  console.log("Bot running (RPC log mode)");
  logListenerId = logConnection.onLogs(PUMP_FUN_PROGRAM, onLogs, commitment);
}

function subscribeGeyser(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 420,
      method: "transactionSubscribe",
      params: [
        {
          failed: false,
          accountInclude: [PUMP_FUN_PROGRAM_ID],
        },
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          transactionDetails: "full",
          maxSupportedTransactionVersion: 0,
        },
      ],
    })
  );
}

function runGeyserMode(config: BotConfig, payerKeypair: Keypair): void {
  const geyserUrl = config.geyserRpc!;
  const connection = createRpcConnection(config.rpcEndpoint, "processed");

  console.log("Wallet pubkey =>", payerKeypair.publicKey.toBase58());

  const connect = (): void => {
    const ws = new WebSocket(geyserUrl);
    let isProcessing = false;

    ws.on("open", () => {
      console.log("Geyser WebSocket connected");
      subscribeGeyser(ws);
    });

    ws.on("error", (err) => {
      console.error("Geyser WebSocket error:", err.message);
    });

    ws.on("close", () => {
      if (!isProcessing) {
        console.log("Geyser WebSocket closed — reconnecting in 3s");
        setTimeout(connect, 3000);
      }
    });

    ws.on("message", async (data) => {
      if (isProcessing) {
        return;
      }

      try {
        const message = JSON.parse(data.toString("utf8"));
        const result = message?.params?.result;
        if (!result) {
          return;
        }

        const logs: string[] | undefined = result.transaction?.meta?.logMessages;
        const signature: string | undefined = result.signature;
        const accountKeys: GeyserAccountKey[] | undefined =
          result.transaction?.transaction?.message?.accountKeys;

        if (
          !logs?.some((log) => log.includes(GEYSER_MINT_LOG)) ||
          !signature ||
          !accountKeys?.length
        ) {
          return;
        }

        isProcessing = true;
        ws.close();

        const event: MintEvent = {
          signature,
          devWallet: accountKeys[0].pubkey,
          mint: new PublicKey(accountKeys[1].pubkey),
        };

        const bought = await handleMintEvent(
          event,
          config,
          connection,
          payerKeypair
        );

        if (!bought) {
          isProcessing = false;
          connect();
        }
      } catch (error) {
        console.error("Geyser message handler error:", error);
        isProcessing = false;
        connect();
      }
    });
  };

  console.log("Bot running (Geyser mode)");
  connect();
}

function runBot(config: BotConfig): void {
  const payerKeypair = loadKeypair(config.privateKey);

  if (config.isGeyser) {
    console.log("Mode: Geyser\n");
    runGeyserMode(config, payerKeypair);
  } else {
    console.log("Mode: RPC logs\n");
    void runRpcMode(config, payerKeypair);
  }
}

function main(): void {
  try {
    const config = loadConfig();
    logConfigSummary(config);
    console.log("");
    runBot(config);
  } catch (error) {
    console.error(
      "Startup failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

main();
