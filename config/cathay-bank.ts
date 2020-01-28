enum TransactionType {
  Deposit,
  Withdraw
}

export default {
  defaultAccount: {
    deposit: "Income:Unknown",
    withdraw: "Expenses:Unknown"
  },
  defaultFields: ["說明"],
  rules: [
    {
      rule: /(匯入匯款|卡片轉入|跨行轉入|網銀轉帳)/,
      type: TransactionType.Deposit,
      account: "Income:Unknown"
    },
    {
      rule: /(自行提款|跨行提款)/,
      tpye: TransactionType.Withdraw,
      account: "Expenses:Food:Regular"
    },
    {
      rule: /(跨行費用)/,
      tpye: TransactionType.Withdraw,
      account: "Expenses:Finance:Bank:TransactionFee"
    },
    {
      rule: /(跨行費用)/,
      tpye: TransactionType.Withdraw,
      account: "Expenses:Finance:Bank:TransactionFee"
    },
    {
      rule: /(網銀外存)/,
      tpye: TransactionType.Withdraw,
      account: "Assets:Bank:Cathay:USD"
    },
    {
      rule: /(信用卡款)/,
      tpye: TransactionType.Withdraw,
      account: "Liabilities:CreditCard:Cathay"
    },
    {
      rule: /(統一發票中獎)/,
      fields: ["備註"],
      tpye: TransactionType.Deposit,
      account: "Liabilities:CreditCard:Cathay"
    },
    {
      rule: /(花旗)/,
      fields: ["備註"],
      tpye: TransactionType.Deposit,
      account: "Liabilities:CreditCard:Cathay"
    }
  ]
};
