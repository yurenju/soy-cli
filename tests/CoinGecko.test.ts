import { expect } from "chai";
import { CoinGecko, COINGECKO_BASE_URL } from "../src/services/CoinGecko";
import nock from "nock";

describe("CoinGecko", () => {
  describe("getHistoryPrice", () => {
    it("regular", async () => {
      nock("https://api.coingecko.com")
        .get(`/api/v3/coins/bitcoin/history?date=01-02-2020`)
        .reply(200, {
          id: "bitcoin",
          symbol: "btc",
          name: "Bitcoin",
          market_data: {
            current_price: {
              twd: 15000
            },
            market_cap: {},
            total_volume: {}
          }
        });

      const cg = new CoinGecko();
      const price = await cg.getHistoryPrice("2020-02-01", "bitcoin");
      expect(price.date).to.eq("2020-02-01");
      expect(price.market_data.current_price["twd"]).eq(15000);
    });

    it("replace cSAI to cDAI to get correct price", async () => {
      nock("https://api.coingecko.com")
        .get("/api/v3/coins/cdai/history?date=01-12-2019")
        .reply(200, {
          id: "cdai",
          symbol: "cdai",
          name: "Compound Dai",
          market_data: {
            current_price: {
              twd: 0.6
            },
            market_cap: {},
            total_volume: {}
          }
        });

      const cg = new CoinGecko();
      const price = await cg.getHistoryPrice("2019-12-01", "compound-sai");
      expect(price.date).to.eq("2019-12-01");
      expect(price.market_data.current_price["twd"]).eq(0.6);
    });
  });
});
