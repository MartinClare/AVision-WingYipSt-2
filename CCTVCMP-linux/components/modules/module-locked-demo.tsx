"use client";

import { Crown, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { getModuleById, type ModuleId } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = {
  moduleId: Exclude<ModuleId, "avision">;
};

type ExternalModuleId = Exclude<ModuleId, "avision">;
type RiskLevel = "low" | "medium" | "high";

type DemoPreset = {
  subtitle: string;
  accentClass: string;
  panelTitle: string;
  kpis: Array<{ label: string; value: string; trend: string }>;
  rows: Array<{ id: string; zone: string; status: string; risk: RiskLevel }>;
  graphBars: number[];
  graphNodes: Array<{ top: string; left: string; colorClass: string }>;
};

const MODULE_PRESETS: Record<ExternalModuleId, DemoPreset> = {
  "tower-crane": {
    subtitle: "Lift planning, load swing and slew zone telemetry",
    accentClass: "from-sky-500/10 to-indigo-500/10",
    panelTitle: "Crane Movement Heatmap",
    kpis: [
      { label: "Cranes Online", value: "7", trend: "+1 today" },
      { label: "Critical Lifts", value: "4", trend: "2 pending permit" },
      { label: "Wind Alerts", value: "2", trend: "Below threshold" },
      { label: "Avg Lift Cycle", value: "03:18", trend: "-12 sec" },
    ],
    rows: [
      { id: "CRN-12", zone: "North Yard", status: "lifting", risk: "medium" },
      { id: "CRN-08", zone: "Core Tower", status: "idle", risk: "low" },
      { id: "CRN-21", zone: "East Facade", status: "maintenance", risk: "high" },
      { id: "CRN-05", zone: "Podium", status: "lifting", risk: "medium" },
      { id: "CRN-17", zone: "West Gate", status: "standby", risk: "low" },
    ],
    graphBars: [22, 36, 55, 44, 61, 40, 28],
    graphNodes: [
      { top: "22%", left: "26%", colorClass: "bg-sky-500" },
      { top: "46%", left: "58%", colorClass: "bg-amber-500" },
      { top: "70%", left: "38%", colorClass: "bg-rose-500" },
    ],
  },
  "restricted-zone": {
    subtitle: "Geo-fencing, worker proximity and breach timeline",
    accentClass: "from-rose-500/10 to-orange-500/10",
    panelTitle: "Fence Breach Density",
    kpis: [
      { label: "Active Zones", value: "19", trend: "3 temporary zones" },
      { label: "Breach Events", value: "6", trend: "-2 vs yesterday" },
      { label: "Auto Warnings", value: "42", trend: "98% delivered" },
      { label: "Avg Clear Time", value: "01:42", trend: "-18 sec" },
    ],
    rows: [
      { id: "RZ-A13", zone: "Chemical Store", status: "alerted", risk: "high" },
      { id: "RZ-C04", zone: "Excavation Pit", status: "sealed", risk: "medium" },
      { id: "RZ-D09", zone: "Scaffold Edge", status: "monitoring", risk: "medium" },
      { id: "RZ-B02", zone: "Server Room", status: "secured", risk: "low" },
      { id: "RZ-F18", zone: "Roof Access", status: "alerted", risk: "high" },
    ],
    graphBars: [28, 21, 48, 35, 58, 42, 30],
    graphNodes: [
      { top: "30%", left: "33%", colorClass: "bg-rose-500" },
      { top: "52%", left: "64%", colorClass: "bg-orange-500" },
      { top: "72%", left: "49%", colorClass: "bg-red-500" },
    ],
  },
  "mobile-machine": {
    subtitle: "Plant routes, blind-spot alerts and speed envelopes",
    accentClass: "from-amber-500/10 to-yellow-500/10",
    panelTitle: "Machine Traffic Pattern",
    kpis: [
      { label: "Machines Active", value: "24", trend: "16 moving now" },
      { label: "Near Misses", value: "3", trend: "-1 this shift" },
      { label: "Idle >15 min", value: "5", trend: "Fuel optimize" },
      { label: "Speed Compliance", value: "96.4%", trend: "+1.1%" },
    ],
    rows: [
      { id: "MM-311", zone: "South Ramp", status: "moving", risk: "medium" },
      { id: "MM-220", zone: "Loading Bay", status: "queued", risk: "low" },
      { id: "MM-145", zone: "Tunnel A", status: "overspeed", risk: "high" },
      { id: "MM-287", zone: "Crusher Line", status: "moving", risk: "medium" },
      { id: "MM-198", zone: "Fuel Point", status: "inspection", risk: "low" },
    ],
    graphBars: [18, 29, 52, 66, 41, 37, 24],
    graphNodes: [
      { top: "25%", left: "29%", colorClass: "bg-amber-500" },
      { top: "49%", left: "61%", colorClass: "bg-yellow-500" },
      { top: "68%", left: "43%", colorClass: "bg-orange-500" },
    ],
  },
  "people-tracker": {
    subtitle: "Headcount, muster points and shift movement flow",
    accentClass: "from-emerald-500/10 to-green-500/10",
    panelTitle: "People Flow Intensity",
    kpis: [
      { label: "On-site Workers", value: "312", trend: "Night shift: 84" },
      { label: "At Muster", value: "297", trend: "95.2% accounted" },
      { label: "No Badge Signal", value: "7", trend: "2 unresolved" },
      { label: "Avg Zone Dwell", value: "00:19", trend: "+3 min" },
    ],
    rows: [
      { id: "PT-8441", zone: "Main Atrium", status: "tracked", risk: "low" },
      { id: "PT-2910", zone: "Basement B2", status: "stale-signal", risk: "medium" },
      { id: "PT-6632", zone: "Hoist Lobby", status: "unauthorized", risk: "high" },
      { id: "PT-7325", zone: "Muster Point C", status: "tracked", risk: "low" },
      { id: "PT-9056", zone: "Steel Deck", status: "tracked", risk: "medium" },
    ],
    graphBars: [24, 33, 45, 60, 54, 39, 31],
    graphNodes: [
      { top: "27%", left: "36%", colorClass: "bg-emerald-500" },
      { top: "47%", left: "62%", colorClass: "bg-green-500" },
      { top: "73%", left: "46%", colorClass: "bg-lime-500" },
    ],
  },
  "smart-lock": {
    subtitle: "Access grants, intrusion trails and lock health checks",
    accentClass: "from-violet-500/10 to-fuchsia-500/10",
    panelTitle: "Door Access Timeline",
    kpis: [
      { label: "Locks Online", value: "86", trend: "2 battery-low" },
      { label: "Denied Attempts", value: "9", trend: "-3 in 24h" },
      { label: "Remote Unlocks", value: "41", trend: "Avg 1.2s RTT" },
      { label: "Audit Coverage", value: "100%", trend: "No gaps" },
    ],
    rows: [
      { id: "SL-G12", zone: "Gate 12", status: "secured", risk: "low" },
      { id: "SL-R03", zone: "Records Vault", status: "denied", risk: "high" },
      { id: "SL-E07", zone: "Electrical Room", status: "override", risk: "medium" },
      { id: "SL-L21", zone: "Lift Lobby", status: "secured", risk: "low" },
      { id: "SL-S11", zone: "Substation", status: "denied", risk: "medium" },
    ],
    graphBars: [16, 24, 37, 52, 43, 39, 22],
    graphNodes: [
      { top: "24%", left: "30%", colorClass: "bg-violet-500" },
      { top: "50%", left: "66%", colorClass: "bg-fuchsia-500" },
      { top: "71%", left: "47%", colorClass: "bg-purple-500" },
    ],
  },
  "confined-space": {
    subtitle: "Gas trend, permit controls and rescue readiness board",
    accentClass: "from-cyan-500/10 to-blue-500/10",
    panelTitle: "Atmosphere Monitoring Mesh",
    kpis: [
      { label: "Permits Active", value: "11", trend: "2 expiring soon" },
      { label: "Gas Alarms", value: "1", trend: "Resolved in 3m" },
      { label: "Ventilation OK", value: "94%", trend: "+4%" },
      { label: "Rescue Team ETA", value: "06:00", trend: "Within SLA" },
    ],
    rows: [
      { id: "CS-P44", zone: "Tank Farm 3", status: "entry-open", risk: "medium" },
      { id: "CS-P07", zone: "Sewer Shaft", status: "paused", risk: "high" },
      { id: "CS-P31", zone: "Boiler Crawl", status: "entry-open", risk: "medium" },
      { id: "CS-P16", zone: "Duct Tunnel", status: "monitoring", risk: "low" },
      { id: "CS-P53", zone: "Utility Vault", status: "entry-open", risk: "low" },
    ],
    graphBars: [21, 32, 41, 58, 49, 45, 34],
    graphNodes: [
      { top: "22%", left: "34%", colorClass: "bg-cyan-500" },
      { top: "48%", left: "59%", colorClass: "bg-blue-500" },
      { top: "70%", left: "45%", colorClass: "bg-sky-500" },
    ],
  },
  "check-in-out": {
    subtitle: "Gate throughput, attendance compliance and shift handover",
    accentClass: "from-teal-500/10 to-emerald-500/10",
    panelTitle: "Gate Throughput Distribution",
    kpis: [
      { label: "Checked In", value: "284", trend: "95% expected crew" },
      { label: "Checked Out", value: "201", trend: "1 delayed exit" },
      { label: "Late Arrivals", value: "14", trend: "-6 today" },
      { label: "Turnstile Health", value: "99.1%", trend: "Nominal" },
    ],
    rows: [
      { id: "CI-1002", zone: "Gate A", status: "check-in", risk: "low" },
      { id: "CI-1094", zone: "Gate C", status: "late", risk: "medium" },
      { id: "CI-1178", zone: "Gate B", status: "tailgating", risk: "high" },
      { id: "CI-1033", zone: "Gate D", status: "check-out", risk: "low" },
      { id: "CI-1127", zone: "Gate A", status: "check-in", risk: "low" },
    ],
    graphBars: [30, 42, 56, 48, 45, 34, 27],
    graphNodes: [
      { top: "26%", left: "32%", colorClass: "bg-teal-500" },
      { top: "52%", left: "63%", colorClass: "bg-emerald-500" },
      { top: "72%", left: "46%", colorClass: "bg-green-500" },
    ],
  },
  "document-system": {
    subtitle: "Permit library, revision control and compliance status",
    accentClass: "from-slate-500/10 to-zinc-500/10",
    panelTitle: "Document Approval Pipeline",
    kpis: [
      { label: "Docs Indexed", value: "12,846", trend: "+211 this week" },
      { label: "Pending Review", value: "37", trend: "8 overdue" },
      { label: "Latest Revisions", value: "124", trend: "24h activity" },
      { label: "Audit Pass Rate", value: "97.8%", trend: "+0.6%" },
    ],
    rows: [
      { id: "DOC-4412", zone: "Permit Set A", status: "review", risk: "medium" },
      { id: "DOC-7821", zone: "Fire Plan R6", status: "approved", risk: "low" },
      { id: "DOC-9110", zone: "Lift SOP v2", status: "rejected", risk: "high" },
      { id: "DOC-2684", zone: "HSE Policy", status: "approved", risk: "low" },
      { id: "DOC-6057", zone: "Method Statement", status: "review", risk: "medium" },
    ],
    graphBars: [19, 26, 40, 51, 57, 43, 35],
    graphNodes: [
      { top: "25%", left: "31%", colorClass: "bg-slate-500" },
      { top: "49%", left: "60%", colorClass: "bg-zinc-500" },
      { top: "70%", left: "47%", colorClass: "bg-neutral-500" },
    ],
  },
};

function riskBadgeVariant(risk: RiskLevel): "destructive" | "default" | "outline" {
  if (risk === "high") return "destructive";
  if (risk === "medium") return "default";
  return "outline";
}

function PreviewHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-md bg-muted" />
        <div className="h-8 w-8 rounded-md bg-primary/30" />
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "bg-primary/20" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`mb-3 h-1.5 w-12 rounded-full ${tone}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TowerCranePreview() {
  return (
    <>
      <PreviewHeader title="Tower Crane Control" subtitle="Live lift planning and anti-collision monitoring" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6">
        <div className="col-span-8 rounded-xl border border-border bg-sky-500/5 p-5">
          <div className="mb-4 flex justify-between text-sm"><span className="font-semibold">Live Site Plan</span><span className="text-emerald-600">7 cranes online</span></div>
          <div className="relative h-[390px] overflow-hidden rounded-lg border border-sky-500/20 bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200 dark:from-slate-950 dark:via-sky-950/30 dark:to-slate-900">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="absolute left-[18%] top-[12%] h-[200px] w-[3px] bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,.8)]" />
            <div className="absolute left-[12%] top-[12%] h-[3px] w-[220px] origin-left rotate-[12deg] bg-amber-500" />
            <div className="absolute left-[58%] top-[28%] h-[175px] w-[3px] bg-sky-600 shadow-[0_0_12px_rgba(2,132,199,.8)]" />
            <div className="absolute left-[48%] top-[28%] h-[3px] w-[210px] origin-left -rotate-[19deg] bg-sky-600" />
            <div className="absolute left-[21%] top-[58%] h-20 w-36 rounded-sm border-2 border-dashed border-amber-500/70 bg-amber-500/10" />
            <div className="absolute left-[54%] top-[62%] h-16 w-28 rounded-sm border-2 border-dashed border-rose-500/70 bg-rose-500/10" />
            <div className="absolute bottom-5 right-5 rounded bg-card px-3 py-2 text-xs shadow">Wind: 14 km/h · Safe</div>
          </div>
        </div>
        <div className="col-span-4 space-y-4">
          <Metric label="Current Lift" value="12.4 t" tone="bg-amber-500" />
          <Metric label="Hook Height" value="68.2 m" tone="bg-sky-500" />
          <div className="rounded-xl border border-border p-4"><p className="mb-4 font-semibold">Lift Queue</p>{["Concrete bucket · CRN-12", "Steel bundle · CRN-08", "Formwork · CRN-05"].map((item) => <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm" key={item}>{item}</div>)}</div>
        </div>
      </div>
    </>
  );
}

function RestrictedZonePreview() {
  return (
    <>
      <PreviewHeader title="Restricted Zone Command" subtitle="Geo-fence status and live breach response" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6">
        <div className="col-span-9 rounded-xl border border-border bg-rose-500/5 p-5">
          <div className="mb-4 flex items-center justify-between"><span className="font-semibold">Interactive Site Zones</span><span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-600">2 active breaches</span></div>
          <div className="relative h-[395px] overflow-hidden rounded-lg bg-slate-200 p-6 dark:bg-slate-900">
            <div className="grid h-full grid-cols-4 grid-rows-3 gap-3">
              {["Public Access", "Excavation Pit", "Loading Bay", "Fire Route", "Material Store", "Chemical Store", "Core Tower", "Substation", "Muster Point", "Scaffold Edge", "Plant Route", "North Gate"].map((zone, index) => (
                <div key={zone} className={cn("flex items-center justify-center rounded-md border text-center text-xs font-medium", index === 1 || index === 5 ? "border-rose-500 bg-rose-500/20 text-rose-700" : index === 7 ? "border-amber-500 bg-amber-500/15" : "border-border bg-card/70")}>{zone}</div>
              ))}
            </div>
            <div className="absolute left-[38%] top-[26%] h-4 w-4 rounded-full border-4 border-card bg-rose-600 shadow-lg" />
            <div className="absolute left-[64%] top-[53%] h-4 w-4 rounded-full border-4 border-card bg-rose-600 shadow-lg" />
          </div>
        </div>
        <div className="col-span-3 space-y-4">
          <Metric label="Zones Armed" value="19" tone="bg-rose-500" />
          <Metric label="Warnings Sent" value="42" tone="bg-orange-500" />
          <div className="rounded-xl border border-border p-4"><p className="mb-3 font-semibold">Latest Alerts</p><div className="space-y-3 text-sm"><p className="border-l-2 border-rose-500 pl-2">Chemical Store<br /><span className="text-xs text-muted-foreground">13:42 · Unauthorised entry</span></p><p className="border-l-2 border-amber-500 pl-2">Excavation Pit<br /><span className="text-xs text-muted-foreground">13:36 · Proximity warning</span></p></div></div>
        </div>
      </div>
    </>
  );
}

function MobileMachinePreview() {
  return (
    <>
      <PreviewHeader title="Mobile Machine Fleet" subtitle="Traffic flow, routes and blind-spot event monitoring" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6">
        <div className="col-span-7 rounded-xl border border-border p-5"><p className="mb-4 font-semibold">Live Machine Routes</p><div className="relative h-[395px] overflow-hidden rounded-lg bg-amber-500/5"><div className="absolute left-0 top-[20%] h-10 w-full border-y-2 border-dashed border-amber-500/60" /><div className="absolute left-[30%] top-0 h-full w-12 border-x-2 border-dashed border-amber-500/60" /><div className="absolute left-[8%] top-[24%] h-7 w-12 rounded bg-amber-500 shadow-lg" /><div className="absolute left-[43%] top-[55%] h-7 w-12 rounded bg-sky-600 shadow-lg" /><div className="absolute left-[68%] top-[24%] h-7 w-12 rounded bg-emerald-600 shadow-lg" /><div className="absolute bottom-5 left-5 rounded bg-card px-3 py-2 text-xs">24 active machines · 16 moving</div></div></div>
        <div className="col-span-5 space-y-4"><div className="grid grid-cols-2 gap-4"><Metric label="Speed Compliance" value="96.4%" tone="bg-emerald-500" /><Metric label="Near Misses" value="3" tone="bg-rose-500" /></div><div className="rounded-xl border border-border p-5"><p className="mb-4 font-semibold">Shift Fleet Activity</p><div className="flex h-36 items-end gap-2">{[32, 54, 40, 72, 58, 84, 65, 48, 61, 38].map((height, i) => <div className="flex-1 rounded-t bg-amber-500/60" style={{ height: `${height}%` }} key={i} />)}</div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>07:00</span><span>12:00</span><span>17:00</span></div></div><div className="rounded-xl border border-border p-5"><p className="mb-3 font-semibold">Safety Exceptions</p><div className="space-y-2 text-sm"><div className="rounded bg-rose-500/10 px-3 py-2">MM-145 · Overspeed · Tunnel A</div><div className="rounded bg-amber-500/10 px-3 py-2">MM-311 · Blind spot warning · South Ramp</div></div></div></div>
      </div>
    </>
  );
}

function PeopleTrackerPreview() {
  return (
    <>
      <PreviewHeader title="People Tracker" subtitle="Workforce presence, movement and muster accountability" />
      <div className="min-h-[530px] p-6">
        <div className="mb-4 grid grid-cols-4 gap-4"><Metric label="On Site" value="312" tone="bg-emerald-500" /><Metric label="At Muster" value="297" tone="bg-sky-500" /><Metric label="Unaccounted" value="7" tone="bg-rose-500" /><Metric label="Active Zones" value="16" tone="bg-violet-500" /></div>
        <div className="grid grid-cols-12 gap-4"><div className="col-span-8 rounded-xl border border-border p-5"><p className="mb-4 font-semibold">Live Floor Occupancy</p><div className="relative h-[310px] rounded-lg bg-emerald-500/5 p-5"><div className="grid h-full grid-cols-5 gap-3">{["F1 Lobby", "F1 East", "F2 Core", "F2 West", "F3 Deck", "F3 Hoist", "F4 Plant", "F4 North", "Roof", "Muster A"].map((label, i) => <div className={cn("flex flex-col justify-between rounded border p-2 text-xs", i === 5 ? "border-amber-500 bg-amber-500/10" : "border-border bg-card")} key={label}><span>{label}</span><b>{[38, 24, 55, 19, 42, 71, 13, 26, 9, 15][i]} people</b></div>)}</div></div></div><div className="col-span-4 rounded-xl border border-border p-5"><p className="mb-4 font-semibold">Muster Progress</p><div className="relative mx-auto h-40 w-40 rounded-full border-[18px] border-emerald-500/25"><div className="absolute inset-0 rounded-full border-[18px] border-emerald-500 border-l-transparent border-b-transparent -rotate-45" /><div className="absolute inset-0 flex flex-col items-center justify-center"><b className="text-3xl">95%</b><span className="text-xs text-muted-foreground">accounted</span></div></div><div className="mt-6 space-y-2 text-sm"><p className="flex justify-between"><span>Point A</span><b>149 / 152</b></p><p className="flex justify-between"><span>Point B</span><b>148 / 153</b></p></div></div></div>
      </div>
    </>
  );
}

function SmartLockPreview() {
  return (
    <>
      <PreviewHeader title="Smart Lock Access Control" subtitle="Door state, mobile credentials and audit events" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6"><div className="col-span-4 space-y-4"><Metric label="Locks Online" value="86 / 88" tone="bg-violet-500" /><Metric label="Access Denied" value="9" tone="bg-rose-500" /><div className="rounded-xl border border-border p-4"><p className="mb-3 font-semibold">Door Groups</p>{["Perimeter · 24", "High Security · 12", "Plant Rooms · 18", "Offices · 34"].map((label) => <div className="mb-2 flex justify-between rounded bg-muted px-3 py-2 text-sm" key={label}><span>{label}</span><span className="text-emerald-600">Online</span></div>)}</div></div><div className="col-span-8 rounded-xl border border-border p-5"><p className="mb-5 font-semibold">Access Event Timeline</p><div className="relative ml-5 border-l-2 border-violet-500/30 pl-8">{[["13:46","Gate 12","Credential accepted","bg-emerald-500"],["13:39","Records Vault","Access denied","bg-rose-500"],["13:24","Electrical Room","Remote unlock approved","bg-violet-500"],["13:12","Substation","After-hours request","bg-amber-500"],["12:58","Lift Lobby","Credential accepted","bg-emerald-500"]].map(([time, door, text, color]) => <div className="relative mb-6" key={time}><div className={cn("absolute -left-[42px] top-1 h-4 w-4 rounded-full border-4 border-card", color)} /><div className="flex justify-between"><div><b>{door}</b><p className="text-sm text-muted-foreground">{text}</p></div><span className="text-sm text-muted-foreground">{time}</span></div></div>)}</div></div></div>
    </>
  );
}

function ConfinedSpacePreview() {
  return (
    <>
      <PreviewHeader title="Confined Space Safety" subtitle="Atmosphere telemetry, entry permits and rescue readiness" />
      <div className="min-h-[530px] p-6"><div className="mb-4 grid grid-cols-4 gap-4"><Metric label="Active Permits" value="11" tone="bg-cyan-500" /><Metric label="Gas Alarms" value="1" tone="bg-rose-500" /><Metric label="Ventilation OK" value="94%" tone="bg-emerald-500" /><Metric label="Rescue ETA" value="06:00" tone="bg-sky-500" /></div><div className="grid grid-cols-3 gap-4">{[["O₂","20.8%","bg-emerald-500"],["H₂S","0 ppm","bg-cyan-500"],["CO","3 ppm","bg-amber-500"]].map(([label, value, color]) => <div className="rounded-xl border border-border p-6 text-center" key={label}><div className={cn("mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full border-[12px] border-l-transparent border-b-transparent rotate-45", color)}><span className="-rotate-45 text-xl font-bold">{value}</span></div><p className="font-semibold">{label} Monitor</p><p className="text-xs text-muted-foreground">Tank Farm 3</p></div>)}</div><div className="mt-4 rounded-xl border border-border p-5"><p className="mb-3 font-semibold">Permit Readiness Board</p><div className="grid grid-cols-4 gap-3">{["Entry Checklist", "Atmosphere Test", "Attendant Assigned", "Rescue Standby"].map((step, i) => <div className={cn("rounded-lg p-4 text-sm", i === 1 ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/10 text-emerald-700")} key={step}><b>{i === 1 ? "Review" : "Complete"}</b><br />{step}</div>)}</div></div></div>
    </>
  );
}

function CheckInOutPreview() {
  return (
    <>
      <PreviewHeader title="Check In / Out" subtitle="Gate throughput, attendance and workforce compliance" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6"><div className="col-span-8 rounded-xl border border-border p-5"><div className="mb-5 flex justify-between"><p className="font-semibold">Gate A — Live Turnstiles</p><span className="text-sm text-emerald-600">4 lanes active</span></div><div className="space-y-4">{["Lane 01","Lane 02","Lane 03","Lane 04"].map((lane, i) => <div className="flex items-center gap-4" key={lane}><span className="w-16 text-sm font-medium">{lane}</span><div className="relative h-12 flex-1 overflow-hidden rounded bg-muted"><div className={cn("absolute top-0 h-full rounded", i === 2 ? "w-[72%] bg-amber-500/40" : "w-[88%] bg-emerald-500/35")} /><div className="absolute left-[22%] top-2 h-8 w-2 rounded bg-card shadow" /><div className="absolute left-[46%] top-2 h-8 w-2 rounded bg-card shadow" /><div className="absolute left-[70%] top-2 h-8 w-2 rounded bg-card shadow" /></div><span className="w-16 text-right text-sm text-muted-foreground">{[84, 78, 55, 67][i]}/hr</span></div>)}</div><div className="mt-8 flex h-28 items-end gap-2">{[28, 38, 67, 82, 56, 72, 91, 58, 43, 62, 49, 31].map((height, i) => <div className="flex-1 rounded-t bg-teal-500/55" style={{ height: `${height}%` }} key={i} />)}</div></div><div className="col-span-4 space-y-4"><Metric label="Checked In" value="284" tone="bg-teal-500" /><Metric label="Late Arrivals" value="14" tone="bg-amber-500" /><Metric label="Tailgating" value="1" tone="bg-rose-500" /><div className="rounded-xl border border-border p-4 text-sm"><p className="mb-3 font-semibold">Latest Gate Event</p><b>CI-1178</b><p className="text-muted-foreground">Tailgating detected · Gate B</p><p className="mt-3 text-xs">13:44 · Camera verified</p></div></div></div>
    </>
  );
}

function DocumentSystemPreview() {
  return (
    <>
      <PreviewHeader title="Document System" subtitle="Controlled documents, revision status and approval workflows" />
      <div className="grid min-h-[530px] grid-cols-12 gap-4 p-6"><div className="col-span-3 rounded-xl border border-border p-4"><p className="mb-4 font-semibold">Document Library</p>{["Project Documents","Safety Management","Permits & Licences","Method Statements","Drawings","Archived"].map((folder, i) => <div className={cn("mb-1 rounded px-3 py-2 text-sm", i === 1 ? "bg-primary/15 text-primary" : "hover:bg-muted")} key={folder}>▸ {folder}</div>)}</div><div className="col-span-6 rounded-xl border border-border p-5"><div className="mb-5 flex justify-between"><p className="font-semibold">Safety Management</p><div className="h-8 w-24 rounded bg-primary/20" /></div><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-3">Name</th><th className="pb-3">Revision</th><th className="pb-3">Status</th></tr></thead><tbody>{[["Fire Safety Plan","R6","Approved"],["Lift SOP","v2.4","Review"],["Emergency Response","R3","Approved"],["Risk Assessment","v8","Overdue"],["PPE Standard","v5","Approved"]].map(([name, revision, status]) => <tr className="border-b" key={name}><td className="py-3 font-medium">▤ {name}</td><td>{revision}</td><td><span className={cn("rounded-full px-2 py-1 text-xs", status === "Approved" ? "bg-emerald-500/15 text-emerald-700" : status === "Overdue" ? "bg-rose-500/15 text-rose-700" : "bg-amber-500/15 text-amber-700")}>{status}</span></td></tr>)}</tbody></table></div><div className="col-span-3 space-y-4"><Metric label="Pending Review" value="37" tone="bg-amber-500" /><Metric label="Overdue" value="8" tone="bg-rose-500" /><div className="rounded-xl border border-border p-4"><p className="mb-4 font-semibold">Approval Progress</p><div className="space-y-3">{[["Submitted", "100%"],["Technical Review", "72%"],["Safety Approval", "48%"],["Published", "34%"]].map(([step, percent]) => <div key={step}><div className="mb-1 flex justify-between text-xs"><span>{step}</span><span>{percent}</span></div><div className="h-2 rounded bg-muted"><div className="h-full rounded bg-primary/60" style={{ width: percent }} /></div></div>)}</div></div></div></div>
    </>
  );
}

function ModulePreview({ moduleId }: Props) {
  switch (moduleId) {
    case "tower-crane": return <TowerCranePreview />;
    case "restricted-zone": return <RestrictedZonePreview />;
    case "mobile-machine": return <MobileMachinePreview />;
    case "people-tracker": return <PeopleTrackerPreview />;
    case "smart-lock": return <SmartLockPreview />;
    case "confined-space": return <ConfinedSpacePreview />;
    case "check-in-out": return <CheckInOutPreview />;
    case "document-system": return <DocumentSystemPreview />;
  }
}

export function ModuleLockedDemo({ moduleId }: Props) {
  const t = useTranslations("modules");
  const module = getModuleById(moduleId);

  if (!module || module.type !== "external") return null;

  const moduleName = t(module.i18nKey);
  const Icon = module.icon;
  const preset = MODULE_PRESETS[moduleId];

  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-xl border border-border bg-card">
      {/* Mock demo UI (blurred behind overlay) */}
      <div className="pointer-events-none select-none blur-[2px]" aria-hidden="true">
        <ModulePreview moduleId={moduleId} />
      </div>
      <div className="hidden">
        <div
          className={cn(
            "mb-6 rounded-xl border border-border bg-gradient-to-r p-4",
            preset.accentClass
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{moduleName}</h2>
              <p className="text-sm text-muted-foreground">{preset.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {preset.kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.trend}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("demoLiveFeed")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("demoColId")}</TableHead>
                    <TableHead>{t("demoColZone")}</TableHead>
                    <TableHead>{t("demoColStatus")}</TableHead>
                    <TableHead>{t("demoColRisk")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preset.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.id}</TableCell>
                      <TableCell>{row.zone}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={riskBadgeVariant(row.risk)}>
                          {row.risk}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{preset.panelTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-24 rounded-lg border border-dashed border-border bg-muted/40 p-3">
                <div className="flex h-full items-end gap-1.5">
                  {preset.graphBars.map((bar, i) => (
                    <div
                      key={`${moduleId}-bar-${i}`}
                      className="flex-1 rounded-t-sm bg-primary/30"
                      style={{ height: `${bar}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="relative h-36 overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                <div className="absolute inset-4 grid grid-cols-3 gap-2 opacity-60">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={`${moduleId}-cell-${i}`} className="rounded-md border border-border bg-background/70" />
                  ))}
                </div>
                {preset.graphNodes.map((node, i) => (
                  <div
                    key={`${moduleId}-node-${i}`}
                    className={cn("absolute h-3.5 w-3.5 rounded-full shadow", node.colorClass)}
                    style={{ top: node.top, left: node.left }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Locked VIP overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[3px]">
        <Card className="mx-4 w-full max-w-md border-amber-500/30 shadow-xl">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Crown className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg">{t("lockedTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("lockedDescription", { module: moduleName })}
            </p>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                {t("lockedHint")}
              </span>
            </div>
            <Button disabled className="w-full">
              {t("upgradeButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
