import { describe, it, expect } from 'vitest';
import { parseAolbXml, AolbParseError } from './parse-aolb';

const minimalXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="ag-grid">
    <Table>
      <Row><Cell><Data ss:Type="String">Open Balance 0.00</Data></Cell></Row>
      <Row/>
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
        <Cell><Data ss:Type="String">40079967</Data></Cell>
        <Cell><Data ss:Type="String">12-02-2024</Data></Cell>
        <Cell><Data ss:Type="String">Buy Invoice</Data></Cell>
        <Cell><Data ss:Type="String">Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000</Data></Cell>
        <Cell><Data ss:Type="Number">4405.10</Data></Cell>
        <Cell><Data ss:Type="Number">0</Data></Cell>
        <Cell><Data ss:Type="Number">18194.90</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
      </Row>
      <Row><Cell><Data ss:Type="String">Close Balance 18194.90</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`;

describe('parseAolbXml', () => {
  it('extracts open + close balance', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.openBalance).toBe(0);
    expect(r.closeBalance).toBeCloseTo(18194.90, 2);
  });

  it('emits one data row (skipping header + open/close lines)', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      details: '40079967',
      occurredAt: '2024-02-12',
      opType: 'Buy Invoice',
      description: expect.stringContaining('T M G Holding'),
      debit: 4405.10,
      credit: 0,
      balanceAfter: 18194.90,
    });
  });

  it('parses DD-MM-YYYY → YYYY-MM-DD', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.rows[0].occurredAt).toBe('2024-02-12');
  });

  it('throws AolbParseError on non-spreadsheetml input', () => {
    expect(() => parseAolbXml('<html/>')).toThrow(AolbParseError);
  });

  it('handles ss:Index gaps (sparse cells)', () => {
    const sparse = minimalXml.replace(
      '<Cell><Data ss:Type="String">40079967</Data></Cell>',
      '<Cell ss:Index="1"><Data ss:Type="String">40079967</Data></Cell>',
    );
    const r = parseAolbXml(sparse);
    expect(r.rows).toHaveLength(1);
  });
});
