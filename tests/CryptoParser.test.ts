import { CryptoParser, TokenMetadataMap } from "../src/CryptoParser";
import "reflect-metadata";
import { expect } from "chai";
import { mock, instance, when, anyString } from "ts-mockito";
import { Etherscan, EthTx, Erc20Transfer } from "../src/services/Etherscan";
import { Connection, CryptoConfig } from "../src/config/CryptoConfig";
import moment = require("moment");
import { Posting } from "../src/models/Posting";
import { Transaction } from "../src/models/Transaction";
import BigNumber from "bignumber.js";
import { patternReplace, postingTransform } from "../src/Common";
import { PatternType, Rule, Config } from "../src/config/Config";
import { plainToClass } from "@marcj/marshal";

function createEthTx(timeStamp = ""): EthTx {
  return {
    from: "",
    to: "",
    blockNumber: "",
    gasUsed: "",
    gasPrice: "",
    hash: "",
    value: "",
    timeStamp: timeStamp,
    blockHash: "0",
    erc20Transfers: [],
    internalTransfers: [],
    isError: "0",
    txreceipt_status: "",
    confirmations: "0",
    contractAddress: "",
    cumulativeGasUsed: "",
    gas: "",
    input: "",
    nonce: "",
    transactionIndex: "",
  };
}

function createTransfer(
  value = "0",
  tokenDecimal = "3",
  tokenSymbol = "SYM"
): Erc20Transfer {
  return {
    from: "",
    to: "",
    tokenSymbol,
    tokenDecimal,
    value,
    timeStamp: "0",
    hash: "",
    contractAddress: "",
    blockHash: "",
    tokenName: "",
    blockNumber: "",
    confirmations: "",
    cumulativeGasUsed: "",
    gas: "",
    gasPrice: "",
    gasUsed: "",
    input: "",
    nonce: "",
    transactionIndex: "",
  };
}

describe("CryptoParser", () => {
  let parser: CryptoParser;
  let config: CryptoConfig;

  beforeEach(() => {
    const options = { config: `${__dirname}/../config/crypto-sample.yaml` };
    parser = new CryptoParser(options);
    config = plainToClass(CryptoConfig, Config.parse(options.config));
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
      expect(conn!.address.toLowerCase()).to.eq(expected);
    });

    it("matched with uppercase", () => {
      const expected = "0x6344793A588C7B3076BF74562463998B2966EE91";
      const conn = parser.getConnection(expected);
      expect(conn!.address.toLowerCase()).to.eq(expected.toLowerCase());
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
        address: "",
      };
      const tokenMap: TokenMetadataMap = {
        SYM: {
          contractAddress: "",
          tokenDecimal: "3",
        },
      };
      const balances = await parser.getBalances(tx, tokenMap, conn);
      expect(balances.length).to.eq(1);
      expect(balances[0].toString()).to.eq(
        `2020-02-26 balance prefix:SYM 1.234 SYM`
      );
    });
  });

  describe("getETHPostings()", () => {
    it("transfer from our account to unknown expense", () => {
      const d = parser.getETHPostings(
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
      const d = parser.getETHPostings(
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

  describe("getERC20Postings()", () => {
    it("single transfer from our own address", () => {
      const transfers: Erc20Transfer[] = [
        {
          from: "0x6344793a588c7b3076bf74562463998b2966ee91",
          to: "unknown-to-address",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address",
          blockHash: "",
          tokenName: "",
          blockNumber: "",
          confirmations: "",
          cumulativeGasUsed: "",
          gas: "",
          gasPrice: "",
          gasUsed: "",
          input: "",
          nonce: "",
          transactionIndex: "",
        },
      ];

      const d = parser.getERC20Postings(transfers);
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Assets:Crypto:TestAccount:SYM");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("SYM");
      expect(d[1].account).to.eq("Expenses:Unknown");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("SYM");
    });

    it("single transfer to our own address", () => {
      const transfers: Erc20Transfer[] = [
        {
          from: "unknown-from-address",
          to: "0x6344793a588c7b3076bf74562463998b2966ee91",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address",
          blockHash: "",
          tokenName: "",
          blockNumber: "",
          confirmations: "",
          cumulativeGasUsed: "",
          gas: "",
          gasPrice: "",
          gasUsed: "",
          input: "",
          nonce: "",
          transactionIndex: "",
        },
      ];

      const d = parser.getERC20Postings(transfers);
      expect(d.length).to.eq(2);
      expect(d[0].account).to.eq("Income:Unknown");
      expect(d[0].amount).to.eq("-1.23");
      expect(d[0].symbol).to.eq("SYM");
      expect(d[1].account).to.eq("Assets:Crypto:TestAccount:SYM");
      expect(d[1].amount).to.eq("1.23");
      expect(d[1].symbol).to.eq("SYM");
    });

    it("merge transactions", () => {
      const transfers: Erc20Transfer[] = [
        {
          from: "0x6344793a588c7b3076bf74562463998b2966ee91",
          to: "somewhere",
          tokenSymbol: "SYM",
          tokenDecimal: "2",
          value: "123",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address",
          blockHash: "",
          tokenName: "",
          blockNumber: "",
          confirmations: "",
          cumulativeGasUsed: "",
          gas: "",
          gasPrice: "",
          gasUsed: "",
          input: "",
          nonce: "",
          transactionIndex: "",
        },
        {
          from: "somewhere",
          to: "0x6344793a588c7b3076bf74562463998b2966ee91",
          tokenSymbol: "CSYM",
          tokenDecimal: "4",
          value: "55660000",
          timeStamp: "0",
          hash: "hash",
          contractAddress: "contract-address",
          blockHash: "",
          tokenName: "",
          blockNumber: "",
          confirmations: "",
          cumulativeGasUsed: "",
          gas: "",
          gasPrice: "",
          gasUsed: "",
          input: "",
          nonce: "",
          transactionIndex: "",
        },
      ];

      const d = parser.getERC20Postings(transfers);
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
      const d = new Posting({
        account: "TestAccount:ETH-SYM",
        amount: "1.23",
        symbol: "ETH-SYM",
      });
      patternReplace(d, new Transaction(), config.rules);
      expect(d.symbol).to.eq("SYM");
      expect(d.account).to.eq("TestAccount:SYM");
    });
  });

  describe("getDateCoinMap()", () => {
    it("get map with id", () => {
      const posting = new Posting({
        account: "TestAccount",
        amount: "12.3",
        symbol: "BAT",
      });
      const tx = new Transaction({
        date: moment("2020-02-25"),
        narration: "narration",
        postings: [posting],
      });
      const map = parser.getDateCoinMap([tx]);
      expect(Object.keys(map).length).to.eq(1);
      expect(map["2020-02-25"]["basic-attention-token"][0]).to.eq(posting);
    });
  });

  describe("getNarration()", () => {
    it("get Exchange narration if transfers great than 1", async () => {
      const tx = createEthTx();
      tx.erc20Transfers.push(createTransfer(), createTransfer());
      const narration = await parser.getNarration(tx);
      expect(narration).to.contain("Exchange");
    });

    it("get ERC20 transfer narration if transfers is 1", async () => {
      const tx = createEthTx();
      tx.value = "0";
      tx.erc20Transfers.push(createTransfer());
      const narration = await parser.getNarration(tx);
      expect(narration).to.contain("Received");
    });

    it("get ETH transfer if no transfer and value is not zero", async () => {
      const tx = createEthTx();
      tx.value = "20";
      const narration = await parser.getNarration(tx);
      expect(narration).to.contain("Received");
    });

    it("get Contract Execution if value is not zero", async () => {
      const tx = createEthTx();
      tx.value = "0";
      const narration = await parser.getNarration(tx);
      expect(narration).to.eq("Contract Execution");
    });
  });

  describe("toBeanTx()", () => {
    it("has gas posting if from field if our address", async () => {
      const tx = createEthTx();
      const decimals = new BigNumber(10).pow(18);
      tx.from = "0x6344793a588c7b3076bf74562463998b2966ee91";
      tx.gasUsed = "3";
      tx.gasPrice = new BigNumber(4).multipliedBy(decimals).toString();

      const bean = await parser.toBeanTx(tx);
      expect(bean.postings[0].amount).to.eq("12");
    });
  });

  describe("postingTransform", () => {
    it("transform matched field to new value", () => {
      const data = {
        account: "test-account",
      };
      postingTransform(data, "/account", "new-account");
      expect(data.account).to.eq("new-account");
    });

    it("transform account for symbol", () => {
      const data = {
        account: "test-account:ETH-SYM",
        symbol: "ETH-SYM",
      };
      postingTransform(data, "/symbol", "SYM");
      expect(data.account).to.eq("test-account:SYM");
      expect(data.symbol).to.eq("SYM");
    });
  });
});
