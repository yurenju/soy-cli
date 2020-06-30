import { readFileSync } from "fs";
import { ShellString, mkdir } from "shelljs";
import path, { basename } from "path";
import * as iconv from "iconv-lite";
import moment from "moment";
import { Config } from "./config/Config";
import { plainToClass } from "@marcj/marshal";
import { Transaction } from "./models/Transaction";
import { Posting } from "./models/Posting";
import { parseROCDate, patternReplace } from "./Common";
import { CreditCardBill, CreditCardTransaction } from "./CreditCardBill";
import Errors from "./Errors";
import CathayCreditCardConfig from "./config/CathayCreditCardConfig";
import { EInvoiceService, Invoice, InvDate } from "./EInvoiceService";

const BillColumns = {
  currency: [5, 0],
  previousBalance: [5, 1],
  previousPayment: [5, 2],
  newBalance: [5, 3],
  minimumDue: [5, 8],
};

const TxColumns = {
  transactionDate: 0,
  postingDate: 1,
  description: 2,
  amount: 3,
  country: 6,
  foreignCurrency: 7,
  foreignAmount: 8,
  exchangeDate: 9,
};

const TxStartLine = 22;

function getColumn(table: string[][], pos: number[]) {
  return table[pos[0]][pos[1]].trim();
}

function getMoment(invDate: InvDate): moment.Moment {
  return moment({
    year: invDate.year + 1911,
    month: invDate.month - 1,
    date: invDate.date,
  });
}

export class CathayCreditCardParser {
  config: CathayCreditCardConfig;
  basename: string;

  static command = "cathay-credit-card";
  static options = [
    "-c, --config <config-file>",
    "-i, --input-file <input-csv-file>",
  ];
  static envs = [
    "EINVOICE_APP_ID",
    "EINVOICE_API_KEY",
    "EINVOICE_UUID",
    "EINVOICE_CARD_ID",
    "EINVOICE_CARD_KEY",
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

  async parse() {
    const { inputFile, outputDir, encoding } = this.config;

    const originContent = readFileSync(inputFile);
    const encodedContent = iconv.decode(originContent, encoding);

    mkdir("-p", outputDir);
    this.writeEncodedCSV(encodedContent, outputDir);
    const parsed = this.parseCSV(encodedContent);
    const beansContent = await this.roastBeans(parsed);
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
      (line) => line[TxColumns.description] === "正卡本期消費"
    );

    if (endLine === -1) {
      throw new Error(Errors.EndLineNotFound);
    }

    const year = moment().year();
    csv.slice(TxStartLine, endLine).forEach((line) => {
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
        amount,
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
      .map((line) => line.split(",").map((col) => col.trim()));
    const matched = table[1][0].match(
      /帳單結帳日：([\d\/]+)\s*繳款截止日（遇假日順延）：([\d\/]+)\/請儘速繳款/
    );
    const closingDate = matched ? parseROCDate(matched[1]) : moment();
    const paymentDueDate = matched ? parseROCDate(matched[2]) : moment();
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
      transactions: this.parseTxs(table),
    };

    return bill;
  }

  fillTxMetadata(beanTx: Transaction, tx: CreditCardTransaction) {
    const fields = [
      "postingDate",
      "country",
      "foreignCurrency",
      "foreignAmount",
      "exchangeDate",
    ];
    fields.forEach((field) => {
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
  async getInvoices(
    bill: CreditCardBill,
    invoiceService: EInvoiceService
  ): Promise<Invoice[]> {
    const prevMonth = bill.closingDate.clone().subtract(1, "month");

    const queryRange = [
      prevMonth.clone().startOf("month"),
      prevMonth.clone().endOf("month"),
      bill.closingDate.clone().startOf("month"),
      bill.closingDate.clone().endOf("month"),
    ].map((date) => date.format("YYYY/MM/DD"));

    const prevInvoices = (
      await invoiceService.getInvoiceList(queryRange[0], queryRange[1])
    ).details;
    const currInvoices = (
      await invoiceService.getInvoiceList(queryRange[2], queryRange[3])
    ).details;

    return [...prevInvoices, ...currInvoices];
  }

  getDefaultExpenses(tx: CreditCardTransaction) {
    const expense = new Posting({
      account: this.config.defaultAccount.expenses,
      amount: tx.amount.toString(),
      symbol: "TWD",
    });
    const baseAccount = new Posting({
      account: this.config.defaultAccount.base,
    });
    return [expense, baseAccount];
  }

  async roastBeans(bill: CreditCardBill): Promise<string> {
    let invoiceService: EInvoiceService | null = null;

    const txMetadataFields = [
      "invNum",
      "sellerName",
      "sellerAddress",
      "sellerBan",
      "invoiceTime",
    ];
    const postingMetadataFields = ["description", "quantity", "unitPrice"];

    if (this.config.einvoiceIntegration) {
      const satisfied = CathayCreditCardParser.envs.every(
        (key) => process.env[key]
      );
      if (!satisfied) {
        throw new Error(Errors.RequiredEnvsNotSatisfied);
      }

      invoiceService = new EInvoiceService(
        process.env.EINVOICE_APP_ID || "",
        process.env.EINVOICE_API_KEY || "",
        process.env.EINVOICE_UUID || "",
        process.env.EINVOICE_CARD_ID || "",
        process.env.EINVOICE_CARD_KEY || ""
      );
    }

    const invoiceMap: { [key: string]: Invoice } = {};
    const invoices = invoiceService
      ? await this.getInvoices(bill, invoiceService)
      : [];

    invoices.forEach((invoice) => {
      const date = getMoment(invoice.invDate);
      const key = `${date.format("YYYY-MM-DD")}:${invoice.amount}`;
      invoiceMap[key] = invoice;
    });

    const beanTxs: Transaction[] = [];

    for (let i = 0; i < bill.transactions.length; i++) {
      const tx = bill.transactions[i];
      const txDate = tx.transactionDate.format("YYYY-MM-DD");
      const beanTx = new Transaction({
        date: tx.transactionDate,
        narration: tx.description,
      });
      beanTx.metadata["source"] = "credit-card-bill";
      this.fillTxMetadata(beanTx, tx);

      const key = `${beanTx.date}:${tx.amount}`;
      const invoice = invoiceMap[key];

      if (invoice) {
        const date = getMoment(invoice.invDate);
        const detail = await invoiceService?.getInvoiceDetail(
          invoice.invNum,
          date.format("YYYY/MM/DD"),
          invoice.amount
        );

        if (detail?.code === 200) {
          beanTx.metadata["source"] = "invoice";
          txMetadataFields.forEach((field) => {
            beanTx.metadata[field] = detail[field];
          });

          const postings: Posting[] = detail.details.map((detail) => {
            const posting = new Posting({
              account: this.config.defaultAccount.expenses,
              amount: detail.amount,
              symbol: "TWD",
            });
            postingMetadataFields.forEach((field) => {
              posting.metadata[field] = detail[field];
            });

            return posting;
          });
          const baseAccount = new Posting({
            account: this.config.defaultAccount.base,
          });
          beanTx.postings.push(...postings, baseAccount);
        } else {
          const params = [
            invoice.invNum,
            date.format("YYYY/MM/DD"),
            invoice.amount,
          ]
            .join(",")
            .replace('"', "");
          beanTx.metadata["error"] = params;
          beanTx.postings.push(...this.getDefaultExpenses(tx));
        }
      } else {
        beanTx.postings.push(...this.getDefaultExpenses(tx));
      }

      beanTxs.push(beanTx);
    }

    beanTxs.forEach((tx) =>
      tx.postings.forEach((posting) =>
        patternReplace(posting, tx, this.config.rules)
      )
    );

    return beanTxs.map((tx) => tx.toString()).join("\n\n");
  }
}
