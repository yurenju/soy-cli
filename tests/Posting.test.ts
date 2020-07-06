import { Posting, Cost } from "../src/models/Posting";
import { expect } from "chai";

describe("Posting", () => {
  describe("toString()", () => {
    it("with account & amount", () => {
      const posting = new Posting({
        account: "TestAccount",
        amount: "30.0",
        symbol: "USD",
      }).toString();
      expect(posting).to.eq("  TestAccount 30.0 USD");
    });

    it("with account, amount & cost", () => {
      const posting = new Posting({
        account: "TestAccount",
        amount: "30.0",
        symbol: "USD",
        cost: new Cost({ amount: "30", symbol: "TWD" }),
      }).toString();
      expect(posting).to.eq("  TestAccount 30.0 USD {30 TWD}");
    });
  });
});
