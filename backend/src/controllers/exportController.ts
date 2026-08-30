import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';

/**
 * Export compliance — PostgreSQL.
 *
 * Ghanaian timber and produce bound for the US or EU needs real paperwork:
 *   • a US Lacey Act plant declaration (genus/species, country of harvest, value)
 *   • an EU FLEGT licence
 *   • a commercial invoice
 *   • a phytosanitary certificate
 *
 * These PDFs are generated here. Getting the species names right matters —
 * a wrong declaration is a customs seizure.
 */

/** Ghanaian timber, common name → scientific name. */
const SPECIES: Record<string, { genus: string; species: string }> = {
  odum:     { genus: 'Milicia',           species: 'excelsa' },
  iroko:    { genus: 'Milicia',           species: 'excelsa' },
  wawa:     { genus: 'Triplochiton',      species: 'scleroxylon' },
  mahogany: { genus: 'Khaya',             species: 'ivorensis' },
  teak:     { genus: 'Tectona',           species: 'grandis' },
  bamboo:   { genus: 'Bambusa',           species: 'vulgaris' },
  edinam:   { genus: 'Entandrophragma',   species: 'angolense' },
  sapele:   { genus: 'Entandrophragma',   species: 'cylindricum' },
  ofram:    { genus: 'Terminalia',        species: 'superba' },
  emeri:    { genus: 'Terminalia',        species: 'ivorensis' },
};

/** The documents an export order must produce before it can ship. */
const REQUIRED_DOCS = [
  'Commercial invoice',
  'Packing list',
  'Certificate of origin',
  'Phytosanitary certificate',
  'FLEGT licence (EU)',
  'Lacey Act declaration (US)',
  'Bill of lading',
];

async function loadExportOrder(orderId: string) {
  const [order] = await q<any>(
    `SELECT o.*,
            b.full_name AS buyer_name, b.company AS buyer_company,
            b.address AS buyer_address, b.email AS buyer_email, b.phone AS buyer_phone,
            s.full_name AS seller_name, s.company AS seller_company,
            s.address AS seller_address, s.email AS seller_email, s.phone AS seller_phone,
            s.export_licence_number
       FROM orders o
       JOIN users b ON b.id = o.buyer_id
       JOIN users s ON s.id = o.seller_id
      WHERE o.id = $1::uuid`,
    [orderId],
  );
  if (!order) return null;

  const items = await q<any>(
    `SELECT i.title, i.quantity, i.unit_price, i.subtotal,
            COALESCE(i.species, p.species) AS species,
            p.unit, p.origin, p.flegt_licence
       FROM order_items i
       LEFT JOIN products p ON p.id = i.product_id
      WHERE i.order_id = $1::uuid`,
    [orderId],
  );
  return { order, items };
}

/** GET /api/export/lacey-act/:orderId — the US plant declaration, as a PDF. */
export const generateLaceyActDeclaration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadExportOrder(req.params.orderId);
    if (!loaded) { res.status(404).json({ error: 'Order not found.' }); return; }

    const { order, items } = loaded;
    if (!order.is_export) {
      res.status(400).json({ error: 'This is not an export order.' });
      return;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=lacey-act-${order.order_number}.pdf`);
    doc.pipe(res);

    doc.fontSize(16).text('PLANT AND PLANT PRODUCT DECLARATION', { align: 'center' });
    doc.fontSize(9).text('US Lacey Act — Form PPQ 505', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(10);
    doc.text(`Order: ${order.order_number}`);
    doc.text(`Exporter: ${order.seller_company || order.seller_name}`);
    doc.text(`Export licence: ${order.export_licence_number || 'Not supplied'}`);
    doc.text(`Importer: ${order.buyer_company || order.buyer_name}`);
    doc.text(`Destination: ${order.destination_country || 'United States'}`);
    doc.text(`Date: ${new Date().toDateString()}`);
    doc.moveDown();

    doc.fontSize(11).text('Declared plant material', { underline: true });
    doc.moveDown(0.5);

    let total = 0;
    for (const item of items) {
      const common = (item.species || '').toLowerCase();
      const sci = SPECIES[common] || { genus: 'Unknown', species: 'spp.' };
      const value = Number(item.subtotal);
      total += value;

      doc.fontSize(9);
      doc.text(`Genus: ${sci.genus}    Species: ${sci.species}`);
      doc.text(`Common name: ${item.species || item.title}`);
      doc.text(`Country of harvest: ${item.origin || 'Ghana'}`);
      doc.text(`Quantity: ${Number(item.quantity)} ${item.unit || 'm³'}`);
      doc.text(`Declared value: GHS ${value.toLocaleString()}`);
      if (item.flegt_licence) doc.text(`FLEGT licence: ${item.flegt_licence}`);
      doc.moveDown(0.6);
    }

    doc.moveDown();
    doc.fontSize(10).text(`Total declared value: GHS ${total.toLocaleString()}`);
    doc.moveDown(2);
    doc.fontSize(8).text(
      'I certify that the information above is true and correct to the best of my knowledge. ' +
      'Making a false declaration is an offence under the US Lacey Act (16 U.S.C. §§ 3371-3378).',
      { align: 'justify' },
    );
    doc.moveDown(2);
    doc.text('Signature: ______________________________     Date: ____________');

    doc.end();

    // Record that it was produced.
    await q(`UPDATE orders SET lacey_act_generated = TRUE WHERE id = $1::uuid`,
      [req.params.orderId]).catch(() => {});
    await q(
      `INSERT INTO export_compliance_items (order_id, item, completed, completed_at)
       VALUES ($1::uuid, 'Lacey Act declaration (US)', TRUE, now())
       ON CONFLICT (order_id, item)
         DO UPDATE SET completed = TRUE, completed_at = now()`,
      [req.params.orderId],
    ).catch(() => {});
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};

/** GET /api/export/invoice/:orderId — the commercial invoice, as a PDF. */
export const generateCommercialInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadExportOrder(req.params.orderId);
    if (!loaded) { res.status(404).json({ error: 'Order not found.' }); return; }

    const { order, items } = loaded;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=invoice-${order.order_number}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text('COMMERCIAL INVOICE', { align: 'center' });
    doc.fontSize(9).text('NationMart · Desward Technology · Ghana', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(10);
    doc.text(`Invoice: ${order.order_number}`);
    doc.text(`Date: ${new Date(order.created_at).toDateString()}`);
    doc.moveDown();

    doc.fontSize(11).text('Exporter', { underline: true });
    doc.fontSize(9);
    doc.text(order.seller_company || order.seller_name);
    if (order.seller_address) doc.text(order.seller_address);
    if (order.seller_email) doc.text(order.seller_email);
    if (order.export_licence_number) doc.text(`Export licence: ${order.export_licence_number}`);
    doc.moveDown();

    doc.fontSize(11).text('Importer', { underline: true });
    doc.fontSize(9);
    doc.text(order.buyer_company || order.buyer_name);
    if (order.buyer_address) doc.text(order.buyer_address);
    if (order.buyer_email) doc.text(order.buyer_email);
    doc.moveDown(1.5);

    doc.fontSize(11).text('Goods', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    for (const item of items) {
      doc.text(
        `${item.title}${item.species ? ` (${item.species})` : ''} · ` +
        `${Number(item.quantity)} ${item.unit || 'unit'} × ` +
        `GHS ${Number(item.unit_price).toLocaleString()} = ` +
        `GHS ${Number(item.subtotal).toLocaleString()}`,
      );
    }

    doc.moveDown();
    doc.fontSize(11).text(
      `TOTAL: ${order.currency} ${Number(order.total_amount).toLocaleString()}`,
      { align: 'right' },
    );
    doc.moveDown(2);
    doc.fontSize(8).text('Country of origin: Ghana');
    doc.text(`Destination: ${order.destination_country || 'Not specified'}`);

    doc.end();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};

/** GET /api/export/compliance/:orderId — how much paperwork is still outstanding. */
export const getComplianceStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [order] = await q<any>(
      `SELECT order_number, is_export, destination_country, lacey_act_generated
         FROM orders WHERE id = $1::uuid`,
      [req.params.orderId],
    );
    if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }

    // Seed the checklist the first time it is asked for.
    for (const item of REQUIRED_DOCS) {
      await q(
        `INSERT INTO export_compliance_items (order_id, item)
         VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
        [req.params.orderId, item],
      );
    }

    const checklist = await q<any>(
      `SELECT item, completed, document_url, completed_at
         FROM export_compliance_items
        WHERE order_id = $1::uuid
        ORDER BY id`,
      [req.params.orderId],
    );

    const done = checklist.filter((c) => c.completed).length;
    res.json({
      orderNumber: order.order_number,
      isExport: order.is_export,
      destination: order.destination_country,
      complianceProgress: `${done}/${checklist.length}`,
      percentComplete: checklist.length ? Math.round((done / checklist.length) * 100) : 0,
      checklist,
      laceyActReady: order.lacey_act_generated,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** PATCH /api/export/compliance/:orderId/checklist — tick off a document. */
export const updateComplianceItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { item, completed, documentUrl } = req.body;
    const rows = await q<any>(
      `UPDATE export_compliance_items
          SET completed = $3,
              document_url = COALESCE($4, document_url),
              completed_at = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE order_id = $1::uuid AND item = $2
        RETURNING *`,
      [req.params.orderId, item, !!completed, documentUrl ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Checklist item not found.' }); return; }
    res.json({ item: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
