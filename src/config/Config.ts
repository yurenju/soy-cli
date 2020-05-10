import { readFileSync } from "fs";
import * as yaml from "js-yaml";

export enum PatternType {
  Directive = "directive",
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
  defaultAccount: DefaultAccount;
  outputDir: string;
  rules: Rule[];

  static parse(file: string): any {
    const content = readFileSync(file, { encoding: "utf8" });
    return yaml.safeLoad(content);
  }
}
