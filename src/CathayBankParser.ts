import { readFileSync } from "fs";
import { ShellString, mkdir } from "shelljs";
import path, { basename } from "path";
import * as iconv from "iconv-lite";
import parse from "csv-parse/lib/sync";
import moment from "moment";
import { Config } from "./config/Config";
import CathayBankConfig from "./config/CathayBankConfig";
import { plainToClass } from "class-transformer";
import { Transaction } from "./models/Transaction";
import { Posting } from "./models/Posting";
import { TxType, patternReplace } from "./Common";
import { Directive, Balance } from "./models";

export class CathayBankParser {
  config: CathayBankConfig;
  basename: string;

  static command = "cathay-bank";
  static options = [
    "-c, --config <config-file>",
    "-i, --input-file <input-csv-file>",
  ];

  constructor(options: any) {
    const config = plainToClass(CathayBankConfig, Config.parse(options.config));
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

  parseCSV(content: string) {
    const csvOptions = {
      relax_column_count: true,
      columns: true,
      trim: true,
    };

    return parse(content.split("\n").slice(1).join("\n"), csvOptions);
  }

  getTxType(record: Record<string, string>): TxType {
    if (record["提出"]) {
      return TxType.Withdraw;
    } else if (record["存入"]) {
      return TxType.Deposit;
    } else {
      throw new Error("Failed to get Transaction Type");
    }
  }

  roastBeans(csvRecords: Record<string, string>[]): string {
    const txs: Transaction[] = [];
    const { defaultAccount } = this.config;
    const { base: baseAccount } = defaultAccount;

    let last;
    csvRecords.forEach((record) => {
      last = record;
      const date = moment(record["日期"], "YYYYMMDD");
      const fieldMapping = {
        說明: "description",
        備註: "note",
        特別備註: "extraNote",
      };
      const narration = record["說明"].trim();
      const tx: Transaction = new Transaction({
        date,
        narration,
      });
      Object.entries(fieldMapping).forEach(([csvField, txField]) => {
        if (record[csvField]) {
          tx.metadata[txField] = record[csvField].replace(/\s+/g, " ");
        }
      });

      const txType = this.getTxType(record);

      if (txType === TxType.Deposit) {
        tx.postings.push(
          new Posting({
            account: baseAccount,
            amount: record["存入"],
            symbol: "TWD",
          }),
          new Posting({ account: defaultAccount.income })
        );
      } else {
        tx.postings.push(
          new Posting({
            account: defaultAccount.expenses,
            amount: record["提出"],
            symbol: "TWD",
          }),
          new Posting({ account: baseAccount })
        );
      }
      txs.push(tx);
    });

    txs.forEach((tx) =>
      tx.postings.forEach((posting) =>
        patternReplace(posting, tx, this.config.rules)
      )
    );

    const directives: Directive[] = [...txs];
    if (last) {
      const balance = new Balance({
        account: baseAccount,
        amount: last["餘額"],
        date: moment(last["日期"], "YYYYMMDD").add(1, "day"),
      });
      directives.push(balance);
    }

    return directives.map((dir) => dir.toString()).join("\n\n");
  }
}
