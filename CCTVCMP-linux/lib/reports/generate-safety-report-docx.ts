import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { writeFileSync } from "fs";
import { composeProfessionalSafetyNarrative } from "./compose-safety-report-narrative";
import type { SafetyReportData } from "./safety-report-types";

function fmtDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true })],
  });
}

function body(text: string, options?: { bold?: boolean; italic?: boolean; spacingAfter?: number }) {
  return new Paragraph({
    spacing: { after: options?.spacingAfter ?? 180, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        italics: options?.italic,
        size: 22,
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function metaLine(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 21 }),
      new TextRun({ text: value, size: 21 }),
    ],
  });
}

function metricsTable(data: SafetyReportData) {
  const rows = [
    ["Inspections", "Incidents", "Elevated alerts", "Cameras"],
    [
      String(data.summary.analysisReports),
      String(data.summary.totalIncidents),
      String(data.summary.elevatedReports),
      String(data.summary.camerasReporting),
    ],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell,
                      bold: rowIndex === 0,
                      size: rowIndex === 0 ? 20 : 24,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
    ),
  });
}

function findingBlock(index: number, location: string, priority: string, parts: Array<[string, string]>) {
  return [
    heading(`${index}. ${location}`, HeadingLevel.HEADING_3),
    body(`Priority: ${priority}`, { bold: true, spacingAfter: 120 }),
    ...parts.flatMap(([label, value]) => [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: label, bold: true, size: 21 })],
      }),
      body(value, { spacingAfter: 140 }),
    ]),
  ];
}

export async function generateSafetyReportDocx(data: SafetyReportData, outputPath: string): Promise<void> {
  const narrative = composeProfessionalSafetyNarrative(data);
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: "CONSTRUCTION SITE SAFETY REPORT", bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: "AXON Vision — Central Monitoring Platform", size: 22, color: "666666" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: data.title, bold: true, size: 28 })],
    }),
    metaLine("Project / Site", data.projectName),
    metaLine("Report reference", narrative.reportReference),
    metaLine("Reporting period", `${fmtDateTime(data.rangeStart)} to ${fmtDateTime(data.rangeEnd)}`),
    metaLine("Prepared", fmtDateTime(data.generatedAt)),
    metaLine("Prepared by", narrative.preparedBy),
    new Paragraph({
      spacing: { before: 160, after: 200 },
      children: [
        new TextRun({ text: "Overall risk rating: ", bold: true, size: 24 }),
        new TextRun({ text: narrative.overallRiskRating.toUpperCase(), bold: true, size: 28 }),
      ],
    }),
    metricsTable(data),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  );

  children.push(heading("1. Executive Summary", HeadingLevel.HEADING_1));
  for (const paragraph of narrative.executiveSummary) children.push(body(paragraph));
  children.push(body(narrative.overallRiskStatement, { bold: true, spacingAfter: 240 }));

  children.push(heading("2. Scope & Methodology", HeadingLevel.HEADING_1));
  for (const item of narrative.scopeAndMethod) children.push(bullet(item));

  children.push(heading("3. Key Observations", HeadingLevel.HEADING_1));
  for (const item of narrative.keyObservations) children.push(bullet(item));

  children.push(heading("4. Thematic Safety Assessment", HeadingLevel.HEADING_1));
  children.push(heading("4.1 Personal Protective Equipment (PPE)", HeadingLevel.HEADING_2));
  children.push(body(narrative.thematicAssessment.ppe));
  children.push(heading("4.2 Construction Safety", HeadingLevel.HEADING_2));
  children.push(body(narrative.thematicAssessment.construction));
  children.push(heading("4.3 Fire Safety", HeadingLevel.HEADING_2));
  children.push(body(narrative.thematicAssessment.fire));
  children.push(heading("4.4 Site Security & Access", HeadingLevel.HEADING_2));
  children.push(body(narrative.thematicAssessment.security));

  children.push(heading("5. Priority Findings & Required Actions", HeadingLevel.HEADING_1));
  if (!narrative.priorityFindings.length) {
    children.push(
      body(
        "No priority findings requiring escalation were identified during this period. Continue routine monitoring and daily coordination of safety controls.",
      ),
    );
  } else {
    narrative.priorityFindings.forEach((finding, index) => {
      children.push(
        ...findingBlock(index + 1, finding.location, finding.priority, [
          ["Observation", finding.observation],
          ["Hazard assessment", finding.hazardAssessment],
          ["Required action", finding.requiredAction],
        ]),
      );
    });
  }

  children.push(heading("6. Incident Review", HeadingLevel.HEADING_1));
  for (const item of narrative.incidentReview) children.push(bullet(item));

  children.push(heading("7. Corrective Actions", HeadingLevel.HEADING_1));
  for (const item of narrative.correctiveActions) children.push(bullet(item));

  children.push(heading("8. Recommendations to Site Management", HeadingLevel.HEADING_1));
  for (const item of narrative.managementRecommendations) children.push(bullet(item));

  children.push(heading("9. Surveillance Coverage Summary", HeadingLevel.HEADING_1));
  for (const item of narrative.surveillanceSummary) children.push(bullet(item));

  children.push(heading("10. Conclusion", HeadingLevel.HEADING_1));
  for (const paragraph of narrative.conclusion) children.push(body(paragraph));

  children.push(
    new Paragraph({ spacing: { before: 360, after: 120 }, children: [] }),
    body("Site Safety Officer"),
    body("AXON Vision CMP — Automated Safety Reporting"),
    body(`Report ref: ${narrative.reportReference}`, { spacingAfter: 120 }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(outputPath, buffer);
}
