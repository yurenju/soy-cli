import Bottleneck from "bottleneck";
import BigNumber from "bignumber.js";
import fetch from "node-fetch";

const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

export interface ERC20Transfer {
  from: string;
  to: string;
  tokenSymbol: string;
  tokenDecimal: string;
  value: string;
  timeStamp: string;
  hash: string;
  contractAddress: string;
}

export interface EthTx {
  hash: string;
  transfers: ERC20Transfer[];
  internalTransfers: EthTx[];
  value: string;
  timeStamp: string;
  blockNumber: string;
  from: string;
  to: string;
  gasUsed: string;
  gasPrice: string;
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
      minTime
    });
  }

  private getTxParams(hash: string) {
    return new URLSearchParams({
      module: "proxy",
      action: "eth_getTransactionByHash",
      txhash: hash,
      apikey: this.apiKey
    }).toString();
  }

  private getReceiptParams(hash: string) {
    return new URLSearchParams({
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: hash,
      apikey: this.apiKey
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
      apikey: this.apiKey
    }).toString();
  }

  private getTxListParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "txlist",
      address,
      apikey: this.apiKey
    }).toString();
  }

  private getTxListInternalParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "txlistinternal",
      address,
      apikey: this.apiKey
    }).toString();
  }

  private getTokenTxParams(address: string) {
    return new URLSearchParams({
      module: "account",
      action: "tokentx",
      address,
      apikey: this.apiKey
    }).toString();
  }

  async getTransaction(hash: string): Promise<EthTx> {
    console.log(`    getting tx ${hash}`);
    const txParams = this.getTxParams(hash);
    const receiptParams = this.getReceiptParams(hash);
    const txurl = `${this.baseUrl}?${txParams}`;
    const receipturl = `${this.baseUrl}?${receiptParams}`;
    const { result: txResult } = await this.limit.schedule(() =>
      fetch(txurl).then(res => res.json())
    );
    const { result: receiptResult } = await this.limit.schedule(() =>
      fetch(receipturl).then(res => res.json())
    );
    return {
      from: txResult.from,
      to: txResult.to,
      blockNumber: new BigNumber(receiptResult.blockNumber).toString(),
      gasUsed: new BigNumber(receiptResult.gasUsed).toString(),
      gasPrice: new BigNumber(txResult.getPrice).toString(),
      hash: txResult.hash,
      value: new BigNumber(txResult.value).toString(),
      timeStamp: "",
      transfers: [],
      internalTransfers: []
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
      fetch(balanceUrl).then(res => res.json())
    );
    return result;
  }

  getTxList(address: string) {
    const url = `${this.baseUrl}?${this.getTxListParams(address)}`;
    return this.limit.schedule(() => fetch(url).then(res => res.json()));
  }

  getTxListInternal(address: string) {
    const url = `${this.baseUrl}?${this.getTxListInternalParams(address)}`;
    return this.limit.schedule(() => fetch(url).then(res => res.json()));
  }

  getErc20TxList(address: string) {
    const url = `${this.baseUrl}?${this.getTokenTxParams(address)}`;
    return this.limit.schedule(() => fetch(url).then(res => res.json()));
  }
}
