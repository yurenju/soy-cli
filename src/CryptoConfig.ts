import { Config } from "./Config";

export interface Connection {
  type: string;
  address: string;
  accountPrefix: string;
}

export interface Pattern {
  symbol?: string;
  to?: string;
}

export interface Transform {
  field: string;
  value: string;
}

export interface Rule {
  type: string;
  pattern: Pattern;
  transform: Transform[];
}

export interface Coin {
  symbol: string;
  id: string;
}

export class CryptoConfig extends Config {
  connections: Connection[];
  rules: Rule[];
  timestamp: { ethereum: string };
  coins: Coin[];
  fiat: string;
}
