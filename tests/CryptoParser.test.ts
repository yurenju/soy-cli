import { CryptoParser, TokenMetadataMap } from "../src/CryptoParser";
import { expect } from "chai";
import { mock, instance, when, anyString } from "ts-mockito";
import { Etherscan, EthTx, ERC20Transfer } from "../src/services/Etherscan";
import { Connection } from "../src/config/CryptoConfig";
import moment = require("moment");
import Directive from "../src/Directive";
import BeanTransaction from "../src/BeanTransaction";
import BigNumber from "bignumber.js";

function createEthTx(timeStamp = ""): EthTx {
  return {
    hash: "",
    transfers: [],
    internalTransfers: [],
    value: "",
    timeStamp,
    blockNumber: "",
    from: "",
    to: "",
    gasUsed: "",
    gasPrice: ""
  };
}

function createTransfer(
  value = "0",
  tokenDecimal = "3",
  tokenSymbol = "SYM"
): ERC20Transfer {
  return {
    from: "",
    to: "",
    tokenSymbol,
    tokenDecimal,
    value,
    timeStamp: "0",
    hash: "",
    contractAddress: ""
  };
}

describe("CryptoParser", () => {
  let parser: CryptoParser;

  beforeEach(() => {
    const options = { config: `${__dirname}/../config/crypto-sample.yaml` };
    parser = new CryptoParser(options);
  });

  it("constructor", () => {
    const options = { config: `${__dirname}/../config/crypto-sample.yaml` };
    parser = new CryptoParser(options);
    expect(parser.config.fiat).to.eq("TWD");
  });

  describe("getValue()", () => {
    it("gets 1.23", () => {
      const val = parser.getValue("123000", "5");
      expect(val).to.eq("1.23");
    });
  });

  describe("getConnection()", () => {
    it("return null if no match", () => {
      const conn = parser.getConnection("NOT-EXIST");
      expect(conn).to.be.null;
    });

    it("matched", () => {
      const expected = "0x6344793a588c7b3076bf74562463998b2966ee91";
      const conn = parser.getConnection(expected);
      expect(conn.address.toLowerCase()).to.eq(expected);
    });

    it("matched with uppercase", () => {
      const expected = "0x6344793A588C7B3076BF74562463998B2966EE91";
      const conn = parser.getConnection(expected);
      expect(conn.address.toLowerCase()).to.eq(expected.toLowerCase());
    });
  });

  describe("getAccount()", () => {
    it("return prefix with symbol if prefix is not null", () => {
      const account = parser.getAccount("prefix", "symbol", "default");
      expect(account).to.eq("prefix:symbol");
    });

    it("return default account if prefix is null", () => {
      const account = parser.getAccount(undefined, "symbol", "default-account");
      expect(account).to.eq("default-account");
    });
  });

  describe("getBalances()", () => {
    it("get balances", async () => {
      const date = "2020-02-25";
      const timeStamp = moment(date).format("X");
      const mockedEtherscan = mock(Etherscan);
      parser.etherscan = instance(mockedEtherscan);
      when(
        mockedEtherscan.getTokenBalance(anyString(), anyString(), anyString())
      ).thenResolve("1234");
      const tx: EthTx = createEthTx(timeStamp);
      const conn: Connection = {
        type: "",
        accountPrefix: "prefix",
        address: ""
      };
      const tokenMap: TokenMetadataMap = {
        SYM: {
          contractAddress: "",
          tokenDecimal: "3"
        }
      };
      const balances = await parser.getBalances(tx, tokenMap, conn);
      expect(balances.length).to.eq(1);
      expect(balances[0]).to.eq(`2020-02-26 balance prefix:SYM 1.234 SYM`);
    });
  });

  describe("getETHDirectives()", () => {
    it("transfer from our account to unknown expense", () => {
      const d = parser.getETHDirectives(
        "0x6344793a588c7b3076bf74562463998b2966ee91",
        "unknown-to-address",
        "1230000000000000000"
      );
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Assets:Crypto:TestAccount:ETH");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("ETH");
      expect(d[1].account).to.eq("Expenses:Unknown");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("ETH");
    });

    it("transfer from unknown income to our account", () => {
      const d = parser.getETHDirectives(
        "unknown-from-address",
        "0x6344793a588c7b3076bf74562463998b2966ee91",
        "1230000000000000000"
      );
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Income:Unknown");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("ETH");
      expect(d[1].account).to.eq("Assets:Crypto:TestAccount:ETH");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("ETH");
    });
  });

  describe("getERC20Directives()", () => {
    it("single transfer from our own address", () => {
      const transfers: ERC20Transfer[] = [
        {
          from: "0x6344793a588c7b3076bf74562463998b2966ee91",
          to: "unknown-to-address",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address"
        }
      ];

      const d = parser.getERC20Directives(transfers);
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Assets:Crypto:TestAccount:SYM");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("SYM");
      expect(d[1].account).to.eq("Expenses:Unknown");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("SYM");
    });

    it("single transfer to our own address", () => {
      const transfers: ERC20Transfer[] = [
        {
          from: "unknown-from-address",
          to: "0x6344793a588c7b3076bf74562463998b2966ee91",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address"
        }
      ];

      const d = parser.getERC20Directives(transfers);
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Income:Unknown");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("SYM");
      expect(d[1].account).to.eq("Assets:Crypto:TestAccount:SYM");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("SYM");
    });

    it("merge transactions", () => {
      const transfers: ERC20Transfer[] = [
        {
          from: "0x6344793a588c7b3076bf74562463998b2966ee91",
          to: "somewhere",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address"
        },
        {
          from: "somewhere",
          to: "0x6344793a588c7b3076bf74562463998b2966ee91",
          tokenSymbol: "CSYM",
          tokenDecimal: "4",
          value: "55660000",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address"
        }
      ];

      const d = parser.getERC20Directives(transfers);
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Assets:Crypto:TestAccount:SYM");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("SYM");
      expect(d[1].account).to.eq("Assets:Crypto:TestAccount:CSYM");
      expect(d[1].amount).to.eq("5,566");
      expect(d[1].symbol).to.eq("CSYM");
    });
  });

  describe("patternReplace()", () => {
    it("replace symbol", () => {
      const d = new Directive("TestAccount:ETH-SYM", "1.23", "ETH-SYM");
      parser.patternReplace(d, new BeanTransaction());
      expect(d.symbol).to.eq("SYM");
      expect(d.account).to.eq("TestAccount:SYM");
    });
  });

  describe("getDateCoinMap()", () => {
    it("get map with id", () => {
      const d = new Directive("TestAccount", "12.3", "BAT");
      const tx = new BeanTransaction("2020-02-25", "*", "", "narration", [d]);
      const map = parser.getDateCoinMap([tx]);
      expect(Object.keys(map).length).to.eq(1);
      expect(map["2020-02-25"]["basic-attention-token"][0]).to.eq(d);
    });
  });

  describe("getNarration()", () => {
    it("get Exchange narration if transfers great than 1", () => {
      const tx = createEthTx();
      tx.transfers.push(createTransfer(), createTransfer());
      const narration = parser.getNarration(tx);
      expect(narration).to.eq("ERC20 Exchange");
    });

    it("get ERC20 transfer narration if transfers is 1", () => {
      const tx = createEthTx();
      tx.transfers.push(createTransfer());
      const narration = parser.getNarration(tx);
      expect(narration).to.eq("ERC20 Transfer");
    });

    it("get ETH transfer if no transfer and value is not zero", () => {
      const tx = createEthTx();
      tx.value = "20";
      const narration = parser.getNarration(tx);
      expect(narration).to.eq("ETH Transfer");
    });

    it("get Contract Execution if value is not zero", () => {
      const tx = createEthTx();
      tx.value = "0";
      const narration = parser.getNarration(tx);
      expect(narration).to.eq("Contract Execution");
    });
  });

  describe("toBeanTx()", () => {
    it("has gas directive if from field if our address", () => {
      const tx = createEthTx();
      const decimals = new BigNumber(10).pow(18);
      tx.from = "0x6344793a588c7b3076bf74562463998b2966ee91";
      tx.gasUsed = "3";
      tx.gasPrice = new BigNumber(4).multipliedBy(decimals).toString();

      const bean = parser.toBeanTx(tx);
      expect(bean.directives[0].amount).to.eq("12");
    });
  });

  describe("directiveTransform", () => {
    it("transform matched field to new value", () => {
      const data = {
        account: "test-account"
      };
      parser.directiveTransform(data, "account", "new-account");
      expect(data.account).to.eq("new-account");
    });

    it("transform account for symbol", () => {
      const data = {
        account: "test-account:ETH-SYM",
        symbol: "ETH-SYM"
      };
      parser.directiveTransform(data, "symbol", "SYM");
      expect(data.account).to.eq("test-account:SYM");
      expect(data.symbol).to.eq("SYM");
    });
  });
});
