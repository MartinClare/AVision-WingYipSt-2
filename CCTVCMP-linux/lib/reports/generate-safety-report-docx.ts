import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { writeFileSync } from "fs";
import {
  composeDailyManagementNarrative,
  composeProfessionalSafetyNarrative,
} from "./compose-safety-report-narrative";
import type {
  DailyManagementNarrative,
  SafetyHighlight,
  SafetyReportData,
  ThemeSummary,
  UnverifiedObservation,
} from "./safety-report-types";

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

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true })],
  });
}

function body(text: string, options?: { bold?: boolean; italic?: boolean; spacingAfter?: number; color?: string }) {
  return new Paragraph({
    spacing: { after: options?.spacingAfter ?? 180, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        italics: options?.italic,
        size: 22,
        color: options?.color,
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

function kpiTable(narrative: DailyManagementNarrative) {
  const rows = [
    ["Reviews", "Cameras", "Highlights", "Resolved", "Attention"],
    [
      String(narrative.kpis.reviewsCompleted),
      String(narrative.kpis.camerasReporting),
      String(narrative.kpis.noteworthyObservations),
      String(narrative.kpis.resolvedItems),
      String(narrative.kpis.itemsRequiringAttention),
    ],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, rowIndex) =>
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

function themeBlocks(theme: ThemeSummary): Paragraph[] {
  const blocks = [
    body(`${theme.label} (${theme.observationCount} observations, ${theme.cameraCount} cameras)`, {
      bold: true,
      spacingAfter: 80,
    }),
    body(theme.summary),
  ];
  for (const conclusion of theme.recurringConclusions) blocks.push(bullet(conclusion));
  return blocks;
}

function highlightBlocks(highlight: SafetyHighlight, index: number): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    heading(`${index}. ${highlight.heading}`, HeadingLevel.HEADING_3),
    body(
      `${fmtDateTime(highlight.observedAt)} HKT · ${highlight.cameraName} · ${evidenceLabel(highlight.evidenceStatus)}`,
      { color: "666666", spacingAfter: 120 },
    ),
  ];

  if (highlight.imageBytes) {
    try {
      blocks.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new ImageRun({
              data: highlight.imageBytes,
              transformation: { width: 360, height: 220 },
              type: highlight.imageMimeType === "image/png" ? "png" : "jpg",
            }),
          ],
        }),
      );
    } catch {
      blocks.push(body("(Evidence photo could not be embedded.)", { color: "666666" }));
    }
  }

  blocks.push(
    body(`Observation: ${highlight.observation}`),
    body(`Potential consideration: ${highlight.potentialConsideration}`, { color: "374151" }),
  );
  if (highlight.positiveResponse) {
    blocks.push(body(`Positive response: ${highlight.positiveResponse}`, { color: "166534" }));
  }
  blocks.push(body(`Suggested improvement scheme: ${highlight.suggestedImprovement}`, { bold: true }));
  return blocks;
}

function unverifiedBlocks(item: UnverifiedObservation): Paragraph[] {
  return [
    body(`${item.label} (${item.observationCount} readings)`, { bold: true, spacingAfter: 80 }),
    body(item.summary, { color: "374151" }),
    body(`Why separate: ${item.reason}`, { color: "666666" }),
  ];
}

async function generateDailyDocx(data: SafetyReportData, outputPath: string): Promise<void> {
  const narrative = composeDailyManagementNarrative(data);
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: "DAILY SAFETY REVIEW", bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: "AXON Vision — Evidence-Backed Site Summary", size: 22, color: "666666" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: data.title, bold: true, size: 28 })],
    }),
    metaLine("Project / Site", data.projectName),
    metaLine("Report reference", narrative.reportReference),
    metaLine("Reporting period", `${fmtDateTime(data.rangeStart)} to ${fmtDateTime(data.rangeEnd)} HKT`),
    metaLine("Prepared", `${fmtDateTime(data.generatedAt)} HKT`),
    metaLine("Prepared by", narrative.preparedBy),
    metaLine("Report confidence", narrative.confidence),
    new Paragraph({
      spacing: { before: 160, after: 200 },
      children: [
        new TextRun({ text: "Daily status: ", bold: true, size: 24 }),
        new TextRun({ text: narrative.dailyStatus, bold: true, size: 24 }),
      ],
    }),
    kpiTable(narrative),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  );

  children.push(heading("1. Management Summary", HeadingLevel.HEADING_1));
  children.push(body(narrative.overviewParagraph));
  children.push(body(narrative.comparisonNote, { color: "374151" }));

  children.push(heading("2. Safety Observation Profile", HeadingLevel.HEADING_1));
  if (!narrative.themeSummaries.length) {
    children.push(
      body("No recurring elevated safety themes were identified from structured AI text in this window."),
    );
  } else {
    for (const theme of narrative.themeSummaries) children.push(...themeBlocks(theme));
  }

  children.push(heading("3. Photo-Supported Highlights", HeadingLevel.HEADING_1));
  if (!narrative.highlights.length) {
    children.push(
      body(
        "No photo-supported highlights were selected for this period. Unverified or known false-positive patterns are summarised separately below.",
      ),
    );
  } else {
    narrative.highlights.forEach((highlight, index) => {
      children.push(...highlightBlocks(highlight, index + 1));
    });
  }

  children.push(heading("4. Unverified AI Observations", HeadingLevel.HEADING_1));
  if (!narrative.unverifiedObservations.length) {
    children.push(
      body("No separate unverified or dismissed AI observation patterns were retained for this window."),
    );
  } else {
    for (const item of narrative.unverifiedObservations) children.push(...unverifiedBlocks(item));
  }

  children.push(heading("5. Positive / Normal Observations", HeadingLevel.HEADING_1));
  for (const practice of narrative.positivePractices) {
    children.push(bullet(`${practice.title}: ${practice.description}`));
  }

  children.push(heading("6. Improvement Scheme", HeadingLevel.HEADING_1));
  for (const scheme of narrative.improvementSchemes) {
    children.push(body(`${scheme.horizon}: ${scheme.theme}`, { bold: true, spacingAfter: 80 }));
    children.push(body(scheme.scheme));
    children.push(body(`Intended benefit: ${scheme.intendedBenefit}`, { color: "374151" }));
    children.push(body(`Suggested team: ${scheme.suggestedTeam}`, { color: "666666" }));
  }

  children.push(heading("7. Coverage and Methodology", HeadingLevel.HEADING_1));
  for (const note of narrative.monitoringNotes) children.push(bullet(note));
  for (const note of narrative.methodologyNotes) children.push(bullet(note));
  children.push(bullet(`Report confidence: ${narrative.confidence}`));
  children.push(
    bullet(`Cameras reporting: ${data.monitoring.camerasReporting} / ${data.monitoring.camerasExpected}`),
  );
  children.push(bullet(`Elevated classifications: ${data.summary.elevatedReports}`));

  children.push(heading("8. Closing Note", HeadingLevel.HEADING_1));
  children.push(body(narrative.closingNote));

  children.push(
    new Paragraph({ spacing: { before: 360, after: 120 }, children: [] }),
    body("Site Safety Coordination"),
    body("AXON Vision CMP — Daily Safety Review"),
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

async function generateWeeklyDocx(data: SafetyReportData, outputPath: string): Promise<void> {
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
  );

  children.push(heading("1. Executive Summary", HeadingLevel.HEADING_1));
  for (const paragraph of narrative.executiveSummary) children.push(body(paragraph));
  children.push(body(narrative.overallRiskStatement, { bold: true, spacingAfter: 240 }));

  children.push(heading("2. Key Observations", HeadingLevel.HEADING_1));
  for (const item of narrative.keyObservations) children.push(bullet(item));

  children.push(heading("3. Improvement Recommendations", HeadingLevel.HEADING_1));
  for (const item of narrative.managementRecommendations) children.push(bullet(item));

  children.push(heading("4. Conclusion", HeadingLevel.HEADING_1));
  for (const paragraph of narrative.conclusion) children.push(body(paragraph));

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

export async function generateSafetyReportDocx(data: SafetyReportData, outputPath: string): Promise<void> {
  if (data.period === "daily") {
    await generateDailyDocx(data, outputPath);
    return;
  }
  await generateWeeklyDocx(data, outputPath);
}
