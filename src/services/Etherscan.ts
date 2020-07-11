import Bottleneck from "bottleneck";
import BigNumber from "bignumber.js";
import fetch from "node-fetch";

const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

export interface EtherscanBaseTx {
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  nonce: string;
  timeStamp: string;
  to: string;
  value: string;
  transactionIndex: string;
}

export interface EthTx extends EtherscanBaseTx {
  blockHash: string;
  isError: string;
  txreceipt_status: string;
  erc20Transfers: Erc20Transfer[];
  internalTransfers: InternalTx[];
}

export interface Erc20Transfer extends EtherscanBaseTx {
  blockHash: string;
  tokenDecimal: string;
  tokenName: string;
  tokenSymbol: string;
}

export interface InternalTx extends EtherscanBaseTx {
  errCode: string;
  isError: string;
  traceId: string;
  type: string;
}

export interface EtherscanResponse<T> {
  message: string;
  status: string;
  result: T;
}

export interface GetAbiResponse extends EtherscanResponse<string> {
  address: string;
}

export interface GetSourceResponse
  extends EtherscanResponse<SourceCodeResult[]> {
  address: string;
}

export interface SourceCodeResult {
  ABI: string;
  ContractName: string;
}

export interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

export interface RpcTx {
  blockHash: string;
  blockNumber: string;
  from: string;
  gas: string;
  gasPrice: string;
  hash: string;
  input: string;
  nonce: string;
  to: string;
  transactionIndex: string;
  value: string;
  v: string;
  r: string;
  s: string;
}

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

export interface RpcReceipt {
  blockHash: string;
  blockNumber: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gasUsed: string;
  logs: RpcLog[];
  logsBloom: string;
  status: string;
  to: string;
  transactionHash: string;
  transactionIndex: string;
}

export class Etherscan {
  private readonly limit: Bottleneck;

  constructor(
    private readonly apiKey = "",
    private readonly baseUrl = ETHERSCAN_BASE_URL,
    minTime = 200,
    maxConcurrent = 1
  ) {
    this.limit = new Bottleneck({
      maxConcurrent,
      minTime,
    });
  }

  private getTxParams(hash: string) {
    return new URLSearchParams({
      module: "proxy",
      action: "eth_getTransactionByHash",
      txhash: hash,
      apikey: this.apiKey,
    }).toString();
  }

  private getReceiptParams(hash: string) {
    return new URLSearchParams({
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: hash,
      apikey: this.apiKey,
    }).toString();
  }

  private getTokenBalanceParams(
    contractaddress: string,
    address: string,
    tag: string
  ) {
    return new URLSearchParams({
      module: "account",
      action: "tokenbalance",
      contractaddress,
      address,
      tag,
      apikey: this.apiKey,
    }).toString();
  }

  private getTxListParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "txlist",
      address,
      apikey: this.apiKey,
    }).toString();
  }

  private getSourceCodeParams(address: string) {
    return new URLSearchParams({
      module: "contract",
      action: "getsourcecode",
      address,
      apikey: this.apiKey,
    }).toString();
  }

  private getTxListInternalParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "txlistinternal",
      address,
      apikey: this.apiKey,
    }).toString();
  }

  private getTokenTxParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "tokentx",
      address,
      apikey: this.apiKey,
    }).toString();
  }

  async getSourceCode(address: string): Promise<GetSourceResponse> {
    console.log(`    getting source code for address ${address}`);
    const params = this.getSourceCodeParams(address);
    const url = `${this.baseUrl}?${params}`;
    const result: GetSourceResponse = await this.limit.schedule(() =>
      fetch(url).then((res) => res.json())
    );
    result.address = address;
    return result;
  }

  async getTransaction(hash: string): Promise<EthTx> {
    console.log(`    getting tx ${hash}`);
    const txParams = this.getTxParams(hash);
    const receiptParams = this.getReceiptParams(hash);
    const txUrl = `${this.baseUrl}?${txParams}`;
    const receiptUrl = `${this.baseUrl}?${receiptParams}`;
    const {
      result: txResult,
    }: RpcResponse<RpcTx> = await this.limit.schedule(() =>
      fetch(txUrl).then((res) => res.json())
    );

    const {
      result: receiptResult,
    }: RpcResponse<RpcReceipt> = await this.limit.schedule(() =>
      fetch(receiptUrl).then((res) => res.json())
    );

    return {
      from: txResult.from,
      to: txResult.to,
      blockNumber: new BigNumber(receiptResult.blockNumber).toString(),
      gasUsed: new BigNumber(receiptResult.gasUsed).toString(),
      gasPrice: new BigNumber(txResult.gasPrice).toString(),
      hash: txResult.hash,
      value: new BigNumber(txResult.value).toString(),
      timeStamp: "",
      blockHash: txResult.blockHash,
      erc20Transfers: [],
      internalTransfers: [],
      isError: "0",
      txreceipt_status: receiptResult.status,
      confirmations: "0",
      contractAddress: receiptResult.contractAddress,
      cumulativeGasUsed: receiptResult.cumulativeGasUsed,
      gas: txResult.gas,
      input: txResult.input,
      nonce: txResult.nonce,
      transactionIndex: txResult.transactionIndex,
    };
  }

  async getTokenBalance(
    contractAddress: string,
    address: string,
    blockNumber: string
  ): Promise<string> {
    const tag = parseInt(blockNumber).toString(16);
    const params = this.getTokenBalanceParams(contractAddress, address, tag);
    const balanceUrl = `${this.baseUrl}?${params}`;
    const { result } = await this.limit.schedule(() =>
      fetch(balanceUrl).then((res) => res.json())
    );
    return result;
  }

  getTxList(address: string): Promise<EtherscanResponse<EthTx[]>> {
    const url = `${this.baseUrl}?${this.getTxListParams(address)}`;
    return this.limit.schedule(() => fetch(url).then((res) => res.json()));
  }

  getTxListInternal(address: string): Promise<EtherscanResponse<InternalTx[]>> {
    const url = `${this.baseUrl}?${this.getTxListInternalParams(address)}`;
    return this.limit.schedule(() => fetch(url).then((res) => res.json()));
  }

  getErc20TxList(address: string): Promise<EtherscanResponse<Erc20Transfer[]>> {
    const url = `${this.baseUrl}?${this.getTokenTxParams(address)}`;
    return this.limit.schedule(() => fetch(url).then((res) => res.json()));
  }
}
