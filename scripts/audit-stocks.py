#!/usr/bin/env python3
"""
3-way audit of Personal Stock Investment imports against fresh broker reports.

Parses 19 broker .xls files from C:\\kareemhady\\Lime Domains\\Personal\\AOLB\\:
  - 001/003 x (Cashflow|Invoices|Executions) x (2024|2025|2026)  -> 18 files
  - 009 Cashflow 2024                                             ->  1 file

Emits ONE JSON file:
  C:\\kareemhady\\scripts\\audit-stocks.broker.json

Schema:
{
  "files": [...],         # per-file metadata
  "invoices": [           # one row per invoice across all Invoices files
      {"account": "001", "year": 2024, "invoice_id": "40313340",
       "side": "Buy"|"Sell", "exec_date": "YYYY-MM-DD", "stock": "...",
       "currency": "EGP", "custodian": "...", "settlement_date": "...",
       "qty": 1000, "avg_price": 3.75, "total_fees": 12.34,
       "total_amount": 3750.0, "amount_due": 3762.34}
  ],
  "executions": [         # per execution
      {"account": "001", "year": 2024, "order_id": "...", "side": "Buy"|"Sell",
       "stock": "...", "invoice_id": "...", "exec_date": "...",
       "qty": ..., "price": ..., "total_value": ...}
  ],
  "cashflow": [           # per cashflow row
      {"account": "001", "year": 2024, "occurred_at": "YYYY-MM-DD",
       "op_type": "...", "description": "...", "debit": ..., "credit": ...}
  ]
}

The agent doing the audit reads this JSON, queries Supabase via MCP, then
writes the markdown report.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

ROOT = Path(r"C:\kareemhady\Lime Domains\Personal\AOLB")
OUT = Path(r"C:\kareemhady\scripts\audit-stocks.broker.json")

SS = "{urn:schemas-microsoft-com:office:spreadsheet}"

FILE_RE = re.compile(r"^(?P<account>\d{3})\s+(?P<kind>Cashflow|Invoices|Executions)\s+(?P<year>\d{4})\.xls$", re.IGNORECASE)


def parse_dmy(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", s)
    if not m:
        return None
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"


def num(v: str | None) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except ValueError:
        try:
            return float(v.replace(",", ""))
        except Exception:
            return 0.0


def get_rows(xml_path: Path) -> list[list[str | None]]:
    """Return dense rows. Each row is a list of cells in order (None for blank).
    Honours ss:Index gaps. Returns the longest row width."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    # Find Worksheet ag-grid (or first)
    ws_list = root.findall(f"{SS}Worksheet")
    ws = None
    for w in ws_list:
        if w.get(f"{SS}Name") == "ag-grid":
            ws = w
            break
    if ws is None and ws_list:
        ws = ws_list[0]
    if ws is None:
        return []
    table = ws.find(f"{SS}Table")
    if table is None:
        return []
    rows_xml = table.findall(f"{SS}Row")
    out: list[list[str | None]] = []
    max_w = 0
    for row in rows_xml:
        cells = []
        cursor = 0
        cell_list = row.findall(f"{SS}Cell")
        # Determine row width; pre-fill later
        local: dict[int, str | None] = {}
        for cell in cell_list:
            idx_attr = cell.get(f"{SS}Index")
            if idx_attr:
                cursor = int(idx_attr) - 1
            data = cell.find(f"{SS}Data")
            text = data.text if data is not None else None
            local[cursor] = text if text != "" else None
            cursor += 1
        if not local:
            out.append([])
            continue
        width = max(local.keys()) + 1
        max_w = max(max_w, width)
        row_arr: list[str | None] = [None] * width
        for k, v in local.items():
            row_arr[k] = v
        out.append(row_arr)
    # Pad all rows to max_w
    for r in out:
        while len(r) < max_w:
            r.append(None)
    return out


def parse_invoices(path: Path, account: str, year: int) -> list[dict]:
    rows = get_rows(path)
    out = []
    for i, row in enumerate(rows):
        if not row or row[0] is None:
            continue
        # Skip header
        if str(row[0]).strip().lower() == "invoice":
            continue
        # Need at least 12 cols
        if len(row) < 12:
            continue
        invoice_id = str(row[0]).strip()
        if not invoice_id or not invoice_id[0].isdigit():
            continue
        side = (row[1] or "").strip()
        out.append({
            "account": account,
            "year": year,
            "row_index": i,
            "invoice_id": invoice_id,
            "side": side,  # "Buy" or "Sell" (whitespace stripped)
            "exec_date": parse_dmy(row[2]),
            "stock": (row[3] or "").strip(),
            "currency": (row[4] or "").strip(),
            "custodian": (row[5] or "").strip(),
            "settlement_date": parse_dmy(row[6]),
            "qty": num(row[7]),
            "avg_price": num(row[8]),
            "total_fees": num(row[9]),
            "total_amount": num(row[10]),
            "amount_due": num(row[11]),
        })
    return out


def parse_executions(path: Path, account: str, year: int) -> list[dict]:
    rows = get_rows(path)
    out = []
    for i, row in enumerate(rows):
        if not row or row[0] is None:
            continue
        if str(row[0]).strip().lower() == "order":
            continue
        if len(row) < 8:
            continue
        order_id = str(row[0]).strip()
        if not order_id or not order_id[0].isdigit():
            continue
        out.append({
            "account": account,
            "year": year,
            "row_index": i,
            "order_id": order_id,
            "side": (row[1] or "").strip(),
            "stock": (row[2] or "").strip(),
            "invoice_id": str(row[3]).strip() if row[3] is not None else "",
            "exec_date": parse_dmy(row[4]),
            "qty": num(row[5]),
            "price": num(row[6]),
            "total_value": num(row[7]),
        })
    return out


def parse_cashflow(path: Path, account: str, year: int) -> list[dict]:
    rows = get_rows(path)
    out = []
    for i, row in enumerate(rows):
        if not row:
            continue
        # Header
        if row and row[0] and str(row[0]).strip().lower() == "date":
            continue
        if len(row) < 5:
            continue
        occurred = parse_dmy(row[0])
        op_type = (row[1] or "").strip() if row[1] else ""
        if not occurred and not op_type:
            continue
        out.append({
            "account": account,
            "year": year,
            "row_index": i,
            "occurred_at": occurred,
            "op_type": op_type,
            "description": (row[2] or "").strip() if row[2] else "",
            "debit": num(row[3]),
            "credit": num(row[4]),
        })
    return out


def main():
    if not ROOT.is_dir():
        print(f"ERROR: source dir not found: {ROOT}", file=sys.stderr)
        sys.exit(1)

    files_meta = []
    invoices: list[dict] = []
    executions: list[dict] = []
    cashflow: list[dict] = []

    for entry in sorted(ROOT.iterdir()):
        if not entry.is_file():
            continue
        m = FILE_RE.match(entry.name)
        if not m:
            continue
        account = m.group("account")
        kind = m.group("kind").lower()
        year = int(m.group("year"))
        meta = {
            "file": entry.name,
            "account": account,
            "kind": kind,
            "year": year,
            "size": entry.stat().st_size,
        }
        try:
            if kind == "invoices":
                rows = parse_invoices(entry, account, year)
                meta["rows"] = len(rows)
                invoices.extend(rows)
            elif kind == "executions":
                rows = parse_executions(entry, account, year)
                meta["rows"] = len(rows)
                executions.extend(rows)
            elif kind == "cashflow":
                rows = parse_cashflow(entry, account, year)
                meta["rows"] = len(rows)
                cashflow.extend(rows)
        except Exception as e:
            meta["error"] = repr(e)
        files_meta.append(meta)

    payload = {
        "files": files_meta,
        "invoices": invoices,
        "executions": executions,
        "cashflow": cashflow,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT}")
    print(f"  files     : {len(files_meta)}")
    print(f"  invoices  : {len(invoices)}")
    print(f"  executions: {len(executions)}")
    print(f"  cashflow  : {len(cashflow)}")


if __name__ == "__main__":
    main()
