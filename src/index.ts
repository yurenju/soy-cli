#!/usr/bin/env node

import "reflect-metadata";
import { Command } from "commander";
import { CathayBankParser } from "./CathayBankParser";
import { CathayCreditCardParser } from "./CathayCreditCardParser";

import { CryptoParser } from "./CryptoParser";

const program = new Command();

// Cathay Bank
let cathayBankOption = program.command(CathayBankParser.command);
CathayBankParser.options.forEach(opt => {
  cathayBankOption = cathayBankOption.option(opt);
});
cathayBankOption.action(options => {
  const parser = new CathayBankParser(options);
  parser.parse();
});

// Cathay Credit Card
let cathayCreditCardOption = program.command(CathayCreditCardParser.command);
CathayCreditCardParser.options.forEach(opt => {
  cathayCreditCardOption = cathayCreditCardOption.option(opt);
});
cathayCreditCardOption.action(options => {
  const parser = new CathayCreditCardParser(options);
  parser.parse();
});

// Cryptos
let crpytoOptions = program.command(CryptoParser.command);
CryptoParser.options.forEach(opt => {
  crpytoOptions = crpytoOptions.option(opt);
});
crpytoOptions.action(options => {
  const parser = new CryptoParser(options);
  parser.parse();
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
