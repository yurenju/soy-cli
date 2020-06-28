import { readFileSync } from "fs";
import * as yaml from "js-yaml";

export enum PatternType {
  Posting = "posting",
  Transaction = "transaction",
  Balance = "balance",
}

export interface Pattern {
  type: PatternType;
  query: string;
  value: string;
}

export interface Transform {
  type: PatternType;
  query: string;
  value: string;
}

export interface Rule {
  pattern: Pattern[];
  transform: Transform[];
}

export interface DefaultAccount {
  income: string;
  expenses: string;
  pnl: string;
  base?: string;
  ethTx?: string;
}

export class Config {
  defaultAccount: DefaultAccount = { income: "", expenses: "", pnl: "" };
  outputDir: string = "";
  rules: Rule[] = [];

  static parse(file: string): Record<string, any> {
    const content = readFileSync(file, { encoding: "utf8" });
    return yaml.safeLoad(content);
  }
}
