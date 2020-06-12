import Posting from "../src/Posting";
import BeanTransaction from "../src/BeanTransaction";
import { expect } from "chai";

describe("BeanTransaction", () => {
  describe("toString()", () => {
    const posting = new Posting("TestAccount", "30.0", "USD").toString();

    it("regular", () => {
      const tx = new BeanTransaction("2019-03-03", "*", null, "description", [
        posting,
      ]);
      expect(tx.toString()).to.eq(
        `2019-03-03 * "description"\n  TestAccount 30.0 USD`
      );
    });
  });
});
