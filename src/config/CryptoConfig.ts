import { Config } from "./Config";

export interface Connection {
  type: string;
  address: string;
  accountPrefix: string;
}

export interface Coin {
  symbol: string;
  id: string;
}

export class CryptoConfig extends Config {
  connections: Connection[] = [];
  excludeCoins: string[] = [];
  timestamp: { ethereum: string } = { ethereum: "" };
  coins: Coin[] = [];
  fiat: string = "TWD";
}
