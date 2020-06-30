import { Config } from "./Config";
import { f } from "@marcj/marshal";

export class Connection {
  @f type: string = "";
  @f address: string = "";
  @f accountPrefix: string = "";
}

export class Coin {
  @f symbol: string = "";
  @f id: string = "";
}

export class Timestamp {
  @f ethereum: string = "";
}

export class CryptoConfig extends Config {
  @f.array(Connection) connections: Connection[] = [];
  @f.array(String) excludeCoins: string[] = [];
  @f timestamp: Timestamp = new Timestamp();
  @f.array(Coin) coins: Coin[] = [];
  @f fiat: string = "TWD";
}
