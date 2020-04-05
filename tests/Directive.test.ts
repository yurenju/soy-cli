import Directive from "../src/Directive";
import { expect } from "chai";

describe("Directive", () => {
  describe("toString()", () => {
    it("with account & amount", () => {
      const dir = new Directive("TestAccount", "30.0", "USD").toString();
      expect(dir).to.eq("  TestAccount 30.0 USD");
    });

    it("with account, amount & cost", () => {
      const dir = new Directive(
        "TestAccount",
        "30.0",
        "USD",
        "30 TWD"
      ).toString();
      expect(dir).to.eq("  TestAccount 30.0 USD {30 TWD}");
    });

    it("with metadata", () => {
      const dir = new Directive("TestAccount", "30.0", "USD");
      dir.metadata = { tx: "1234" };
      expect(dir.toString(true)).to.eq(
        `  TestAccount 30.0 USD\n    tx: "1234"`
      );
    });
  });
});
