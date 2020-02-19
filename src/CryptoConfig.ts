import { Config } from "./Config";

interface Connection {
  type: string;
  address: string;
  accountPrefix: string;
}

interface Pattern {
  symbol?: string;
  to?: string;
}

interface Transform {
  field: string;
  value: string;
}

interface Rule {
  type: string;
  pattern: Pattern;
  transform: Transform[];
}

interface Coin {
  symbol: string;
  id: string;
}

export default class CryptoConfig extends Config {
  connections: Connection[];
  rules: Rule[];
  timestamp: { ethereum: string };
  coins: Coin[];
  fiat: string;
}
