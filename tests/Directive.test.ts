import Posting from "../src/Posting";
import { expect } from "chai";

describe("Posting", () => {
  describe("toString()", () => {
    it("with account & amount", () => {
      const posting = new Posting("TestAccount", "30.0", "USD").toString();
      expect(posting).to.eq("  TestAccount 30.0 USD");
    });

    it("with account, amount & cost", () => {
      const posting = new Posting(
        "TestAccount",
        "30.0",
        "USD",
        "30 TWD"
      ).toString();
      expect(posting).to.eq("  TestAccount 30.0 USD {30 TWD}");
    });

    it("with metadata", () => {
      const posting = new Posting("TestAccount", "30.0", "USD");
      posting.metadata = { tx: "1234" };
      expect(posting.toString(true)).to.eq(
        `  TestAccount 30.0 USD\n    tx: "1234"`
      );
    });
  });
});
