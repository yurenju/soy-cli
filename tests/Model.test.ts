import { OpenAccount, Posting, Transaction, Balance } from "../src/models";
import { expect } from "chai";
import { plainToClass } from "@marcj/marshal";

describe("Models", () => {
  describe("OpenAccount", () => {
    it("convert json to a OpenAccount object", () => {
      const json = {
        date: "2020-03-11",
        symbol: "TWD",
        account: "Asset:Bank:Detroit",
      };

      const openAccount = plainToClass(OpenAccount, json);
      expect(openAccount.date.format("YYYY/MM/DD")).eq("2020/03/11");
      expect(openAccount.symbol).eq("TWD");
      expect(openAccount.account).eq("Asset:Bank:Detroit");
      expect(openAccount.type).eq("open");
    });
  });

  describe("Balance", () => {
    it("generates balance statement", () => {
      const json = {
        date: "2000-05-21",
        account: "TestAccount",
        amount: "20",
        symbol: "TWD",
      };
      const balance = plainToClass(Balance, json);
      expect(balance.toString()).eq("2000-05-21 balance TestAccount 20 TWD");
    });
  });

  describe("Posting", () => {
    it("with account & amount", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
      };
      const posting = plainToClass(Posting, json);
      expect(posting.toString()).to.eq("  TestAccount 30.0 TWD");
    });

    it("without amount", () => {
      const json = {
        account: "TestAccount",
      };
      const posting = plainToClass(Posting, json);
      expect(posting.toString()).eq("  TestAccount");
    });

    it("with cost", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
        cost: {
          amount: "2.0",
          symbol: "JPY",
        },
      };
      const posting = plainToClass(Posting, json);
      expect(posting.toString()).to.eq("  TestAccount 30.0 TWD {2.0 JPY}");
    });

    it("with unit price", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
        price: {
          type: "unit",
          amount: "2.0",
          symbol: "JPY",
        },
      };
      const posting = plainToClass(Posting, json);
      expect(posting.toString()).to.eq("  TestAccount 30.0 TWD @ 2.0 JPY");
    });

    it("with total price", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
        price: {
          type: "total",
          amount: "2.0",
          symbol: "JPY",
        },
      };
      const posting = plainToClass(Posting, json);
      expect(posting.toString()).to.eq("  TestAccount 30.0 TWD @@ 2.0 JPY");
    });

    it("with metadata", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
        metadata: {
          tx: "tx-hash",
          key2: "value2",
        },
      };
      const posting = plainToClass(Posting, json);
      const expected = [
        "  TestAccount 30.0 TWD",
        `    tx: "tx-hash"`,
        `    key2: "value2"`,
      ];
      expect(posting.toString()).to.eq(expected.join("\n"));
    });

    it("with all fields", () => {
      const json = {
        account: "TestAccount",
        amount: "30.0",
        symbol: "TWD",
        cost: {
          amount: "5.0",
          symbol: "JPY",
        },
        price: {
          type: "total",
          amount: "20.1",
          symbol: "EUR",
        },
        metadata: {
          tx: "tx-hash",
          key2: "value2",
        },
      };
      const posting = plainToClass(Posting, json);
      const expected = [
        "  TestAccount 30.0 TWD {5.0 JPY} @@ 20.1 EUR",
        `    tx: "tx-hash"`,
        `    key2: "value2"`,
      ];
      expect(posting.toString()).to.eq(expected.join("\n"));
    });
  });

  describe("Transaction", () => {
    it("with base transaction", () => {
      const json = {
        date: "2012-02-01",
        narration: "description",
      };
      const tx = plainToClass(Transaction, json);
      expect(tx.toString()).eq(`2012-02-01 * "description"`);
    });

    it("with multiple postings", () => {
      const json = {
        date: "2012-02-01",
        narration: "description",
        postings: [
          { account: "TestAccount1", amount: "30.0", symbol: "TWD" },
          { account: "TestAccount2", amount: "-30.0", symbol: "TWD" },
        ],
      };
      const tx = plainToClass(Transaction, json);
      const expected = [
        `2012-02-01 * "description"`,
        "  TestAccount1 30.0 TWD",
        "  TestAccount2 -30.0 TWD",
      ];
      expect(tx.toString()).eq(expected.join("\n"));
    });
  });
});
