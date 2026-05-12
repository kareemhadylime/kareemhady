import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importAolbFile } from './import';

const fakeXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="ag-grid">
    <Table>
      <Row><Cell><Data ss:Type="String">Open Balance 0.00</Data></Cell></Row>
      <Row>
        <Cell><Data ss:Type="String">Details</Data></Cell>
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Operation Type</Data></Cell>
        <Cell><Data ss:Type="String">Description</Data></Cell>
        <Cell><Data ss:Type="String">Debit</Data></Cell>
        <Cell><Data ss:Type="String">Credit</Data></Cell>
        <Cell><Data ss:Type="String">Balance</Data></Cell>
        <Cell><Data ss:Type="String">D/C</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell><Data ss:Type="String">11-02-2024</Data></Cell>
        <Cell><Data ss:Type="String">Bank Deposit</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell><Data ss:Type="Number">0</Data></Cell>
        <Cell><Data ss:Type="Number">14000000</Data></Cell>
        <Cell><Data ss:Type="Number">14000000</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
      </Row>
      <Row><Cell><Data ss:Type="String">Close Balance 14000000.00</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`;

function makeMockClient() {
  // minimal supabase-shaped client capturing inserts
  const inserted: Record<string, any[]> = {};
  const lookupAccounts: Record<string, number> = { '001': 1, '003': 2, '009': 3 };
  return {
    inserted,
    from(table: string) {
      const api: any = {
        select: (cols?: string) => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              if (table === 'personal_stock_uploads' && col === 'sha256') return { data: null };
              if (table === 'personal_stock_accounts' && col === 'code') {
                const id = lookupAccounts[val];
                return id ? { data: { id } } : { data: null };
              }
              if (table === 'personal_stock_instruments' && col === 'ticker') return { data: null };
              return { data: null };
            },
          }),
        }),
        insert: (rows: any) => {
          inserted[table] = (inserted[table] ?? []).concat(Array.isArray(rows) ? rows : [rows]);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'mock-' + table + '-id', ...inserted[table][inserted[table].length - 1] } }),
            }),
          };
        },
        update: (patch: any) => ({
          eq: (_c: string, _v: any) => ({ then: (cb: any) => cb({ data: null }) }),
        }),
      };
      return api;
    },
  };
}

describe('importAolbFile', () => {
  it('imports a minimal Bank Deposit row end-to-end', async () => {
    const client = makeMockClient();
    const result = await importAolbFile({
      filename: 'AOLB Account 001 - 2024.xls',
      xml: fakeXml,
      client: client as any,
      uploadedBy: 'kareem.hady@gmail.com',
    });
    expect(result.status).toBe('ok');
    expect(result.parsed.cash).toBe(1);
    expect(result.reconciliationDelta).toBeCloseTo(0, 2);
  });

  it('returns "duplicate" if sha256 already exists', async () => {
    const client = makeMockClient();
    // force dedup hit
    (client as any).from = (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing-upload' } }) }),
      }),
    });
    const result = await importAolbFile({
      filename: 'AOLB Account 001 - 2024.xls',
      xml: fakeXml,
      client: client as any,
      uploadedBy: 'kareem.hady@gmail.com',
    });
    expect(result.status).toBe('duplicate');
  });

  it('rejects filenames that do not match the AOLB pattern', async () => {
    const client = makeMockClient();
    await expect(
      importAolbFile({
        filename: 'not-an-aolb-file.xls',
        xml: fakeXml,
        client: client as any,
        uploadedBy: 'k@x',
      }),
    ).rejects.toThrow(/filename/i);
  });
});
