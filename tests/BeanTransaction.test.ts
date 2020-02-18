import Directive from "../src/parsers/Directive";
import BeanTransaction from "../src/parsers/BeanTransaction";
import { expect } from "chai";

describe("BeanTransaction", () => {
  describe("toString()", () => {
    const dir = new Directive("TestAccount", "30.0", "USD").toString();

    it("regular", () => {
      const tx = new BeanTransaction("2019-03-03", "*", null, "description", [
        dir
      ]);
      expect(tx.toString()).to.eq(
        `2019-03-03 * "description"\n  TestAccount 30.0 USD`
      );
    });
  });
});
