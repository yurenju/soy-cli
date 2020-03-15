import { Config } from "./Config";

export interface Connection {
  type: string;
  address: string;
  accountPrefix: string;
}

export enum PatternType {
  Directive = "directive",
  Transaction = "transaction",
  Balance = "balance"
}

export interface Pattern {
  type: PatternType;
  field: string;
  value: string;
}

export interface Transform {
  type: PatternType;
  field: string;
  value: string;
}

export interface Rule {
  pattern: Pattern[];
  transform: Transform[];
}

export interface Coin {
  symbol: string;
  id: string;
}

export class CryptoConfig extends Config {
  connections: Connection[];
  rules: Rule[];
  excludeCoins: string[];
  timestamp: { ethereum: string };
  coins: Coin[];
  fiat: string;
}
