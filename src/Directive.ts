export default class Directive {
  account: string;
  amount: string;
  cost: string;
  price: string;
  symbol: string;
  metadata: { [key: string]: string };

  constructor(
    account = "",
    amount = "",
    symbol = "",
    cost = "",
    price = "",
    metadata = {}
  ) {
    this.account = account;
    this.amount = amount;
    this.symbol = symbol;
    this.cost = cost;
    this.price = price;
    this.metadata = metadata;
  }

  toString() {
    const { account, amount, symbol, cost, price } = this;
    const strArr = [account, amount, symbol];
    if (cost || amount[0] === "-") {
      strArr.push(`{${cost}}`);
    }
    if (price) {
      strArr.push(`@ ${price}`);
    }

    const metadata = Object.entries(this.metadata)
      .map(([key, value]) => `    ${key}: "${value}"`)
      .join("\n");

    if (metadata !== "") {
      return `  ${strArr.join(" ")}\n${metadata}`;
    } else {
      return `  ${strArr.join(" ")}`;
    }
  }
}
