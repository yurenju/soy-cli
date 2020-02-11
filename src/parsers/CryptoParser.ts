import dotenv from "dotenv";
import fetch from "node-fetch";
import moment from "moment";
import BigNumber from "bignumber.js";
import { ShellString, mkdir } from "shelljs";
import path from "path";
import Bottleneck from "bottleneck";
import { Config } from "../Config";

dotenv.config();

const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 200
});

const decimals = new BigNumber(10).pow(18);

class BeanTransaction {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  attributes: { [key: string]: string };
  directives: Directive[];

  constructor(
    date = moment().format("YYYY-MM-DD"),
    flag = "*",
    payee = "",
    narration = "",
    directives = [],
    attributes = {}
  ) {
    this.date = date;
    this.flag = flag;
    this.payee = payee;
    this.narration = narration;
    this.directives = directives;
    this.attributes = attributes;
  }

  toString() {
    const { date, flag, payee, narration, directives, attributes } = this;
    const lines = [];
    const firstArr = [date, flag];
    if (payee) {
      firstArr.push(`"${payee}"`);
    }
    if (narration) {
      firstArr.push(`"${narration}"`);
    }
    const attrsLines = Object.entries(attributes).map(
      ([key, value]) => `  ${key}: "${value}"`
    );

    lines.push(firstArr.join(" "));
    lines.push(...attrsLines);
    lines.push(...directives.map(d => d.toString()));

    return lines.join("\n");
  }
}

class Directive {
  account: string;
  amount: string;
  cost: string;
  price: string;

  constructor(account = "", amount = "", cost = "", price = "") {
    this.account = account;
    this.amount = amount;
    this.cost = cost;
    this.price = price;
  }

  toString() {
    const { account, amount, cost, price } = this;
    const strArr = [account, amount];
    if (cost) {
      strArr.push(`{${cost}}`);
    }
    if (price) {
      strArr.push(`@ ${price}`);
    }

    return "  " + strArr.join(" ");
  }
}

enum EthTxType {
  EthTransfer = "ETH Transfer",
  ERC20Transfer = "ERC20 Transfer",
  ERC20Exchange = "ERC20 Exchange",
  ContractExecution = "Contract Execution"
}

export class CryptoParser {
  config: Config;

  static command = "crypto";
  static options = ["-c, --config <config-file>"];
  static envs = ["ETHERSCAN_API_KEY"];

  constructor(options: any) {
    this.config = Config.parse(options.config);
    this.config["outputDir"] = process.cwd();
  }

  getValue(value: string, tokenDecimal: string): string {
    const decimals = new BigNumber(10).pow(new BigNumber(tokenDecimal));
    return new BigNumber(value).div(decimals).toFormat();
  }

  getConnection(addr: string, conns: any[]) {
    for (let i = 0; i < conns.length; i++) {
      if (conns[i].address.toLowerCase() === addr) {
        return conns[i];
      }
    }

    return null;
  }

  getDirective(
    sign: string,
    value: string,
    tokenDecimal: string,
    conn: any,
    tokenSymbol: string,
    defaultAccount: string
  ) {
    const val = this.getValue(value, tokenDecimal);
    const account = conn
      ? `${conn.accountPrefix}:${tokenSymbol}`
      : defaultAccount;
    const amount = `${sign}${val} ${tokenSymbol}`;
    return new Directive(account, amount);
  }

  async getTransaction(hash: string) {
    const apikey = process.env.ETHERSCAN_API_KEY;
    const txurl = `${ETHERSCAN_BASE_URL}?module=proxy&action=eth_getTransactionByHash&txhash=${hash}&apikey=${apikey}`;
    const receipturl = `${ETHERSCAN_BASE_URL}?module=proxy&action=eth_getTransactionReceipt&txhash=${hash}&apikey=${apikey}`;
    const { result: txResult } = await limiter.schedule(() =>
      fetch(txurl).then(res => res.json())
    );
    const { result: receiptResult } = await limiter.schedule(() =>
      fetch(receipturl).then(res => res.json())
    );
    return {
      from: txResult.from,
      to: txResult.to,
      gasUsed: new BigNumber(receiptResult.gasUsed).toString(),
      gasPrice: new BigNumber(txResult.getPrice).toString(),
      hash: txResult.hash,
      value: new BigNumber(txResult.value).toString(),
      timeStamp: "",
      transfers: []
    };
  }

  getERC20Driectives(transfers: any[], conns: any[], defaultAccount: any) {
    const dirs = [];
    transfers.forEach(transfer => {
      const { from, to, tokenSymbol, tokenDecimal, value } = transfer;

      const fromConn = this.getConnection(from, conns);
      const toConn = this.getConnection(to, conns);

      // filter default account if there are more than 1 transfer
      // merged from:
      //   Assets:Crypto:Wallet:SAI -20 SAI
      //   Expenses:Unknown 20 SAI
      //   Income:Unknown -100 CSAI
      //   Assets:Crypto:Wallet:CSAI 100 CSAI
      // to:
      //   Assets:Crypto:Wallet:SAI -20 SAI
      //   Assets:Crypto:Wallet:CSAI 100 CSAI
      if (fromConn || transfers.length <= 1) {
        dirs.push(
          this.getDirective(
            "-",
            value,
            tokenDecimal,
            fromConn,
            tokenSymbol,
            defaultAccount.deposit
          )
        );
      }
      if (toConn || transfers.length <= 1) {
        dirs.push(
          this.getDirective(
            "",
            value,
            tokenDecimal,
            toConn,
            tokenSymbol,
            defaultAccount.withdraw
          )
        );
      }
    });

    return dirs;
  }

  async roasteBean(): Promise<string> {
    const { connections, defaultAccount } = this.config;
    const beanTxns = [];
    const ethTxnMap: { [hash: string]: any } = {};
    const apikey = process.env.ETHERSCAN_API_KEY;
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];

      if (conn.type === "ethereum") {
        const address = conn.address.toLowerCase();
        const txlistUrl = `${ETHERSCAN_BASE_URL}?module=account&action=txlist&address=${address}&apikey=${apikey}`;
        const tokentxUrl = `${ETHERSCAN_BASE_URL}?module=account&action=tokentx&address=${address}&apikey=${apikey}`;
        const txlistRes: any = await limiter.schedule(() =>
          fetch(txlistUrl).then(res => res.json())
        );
        const tokenRes: any = await limiter.schedule(() =>
          fetch(tokentxUrl).then(res => res.json())
        );

        txlistRes.result.forEach(tx => {
          if (!ethTxnMap[tx.hash]) {
            ethTxnMap[tx.hash] = tx;
            tx.transfers = [];
            tx.type =
              tx.value === "0"
                ? EthTxType.ContractExecution
                : EthTxType.EthTransfer;
          } else {
            ethTxnMap[tx.hash].value = tx.value;
          }
        });

        tokenRes.result.forEach(async transfer => {
          transfer.from = transfer.from.toLowerCase();
          transfer.tokenSymbol = transfer.tokenSymbol
            .toUpperCase()
            .replace(/[^\w]/, "");

          if (!ethTxnMap[transfer.hash]) {
            const tx = await this.getTransaction(transfer.hash);
            tx.timeStamp = transfer.timeStamp;
            ethTxnMap[transfer.hash] = tx;
          }

          const tx = ethTxnMap[transfer.hash];
          const duplicated = tx.transfers.some(
            tr =>
              tr.from === transfer.from &&
              tr.to === transfer.to &&
              tr.value === transfer.value
          );

          if (!duplicated) {
            tx.transfers.push(transfer);
            tx.type =
              tx.transfers.length <= 1
                ? EthTxType.ERC20Transfer
                : EthTxType.ERC20Exchange;
          }
        });
      }
    }

    const txlist = [...Object.values(ethTxnMap)].sort(
      (a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp)
    );

    txlist.forEach(tx => {
      const {
        value,
        transfers,
        from,
        to,
        timeStamp,
        gasUsed,
        gasPrice,
        hash,
        type
      } = tx;

      const date = moment(parseInt(timeStamp) * 1000).format("YYYY-MM-DD");

      const gas = new BigNumber(gasUsed)
        .multipliedBy(gasPrice)
        .div(decimals)
        .toString();

      const val = new BigNumber(value).div(decimals).toString();

      const narration = type;
      const beanTx = new BeanTransaction(date, "*", "", narration);
      const { directives, attributes } = beanTx;
      attributes["tx"] = hash;

      const fromConn = this.getConnection(from, connections);

      if (fromConn) {
        directives.push(
          new Directive(defaultAccount.ethTx, `${gas} ETH`),
          new Directive(`${fromConn.accountPrefix}:ETH`, `-${gas} ETH`)
        );
      }

      // ERC20 transfer or exchange
      if (transfers) {
        const dirs = this.getERC20Driectives(
          transfers,
          connections,
          defaultAccount
        );
        directives.push(...dirs);
      }
      if (val !== "0") {
        const fromConn = this.getConnection(from, connections);
        const toConn = this.getConnection(to, connections);

        directives.push(
          this.getDirective(
            "-",
            value,
            "18",
            fromConn,
            "ETH",
            defaultAccount.deposit
          )
        );

        directives.push(
          this.getDirective(
            "",
            value,
            "18",
            toConn,
            "ETH",
            defaultAccount.withdraw
          )
        );
      }
      beanTxns.push(beanTx);
    });

    return beanTxns.map(t => t.toString()).join("\n\n");
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
