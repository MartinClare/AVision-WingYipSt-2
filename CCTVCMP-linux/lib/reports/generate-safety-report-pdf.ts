import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import { finished } from "stream/promises";
import { composeProfessionalSafetyNarrative } from "./compose-safety-report-narrative";
import type { ProfessionalFinding, SafetyReportData } from "./safety-report-types";

const PAGE_MARGIN = 48;
const BRAND = "#1f2937";
const MUTED = "#6b7280";

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

function fmtDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - PAGE_MARGIN) doc.addPage();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 44);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(BRAND).text(title.toUpperCase());
  doc.moveDown(0.25);
  doc.strokeColor("#d1d5db").lineWidth(1).moveTo(PAGE_MARGIN, doc.y).lineTo(doc.page.width - PAGE_MARGIN, doc.y).stroke();
  doc.moveDown(0.55);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, options?: { indent?: number; bold?: boolean; color?: string }) {
  doc
    .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10.5)
    .fillColor(options?.color ?? "#111827")
    .text(text, PAGE_MARGIN + (options?.indent ?? 0), doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2 - (options?.indent ?? 0),
      align: "justify",
      lineGap: 3,
    });
  doc.moveDown(0.35);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  for (const item of items) {
    ensureSpace(doc, 36);
    paragraph(doc, `• ${item}`, { indent: 10 });
  }
}

function riskBadge(doc: PDFKit.PDFDocument, label: string, x: number, y: number): void {
  const color = riskColor(label);
  doc.roundedRect(x, y, 118, 28, 4).fill(color);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff").text(`RISK: ${label.toUpperCase()}`, x + 10, y + 8);
}

function metricsRow(doc: PDFKit.PDFDocument, data: SafetyReportData): void {
  const items = [
    ["Inspections", String(data.summary.analysisReports)],
    ["Incidents", String(data.summary.totalIncidents)],
    ["Elevated alerts", String(data.summary.elevatedReports)],
    ["Cameras", String(data.summary.camerasReporting)],
  ];
  const width = (doc.page.width - PAGE_MARGIN * 2 - 18) / 4;
  let x = PAGE_MARGIN;
  const y = doc.y;
  for (const [label, value] of items) {
    doc.roundedRect(x, y, width, 42, 4).stroke("#e5e7eb");
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, x + 8, y + 8, { width: width - 16 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND).text(value, x + 8, y + 22, { width: width - 16 });
    x += width + 6;
  }
  doc.y = y + 54;
}

function renderFinding(doc: PDFKit.PDFDocument, index: number, finding: ProfessionalFinding): void {
  ensureSpace(doc, 120);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(BRAND).text(`${index}. ${finding.location}`);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(priorityColor(finding.priority)).text(`Priority: ${finding.priority}`, PAGE_MARGIN + 280, doc.y - 12);
  doc.moveDown(0.15);
  paragraph(doc, `Observation: ${finding.observation}`);
  paragraph(doc, `Hazard assessment: ${finding.hazardAssessment}`, { color: "#374151" });
  paragraph(doc, `Required action: ${finding.requiredAction}`, { bold: true });
  doc.moveDown(0.25);
}

export async function generateSafetyReportPdf(data: SafetyReportData, outputPath: string): Promise<void> {
  const narrative = composeProfessionalSafetyNarrative(data);
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" });
  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  // Header block
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND).text("CONSTRUCTION SITE SAFETY REPORT", PAGE_MARGIN, PAGE_MARGIN);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text("AXON Vision — Central Monitoring Platform", PAGE_MARGIN, doc.y + 4);
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(BRAND).text(data.title);
  doc.moveDown(0.35);
  paragraph(doc, `Project / Site: ${data.projectName}`, { bold: true });
  paragraph(doc, `Report reference: ${narrative.reportReference}`, { color: MUTED });
  paragraph(doc, `Reporting period: ${fmtDateTime(data.rangeStart)} to ${fmtDateTime(data.rangeEnd)}`, { color: MUTED });
  paragraph(doc, `Prepared: ${fmtDateTime(data.generatedAt)}`, { color: MUTED });
  paragraph(doc, `Prepared by: ${narrative.preparedBy}`, { color: MUTED });

  riskBadge(doc, narrative.overallRiskRating, doc.page.width - PAGE_MARGIN - 118, PAGE_MARGIN + 4);
  doc.moveDown(0.6);
  metricsRow(doc, data);

  sectionTitle(doc, "1. Executive Summary");
  for (const p of narrative.executiveSummary) paragraph(doc, p);
  paragraph(doc, narrative.overallRiskStatement, { bold: true, color: riskColor(narrative.overallRiskRating) });

  sectionTitle(doc, "2. Scope & Methodology");
  bulletList(doc, narrative.scopeAndMethod);

  sectionTitle(doc, "3. Key Observations");
  bulletList(doc, narrative.keyObservations);

  sectionTitle(doc, "4. Thematic Safety Assessment");
  paragraph(doc, "4.1 Personal Protective Equipment (PPE)", { bold: true });
  paragraph(doc, narrative.thematicAssessment.ppe);
  paragraph(doc, "4.2 Construction Safety", { bold: true });
  paragraph(doc, narrative.thematicAssessment.construction);
  paragraph(doc, "4.3 Fire Safety", { bold: true });
  paragraph(doc, narrative.thematicAssessment.fire);
  paragraph(doc, "4.4 Site Security & Access", { bold: true });
  paragraph(doc, narrative.thematicAssessment.security);

  sectionTitle(doc, "5. Priority Findings & Required Actions");
  if (!narrative.priorityFindings.length) {
    paragraph(doc, "No priority findings requiring escalation were identified during this period. Continue routine monitoring and daily coordination of safety controls.");
  } else {
    narrative.priorityFindings.forEach((finding, index) => renderFinding(doc, index + 1, finding));
  }

  sectionTitle(doc, "6. Incident Review");
  bulletList(doc, narrative.incidentReview);

  sectionTitle(doc, "7. Corrective Actions");
  bulletList(doc, narrative.correctiveActions);

  sectionTitle(doc, "8. Recommendations to Site Management");
  bulletList(doc, narrative.managementRecommendations);

  sectionTitle(doc, "9. Surveillance Coverage Summary");
  bulletList(doc, narrative.surveillanceSummary);

  sectionTitle(doc, "10. Conclusion");
  for (const p of narrative.conclusion) paragraph(doc, p);

  ensureSpace(doc, 80);
  doc.moveDown(1.2);
  doc.strokeColor("#9ca3af").lineWidth(0.5).moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + 220, doc.y).stroke();
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Site Safety Officer", PAGE_MARGIN, doc.y + 8);
  doc.text("AXON Vision CMP — Automated Safety Reporting", PAGE_MARGIN, doc.y + 4);
  doc.text(`Report ref: ${narrative.reportReference}`, PAGE_MARGIN, doc.y + 4);

  doc.end();
  await finished(stream);
}
