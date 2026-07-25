/**
 * seed-cameras.ts — pre-register edge cameras in the CMP database.
 *
 * Reads camera definitions either from:
 *   1. The CAMERAS env var (JSON array, see format below), OR
 *   2. The hardcoded list at the bottom of this file (edit as needed).
 *
 * CAMERAS format:
 *   '[{"id":"camera1","name":"Lobby","streamUrl":"rtsp://..."},...]'
 *
 * Run:
 *   npm run seed-cameras
 *
 * The script is safe to re-run — it upserts by edgeCameraId so existing
 * records are updated rather than duplicated.
 */

import { PrismaClient } from "@prisma/client";

type CameraSpec = {
  /** Must match the `id` field in app.config.json */
  id: string;
  name: string;
  streamUrl?: string;
};

// ── Camera list ───────────────────────────────────────────────────────────────
// Override with CAMERAS env var (JSON), or edit this array directly.
// AVision#2 — Wing Yip St (33 cameras, IDs prefixed av2_ to avoid collision with AVision#1)
const DEFAULT_CAMERAS: CameraSpec[] = [
  // Floor 1
  { id: "av2_camera1",  name: "F1_1",   streamUrl: "rtsp://admin:123456@192.168.10.53:554/Streaming/Channels/101" },
  { id: "av2_camera2",  name: "F1_2",   streamUrl: "rtsp://admin:123456@192.168.10.52:554/Streaming/Channels/101" },
  { id: "av2_camera3",  name: "F1_3",   streamUrl: "rtsp://admin:123456@192.168.10.49:554/Streaming/Channels/101" },
  { id: "av2_camera4",  name: "F1_4",   streamUrl: "rtsp://admin:123456@192.168.10.50:554/Streaming/Channels/101" },
  { id: "av2_camera5",  name: "F1_5",   streamUrl: "rtsp://admin:123456@192.168.10.51:554/Streaming/Channels/101" },
  // Floor 2
  { id: "av2_camera6",  name: "F2_1",   streamUrl: "rtsp://admin:123456@192.168.10.47:554/Streaming/Channels/101" },
  { id: "av2_camera7",  name: "F2_2",   streamUrl: "rtsp://admin:123456@192.168.10.46:554/Streaming/Channels/101" },
  { id: "av2_camera8",  name: "F2_3",   streamUrl: "rtsp://admin:123456@192.168.10.44:554/Streaming/Channels/101" },
  { id: "av2_camera9",  name: "F2_4",   streamUrl: "rtsp://admin:123456@192.168.10.45:554/Streaming/Channels/101" },
  { id: "av2_camera10", name: "F2_5",   streamUrl: "rtsp://admin:123456@192.168.10.48:554/Streaming/Channels/101" },
  // Floor 3
  { id: "av2_camera11", name: "F3_1",   streamUrl: "rtsp://admin:123456@192.168.10.27:554/Streaming/Channels/101" },
  { id: "av2_camera12", name: "F3_2",   streamUrl: "rtsp://admin:123456@192.168.10.26:554/Streaming/Channels/101" },
  { id: "av2_camera13", name: "F3_3",   streamUrl: "rtsp://admin:123456@192.168.10.28:554/Streaming/Channels/101" },
  // Floor 4
  { id: "av2_camera14", name: "F4_1",   streamUrl: "rtsp://admin:123456@192.168.10.32:554/Streaming/Channels/101" },
  { id: "av2_camera15", name: "F4_2",   streamUrl: "rtsp://admin:123456@192.168.10.29:554/Streaming/Channels/101" },
  { id: "av2_camera16", name: "F4_3",   streamUrl: "rtsp://admin:123456@192.168.10.31:554/Streaming/Channels/101" },
  // Floor 5
  { id: "av2_camera17", name: "F5_1",   streamUrl: "rtsp://admin:123456@192.168.10.56:554/Streaming/Channels/101" },
  { id: "av2_camera18", name: "F5_2",   streamUrl: "rtsp://admin:123456@192.168.10.55:554/Streaming/Channels/101" },
  { id: "av2_camera19", name: "F5_3",   streamUrl: "rtsp://admin:123456@192.168.10.54:554/Streaming/Channels/101" },
  // Floor 7
  { id: "av2_camera20", name: "F7_1",   streamUrl: "rtsp://admin:123456@192.168.10.41:554/Streaming/Channels/101" },
  { id: "av2_camera21", name: "F7_2",   streamUrl: "rtsp://admin:123456@192.168.10.42:554/Streaming/Channels/101" },
  { id: "av2_camera22", name: "F7_3",   streamUrl: "rtsp://admin:123456@192.168.10.43:554/Streaming/Channels/101" },
  // Floor 8
  { id: "av2_camera33", name: "F8_EA1", streamUrl: "rtsp://admin:123456@192.168.10.59:554/Streaming/Channels/1" },
  // Floor 9
  { id: "av2_camera23", name: "F9_1",   streamUrl: "rtsp://admin:123456@192.168.10.37:554/Streaming/Channels/101" },
  { id: "av2_camera24", name: "F9_2",   streamUrl: "rtsp://admin:123456@192.168.10.38:554/Streaming/Channels/101" },
  { id: "av2_camera25", name: "F9_3",   streamUrl: "rtsp://admin:123456@192.168.10.39:554/Streaming/Channels/101" },
  // Floor 11
  { id: "av2_camera26", name: "F11_1",  streamUrl: "rtsp://admin:123456@192.168.10.35:554/Streaming/Channels/101" },
  { id: "av2_camera27", name: "F11_2",  streamUrl: "rtsp://admin:123456@192.168.10.36:554/Streaming/Channels/101" },
  { id: "av2_camera28", name: "F11_3",  streamUrl: "rtsp://admin:123456@192.168.10.40:554/Streaming/Channels/101" },
  // Floor 13
  { id: "av2_camera29", name: "F13_1",  streamUrl: "rtsp://admin:123456@192.168.10.33:554/Streaming/Channels/101" },
  { id: "av2_camera30", name: "F13_2",  streamUrl: "rtsp://admin:123456@192.168.10.34:554/Streaming/Channels/101" },
  { id: "av2_camera31", name: "F13_3",  streamUrl: "rtsp://admin:123456@192.168.10.57:554/Streaming/Channels/101" },
  // Roof
  { id: "av2_camera32", name: "ROOF_4", streamUrl: "rtsp://admin:123456@192.168.10.25:554/Streaming/Channels/101" },
];

const PROJECT_NAME = process.env.SEED_PROJECT_NAME?.trim() || "Wing Yip St - AVision#2";
const ZONE_NAME    = process.env.SEED_ZONE_NAME?.trim()    || "All Floors";

void (async () => {
  let cameras: CameraSpec[] = DEFAULT_CAMERAS;

  const camerasEnv = process.env.CAMERAS?.trim();
  if (camerasEnv) {
    try {
      cameras = JSON.parse(camerasEnv) as CameraSpec[];
    } catch {
      console.error("CAMERAS env var is not valid JSON — using hardcoded list.");
    }
  }

  const prisma = new PrismaClient();
  try {
    // 1. Ensure a project exists
    let project = await prisma.project.findFirst({ where: { name: PROJECT_NAME } });
    if (!project) {
      project = await prisma.project.create({
        data: { name: PROJECT_NAME, location: "Edge Device" },
      });
      console.log(`Created project: "${project.name}" (${project.id})`);
    } else {
      console.log(`Using existing project: "${project.name}" (${project.id})`);
    }

    // 2. Ensure a zone exists inside that project
    let zone = await prisma.zone.findFirst({ where: { projectId: project.id, name: ZONE_NAME } });
    if (!zone) {
      zone = await prisma.zone.create({
        data: { projectId: project.id, name: ZONE_NAME, riskLevel: "medium" },
      });
      console.log(`Created zone: "${zone.name}" (${zone.id})`);
    } else {
      console.log(`Using existing zone: "${zone.name}" (${zone.id})`);
    }

    // 3. Upsert each camera
    console.log(`\nRegistering ${cameras.length} camera(s)…`);
    for (const cam of cameras) {
      const existing = await prisma.camera.findUnique({ where: { edgeCameraId: cam.id } });
      if (existing) {
        await prisma.camera.update({
          where: { id: existing.id },
          data: {
            name: cam.name,
            streamUrl: cam.streamUrl ?? existing.streamUrl,
            projectId: project.id,
            zoneId: zone.id,
          },
        });
        console.log(`  ✓ Updated:  ${cam.id} → "${cam.name}"`);
      } else {
        await prisma.camera.create({
          data: {
            edgeCameraId: cam.id,
            name: cam.name,
            streamUrl: cam.streamUrl,
            projectId: project.id,
            zoneId: zone.id,
          },
        });
        console.log(`  ✓ Created:  ${cam.id} → "${cam.name}"`);
      }
    }

    console.log("\nDone. All cameras are registered in the CMP.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
