import dotenv from "dotenv";
import moment from "moment";
import BigNumber from "bignumber.js";
import { ShellString, mkdir } from "shelljs";
import path from "path";
import { plainToClass } from "class-transformer";
import { Config, PatternType } from "./config/Config";
import Directive from "./Directive";
import BeanTransaction from "./BeanTransaction";
import { CryptoConfig, Connection } from "./config/CryptoConfig";
import { EthTx, ERC20Transfer, Etherscan } from "./services/Etherscan";
import { CoinGecko, HistoryPrice } from "./services/CoinGecko";
import { directiveTransform, patternReplace } from "./Common";

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

    if (!this.config.excludeCoins) {
      this.config.excludeCoins = [];
    }
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
    const { excludeCoins, rules } = this.config;
    const { blockNumber, timeStamp } = lastTx;
    const { accountPrefix, address } = conn;
    const balances = [];
    const date = moment(parseInt(timeStamp) * 1000)
      .add(1, "day")
      .format("YYYY-MM-DD");

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
      const data = { date, account, balance, symbol };

      rules.forEach((rule) =>
        rule.pattern.forEach(({ type, query: field, value }) => {
          if (type === PatternType.Balance && data[field] === value) {
            rule.transform.forEach(({ query: field, value }) =>
              directiveTransform(data, field, value)
            );
          }
        })
      );

      balances.push(
        `${data.date} balance ${data.account} ${data.balance} ${data.symbol}`
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

  getETHDirectives(from: string, to: string, value: string): Directive[] {
    const { defaultAccount } = this.config;
    const fromConn = this.getConnection(from);
    const toConn = this.getConnection(to);
    const directives = [];

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

    directives.push(
      new Directive(fromAccount, fromVal, "ETH"),
      new Directive(toAccount, toVal, "ETH")
    );

    return directives;
  }

  getInternalDirectives(transfers: EthTx[]) {
    const { defaultAccount } = this.config;
    const dirs = [];
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
        dirs.push(new Directive(fromAccount, `-${amount}`, "ETH"));
      }
      if ((toConn || transfers.length <= 1) && value !== "0") {
        dirs.push(new Directive(toAccount, amount, "ETH"));
      }
    });

    return dirs;
  }

  getERC20Directives(transfers: ERC20Transfer[]) {
    const { defaultAccount, excludeCoins } = this.config;
    const dirs = [];
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
        const dir = new Directive(fromAccount, `-${amount}`, tokenSymbol);
        dir.ambiguousPrice = false;
        dir.metadata.address = from;
        dirs.push(dir);
      }
      if ((toConn || transfers.length <= 1) && value !== "0") {
        const dir = new Directive(toAccount, amount, tokenSymbol);
        dir.metadata.address = to;
        dirs.push(dir);
      }
    });

    return dirs;
  }

  getDateCoinMap(beans: BeanTransaction[]): DateCoinMap {
    const map: DateCoinMap = {};

    beans.forEach((bean) => {
      if (!map[bean.date]) {
        map[bean.date] = {};
      }

      const coinsMap = map[bean.date];

      bean.directives.forEach((d) => {
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

  async fillPrices(beans: BeanTransaction[]) {
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
      map[date][id].forEach((dir) => {
        if (!result.market_data) {
          console.error(
            `unexpected result: ${JSON.stringify(result, null, 2)}`
          );
          return;
        }
        if (dir.amount[0] !== "-" || dir.account.match(/^Income:/)) {
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
      internalTransfers,
      from,
      to,
      timeStamp,
      gasUsed,
      gasPrice,
      hash,
    } = tx;
    const { defaultAccount, rules } = this.config;

    const date = moment(parseInt(timeStamp) * 1000).format("YYYY-MM-DD");

    const gas = new BigNumber(gasUsed)
      .multipliedBy(gasPrice)
      .div(decimals)
      .toString();

    const val = new BigNumber(value).div(decimals).toString();

    const narration = this.getNarration(tx);
    const beanTx = new BeanTransaction(date, "*", "", narration);
    const { directives, metadata } = beanTx;
    metadata.tx = hash;
    metadata.from = from;
    metadata.to = to;

    const fromConn = this.getConnection(from);

    // Gas
    if (fromConn) {
      const gasExpense = new Directive(defaultAccount.ethTx, gas, "ETH");
      const ethAccount = new Directive(
        `${fromConn.accountPrefix}:ETH`,
        `-${gas}`,
        "ETH"
      );
      ethAccount.ambiguousPrice = false;
      directives.push(gasExpense, ethAccount);
    }

    // ERC20 transfer or exchange
    const dirs = this.getERC20Directives(transfers);
    directives.push(...dirs);

    // internal transfer
    directives.push(...this.getInternalDirectives(internalTransfers));

    // EtH Transfer
    if (val !== "0") {
      const dirs = this.getETHDirectives(from, to, value);
      directives.push(...dirs);
    }

    beanTx.directives.forEach((dir) => patternReplace(dir, beanTx, rules));
    const pnl = new Directive(defaultAccount.pnl);
    beanTx.directives.push(pnl);
    return beanTx;
  }

  async roastBean(): Promise<string> {
    const { connections } = this.config;
    const beanTxs: BeanTransaction[] = [];
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
        txListRes.result.forEach((tx) => {
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
    return (
      beanTxs.map((t) => t.toString()).join("\n\n") +
      "\n\n" +
      balances.join("\n")
    );
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
