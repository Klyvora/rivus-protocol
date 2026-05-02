/**
 * RivusClient — Primary SDK interface for the Rivus payment streaming protocol.
 *
 * This client wraps the Soroban StreamManager contract and provides a clean
 * TypeScript API that any Stellar developer can drop into their project.
 *
 * @example
 * ```typescript
 * import { RivusClient, months, fromNow } from "@rivus/sdk";
 * import { signTransaction } from "@stellar/freighter-api";
 *
 * const rivus = new RivusClient({
 *   network: "testnet",
 *   contractId: "CXXXXXXX...",
 * });
 *
 * // Create a 6-month linear stream of 1000 USDC
 * const streamId = await rivus.createStream({
 *   sender: "GABCD...",
 *   recipient: "GEFGH...",
 *   token: "USDC_CONTRACT_ID",
 *   totalAmount: 1_000_0000000n, // 1000 USDC in stroops
 *   startTime: Date.now() / 1000 | 0,
 *   endTime: fromNow(months(6)),
 *   streamType: "linear",
 *   sign: (xdr) => signTransaction(xdr, { network: "TESTNET" }),
 * });
 * ```
 */

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  scValToNative,
  nativeToScVal,
  Address,
} from "@stellar/stellar-sdk";

import type {
  RivusConfig,
  Stream,
  StreamProgress,
  CreateStreamParams,
  WithdrawParams,
  CancelParams,
  SignerFn,
  StreamType,
} from "../src/types/index.ts";

import { computeClaimable, nowSeconds } from "./utils/time";

const RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://soroban-mainnet.stellar.org",
};

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export class RivusClient {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly config: RivusConfig;

  constructor(config: RivusConfig) {
    this.config = config;
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Create a new payment stream.
   *
   * The sender wallet must have approved the StreamManager contract to
   * spend `totalAmount` of the token before this call succeeds.
   *
   * @returns The new stream ID as a string
   */
  async createStream(params: CreateStreamParams & { sign: SignerFn }): Promise<string> {
    const {
      sender,
      recipient,
      token,
      totalAmount,
      startTime,
      endTime,
      streamType,
      cliffDuration = 0,
      stepInterval = 0,
      sign,
    } = params;

    const streamTypeScVal = this.streamTypeToScVal(streamType);

    const operation = this.contract.call(
      "create_stream",
      new Address(sender).toScVal(),
      new Address(recipient).toScVal(),
      new Address(token).toScVal(),
      nativeToScVal(totalAmount, { type: "i128" }),
      nativeToScVal(startTime, { type: "u64" }),
      nativeToScVal(endTime, { type: "u64" }),
      streamTypeScVal,
      nativeToScVal(cliffDuration, { type: "u64" }),
      nativeToScVal(stepInterval, { type: "u64" }),
    );

    const result = await this.invoke(sender, operation, sign);
    const streamId = scValToNative(result) as bigint;
    return streamId.toString();
  }

  // -------------------------------------------------------------------------
  // Withdraw
  // -------------------------------------------------------------------------

  /**
   * Withdraw all claimable tokens for a stream.
   * The tokens always go to the stream's recipient regardless of who calls.
   *
   * @returns Amount withdrawn in base units
   */
  async withdraw(params: WithdrawParams): Promise<bigint> {
    const { streamId, sign } = params;
    const stream = await this.getStream(streamId);

    const operation = this.contract.call(
      "withdraw",
      nativeToScVal(BigInt(streamId), { type: "u64" }),
    );

    const result = await this.invoke(stream.recipient, operation, sign);
    return scValToNative(result) as bigint;
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  /**
   * Cancel an active stream.
   * Earned tokens are sent to the recipient; unearned tokens return to sender.
   * Only the stream's sender can call this.
   */
  async cancel(params: CancelParams): Promise<void> {
    const { streamId, sender, sign } = params;

    const operation = this.contract.call(
      "cancel",
      new Address(sender).toScVal(),
      nativeToScVal(BigInt(streamId), { type: "u64" }),
    );

    await this.invoke(sender, operation, sign);
  }

  // -------------------------------------------------------------------------
  // Read-only
  // -------------------------------------------------------------------------

  /**
   * Fetch a stream by ID from the contract.
   */
  async getStream(streamId: string): Promise<Stream> {
    const result = await this.server.simulateTransaction(
      await this.buildReadTx(
        this.contract.call(
          "get_stream",
          nativeToScVal(BigInt(streamId), { type: "u64" }),
        ),
      ),
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`get_stream failed: ${result.error}`);
    }

    const raw = scValToNative(
      (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
        .result!.retval
    ) as Record<string, unknown>;

    return this.parseStream(raw);
  }

  /**
   * Get real-time claimable amount for a stream.
   * Computed locally from stream data — no extra network call needed
   * after getStream().
   */
  async getClaimable(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    return computeClaimable(stream);
  }

  /**
   * Get a full progress snapshot for a stream.
   */
  async getProgress(streamId: string): Promise<StreamProgress> {
    const stream = await this.getStream(streamId);
    const claimable = computeClaimable(stream);
    const now = nowSeconds();

    const vested = stream.totalAmount - stream.withdrawn - claimable;
    const percentVested =
      stream.totalAmount > 0n
        ? Number((vested * 10000n) / stream.totalAmount) / 100
        : 0;

    return {
      streamId,
      claimable,
      totalAmount: stream.totalAmount,
      withdrawn: stream.withdrawn,
      percentVested,
      isEnded: now >= stream.endTime,
      isCancelled: stream.cancelled,
    };
  }

  /**
   * Total number of streams ever created.
   */
  async getStreamCount(): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      await this.buildReadTx(this.contract.call("get_stream_count")),
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`get_stream_count failed: ${result.error}`);
    }

    return scValToNative(
      (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
        .result!.retval
    ) as bigint;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async invoke(
    source: string,
    operation: xdr.Operation,
    sign: SignerFn,
  ): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(source);

    let tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    const signedXdr = await sign(prepared.toXDR());

    const submitted = await this.server.sendTransaction(
      TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase),
    );

    if (submitted.status === "ERROR") {
      throw new Error(`Transaction failed: ${submitted.errorResult}`);
    }

    const hash = submitted.hash;
    return this.pollForResult(hash);
  }

  private async pollForResult(hash: string): Promise<xdr.ScVal> {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await this.server.getTransaction(hash);

      if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return (status as SorobanRpc.Api.GetSuccessfulTransactionResponse)
          .returnValue!;
      }
      if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction ${hash} failed`);
      }
    }
    throw new Error(`Transaction ${hash} timed out`);
  }

  private async buildReadTx(operation: xdr.Operation) {
    const dummyAccount = {
      accountId: () => "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
      sequenceNumber: () => "0",
      incrementSequenceNumber: () => {},
    } as unknown as Parameters<typeof TransactionBuilder>[0];

    return new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
  }

  private streamTypeToScVal(type: StreamType): xdr.ScVal {
    const variants: Record<StreamType, string> = {
      linear: "Linear",
      cliff_linear: "CliffLinear",
      stepped: "Stepped",
    };
    return xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol(variants[type]),
    ]);
  }

  private parseStream(raw: Record<string, unknown>): Stream {
    return {
      id: String(raw.id),
      sender: String(raw.sender),
      recipient: String(raw.recipient),
      token: String(raw.token),
      totalAmount: BigInt(String(raw.total_amount)),
      withdrawn: BigInt(String(raw.withdrawn)),
      startTime: Number(raw.start_time),
      endTime: Number(raw.end_time),
      cliffDuration: Number(raw.cliff_duration),
      stepInterval: Number(raw.step_interval),
      streamType: String(raw.stream_type).toLowerCase() as StreamType,
      cancelled: Boolean(raw.cancelled),
    };
  }
}