/**
 * Design-demo fixture — data distilled from
 * `docs/new-frontend/design/protean-shell-prototype.html` (finance pack).
 *
 * Purpose: make the live shell visually match the approved design reference.
 * This is fixture UI data, not a live model answer (Law 1: not hidden as truth).
 * New conversations start empty; this seeds the default active thread only.
 */
import type { AppState, Conversation } from '../state/appState';

/** Keep in sync with PREVIEW_WIDTH_DEFAULT_PX in appState (avoid circular import). */
const PREVIEW_WIDTH_DEFAULT_PX = 416;

const DEMO_CONV_ID = 'design-demo-finance';
const DEMO_USER_MSG = 'design-demo-user-1';
const DEMO_ASST_MSG = 'design-demo-asst-1';
const DEMO_ART_ID = 'design-demo-art-1';

const FINANCE_ARTEFACT_HTML = `
<div class="paper"><div class="doc">
  <h1>FY24 margin integrity — COGS restatement</h1>
  <div class="sub">Board memo · prepared for decision · design demo</div>
  <h2>Bottom line up front</h2>
  <div class="bluf">Booked product margins are understated by a data defect, not a trading failure. Restating to cash-verified cost moves group GP from <b class="num">($299,408)</b> to <b class="num">$810,843</b>. <b>Decision requested:</b> approve a correcting journal (FY24 is closed) — no in-place rewrite.</div>
  <h2>The numbers</h2>
  <table class="fin">
    <thead><tr><th>Entity</th><th style="text-align:right">Booked GP</th><th style="text-align:right">Restated GP</th><th style="text-align:right">COGS overstated</th></tr></thead>
    <tbody>
      <tr><td>Retail</td><td class="n neg">(311,232)</td><td class="n">303,861</td><td class="n">615,093</td></tr>
      <tr><td>Wholesale</td><td class="n">8,656</td><td class="n">448,627</td><td class="n">439,971</td></tr>
      <tr><td>Brisbane</td><td class="n neg">(18,787)</td><td class="n">33,802</td><td class="n">52,589</td></tr>
      <tr><td>Burleigh</td><td class="n">21,955</td><td class="n">24,553</td><td class="n">2,598</td></tr>
      <tr class="total"><td>Group</td><td class="n neg">(299,408)</td><td class="n">810,843</td><td class="n">1,110,251</td></tr>
    </tbody>
  </table>
  <h2>Why it happened</h2>
  <p>Negative-inventory and transfer revaluations flowed into the valuation layer, inflating outbound COGS. The trustworthy anchor is the ex-GST cost on <b>paid</b> supplier invoices. <span class="ep fact">FACT</span></p>
  <h2>Recommendation</h2>
  <p>Post a correcting journal per entity (Dr Inventory / Cr COGS) for the overstatement. Draft only — never auto-posted. Net group P&amp;L effect <b class="num">+$1,110,251</b> gross profit.</p>
</div></div>`.trim();

function financeDemoConversation(): Conversation {
  return {
    id: DEMO_CONV_ID,
    title: 'FY24 margin integrity — COGS restatement',
    status: 'idle',
    activeArtefactId: DEMO_ART_ID,
    artefacts: [
      {
        id: DEMO_ART_ID,
        artefactType: 'html',
        title: 'Board memo — FY24 margin integrity',
        content: FINANCE_ARTEFACT_HTML,
        status: 'complete',
        savedPath: null,
      },
    ],
    messages: [
      {
        id: DEMO_USER_MSG,
        role: 'user',
        content:
          'Our FY24 product margins look wrong — some bikes show a loss. Is the COGS trustworthy, and what\'s the real group GP?',
      },
      {
        id: DEMO_ASST_MSG,
        role: 'assistant',
        content: '',
        bodyHtml: `<p>Short answer: <b>the booked COGS is not trustworthy</b> — negative-inventory transfer revaluations inflated it. Anchoring to <b>cash-verified supplier-invoice cost</b> instead <span class="ep fact">FACT</span> restates the group from a booked loss to a real profit.</p>
<p>On the 338 cash-verified products at or below 20% booked margin, group GP moves from <span class="num">($299,408)</span> booked to <span class="num">$810,843</span> restated — COGS overstated by <b class="num">~$1,110,251</b>. <span class="ep fact">FACT</span></p>
<p>Direction isn't uniform: about four in five products were overstated, but a few genuinely sold below cost <span class="ep est">ESTIMATE</span> — real pricing issues, not a data defect. I've drafted the board memo in the preview →</p>`,
        cite: [
          'account.move.line (paid bills)',
          'pos.order.line / sale.order.line',
          'stock.valuation.layer',
        ],
        toolChips: [
          { tool: 'dataLakeQuery', arg: 'account.move.line · in_invoice · paid', ms: 214 },
          { tool: 'dataLakeQuery', arg: 'pos+sale line · price_subtotal', ms: 186 },
          { tool: 'fileRead', arg: 'stock.valuation.layer', ms: 92 },
        ],
        worklogSummary:
          'Restated group GP from booked cost anchor — 7 steps, 3 tools, 1 subagent',
        stats: {
          turnId: 'design-demo-turn',
          cacheHit: false,
          model: 'design-demo',
          timings: { ttftMs: 612, totalMs: 4100 },
        },
        activities: [
          {
            id: 'd1',
            kind: 'stage',
            worklogKind: 'watcher',
            label: 'Planned the turn',
            text: 'Deterministic assembly picked the Strong tier and a sequential tool plan: prove the cost anchor before trusting any margin. Cache checked — miss.',
            done: true,
            durationMs: 38,
          },
          {
            id: 'd2',
            kind: 'thinking',
            worklogKind: 'think',
            label: 'Reasoning',
            text: "Booked COGS comes off the valuation layer, which is polluted by negative-inventory transfer revaluations. I shouldn't trust it. The defensible anchor is the ex-GST cost on paid supplier invoices — that chain is cash-provable.",
            done: true,
          },
          {
            id: 'd3',
            kind: 'tool',
            worklogKind: 'tool',
            label: 'Queried the data-lake',
            code: 'dataLakeQuery',
            text: 'account.move.line where move_type=in_invoice and payment_state in (paid, in_payment) — 1,147 paid bills matched.',
            done: true,
            durationMs: 214,
          },
          {
            id: 'd4',
            kind: 'tool',
            worklogKind: 'tool',
            label: 'Queried the data-lake',
            code: 'dataLakeQuery',
            text: 'Revenue leg: pos.order.line + sale.order.line price_subtotal, joined to product.',
            done: true,
            durationMs: 186,
          },
          {
            id: 'd5',
            kind: 'tool',
            worklogKind: 'file',
            label: 'Read the valuation layer',
            code: 'stock.valuation.layer',
            text: 'Pulled booked outbound COGS for comparison — confirmed it diverges from the invoice-cost anchor.',
            done: true,
            durationMs: 92,
          },
          {
            id: 'd6',
            kind: 'stage',
            worklogKind: 'subagent',
            label: 'Ran the Forensic analyst',
            badge: 'subagent',
            text: 'Traced 338 sub-20%-margin products to source; 4 of 5 overstated. Overstatement totals $1,110,251.',
            done: true,
            durationMs: 3210,
          },
          {
            id: 'd7',
            kind: 'stage',
            worklogKind: 'task',
            label: 'Drafted the board memo',
            text: 'Handed the restated figures to the Report scribe → building the artefact in the preview pane.',
            done: true,
            durationMs: 340,
          },
        ],
        segments: [
          { kind: 'artefact', artefactId: DEMO_ART_ID, title: 'Board memo — FY24 margin integrity', artefactType: 'html' },
        ],
      },
    ],
  };
}

function stubConversation(id: string, title: string): Conversation {
  return {
    id,
    title,
    status: 'idle',
    activeArtefactId: null,
    artefacts: [],
    messages: [],
  };
}

/** Initial app state matching the design-bundle shell prototype (finance demo). */
export function designDemoInitialState(): AppState {
  const demo = financeDemoConversation();
  return {
    conversations: [
      demo,
      stubConversation('design-demo-bas', 'BAS Q4 reconciliation gaps'),
      stubConversation('design-demo-vendor', 'Vendor contract — renewal brief'),
      stubConversation('design-demo-stores', 'Store profitability — Burleigh vs Brisbane'),
    ],
    activeId: demo.id,
    settings: { tier: 'strong', domainId: 'finance' },
    railOpen: false,
    previewOpen: true,
    previewWidth: PREVIEW_WIDTH_DEFAULT_PX,
  };
}
