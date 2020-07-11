import dotenv from "dotenv";
import moment from "moment";
import BigNumber from "bignumber.js";
import { ShellString, mkdir } from "shelljs";
import path from "path";
import { ethers, Contract } from "ethers";
import { plainToClass } from "@marcj/marshal";
import { Config, PatternType } from "./config/Config";
import { Posting, Cost } from "./models/Posting";
import { Transaction } from "./models/Transaction";
import { CryptoConfig, Connection } from "./config/CryptoConfig";
import {
  Etherscan,
  EthTx,
  Erc20Transfer,
  InternalTx,
  SourceCodeResult,
} from "./services/Etherscan";
import { CoinGecko, HistoryPrice } from "./services/CoinGecko";
import {
  postingTransform,
  patternReplace,
  getAmountFromHistoryPrice,
} from "./Common";
import { DATE_FORMAT, Balance } from "./models";
import { Price } from "./models/Price";
import { parseBytes32String, TransactionDescription } from "ethers/lib/utils";

dotenv.config();

const decimals = new BigNumber(10).pow(18);

export interface TokenMetadata {
  contractAddress: string;
  tokenDecimal: string;
}

export interface TokenMetadataMap {
  [symbol: string]: TokenMetadata;
}

type EthTxMap = Record<string, EthTx>;

export interface DateCoinMap {
  [date: string]: CoinMap;
}

export interface CoinMap {
  [coinId: string]: Posting[];
}

interface Options {
  config: string;
}

export class CryptoParser {
  config: CryptoConfig;
  etherscan: Etherscan;
  coingecko: CoinGecko;
  contractSrcMap: Record<string, SourceCodeResult> = {};

  static command = "crypto";
  static options = ["-c, --config <config-file>"];
  static envs = ["ETHERSCAN_API_KEY"];

  constructor(
    options: Options,
    etherscan = new Etherscan(process.env.ETHERSCAN_API_KEY),
    coingecko = new CoinGecko()
  ) {
    this.config = plainToClass(CryptoConfig, Config.parse(options.config));
    this.config.outputDir = process.cwd();
    this.etherscan = etherscan;
    this.coingecko = coingecko;

    if (!this.config.excludeCoins) {
      this.config.excludeCoins = [];
    }
  }

  getValue(value: string, tokenDecimal: string): string {
    const decimals = new BigNumber(10).pow(new BigNumber(tokenDecimal));
    return new BigNumber(value).div(decimals).toFormat();
  }

  getConnection(addr: string): Connection | null {
    const { connections: conns } = this.config;
    for (let i = 0; i < conns.length; i++) {
      if (conns[i].address.toLowerCase() === addr.toLowerCase()) {
        return conns[i];
      }
    }

    return null;
  }

  getAccount(
    prefix: string | undefined,
    symbol: string,
    defaultAccount: string
  ): string {
    return prefix !== undefined ? `${prefix}:${symbol}` : defaultAccount;
  }

  async getBalances(
    lastTx: EthTx,
    tokensMetadata: TokenMetadataMap,
    conn: Connection
  ): Promise<Balance[]> {
    const { excludeCoins, rules } = this.config;
    const { blockNumber, timeStamp } = lastTx;
    const { accountPrefix, address } = conn;
    const balances: Balance[] = [];
    const date = moment(parseInt(timeStamp) * 1000).add(1, "day");

    const meta = Object.entries(tokensMetadata);
    for (let j = 0; j < meta.length; j++) {
      const [symbol, info] = meta[j];
      if (excludeCoins.find((coin) => coin === symbol)) {
        continue;
      }
      const { contractAddress, tokenDecimal } = info;
      const result = await this.etherscan.getTokenBalance(
        contractAddress,
        address,
        blockNumber
      );
      const balance = this.getValue(result, tokenDecimal);
      const account = `${accountPrefix}:${symbol}`;
      const data: Record<string, string> = {
        date: date.format(DATE_FORMAT),
        account,
        balance,
        symbol,
      };

      rules.forEach((rule) =>
        rule.pattern.forEach(({ type, query: field, value }) => {
          if (type === PatternType.Balance && data[field] === value) {
            rule.transform.forEach(({ query: field, value }) =>
              postingTransform(data, field, value)
            );
          }
        })
      );

      balances.push(
        new Balance({
          date,
          account,
          amount: balance,
          symbol,
        })
      );
    }

    return balances;
  }

  async normalizeTransfers(
    txMap: EthTxMap,
    transfers: Erc20Transfer[],
    internalTransfers: InternalTx[],
    tokensMetadata: TokenMetadataMap
  ): Promise<EthTx[]> {
    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      console.log(`  process ERC20 tx (${i + 1} / ${transfers.length})`);
      transfer.from = transfer.from.toLowerCase();
      transfer.tokenSymbol = transfer.tokenSymbol.toUpperCase();
      if (!tokensMetadata[transfer.tokenSymbol]) {
        tokensMetadata[transfer.tokenSymbol] = {
          contractAddress: transfer.contractAddress,
          tokenDecimal: transfer.tokenDecimal,
        };
      }

      if (!txMap[transfer.hash]) {
        const tx = await this.etherscan.getTransaction(transfer.hash);
        tx.timeStamp = transfer.timeStamp;
        txMap[transfer.hash] = tx;
      }

      const tx = txMap[transfer.hash];
      const duplicated = tx.erc20Transfers.some(
        (tr) =>
          tr.from === transfer.from &&
          tr.to === transfer.to &&
          tr.value === transfer.value
      );

      if (!duplicated) {
        tx.erc20Transfers.push(transfer);
      }
    }

    internalTransfers.forEach((transfer) => {
      const tx = txMap[transfer.hash];
      tx.internalTransfers.push(transfer);
    });

    return [...Object.values(txMap)].sort(
      (a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp)
    );
  }

  getETHPostings(from: string, to: string, value: string): Posting[] {
    const { defaultAccount } = this.config;
    const fromConn = this.getConnection(from);
    const toConn = this.getConnection(to);
    const postings = [];

    const fromAccount = this.getAccount(
      fromConn?.accountPrefix,
      "ETH",
      defaultAccount.income
    );

    const toAccount = this.getAccount(
      toConn?.accountPrefix,
      "ETH",
      defaultAccount.expenses
    );

    const toVal = this.getValue(value, "18");
    const fromVal = "-" + toVal;

    postings.push(
      new Posting({ account: fromAccount, amount: fromVal, symbol: "ETH" }),
      new Posting({ account: toAccount, amount: toVal, symbol: "ETH" })
    );

    return postings;
  }

  getInternalPostings(transfers: InternalTx[]) {
    const { defaultAccount } = this.config;
    const postings: Posting[] = [];
    transfers.forEach((transfer) => {
      const { from, to, value } = transfer;

      const fromConn = this.getConnection(from);
      const toConn = this.getConnection(to);

      const fromAccount = this.getAccount(
        fromConn?.accountPrefix,
        "ETH",
        defaultAccount.income
      );

      const toAccount = this.getAccount(
        toConn?.accountPrefix,
        "ETH",
        defaultAccount.expenses
      );

      const amount = this.getValue(value, "18");
      if ((fromConn || transfers.length <= 1) && value !== "0") {
        postings.push(
          new Posting({
            account: fromAccount,
            amount: `-${amount}`,
            symbol: "ETH",
          })
        );
      }
      if ((toConn || transfers.length <= 1) && value !== "0") {
        postings.push(
          new Posting({ account: toAccount, amount, symbol: "ETH" })
        );
      }
    });

    return postings;
  }

  getERC20Postings(transfers: Erc20Transfer[]) {
    const { defaultAccount, excludeCoins } = this.config;
    const postings: Posting[] = [];
    transfers.forEach((transfer) => {
      const { from, to, tokenSymbol, tokenDecimal, value } = transfer;

      if (excludeCoins.find((coin) => coin === tokenSymbol)) {
        return;
      }

      const fromConn = this.getConnection(from);
      const toConn = this.getConnection(to);

      const fromAccount = this.getAccount(
        fromConn?.accountPrefix,
        tokenSymbol,
        defaultAccount.income
      );

      const toAccount = this.getAccount(
        toConn?.accountPrefix,
        tokenSymbol,
        defaultAccount.expenses
      );

      // filter default account if there are more than 1 transfer
      // merged from:
      //   Assets:Crypto:Wallet:SAI -20 SAI
      //   Expenses:Unknown 20 SAI
      //   Income:Unknown -100 CSAI
      //   Assets:Crypto:Wallet:CSAI 100 CSAI
      // to:
      //   Assets:Crypto:Wallet:SAI -20 SAI
      //   Assets:Crypto:Wallet:CSAI 100 CSAI
      const amount = this.getValue(value, tokenDecimal);
      if ((fromConn || transfers.length <= 1) && value !== "0") {
        const pos = new Posting({
          account: fromAccount,
          amount: `-${amount}`,
          symbol: tokenSymbol,
          cost: new Cost({ ambiguous: true }),
        });
        pos.metadata.address = from;
        postings.push(pos);
      }
      if ((toConn || transfers.length <= 1) && value !== "0") {
        const pos = new Posting({
          account: toAccount,
          amount,
          symbol: tokenSymbol,
        });
        pos.metadata.address = to;
        postings.push(pos);
      }
    });

    return postings;
  }

  getDateCoinMap(beans: Transaction[]): DateCoinMap {
    const map: DateCoinMap = {};

    beans.forEach((bean) => {
      const dateStr = bean.date.format(DATE_FORMAT);
      if (!map[dateStr]) {
        map[dateStr] = {};
      }

      const coinsMap = map[dateStr];

      bean.postings.forEach((d) => {
        const coin = this.config.coins.find((c) => c.symbol === d.symbol);
        if (!coin) {
          return;
        }
        if (!coinsMap[coin.id]) {
          coinsMap[coin.id] = [];
        }

        coinsMap[coin.id].push(d);
      });
    });

    return map;
  }

  async getLatestPrices(): Promise<Price[]> {
    const { fiat } = this.config;
    const today = moment().format(DATE_FORMAT);
    const coinGeckoPrices = await Promise.all(
      this.config.coins.map((coin) =>
        this.coingecko.getHistoryPrice(today, coin.id)
      )
    );
    return coinGeckoPrices.map((p, i) => {
      const { symbol: holding } = this.config.coins[i];
      return new Price({
        holding,
        amount: getAmountFromHistoryPrice(p, fiat),
        symbol: fiat,
      });
    });
  }

  async fillPrices(beans: Transaction[]) {
    const { fiat } = this.config;
    const map = this.getDateCoinMap(beans);
    const tasks: Promise<HistoryPrice>[] = [];

    Object.entries(map).forEach(([date, coinsMap]) => {
      Object.keys(coinsMap).forEach((id) => {
        tasks.push(this.coingecko.getHistoryPrice(date, id));
      });
    });
    const results = await Promise.all(tasks);
    results.forEach((result: HistoryPrice) => {
      const { date, id, error } = result;
      if (error) {
        console.error(`cannot find ${id} at ${date}`);
        return;
      }
      map[date][id].forEach((posting) => {
        if (!result.market_data) {
          console.error(
            `unexpected result: ${JSON.stringify(result, null, 2)}`
          );
          return;
        }
        if (posting.amount[0] !== "-" || posting.account.match(/^Income:/)) {
          posting.cost = new Cost({
            amount: getAmountFromHistoryPrice(result, fiat),
            symbol: fiat,
          });
        } else {
          posting.cost = new Cost({ ambiguous: true });
        }
      });
    });
  }

  async getSymbol(contractAddress: string, abi: string): Promise<string> {
    const provider = ethers.getDefaultProvider();
    const contract = new Contract(contractAddress, abi, provider);
    const rawSymbol: string = await contract.symbol();
    return rawSymbol.indexOf("0x") === 0
      ? parseBytes32String(rawSymbol)
      : rawSymbol;
  }

  async getContractInput(
    txHash: string,
    abi: string
  ): Promise<TransactionDescription> {
    const provider = ethers.getDefaultProvider();
    const inter = new ethers.utils.Interface(abi);
    const realTx = await provider.getTransaction(txHash);
    return inter.parseTransaction({
      data: realTx.data,
      value: realTx.value,
    });
  }

  async getSpenderName(address: string): Promise<string> {
    let spenderName = address;
    if (this.contractSrcMap[address]) {
      spenderName = this.contractSrcMap[address].ContractName;
    } else {
      const spenderContract = await this.etherscan.getSourceCode(address);
      if (spenderContract.status === "1" && spenderContract.result.length > 0) {
        spenderName = spenderContract.result[0].ContractName;
        this.contractSrcMap[address] = spenderContract.result[0];
      }
    }

    return spenderName;
  }

  async getNarration(tx: EthTx): Promise<string> {
    let narration = "";
    const ethAmount = new BigNumber(tx.value).div(new BigNumber(10).pow(18));
    if (tx.erc20Transfers.length === 0) {
      if (ethAmount.eq(0)) {
        if (this.contractSrcMap[tx.to]) {
          const abi = this.contractSrcMap[tx.to].ABI;
          const contractName = this.contractSrcMap[tx.to].ContractName;
          const input = await this.getContractInput(tx.hash, abi);

          if (input.name === "approve") {
            const tokenSymbol = await this.getSymbol(tx.to, abi);
            const spenderName = await this.getSpenderName(input.args[0]);
            narration = `${input.name} ${tokenSymbol} for ${spenderName}`;
          } else {
            narration = `Called ${contractName}.${input.name}()`;
          }
        } else {
          narration = "Contract Execution";
        }
      } else {
        const action = this.getConnection(tx.from) ? "Sent" : "Received";
        const amount = new BigNumber(tx.value)
          .div(new BigNumber(10).pow(18))
          .toFixed(3);
        narration = `${action} ${amount} ETH`;
      }
    } else if (tx.erc20Transfers.length <= 1 && ethAmount.eq(0)) {
      const transfer = tx.erc20Transfers[0];
      const action = this.getConnection(transfer.from) ? "Sent" : "Received";
      const amount = new BigNumber(transfer.value).div(
        new BigNumber(10).pow(transfer.tokenDecimal)
      );
      narration = `${action} ${amount} ${transfer.tokenSymbol}`;
    } else {
      const from: string[] = [];
      const to: string[] = [];

      if (this.getConnection(tx.from) && ethAmount.gt(0)) {
        from.push(`${ethAmount.toFixed(3)} ETH`);
      }
      if (this.getConnection(tx.to) && ethAmount.gt(0)) {
        to.push(`${ethAmount.toFixed(3)} ETH`);
      }

      tx.erc20Transfers.forEach((transfer) => {
        const erc20Amount = new BigNumber(transfer.value).div(
          new BigNumber(10).pow(transfer.tokenDecimal)
        );

        if (this.getConnection(transfer.from) && erc20Amount.gt(0)) {
          from.push(`${erc20Amount.toFixed(3)} ${transfer.tokenSymbol}`);
        }
        if (this.getConnection(transfer.to) && erc20Amount.gt(0)) {
          to.push(`${erc20Amount.toFixed(3)} ${transfer.tokenSymbol}`);
        }
      });
      // Exchange [3.0 ETH] -> [40 BAT]
      narration = `Exchange ${from} to ${to}`;

      if (this.contractSrcMap[tx.to]) {
        narration += ` on ${this.contractSrcMap[tx.to].ContractName}`;
      }
    }

    return narration;
  }

  async toBeanTx(tx: EthTx): Promise<Transaction> {
    const {
      value,
      erc20Transfers,
      internalTransfers,
      from,
      to,
      timeStamp,
      gasUsed,
      gasPrice,
      hash,
    } = tx;
    const { defaultAccount, rules } = this.config;

    const date = moment(parseInt(timeStamp) * 1000);

    const gas = new BigNumber(gasUsed)
      .multipliedBy(gasPrice)
      .div(decimals)
      .toString();

    const val = new BigNumber(value).div(decimals).toString();

    const narration = await this.getNarration(tx);
    const beanTx = new Transaction({ date, narration });
    const { postings, metadata } = beanTx;
    metadata.tx = hash;
    metadata.from = from;
    metadata.to = to;

    const fromConn = this.getConnection(from);

    // Gas
    if (fromConn) {
      const gasExpense = new Posting({
        account: defaultAccount.ethTx,
        amount: gas,
        symbol: "ETH",
      });
      const ethAccount = new Posting({
        account: `${fromConn.accountPrefix}:ETH`,
        amount: `-${gas}`,
        symbol: "ETH",
        cost: new Cost({ ambiguous: true }),
      });
      postings.push(gasExpense, ethAccount);
    }

    // ERC20 transfer or exchange
    postings.push(...this.getERC20Postings(erc20Transfers));

    // internal transfer
    postings.push(...this.getInternalPostings(internalTransfers));

    // EtH Transfer
    if (val !== "0") {
      postings.push(...this.getETHPostings(from, to, value));
    }

    beanTx.postings.forEach((posting) =>
      patternReplace(posting, beanTx, rules)
    );
    const pnl = new Posting({ account: defaultAccount.pnl });
    beanTx.postings.push(pnl);
    return beanTx;
  }

  async getContractSource(
    txs: EthTx[],
    erc20Transfers: Erc20Transfer[],
    internalTransfers: InternalTx[]
  ): Promise<Record<string, SourceCodeResult>> {
    const contractSrcMap: Record<string, SourceCodeResult> = {};
    const txMap: Record<string, boolean> = {};
    txs.forEach((tx) => {
      txMap[tx.from] = true;
      txMap[tx.to] = true;
    });
    erc20Transfers.forEach((tx) => {
      txMap[tx.from] = true;
      txMap[tx.to] = true;
      txMap[tx.contractAddress] = true;
    });
    internalTransfers.forEach((tx) => {
      txMap[tx.from] = true;
      txMap[tx.to] = true;
    });

    const tasks = Object.keys(txMap).map((address) =>
      this.etherscan.getSourceCode(address)
    );

    const results = await Promise.all(tasks);
    results.forEach((result) => {
      if (
        result.status === "1" &&
        result.result.length > 0 &&
        result.result[0].ContractName !== ""
      ) {
        contractSrcMap[result.address] = result.result[0];
      }
    });
    return contractSrcMap;
  }

  async roastBean(): Promise<string> {
    const { connections } = this.config;
    const ethTxs: Transaction[] = [];
    const ethTxnMap: EthTxMap = {};
    const balances = [];
    for (let i = 0; i < connections.length; i++) {
      const tokensMetadata: TokenMetadataMap = {};
      const conn = connections[i];
      console.log(`Process ${conn.accountPrefix}`);

      if (conn.type === "ethereum") {
        const address = conn.address.toLowerCase();
        const txListRes = await this.etherscan.getTxList(address);
        const tokenRes = await this.etherscan.getErc20TxList(address);
        const txInternalRes = await this.etherscan.getTxListInternal(address);

        // convert to map
        txListRes.result.forEach((tx: EthTx) => {
          if (!ethTxnMap[tx.hash]) {
            ethTxnMap[tx.hash] = tx;
            tx.erc20Transfers = [];
            tx.internalTransfers = [];
          }
        });

        this.contractSrcMap = await this.getContractSource(
          txListRes.result,
          tokenRes.result,
          txInternalRes.result
        );

        const txList = await this.normalizeTransfers(
          ethTxnMap,
          tokenRes.result,
          txInternalRes.result,
          tokensMetadata
        );

        // get last balance
        const lastTx = txList.slice().pop();
        if (lastTx) {
          balances.push(
            ...(await this.getBalances(lastTx, tokensMetadata, conn))
          );
        }
      }
    }

    const txList = [...Object.values(ethTxnMap)].sort(
      (a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp)
    );

    const beanTxs = await Promise.all(txList.map((tx) => this.toBeanTx(tx)));
    ethTxs.push(...beanTxs);

    await this.fillPrices(ethTxs);
    const prices = await this.getLatestPrices();
    const directives = [...ethTxs, ...balances, ...prices];

    return directives.map((dir) => dir.toString()).join("\n\n");
  }

  async parse() {
    const { outputDir } = this.config;

    mkdir("-p", outputDir);
    const beansContent = await this.roastBean();
    this.writeBeanFile(beansContent, outputDir);
  }

  writeBeanFile(content: string, outputDir: string) {
    const filePath = path.join(outputDir, `${CryptoParser.command}.bean`);
    new ShellString(content).to(filePath);
  }
}
