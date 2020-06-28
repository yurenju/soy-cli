import dotenv from "dotenv";
import moment from "moment";
import BigNumber from "bignumber.js";
import { ShellString, mkdir } from "shelljs";
import path from "path";
import { plainToClass } from "class-transformer";
import { Config, PatternType } from "./config/Config";
import { Posting } from "./models/Posting";
import { Transaction } from "./models/Transaction";
import { CryptoConfig, Connection } from "./config/CryptoConfig";
import { EthTx, ERC20Transfer, Etherscan } from "./services/Etherscan";
import { CoinGecko, HistoryPrice } from "./services/CoinGecko";
import { postingTransform, patternReplace } from "./Common";
import { DATE_FORMAT, Balance } from "./models";

dotenv.config();

const decimals = new BigNumber(10).pow(18);

export interface TokenMetadata {
  contractAddress: string;
  tokenDecimal: string;
}

export interface TokenMetadataMap {
  [symbol: string]: TokenMetadata;
}

interface EthTxMap {
  [hash: string]: EthTx;
}

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
    transfers: ERC20Transfer[],
    internalTransfers: EthTx[],
    tokensMetadata: TokenMetadataMap
  ): Promise<void> {
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
      const duplicated = tx.transfers.some(
        (tr) =>
          tr.from === transfer.from &&
          tr.to === transfer.to &&
          tr.value === transfer.value
      );

      if (!duplicated) {
        tx.transfers.push(transfer);
      }
    }

    internalTransfers.forEach((transfer) => {
      const tx = txMap[transfer.hash];
      tx.internalTransfers.push(transfer);
    });
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

  getInternalPostings(transfers: EthTx[]) {
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

  getERC20Postings(transfers: ERC20Transfer[]) {
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
        });
        pos.ambiguousPrice = false;
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
          posting.cost = {
            amount: result.market_data.current_price[
              fiat.toLowerCase()
            ].toString(),
            symbol: fiat,
          };
        }
      });
    });
  }

  getNarration(tx: EthTx): string {
    let narration = "";
    if (tx.transfers.length === 0) {
      if (tx.value === "0") {
        narration = "Contract Execution";
      } else {
        narration = "ETH Transfer";
      }
    } else if (tx.transfers.length <= 1) {
      narration = "ERC20 Transfer";
    } else {
      narration = "ERC20 Exchange";
    }

    return narration;
  }

  toBeanTx(tx: EthTx) {
    const {
      value,
      transfers,
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

    const narration = this.getNarration(tx);
    const beanTx = new Transaction({ date, narration });
    const { postings: postings, metadata } = beanTx;
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
      });
      ethAccount.ambiguousPrice = false;
      postings.push(gasExpense, ethAccount);
    }

    // ERC20 transfer or exchange
    postings.push(...this.getERC20Postings(transfers));

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

  async roastBean(): Promise<string> {
    const { connections } = this.config;
    const beanTxs: Transaction[] = [];
    const ethTxnMap: EthTxMap = {};
    const balances = [];
    for (let i = 0; i < connections.length; i++) {
      const tokensMetadata: TokenMetadataMap = {};
      const conn = connections[i];
      console.log(`Process ${conn.accountPrefix}`);

      if (conn.type === "ethereum") {
        const address = conn.address.toLowerCase();
        const txListRes: any = await this.etherscan.getTxList(address);
        const tokenRes: any = await this.etherscan.getErc20TxList(address);
        const txInternalRes: any = await this.etherscan.getTxListInternal(
          address
        );

        // convert to map
        txListRes.result.forEach((tx: any) => {
          if (!ethTxnMap[tx.hash]) {
            ethTxnMap[tx.hash] = tx;
            tx.transfers = [];
            tx.internalTransfers = [];
          }
        });

        await this.normalizeTransfers(
          ethTxnMap,
          tokenRes.result,
          txInternalRes.result,
          tokensMetadata
        );

        // get last balance
        const lastTx = [tokenRes, txListRes]
          .map((res) => res.result.slice().pop())
          .sort((a, b) => parseInt(a.blockNumber) - parseInt(b.blockNumber))
          .pop();

        balances.push(
          ...(await this.getBalances(lastTx, tokensMetadata, conn))
        );
      }
    }

    const txList = [...Object.values(ethTxnMap)].sort(
      (a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp)
    );

    beanTxs.push(...txList.map((tx) => this.toBeanTx(tx)));

    await this.fillPrices(beanTxs);
    const directives = [...beanTxs, ...balances];

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
