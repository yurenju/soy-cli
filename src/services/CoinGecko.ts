import Bottleneck from "bottleneck";
import fetch from "node-fetch";
import moment = require("moment");

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export interface HistoryPrice {
  id: string;
  symbol: string;
  name: string;
  market_data: {
    current_price: { [symbol: string]: number };
    market_cap: { [symbol: string]: number };
    total_volume: { [symbol: string]: number };
  };
  date: string;
  error: any;
}

export class CoinGecko {
  private readonly limit: Bottleneck;

  constructor(
    private readonly baseUrl = COINGECKO_BASE_URL,
    minTime = 600,
    maxConcurrent = 1
  ) {
    this.limit = new Bottleneck({
      maxConcurrent,
      minTime
    });
  }

  getHistoryPrice(date: string, coinId: string): Promise<HistoryPrice> {
    let actualCoinId = coinId;
    if (coinId === "compound-sai" && moment(date).isBefore("2019-12-17")) {
      actualCoinId = "cdai";
    }

    const [y, m, d] = date.split("-");
    const coinDate = `${d}-${m}-${y}`;
    const url = `${COINGECKO_BASE_URL}/coins/${actualCoinId}/history?date=${coinDate}`;
    return this.limit
      .schedule(() => {
        console.log(`fetching ${coinId} price at ${date} via coingecko`);
        return fetch(url).then(res => res.json());
      })
      .then((json: HistoryPrice) => {
        json.date = date;
        json.id = coinId;
        return json;
      });
  }
}
