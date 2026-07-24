import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import { finished } from "stream/promises";
import {
  composeDailyManagementNarrative,
  composeProfessionalSafetyNarrative,
} from "./compose-safety-report-narrative";
import type {
  DailyManagementNarrative,
  ProfessionalFinding,
  SafetyHighlight,
  SafetyReportData,
  ThemeSummary,
  UnverifiedObservation,
} from "./safety-report-types";

const PAGE_MARGIN = 48;
const BRAND = "#1f2937";
const MUTED = "#6b7280";

function statusColor(status: string): string {
  switch (status) {
    case "Priority Attention":
      return "#b45309";
    case "Attention Required":
      return "#2563eb";
    default:
      return "#15803d";
  }
}

function riskColor(risk: string): string {
  switch (risk.toLowerCase()) {
    case "critical":
      return "#7f1d1d";
    case "high":
      return "#c0392b";
    case "medium":
      return "#b45309";
    default:
      return "#15803d";
  }
}

function priorityColor(priority: ProfessionalFinding["priority"]): string {
  switch (priority) {
    case "Immediate":
      return "#7f1d1d";
    case "High":
      return "#c0392b";
    case "Medium":
      return "#b45309";
    default:
      return "#4b5563";
  }
}

function evidenceLabel(status: SafetyHighlight["evidenceStatus"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed evidence (same report photo + text)";
    case "unverified":
      return "Unverified AI observation (photo from same report)";
    default:
      return "Dismissed pattern — not a confirmed finding";
  }
}

function fmtDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - PAGE_MARGIN) doc.addPage();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 44);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(BRAND).text(title.toUpperCase(), PAGE_MARGIN, doc.y, {
    width: doc.page.width - PAGE_MARGIN * 2,
  });
  doc.moveDown(0.25);
  doc
    .strokeColor("#d1d5db")
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.55);
}

function sanitizePdfText(text: string): string {
  // Helvetica cannot render CJK or other non-Latin source glyphs reliably. DOCX
  // preserves the original Unicode content; PDF uses the readable ASCII portion.
  const cleaned = text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/(?:\s*\.){2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "AI text was not available in a PDF-compatible language.";
}

function paragraph(
  doc: PDFKit.PDFDocument,
  text: string,
  options?: { indent?: number; bold?: boolean; color?: string },
) {
  doc
    .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10.5)
    .fillColor(options?.color ?? "#111827")
    .text(sanitizePdfText(text), PAGE_MARGIN + (options?.indent ?? 0), doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2 - (options?.indent ?? 0),
      align: "justify",
      lineGap: 3,
    });
  doc.moveDown(0.35);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  for (const item of items.map(sanitizePdfText).filter((item) => /[A-Za-z0-9]{2}/.test(item))) {
    ensureSpace(doc, 36);
    paragraph(doc, `• ${item}`, { indent: 10 });
  }
}

function kpiRow(doc: PDFKit.PDFDocument, narrative: DailyManagementNarrative): void {
  const items = [
    ["Reviews", String(narrative.kpis.reviewsCompleted)],
    ["Cameras", String(narrative.kpis.camerasReporting)],
    ["Highlights", String(narrative.kpis.noteworthyObservations)],
    ["Resolved", String(narrative.kpis.resolvedItems)],
    ["Attention", String(narrative.kpis.itemsRequiringAttention)],
  ];
  const width = (doc.page.width - PAGE_MARGIN * 2 - 24) / 5;
  let x = PAGE_MARGIN;
  const y = doc.y;
  for (const [label, value] of items) {
    doc.roundedRect(x, y, width, 42, 4).stroke("#e5e7eb");
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, x + 8, y + 8, { width: width - 16 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND).text(value, x + 8, y + 22, { width: width - 16 });
    x += width + 6;
  }
  doc.x = PAGE_MARGIN;
  doc.y = y + 54;
}

function renderTheme(doc: PDFKit.PDFDocument, theme: ThemeSummary): void {
  ensureSpace(doc, 70);
  paragraph(doc, `${theme.label} (${theme.observationCount} observations, ${theme.cameraCount} cameras)`, {
    bold: true,
  });
  paragraph(doc, theme.summary);
  if (theme.recurringConclusions.length) {
    bulletList(doc, theme.recurringConclusions);
  }
}

function renderHighlight(doc: PDFKit.PDFDocument, index: number, highlight: SafetyHighlight): void {
  ensureSpace(doc, 220);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(BRAND)
    .text(sanitizePdfText(`${index}. ${highlight.heading}`), PAGE_MARGIN, doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      sanitizePdfText(
        `${fmtDateTime(highlight.observedAt)} HKT · ${highlight.cameraName} · ${evidenceLabel(highlight.evidenceStatus)}`,
      ),
      PAGE_MARGIN,
      doc.y,
      { width: doc.page.width - PAGE_MARGIN * 2 },
    );
  doc.moveDown(0.35);

  if (highlight.imageBytes) {
    try {
      const imgWidth = 260;
      const imgHeight = 155;
      ensureSpace(doc, imgHeight + 20);
      doc.image(highlight.imageBytes, PAGE_MARGIN, doc.y, {
        fit: [imgWidth, imgHeight],
        valign: "center",
      });
      doc.x = PAGE_MARGIN;
      doc.y += imgHeight + 8;
    } catch {
      paragraph(doc, "(Evidence photo could not be embedded.)", { color: MUTED });
    }
  }

  paragraph(doc, `Observation: ${highlight.observation}`);
  paragraph(doc, `Potential consideration: ${highlight.potentialConsideration}`, { color: "#374151" });
  if (highlight.positiveResponse) {
    paragraph(doc, `Positive response: ${highlight.positiveResponse}`, { color: "#166534" });
  }
  paragraph(doc, `Suggested improvement scheme: ${highlight.suggestedImprovement}`, { bold: true });
  doc.moveDown(0.3);
}

function renderUnverified(doc: PDFKit.PDFDocument, item: UnverifiedObservation): void {
  ensureSpace(doc, 60);
  paragraph(doc, `${item.label} (${item.observationCount} readings)`, { bold: true });
  paragraph(doc, item.summary, { color: "#374151" });
  paragraph(doc, `Why separate: ${item.reason}`, { color: MUTED });
}

function renderFinding(doc: PDFKit.PDFDocument, index: number, finding: ProfessionalFinding): void {
  ensureSpace(doc, 120);
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(BRAND).text(`${index}. ${finding.location}`, PAGE_MARGIN, y, {
    width: 260,
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(priorityColor(finding.priority))
    .text(`Priority: ${finding.priority}`, PAGE_MARGIN + 280, y, { width: 160 });
  doc.x = PAGE_MARGIN;
  doc.y = Math.max(doc.y, y + 14);
  paragraph(doc, `Observation: ${finding.observation}`);
  paragraph(doc, `Hazard assessment: ${finding.hazardAssessment}`, { color: "#374151" });
  paragraph(doc, `Required action: ${finding.requiredAction}`, { bold: true });
  doc.moveDown(0.25);
}

async function generateDailyPdf(data: SafetyReportData, outputPath: string): Promise<void> {
  const narrative = composeDailyManagementNarrative(data);
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" });
  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(BRAND)
    .text("DAILY SAFETY REVIEW", PAGE_MARGIN, PAGE_MARGIN, {
      width: doc.page.width - PAGE_MARGIN * 2 - 160,
    });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(MUTED)
    .text("AXON Vision — Evidence-Backed Site Summary", PAGE_MARGIN, doc.y + 4, {
      width: doc.page.width - PAGE_MARGIN * 2 - 160,
    });
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND).text(data.title, PAGE_MARGIN, doc.y, {
    width: doc.page.width - PAGE_MARGIN * 2,
  });
  doc.moveDown(0.35);
  paragraph(doc, `Project / Site: ${data.projectName}`, { bold: true });
  paragraph(doc, `Report reference: ${narrative.reportReference}`, { color: MUTED });
  paragraph(doc, `Reporting period: ${fmtDateTime(data.rangeStart)} to ${fmtDateTime(data.rangeEnd)} HKT`, {
    color: MUTED,
  });
  paragraph(doc, `Prepared: ${fmtDateTime(data.generatedAt)} HKT`, { color: MUTED });
  paragraph(doc, `Prepared by: ${narrative.preparedBy}`, { color: MUTED });
  paragraph(doc, `Report confidence: ${narrative.confidence}`, { color: MUTED });

  const flowXAfterMeta = doc.x;
  const flowYAfterMeta = doc.y;
  const badgeColor = statusColor(narrative.dailyStatus);
  doc.roundedRect(doc.page.width - PAGE_MARGIN - 150, PAGE_MARGIN + 4, 150, 28, 4).fill(badgeColor);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#ffffff")
    .text(narrative.dailyStatus.toUpperCase(), doc.page.width - PAGE_MARGIN - 140, PAGE_MARGIN + 12, {
      width: 130,
      align: "center",
    });
  doc.x = flowXAfterMeta;
  doc.y = flowYAfterMeta;

  doc.moveDown(0.5);
  kpiRow(doc, narrative);

  sectionTitle(doc, "1. Management Summary");
  paragraph(doc, narrative.overviewParagraph);
  paragraph(doc, narrative.comparisonNote, { color: "#374151" });

  sectionTitle(doc, "2. Safety Observation Profile");
  if (!narrative.themeSummaries.length) {
    paragraph(doc, "No recurring elevated safety themes were identified from structured AI text in this window.");
  } else {
    for (const theme of narrative.themeSummaries) renderTheme(doc, theme);
  }

  sectionTitle(doc, "3. Photo-Supported Highlights");
  if (!narrative.highlights.length) {
    paragraph(
      doc,
      "No photo-supported highlights were selected for this period. Unverified or known false-positive patterns are summarised separately below.",
    );
  } else {
    narrative.highlights.forEach((highlight, index) => renderHighlight(doc, index + 1, highlight));
  }

  sectionTitle(doc, "4. Unverified AI Observations");
  if (!narrative.unverifiedObservations.length) {
    paragraph(doc, "No separate unverified or dismissed AI observation patterns were retained for this window.");
  } else {
    for (const item of narrative.unverifiedObservations) renderUnverified(doc, item);
  }

  sectionTitle(doc, "5. Positive / Normal Observations");
  if (!narrative.positivePractices.length) {
    paragraph(doc, "No separate positive practices were recorded for this window.");
  } else {
    for (const practice of narrative.positivePractices) {
      paragraph(doc, `${practice.title}: ${practice.description}`);
    }
  }

  sectionTitle(doc, "6. Improvement Scheme");
  for (const scheme of narrative.improvementSchemes) {
    ensureSpace(doc, 70);
    paragraph(doc, `${scheme.horizon}: ${scheme.theme}`, { bold: true });
    paragraph(doc, scheme.scheme);
    paragraph(doc, `Intended benefit: ${scheme.intendedBenefit}`, { color: "#374151" });
    paragraph(doc, `Suggested team: ${scheme.suggestedTeam}`, { color: MUTED });
  }

  sectionTitle(doc, "7. Coverage and Methodology");
  bulletList(doc, [
    ...narrative.monitoringNotes,
    ...narrative.methodologyNotes,
    `Report confidence: ${narrative.confidence}`,
    `Cameras reporting: ${data.monitoring.camerasReporting} / ${data.monitoring.camerasExpected}`,
    `Elevated classifications: ${data.summary.elevatedReports}`,
  ]);

  sectionTitle(doc, "8. Closing Note");
  paragraph(doc, narrative.closingNote);

  ensureSpace(doc, 70);
  doc.moveDown(1);
  doc.strokeColor("#9ca3af").lineWidth(0.5).moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + 220, doc.y).stroke();
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Site Safety Coordination", PAGE_MARGIN, doc.y + 8);
  doc.text("AXON Vision CMP — Daily Safety Review", PAGE_MARGIN, doc.y + 4);
  doc.text(`Report ref: ${narrative.reportReference}`, PAGE_MARGIN, doc.y + 4);

  doc.end();
  await finished(stream);
}

async function generateWeeklyPdf(data: SafetyReportData, outputPath: string): Promise<void> {
  const narrative = composeProfessionalSafetyNarrative(data);
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" });
  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(BRAND)
    .text("CONSTRUCTION SITE SAFETY REPORT", PAGE_MARGIN, PAGE_MARGIN, {
      width: doc.page.width - PAGE_MARGIN * 2 - 130,
    });
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text("AXON Vision — Central Monitoring Platform", PAGE_MARGIN, doc.y + 4);
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(BRAND).text(data.title);
  doc.moveDown(0.35);
  paragraph(doc, `Project / Site: ${data.projectName}`, { bold: true });
  paragraph(doc, `Report reference: ${narrative.reportReference}`, { color: MUTED });
  paragraph(doc, `Reporting period: ${fmtDateTime(data.rangeStart)} to ${fmtDateTime(data.rangeEnd)}`, { color: MUTED });
  paragraph(doc, `Prepared: ${fmtDateTime(data.generatedAt)}`, { color: MUTED });
  paragraph(doc, `Prepared by: ${narrative.preparedBy}`, { color: MUTED });

  const flowXAfterMeta = doc.x;
  const flowYAfterMeta = doc.y;
  doc.roundedRect(doc.page.width - PAGE_MARGIN - 118, PAGE_MARGIN + 4, 118, 28, 4).fill(riskColor(narrative.overallRiskRating));
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#ffffff")
    .text(`RISK: ${narrative.overallRiskRating.toUpperCase()}`, doc.page.width - PAGE_MARGIN - 108, PAGE_MARGIN + 12);
  doc.x = flowXAfterMeta;
  doc.y = flowYAfterMeta;

  sectionTitle(doc, "1. Executive Summary");
  for (const p of narrative.executiveSummary) paragraph(doc, p);
  paragraph(doc, narrative.overallRiskStatement, { bold: true, color: riskColor(narrative.overallRiskRating) });

  sectionTitle(doc, "2. Key Observations");
  bulletList(doc, narrative.keyObservations);

  sectionTitle(doc, "3. Priority Findings");
  if (!narrative.priorityFindings.length) {
    paragraph(doc, "No priority findings requiring escalation were identified during this period.");
  } else {
    narrative.priorityFindings.forEach((finding, index) => renderFinding(doc, index + 1, finding));
  }

  sectionTitle(doc, "4. Improvement Recommendations");
  bulletList(doc, narrative.managementRecommendations);

  sectionTitle(doc, "5. Conclusion");
  for (const p of narrative.conclusion) paragraph(doc, p);

  doc.end();
  await finished(stream);
}

export async function generateSafetyReportPdf(data: SafetyReportData, outputPath: string): Promise<void> {
  if (data.period === "daily") {
    await generateDailyPdf(data, outputPath);
    return;
  }
  await generateWeeklyPdf(data, outputPath);
}
