import Bottleneck from "bottleneck";

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
    const [y, m, d] = date.split("-");
    const coinDate = `${d}-${m}-${y}`;
    const url = `${COINGECKO_BASE_URL}/coins/${coinId}/history?date=${coinDate}`;
    return this.limit
      .schedule(() => fetch(url).then(res => res.json()))
      .then((json: HistoryPrice) => {
        json.date = date;
        if (json.error) {
          json.id = coinId;
        }
        return json;
      });
  }
}
