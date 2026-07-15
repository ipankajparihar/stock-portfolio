import type { Holding } from "@/lib/types";

/**
 * The portfolio, as recorded in the source spreadsheet.
 *
 * This is the one place the sheet's contents live. Everything else in the app —
 * sectors, weights, subtotals — is *derived* from this array at request time, so
 * replacing this file with the real sheet (or swapping it for a DB query behind the
 * same `Holding[]` shape) requires no other change.
 *
 * `symbol` must be the ticker as both providers know it. Those mostly agree, but not
 * always — Pidilite is PIDILITIND, not PIDILITE. A symbol either provider doesn't
 * recognise degrades to an "unavailable" cell rather than breaking the row.
 */
export const HOLDINGS: Holding[] = [
  // ---------- Financials ----------
  { id: "hdfcbank", name: "HDFC Bank", symbol: "HDFCBANK", exchange: "NSE", sector: "Financials", purchasePrice: 745.0, quantity: 120 },
  { id: "icicibank", name: "ICICI Bank", symbol: "ICICIBANK", exchange: "NSE", sector: "Financials", purchasePrice: 1120.5, quantity: 85 },
  { id: "bajfinance", name: "Bajaj Finance", symbol: "BAJFINANCE", exchange: "NSE", sector: "Financials", purchasePrice: 1180.0, quantity: 60 },
  { id: "kotakbank", name: "Kotak Mahindra Bank", symbol: "KOTAKBANK", exchange: "NSE", sector: "Financials", purchasePrice: 425.0, quantity: 150 },
  { id: "sbilife", name: "SBI Life Insurance", symbol: "SBILIFE", exchange: "NSE", sector: "Financials", purchasePrice: 1420.0, quantity: 40 },

  // ---------- Technology ----------
  { id: "tcs", name: "Tata Consultancy Services", symbol: "TCS", exchange: "NSE", sector: "Technology", purchasePrice: 2850.0, quantity: 45 },
  { id: "infy", name: "Infosys", symbol: "INFY", exchange: "NSE", sector: "Technology", purchasePrice: 1450.0, quantity: 70 },
  { id: "hcltech", name: "HCL Technologies", symbol: "HCLTECH", exchange: "NSE", sector: "Technology", purchasePrice: 1320.0, quantity: 55 },
  { id: "tataelxsi", name: "Tata Elxsi", symbol: "TATAELXSI", exchange: "NSE", sector: "Technology", purchasePrice: 6200.0, quantity: 12 },
  { id: "affle", name: "Affle India", symbol: "AFFLE", exchange: "NSE", sector: "Technology", purchasePrice: 1150.0, quantity: 50 },

  // ---------- Consumer ----------
  { id: "dmart", name: "Avenue Supermarts (DMart)", symbol: "DMART", exchange: "NSE", sector: "Consumer", purchasePrice: 3550.0, quantity: 20 },
  { id: "tataconsum", name: "Tata Consumer Products", symbol: "TATACONSUM", exchange: "NSE", sector: "Consumer", purchasePrice: 985.0, quantity: 90 },
  { id: "pidilite", name: "Pidilite Industries", symbol: "PIDILITIND", exchange: "NSE", sector: "Consumer", purchasePrice: 1720.0, quantity: 35 },
  { id: "asianpaint", name: "Asian Paints", symbol: "ASIANPAINT", exchange: "NSE", sector: "Consumer", purchasePrice: 2900.0, quantity: 25 },

  // ---------- Power & Infrastructure ----------
  { id: "tatapower", name: "Tata Power", symbol: "TATAPOWER", exchange: "NSE", sector: "Power & Infrastructure", purchasePrice: 310.0, quantity: 200 },
  { id: "polycab", name: "Polycab India", symbol: "POLYCAB", exchange: "NSE", sector: "Power & Infrastructure", purchasePrice: 6800.0, quantity: 10 },
  { id: "astral", name: "Astral Ltd", symbol: "ASTRAL", exchange: "NSE", sector: "Power & Infrastructure", purchasePrice: 1750.0, quantity: 40 },

  // ---------- Chemicals ----------
  { id: "deepaknitrite", name: "Deepak Nitrite", symbol: "DEEPAKNTR", exchange: "NSE", sector: "Chemicals", purchasePrice: 1980.0, quantity: 30 },
  { id: "cleanscience", name: "Clean Science & Technology", symbol: "CLEAN", exchange: "NSE", sector: "Chemicals", purchasePrice: 1240.0, quantity: 45 },
  { id: "gravita", name: "Gravita India", symbol: "GRAVITA", exchange: "NSE", sector: "Chemicals", purchasePrice: 1450.0, quantity: 38 },
];
