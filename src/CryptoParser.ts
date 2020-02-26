import dotenv from "dotenv";
import fetch from "node-fetch";
import moment from "moment";
import BigNumber from "bignumber.js";
import { ShellString, mkdir } from "shelljs";
import path from "path";
import Bottleneck from "bottleneck";
import { plainToClass } from "class-transformer";
import { Config, DefaultAccount } from "./Config";
import Directive from "./Directive";
import BeanTransaction from "./BeanTransaction";
import { CryptoConfig, Connection } from "./CryptoConfig";
import { EthTx, ERC20Transfer, Etherscan } from "./Etherscan";
import { CoinGecko, HistoryPrice } from "./CoinGecko";

dotenv.config();

const cgcLmt = new Bottleneck({
  maxConcurrent: 1,
  minTime: 600
});

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
  [coinId: string]: Directive[];
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
  }

  getValue(value: string, tokenDecimal: string): string {
    const decimals = new BigNumber(10).pow(new BigNumber(tokenDecimal));
    return new BigNumber(value).div(decimals).toFormat();
  }

  getConnection(addr: string): Connection {
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
  ): Promise<string[]> {
    const { blockNumber, timeStamp } = lastTx;
    const { accountPrefix, address } = conn;
    const balances = [];
    const date = moment(parseInt(timeStamp) * 1000)
      .add(1, "day")
      .format("YYYY-MM-DD");

    const meta = Object.entries(tokensMetadata);
    for (let j = 0; j < meta.length; j++) {
      const [symbol, info] = meta[j];
      const { contractAddress, tokenDecimal } = info;
      const result = await this.etherscan.getTokenBalance(
        contractAddress,
        address,
        blockNumber
      );
      const balance = this.getValue(result, tokenDecimal);
      const account = `${accountPrefix}:${symbol}`;
      balances.push(`${date} balance ${account} ${balance} ${symbol}`);
    }

    return balances;
  }

  async normalizeTransfers(
    txMap: EthTxMap,
    transfers: ERC20Transfer[],
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
          tokenDecimal: transfer.tokenDecimal
        };
      }

      if (!txMap[transfer.hash]) {
        const tx = await this.etherscan.getTransaction(transfer.hash);
        tx.timeStamp = transfer.timeStamp;
        txMap[transfer.hash] = tx;
      }

      const tx = txMap[transfer.hash];
      const duplicated = tx.transfers.some(
        tr =>
          tr.from === transfer.from &&
          tr.to === transfer.to &&
          tr.value === transfer.value
      );

      if (!duplicated) {
        tx.transfers.push(transfer);
      }
    }
  }

  getETHDirectives(from: string, to: string, value: string): Directive[] {
    const { defaultAccount } = this.config;
    const fromConn = this.getConnection(from);
    const toConn = this.getConnection(to);
    const directives = [];

    const fromAccount = this.getAccount(
      fromConn?.accountPrefix,
      "ETH",
      defaultAccount.deposit
    );

    const toAccount = this.getAccount(
      toConn?.accountPrefix,
      "ETH",
      defaultAccount.withdraw
    );

    const toVal = this.getValue(value, "18");
    const fromVal = "-" + toVal;

    directives.push(
      new Directive(fromAccount, fromVal, "ETH"),
      new Directive(toAccount, toVal, "ETH")
    );

    return directives;
  }

  getERC20Driectives(transfers: ERC20Transfer[]) {
    const { defaultAccount } = this.config;
    const dirs = [];
    transfers.forEach(transfer => {
      const { from, to, tokenSymbol, tokenDecimal, value } = transfer;

      const fromConn = this.getConnection(from);
      const toConn = this.getConnection(to);

      const fromAccount = this.getAccount(
        fromConn?.accountPrefix,
        tokenSymbol,
        defaultAccount.deposit
      );

      const toAccount = this.getAccount(
        toConn?.accountPrefix,
        tokenSymbol,
        defaultAccount.withdraw
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
        dirs.push(new Directive(fromAccount, `-${amount}`, tokenSymbol));
      }
      if ((toConn || transfers.length <= 1) && value !== "0") {
        dirs.push(new Directive(toAccount, amount, tokenSymbol));
      }
    });

    return dirs;
  }

  patternReplace(dir: Directive) {
    const { rules } = this.config;
    rules.forEach(rule => {
      const matched = Object.entries(rule.pattern).some(
        ([key, value]) => dir[key] === value
      );

      if (matched) {
        rule.transform.forEach(({ field, value }) => {
          if (field === "symbol") {
            const regex = new RegExp(`${dir.symbol}$`);
            dir.account = dir.account.replace(regex, value);
          }

          dir[field] = value;
        });
      }
    });
  }

  getDateCoinMap(beans: BeanTransaction[]): DateCoinMap {
    const map: DateCoinMap = {};

    beans.forEach(bean => {
      if (!map[bean.date]) {
        map[bean.date] = {};
      }

      const coinsMap = map[bean.date];

      bean.directives.forEach(d => {
        const coin = this.config.coins.find(c => c.symbol === d.symbol);
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

  async fillPrices(beans: BeanTransaction[]) {
    const { fiat } = this.config;
    const map = this.getDateCoinMap(beans);
    const tasks: Promise<HistoryPrice>[] = [];

    Object.entries(map).forEach(([date, coinsMap]) => {
      Object.keys(coinsMap).forEach(id => {
        tasks.push(this.coingecko.getHistoryPrice(date, id));
      });
    });
    const results = await Promise.all(tasks);
    results.forEach((result: HistoryPrice) => {
      const { date, id, symbol, error } = result;
      if (error) {
        console.error(`cannot find ${id} at ${date}`);
        return;
      }
      map[date][id].forEach(dir => {
        if (!result.market_data) {
          console.error(
            `unexpected result: ${JSON.stringify(result, null, 2)}`
          );
          return;
        }
        if (dir.amount[0] !== "-" && dir.symbol === symbol.toUpperCase()) {
          dir.cost = `${
            result.market_data.current_price[fiat.toLowerCase()]
          } ${fiat}`;
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
      from,
      to,
      timeStamp,
      gasUsed,
      gasPrice,
      hash
    } = tx;
    const { connections, defaultAccount } = this.config;

    const date = moment(parseInt(timeStamp) * 1000).format("YYYY-MM-DD");

    const gas = new BigNumber(gasUsed)
      .multipliedBy(gasPrice)
      .div(decimals)
      .toString();

    const val = new BigNumber(value).div(decimals).toString();

    const narration = this.getNarration(tx);
    const beanTx = new BeanTransaction(date, "*", "", narration);
    const { directives, metadata } = beanTx;
    metadata["tx"] = hash;

    const fromConn = this.getConnection(from);

    if (fromConn) {
      directives.push(
        new Directive(defaultAccount.ethTx, gas, "ETH"),
        new Directive(`${fromConn.accountPrefix}:ETH`, `-${gas}`, "ETH")
      );
    }

    // ERC20 transfer or exchange
    if (transfers) {
      const dirs = this.getERC20Driectives(transfers);
      directives.push(...dirs);
    }

    // EtH Transfer
    if (val !== "0") {
      const dirs = this.getETHDirectives(from, to, value);
      directives.push(...dirs);
    }

    beanTx.directives.forEach(dir => this.patternReplace(dir));
    return beanTx;
  }

  async roasteBean(): Promise<string> {
    const { connections } = this.config;
    const beanTxns: BeanTransaction[] = [];
    const ethTxnMap: EthTxMap = {};
    const balances = [];
    for (let i = 0; i < connections.length; i++) {
      const tokensMetadata: TokenMetadataMap = {};
      const conn = connections[i];
      console.log(`Process ${conn.accountPrefix}`);

      if (conn.type === "ethereum") {
        const address = conn.address.toLowerCase();
        const txlistRes: any = await this.etherscan.getTxList(address);
        const tokenRes: any = await this.etherscan.getErc20TxList(address);

        // convert to map
        txlistRes.result.forEach(tx => {
          if (!ethTxnMap[tx.hash]) {
            ethTxnMap[tx.hash] = tx;
            tx.transfers = [];
          }
        });

        await this.normalizeTransfers(
          ethTxnMap,
          tokenRes.result,
          tokensMetadata
        );

        // get last balance
        const lastTx = [tokenRes, txlistRes]
          .map(res => res.result.slice().pop())
          .sort((a, b) => parseInt(a.blockNumber) - parseInt(b.blockNumber))
          .pop();

        balances.push(
          ...(await this.getBalances(lastTx, tokensMetadata, conn))
        );
      }
    }

    const txlist = [...Object.values(ethTxnMap)].sort(
      (a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp)
    );

    beanTxns.push(...txlist.map(tx => this.toBeanTx(tx)));

    await this.fillPrices(beanTxns);
    return (
      beanTxns.map(t => t.toString()).join("\n\n") +
      "\n\n" +
      balances.join("\n")
    );
  }

  async parse() {
    const { outputDir } = this.config;

    mkdir("-p", outputDir);
    const beansContent = await this.roasteBean();
    this.writeBeanFile(beansContent, outputDir);
  }

  writeBeanFile(content: string, outputDir: string) {
    const filepath = path.join(outputDir, `${CryptoParser.command}.bean`);
    new ShellString(content).to(filepath);
  }
}
