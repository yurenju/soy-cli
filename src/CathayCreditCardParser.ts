import { readFileSync } from "fs";
import { ShellString, mkdir } from "shelljs";
import path, { basename } from "path";
import * as iconv from "iconv-lite";
import moment from "moment";
import { Config } from "./config/Config";
import { plainToClass } from "class-transformer";
import BeanTransaction from "./BeanTransaction";
import Directive from "./Directive";
import { parseROCDate, patternReplace } from "./Common";
import { CreditCardBill, CreditCardTransaction } from "./CreditCardBill";
import Errors from "./Errors";
import CathayCreditCardConfig from "./config/CathayCreditCardConfig";

const BillColumns = {
  currency: [5, 0],
  previousBalance: [5, 1],
  previousPayment: [5, 2],
  newBalance: [5, 3],
  minimumDue: [5, 8]
};

const TxColumns = {
  transactionDate: 0,
  postingDate: 1,
  description: 2,
  amount: 3,
  country: 6,
  foreignCurrency: 7,
  foreignAmount: 8,
  exchangeDate: 9
};

const TxStartLine = 22;

function getColumn(table: string[][], pos: number[]) {
  return table[pos[0]][pos[1]].trim();
}

export class CathayCreditCardParser {
  config: CathayCreditCardConfig;
  basename: string;

  static command = "cathay-credit-card";
  static options = [
    "-c, --config <config-file>",
    "-i, --input-file <input-csv-file>"
  ];

  constructor(options: any) {
    const config = plainToClass(
      CathayCreditCardConfig,
      Config.parse(options.config)
    );
    config.inputFile = options.inputFile;
    config.outputDir = process.cwd();

    this.config = config;
    this.basename = basename(config.inputFile, ".csv");
  }

  parse() {
    const { inputFile, outputDir, encoding } = this.config;

    const originContent = readFileSync(inputFile);
    const encodedContent = iconv.decode(originContent, encoding);

    mkdir("-p", outputDir);
    this.writeEncodedCSV(encodedContent, outputDir);
    const parsed = this.parseCSV(encodedContent);
    const beansContent = this.roastBeans(parsed);
    this.writeBeanFile(beansContent, outputDir);
  }

  writeEncodedCSV(content: string, outputDir: string) {
    const filepath = path.join(outputDir, `${this.basename}.csv`);
    new ShellString(content).to(filepath);
  }

  writeBeanFile(content: string, outputDir: string) {
    const filepath = path.join(outputDir, `${this.basename}.bean`);
    new ShellString(content).to(filepath);
  }

  parseTxs(csv: string[][]): CreditCardTransaction[] {
    const txs: CreditCardTransaction[] = [];

    const endLine = csv.findIndex(
      line => line[TxColumns.description] === "正卡本期消費"
    );

    if (endLine === -1) {
      throw new Error(Errors.EndLineNotFound);
    }

    const year = moment().year();
    csv.slice(TxStartLine, endLine).forEach(line => {
      if (!line[TxColumns.transactionDate]) {
        return;
      }

      const transactionDate = moment(
        `${year}/${line[TxColumns.transactionDate]}`,
        "YYYY/MM/DD"
      );
      const postingDate = moment(line[TxColumns.postingDate], "YYYYMMDD");
      const description = line[TxColumns.description];
      const amount = Number.parseInt(line[TxColumns.amount]);

      const tx: CreditCardTransaction = {
        transactionDate,
        postingDate,
        description,
        amount
      };

      if (line[TxColumns.country]) {
        tx.country = line[TxColumns.country];
      }
      if (line[TxColumns.foreignCurrency]) {
        tx.foreignCurrency = line[TxColumns.foreignCurrency];
      }
      if (line[TxColumns.foreignAmount]) {
        tx.foreignAmount = Number.parseInt(line[TxColumns.foreignAmount]);
      }
      if (line[TxColumns.exchangeDate]) {
        tx.exchangeDate = moment(line[TxColumns.exchangeDate], "YYYYMMDD");
      }

      txs.push(tx);
    });

    return txs;
  }

  parseCSV(content: string): CreditCardBill {
    const table = content
      .split("\n")
      .map(line => line.split(",").map(col => col.trim()));
    const matched = table[1][0].match(
      /帳單結帳日：([\d\/]+)\s*繳款截止日（遇假日順延）：([\d\/]+)\/請儘速繳款/
    );
    const closingDate = parseROCDate(matched[1]);
    const paymentDueDate = parseROCDate(matched[2]);
    const currency = getColumn(table, BillColumns.currency);
    const newBalance = Number.parseInt(
      getColumn(table, BillColumns.newBalance)
    );
    const minimumDue = Number.parseInt(
      getColumn(table, BillColumns.minimumDue)
    );
    const previousBalance = Number.parseInt(
      getColumn(table, BillColumns.previousBalance)
    );
    const previousPayment = Number.parseInt(
      getColumn(table, BillColumns.previousPayment)
    );
    const bill: CreditCardBill = {
      closingDate,
      paymentDueDate,
      currency,
      newBalance,
      minimumDue,
      previousBalance,
      previousPayment,
      transactions: this.parseTxs(table)
    };

    return bill;
  }

  fillTxMetadata(beanTx: BeanTransaction, tx: CreditCardTransaction) {
    const fields = [
      "postingDate",
      "country",
      "foreignCurrency",
      "foreignAmount",
      "exchangeDate"
    ];
    fields.forEach(field => {
      const value = tx[field];
      if (value) {
        if (moment.isMoment(value)) {
          beanTx.metadata[field] = value.format("YYYY-MM-DD");
        } else if (value.toString) {
          beanTx.metadata[field] = value.toString();
        } else if (typeof value === "string") {
          beanTx.metadata[field] = value;
        } else {
          throw new Error(Errors.UnrecognizedType);
        }
      }
    });
  }

  roastBeans(bill: CreditCardBill): string {
    const beanTxs: BeanTransaction[] = bill.transactions.map(tx => {
      const txDate = tx.transactionDate.format("YYYY-MM-DD");
      const beanTx = new BeanTransaction(txDate, "*", "", tx.description);
      const metadata = {
        source: "credit-card-bill"
      };
      beanTx.metadata = metadata;
      this.fillTxMetadata(beanTx, tx);

      if (this.config.einvoiceIntegration) {
        //TBD
      } else {
        const expense = new Directive(
          this.config.defaultAccount.expenses,
          tx.amount.toString(),
          "TWD"
        );
        const baseAccount = new Directive(this.config.defaultAccount.base);
        beanTx.directives.push(expense, baseAccount);
      }

      return beanTx;
    });

    beanTxs.forEach(tx =>
      tx.directives.forEach(dir => patternReplace(dir, tx, this.config.rules))
    );

    return beanTxs.map(tx => tx.toString()).join("\n\n");
  }
}
