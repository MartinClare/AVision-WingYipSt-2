#!/usr/bin/env python3
"""
AVision / Edge-Linux system health check.

Runs local service checks. On failure, attempts auto-heal via systemd --user,
then emails the configured recipient.

Schedules (install with scripts/install-healthcheck-cron.sh):
  - Every hour  → alert only on failure (after auto-heal attempt)
  - 08:00 daily → always send a status report

Config: scripts/healthcheck.conf
"""

from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import smtplib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

CONF_PATH = Path(__file__).parent / "healthcheck.conf"

conf = configparser.ConfigParser()
conf.read(CONF_PATH)

SMTP_HOST = conf.get("smtp", "host", fallback="smtp.gmail.com")
SMTP_PORT = conf.getint("smtp", "port", fallback=587)
SMTP_USER = conf.get("smtp", "user", fallback="")
SMTP_PASS = conf.get("smtp", "pass", fallback="")
ALERT_FROM = conf.get("smtp", "from", fallback=SMTP_USER)
ALERT_TO_RAW = conf.get("smtp", "to", fallback="")
ALERT_TO = [addr.strip() for addr in ALERT_TO_RAW.split(",") if addr.strip()]

REPO_BASE = Path(conf.get("services", "repo_base", fallback=str(Path(__file__).resolve().parents[1])))
PPE_UI_PORT = conf.getint("services", "ppe_ui_port", fallback=3100)
EDGE_CLOUD_PORT = conf.getint("services", "edge_cloud_port", fallback=3101)
CMP_PORT = conf.getint("services", "cmp_port", fallback=3102)
GO2RTC_PORT = conf.getint("services", "go2rtc_port", fallback=3184)

SYSTEMD_PPE_UI = conf.get("systemd", "ppe_ui", fallback="avision-ppe-ui.service")
SYSTEMD_EDGE_CLOUD = conf.get("systemd", "edge_cloud", fallback="avision-edge-cloud.service")
SYSTEMD_CMP = conf.get("systemd", "cmp", fallback="avision-cmp.service")
SYSTEMD_GO2RTC = conf.get("systemd", "go2rtc", fallback="avision-go2rtc.service")

PROCESS_PPE_UI_PATTERN = conf.get("process", "ppe_ui", fallback="AVision-WIngYipSt/ppe-ui")
PROCESS_EDGE_CLOUD_PATTERN = conf.get("process", "edge_cloud", fallback="AVision-WIngYipSt/cloud")
PROCESS_CMP_PATTERN = conf.get("process", "cmp", fallback="CCTVCMP-linux")
PROCESS_GO2RTC_PATTERN = conf.get("process", "go2rtc", fallback="go2rtc -config")

HOSTNAME = socket.gethostname()
NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@dataclass(frozen=True)
class RemoteHost:
    key: str
    display_name: str
    host: str
    ppe_ui_port: int
    health_all_path: str
    config_path: str
    required_services: tuple[str, ...]
    cmp_webhook_url: str
    min_active_streams: int


def load_remote_hosts() -> list[RemoteHost]:
    hosts: list[RemoteHost] = []
    for section in conf.sections():
        if not section.startswith("remote:"):
            continue
        if not conf.getboolean(section, "enabled", fallback=True):
            continue
        required_raw = conf.get(section, "required_services", fallback="")
        required = tuple(s.strip() for s in required_raw.split(",") if s.strip())
        hosts.append(
            RemoteHost(
                key=section.split(":", 1)[1],
                display_name=conf.get(section, "display_name", fallback=conf.get(section, "host", fallback=section)),
                host=conf.get(section, "host", fallback="").strip(),
                ppe_ui_port=conf.getint(section, "ppe_ui_port", fallback=3000),
                health_all_path=conf.get(section, "health_all_path", fallback="/api/health/all"),
                config_path=conf.get(section, "config_path", fallback="/api/config"),
                required_services=required,
                cmp_webhook_url=conf.get(section, "cmp_webhook_url", fallback="").strip(),
                min_active_streams=conf.getint(section, "min_active_streams", fallback=1),
            )
        )
    return hosts


REMOTE_HOSTS = load_remote_hosts()


class Check:
    def __init__(self, name: str, ok: bool, detail: str = ""):
        self.name = name
        self.ok = ok
        self.detail = detail

    def __str__(self) -> str:
        status = "✅ OK" if self.ok else "❌ FAIL"
        line = f"  {status}  {self.name}"
        return f"{line}\n         {self.detail}" if self.detail else line


def check_port(name: str, host: str, port: int, timeout: float = 3.0) -> Check:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return Check(name, True)
    except Exception as exc:
        return Check(name, False, str(exc))


def check_http(name: str, url: str, timeout: float = 5.0, expect_status: int = 200) -> Check:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == expect_status:
                return Check(name, True)
            return Check(name, False, f"HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        return Check(name, False, f"HTTP {exc.code}")
    except Exception as exc:
        return Check(name, False, str(exc))


def check_process(name: str, pattern: str) -> Check:
    result = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True)
    found = result.returncode == 0
    return Check(name, found, "" if found else "process not found")


def check_go2rtc_streams() -> list[Check]:
    checks: list[Check] = []
    url = f"http://localhost:{GO2RTC_PORT}/api/streams"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if not data:
            checks.append(Check("go2rtc:streams", False, "No streams configured"))
        else:
            for cam, info in data.items():
                has_producer = bool(info.get("producers"))
                checks.append(
                    Check(
                        f"go2rtc:stream:{cam}",
                        has_producer,
                        "" if has_producer else "no producer configured",
                    )
                )
    except Exception as exc:
        checks.append(Check("go2rtc:streams", False, str(exc)))
    return checks


def check_cmp_api() -> Check:
    url = f"http://localhost:{CMP_PORT}/api/auth/signin"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return Check("CMP:api", True)
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 405):
            return Check("CMP:api", True)
        return Check("CMP:api", False, f"HTTP {exc.code}")
    except Exception as exc:
        return Check("CMP:api", False, str(exc))


def check_edge_cloud_api() -> Check:
    return check_http(
        "edge-cloud:api",
        f"http://localhost:{EDGE_CLOUD_PORT}/api/health",
        expect_status=200,
    )


def _remote_prefix(remote: RemoteHost) -> str:
    return f"remote:{remote.key}"


def _fetch_remote_json(remote: RemoteHost, path: str, timeout: float = 10.0) -> tuple[dict | None, str]:
    url = f"http://{remote.host}:{remote.ppe_ui_port}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read()), ""
    except urllib.error.HTTPError as exc:
        return None, f"HTTP {exc.code} from {url}"
    except Exception as exc:
        return None, f"{exc} ({url})"


def run_remote_checks(remote: RemoteHost) -> list[Check]:
    prefix = _remote_prefix(remote)
    results: list[Check] = [
        check_port(f"{prefix}:port:{remote.ppe_ui_port} (PPE-UI)", remote.host, remote.ppe_ui_port),
    ]

    health, health_err = _fetch_remote_json(remote, remote.health_all_path)
    if health is None:
        results.append(Check(f"{prefix}:health/all", False, health_err))
        return results

    results.append(Check(f"{prefix}:health/all", True))

    services = health.get("services")
    if isinstance(services, dict):
        for service_name in remote.required_services:
            info = services.get(service_name)
            if not isinstance(info, dict):
                results.append(
                    Check(f"{prefix}:service:{service_name}", False, "missing from health/all response")
                )
                continue
            ok = bool(info.get("ok"))
            detail = "" if ok else f"port {info.get('port', '?')} not healthy"
            results.append(Check(f"{prefix}:service:{service_name}", ok, detail))

    streams = health.get("streams")
    active_streams = 0
    if isinstance(streams, dict):
        for stream_name, healthy in streams.items():
            ok = bool(healthy)
            if ok:
                active_streams += 1
            results.append(
                Check(
                    f"{prefix}:stream:{stream_name}",
                    ok,
                    "" if ok else "no active producer",
                )
            )

    min_streams = remote.min_active_streams
    streams_ok = active_streams >= min_streams
    results.append(
        Check(
            f"{prefix}:streams:active",
            streams_ok,
            "" if streams_ok else f"{active_streams}/{min_streams} active streams",
        )
    )

    if remote.cmp_webhook_url:
        config, config_err = _fetch_remote_json(remote, remote.config_path)
        if config is None:
            results.append(Check(f"{prefix}:cmp-config", False, config_err))
        else:
            central = config.get("centralServer")
            if not isinstance(central, dict):
                results.append(Check(f"{prefix}:cmp-config", False, "centralServer missing"))
            else:
                url_ok = central.get("url") == remote.cmp_webhook_url
                enabled_ok = bool(central.get("enabled"))
                ok = url_ok and enabled_ok
                detail = ""
                if not enabled_ok:
                    detail = "centralServer.enabled is false"
                elif not url_ok:
                    detail = f"url={central.get('url')!r}, expected {remote.cmp_webhook_url!r}"
                results.append(Check(f"{prefix}:cmp-config", ok, detail))

    return results


def _systemctl_restart(service: str) -> str:
    result = subprocess.run(
        ["systemctl", "--user", "restart", service],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return f"systemctl --user restart {service} → OK"
    detail = (result.stderr or result.stdout).strip()
    return f"systemctl --user restart {service} → FAILED ({detail})"


class HealResult:
    def __init__(self, check_name: str, action_taken: str, recovered: bool):
        self.check_name = check_name
        self.action_taken = action_taken
        self.recovered = recovered

    def __str__(self) -> str:
        icon = "✅" if self.recovered else "⚠️"
        return f"  {icon}  {self.check_name}  →  {self.action_taken}"


PORT_PPE_UI = f"port:{PPE_UI_PORT} (PPE-UI)"
PORT_EDGE_CLOUD = f"port:{EDGE_CLOUD_PORT} (edge-cloud)"
PORT_CMP = f"port:{CMP_PORT} (CMP)"
PORT_GO2RTC = f"port:{GO2RTC_PORT} (go2rtc)"
PROCESS_PPE_UI = "process:ppe-ui"
PROCESS_EDGE = "process:edge-cloud"
PROCESS_CMP = "process:CMP"
PROCESS_GO2RTC = "process:go2rtc"
PROCESS_PATTERNS = {
    PROCESS_PPE_UI: PROCESS_PPE_UI_PATTERN,
    PROCESS_EDGE: PROCESS_EDGE_CLOUD_PATTERN,
    PROCESS_CMP: PROCESS_CMP_PATTERN,
    PROCESS_GO2RTC: PROCESS_GO2RTC_PATTERN,
}

HEAL_ACTIONS = {
    PROCESS_PPE_UI: lambda: _systemctl_restart(SYSTEMD_PPE_UI),
    PROCESS_EDGE: lambda: _systemctl_restart(SYSTEMD_EDGE_CLOUD),
    PROCESS_CMP: lambda: _systemctl_restart(SYSTEMD_CMP),
    PROCESS_GO2RTC: lambda: _systemctl_restart(SYSTEMD_GO2RTC),
}

CHECK_ALIAS = {
    PORT_PPE_UI: PROCESS_PPE_UI,
    PORT_EDGE_CLOUD: PROCESS_EDGE,
    PORT_CMP: PROCESS_CMP,
    PORT_GO2RTC: PROCESS_GO2RTC,
    "edge-cloud:api": PROCESS_EDGE,
    "CMP:api": PROCESS_CMP,
    "go2rtc:streams": PROCESS_GO2RTC,
}


def _recheck(failure: Check) -> Check:
    if failure.name.startswith("remote:"):
        remote_key = failure.name.split(":", 2)[1]
        remote = next((r for r in REMOTE_HOSTS if r.key == remote_key), None)
        if remote is None:
            return Check(failure.name, False, "remote host not configured")
        refreshed = {c.name: c for c in run_remote_checks(remote)}
        return refreshed.get(failure.name, Check(failure.name, False, "remote check still failing"))
    if failure.name.startswith("port:"):
        match = re.search(r":(\d+)", failure.name)
        port = int(match.group(1)) if match else 0
        return check_port(failure.name, "localhost", port)
    if failure.name in PROCESS_PATTERNS:
        return check_process(failure.name, PROCESS_PATTERNS[failure.name])
    if failure.name == "CMP:api":
        return check_cmp_api()
    if failure.name == "edge-cloud:api":
        return check_edge_cloud_api()
    if failure.name.startswith("go2rtc:stream:"):
        stream_checks = check_go2rtc_streams()
        return next((c for c in stream_checks if c.name == failure.name), Check(failure.name, False, "stream still missing"))
    return Check(failure.name, False, "re-check not implemented")


def heal_failures(failures: list[Check]) -> tuple[list[HealResult], list[Check]]:
    healed_targets: set[str] = set()
    heal_results: list[HealResult] = []

    for failure in failures:
        if failure.name.startswith("remote:"):
            continue
        target = CHECK_ALIAS.get(failure.name, failure.name)
        if target in healed_targets:
            continue
        healed_targets.add(target)

        action_fn = HEAL_ACTIONS.get(target)
        if not action_fn:
            heal_results.append(HealResult(failure.name, "no auto-heal available", False))
            continue

        print(f"[healthcheck] Attempting heal: {target}")
        try:
            desc = action_fn()
        except Exception as exc:
            desc = f"error: {exc}"
        heal_results.append(HealResult(failure.name, desc, False))

    if healed_targets & set(HEAL_ACTIONS.keys()):
        print("[healthcheck] Waiting 15 s for services to start…")
        time.sleep(15)

    remaining: list[Check] = []
    for failure in failures:
        if failure.name.startswith("remote:"):
            new_check = _recheck(failure)
            if not new_check.ok:
                remaining.append(new_check)
            continue
        new_check = _recheck(failure)
        for heal_result in heal_results:
            if heal_result.check_name == failure.name:
                heal_result.recovered = new_check.ok
                break
        if not new_check.ok:
            remaining.append(new_check)

    return heal_results, remaining


def run_checks() -> list[Check]:
    results: list[Check] = [
        check_port(PORT_PPE_UI, "localhost", PPE_UI_PORT),
        check_port(PORT_EDGE_CLOUD, "localhost", EDGE_CLOUD_PORT),
        check_port(PORT_CMP, "localhost", CMP_PORT),
        check_port(PORT_GO2RTC, "localhost", GO2RTC_PORT),
        check_process(PROCESS_PPE_UI, PROCESS_PATTERNS[PROCESS_PPE_UI]),
        check_process(PROCESS_EDGE, PROCESS_PATTERNS[PROCESS_EDGE]),
        check_process(PROCESS_CMP, PROCESS_PATTERNS[PROCESS_CMP]),
        check_process(PROCESS_GO2RTC, PROCESS_PATTERNS[PROCESS_GO2RTC]),
        check_edge_cloud_api(),
        check_cmp_api(),
    ]
    results.extend(check_go2rtc_streams())
    for remote in REMOTE_HOSTS:
        results.extend(run_remote_checks(remote))
    return results


def _send_email(subject: str, body_text: str, body_html: str) -> None:
    if not SMTP_USER or not SMTP_PASS or SMTP_PASS.startswith("YOUR_"):
        print("[healthcheck] SMTP not configured — skipping email")
        print("[healthcheck] Edit scripts/healthcheck.conf with your SMTP credentials")
        return

    if not ALERT_TO:
        print("[healthcheck] No alert recipients configured — skipping email")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = ALERT_FROM
    msg["To"] = ", ".join(ALERT_TO)
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.sendmail(ALERT_FROM, ALERT_TO, msg.as_string())
        print(f"[healthcheck] Email sent to {', '.join(ALERT_TO)}")
    except Exception as exc:
        print(f"[healthcheck] Failed to send email: {exc}", file=sys.stderr)


def _build_email(
    initial_failures: list[Check],
    all_checks: list[Check],
    tag: str,
    heal_results: list[HealResult] | None = None,
    remaining_failures: list[Check] | None = None,
) -> tuple[str, str, str]:
    healed = heal_results or []
    still_bad = remaining_failures if remaining_failures is not None else initial_failures
    all_ok = len(still_bad) == 0
    auto_fixed = [h for h in healed if h.recovered]

    if all_ok and not initial_failures:
        subject = f"[{tag}] AVision — All Systems OK — {NOW}"
        heading_color = "#27ae60"
        heading_text = "&#10003; AVision — All Systems OK"
    elif all_ok and initial_failures:
        subject = f"[{tag}] AVision — Issue(s) Auto-Fixed on {HOSTNAME} — {NOW}"
        heading_color = "#e67e22"
        heading_text = "&#9889; AVision — Auto-Healed"
    else:
        subject = f"[{tag}] AVision — {len(still_bad)} failure(s) on {HOSTNAME} — {NOW}"
        heading_color = "#c0392b"
        heading_text = "&#9888; AVision Health Alert"

    ok_lines = "\n".join(str(c) for c in all_checks if c.ok)
    heal_text = ""
    if healed:
        heal_text = "\nAUTO-HEAL ACTIONS:\n" + "\n".join(str(h) for h in healed) + "\n"

    remote_hosts = ", ".join(f"{r.display_name} ({r.host})" for r in REMOTE_HOSTS) or "none"
    body_text = f"""AVision Health Check
Host:  {HOSTNAME}
Time:  {NOW}
Repo:  {REPO_BASE}
Remote hosts: {remote_hosts}
{heal_text}
{"All " + str(len(all_checks)) + " checks PASSED (after auto-heal)." if all_ok and initial_failures else ("All " + str(len(all_checks)) + " checks PASSED." if all_ok else "")}
{"STILL FAILING (" + str(len(still_bad)) + "):" if still_bad else ""}
{"".join(chr(10) + str(c) for c in still_bad)}

PASSING CHECKS ({len(all_checks) - len(initial_failures)}):
{ok_lines}

---
Sent automatically by AVision healthcheck.
"""

    heal_html = ""
    if healed:
        heal_html = (
            '<h3 style="color:#e67e22;margin-top:20px">&#9889; Auto-Heal Actions</h3>'
            '<ul style="margin:0;padding:0 0 0 20px">'
            + "".join(
                f'<li style="margin:4px 0">'
                f'{"<b style=color:#27ae60>&#10003;</b>" if h.recovered else "<b style=color:#c0392b>&#10060;</b>"} '
                f"<b>{h.check_name}</b> &mdash; <span style=\"color:#888\">{h.action_taken}</span></li>"
                for h in healed
            )
            + "</ul>"
        )

    fail_html = ""
    if still_bad:
        fail_html = (
            '<h3 style="color:#c0392b">&#10060; Still Failing</h3>'
            '<ul style="margin:0;padding:0 0 0 20px">'
            + "".join(
                f'<li style="margin:4px 0"><b>{c.name}</b>'
                + (f' &mdash; <span style="color:#888">{c.detail}</span>' if c.detail else "")
                + "</li>"
                for c in still_bad
            )
            + "</ul>"
        )

    body_html = f"""<html><body style="font-family:sans-serif;color:#222;max-width:600px">
<h2 style="color:{heading_color}">{heading_text}</h2>
<table style="border-collapse:collapse;margin-bottom:16px">
  <tr><td style="color:#888;padding:2px 12px 2px 0">Host</td><td><b>{HOSTNAME}</b></td></tr>
  <tr><td style="color:#888;padding:2px 12px 2px 0">Time</td><td>{NOW}</td></tr>
  <tr><td style="color:#888;padding:2px 12px 2px 0">Remote</td><td>{remote_hosts}</td></tr>
  <tr><td style="color:#888;padding:2px 12px 2px 0">Status</td>
      <td><b style="color:{heading_color}">{"All " + str(len(all_checks)) + " checks passed" if all_ok else str(len(still_bad)) + " still failing after auto-heal"}</b></td></tr>
  {"<tr><td style='color:#888;padding:2px 12px 2px 0'>Auto-fixed</td><td><b style='color:#27ae60'>" + str(len(auto_fixed)) + " service(s)</b></td></tr>" if auto_fixed else ""}
</table>
{heal_html}
{fail_html}
<h3 style="color:#27ae60;margin-top:20px">&#10003; Passing Checks</h3>
<ul style="margin:0;padding:0 0 0 20px;color:#555">
{"".join(f'<li style="margin:2px 0">{c.name}</li>' for c in all_checks if c.ok)}
</ul>
<p style="color:#aaa;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:8px">
Sent automatically by AVision healthcheck on {HOSTNAME}
</p>
</body></html>"""

    return subject, body_text, body_html


def send_alert(
    initial_failures: list[Check],
    all_checks: list[Check],
    heal_results: list[HealResult] | None = None,
    remaining_failures: list[Check] | None = None,
) -> None:
    subject, body_text, body_html = _build_email(
        initial_failures, all_checks, "ALERT", heal_results, remaining_failures
    )
    _send_email(subject, body_text, body_html)


def send_daily_report(checks: list[Check]) -> None:
    failures = [c for c in checks if not c.ok]
    subject, body_text, body_html = _build_email(failures, checks, "Daily Report")
    _send_email(subject, body_text, body_html)


def send_test_email() -> None:
    subject = f"[TEST] AVision healthcheck email — {HOSTNAME} — {NOW}"
    body_text = f"""AVision healthcheck test email.

Host: {HOSTNAME}
Time: {NOW}
Recipient(s): {", ".join(ALERT_TO)}

If you received this, SMTP alerts are configured correctly.
"""
    body_html = f"""<html><body style="font-family:sans-serif">
<h2 style="color:#27ae60">AVision healthcheck test</h2>
<p>Host: <b>{HOSTNAME}</b><br>Time: {NOW}<br>Recipients: {", ".join(ALERT_TO)}</p>
<p>If you received this, SMTP alerts are configured correctly.</p>
</body></html>"""
    _send_email(subject, body_text, body_html)


def main() -> None:
    parser = argparse.ArgumentParser(description="AVision health check")
    parser.add_argument(
        "--daily-report",
        action="store_true",
        help="Always send an email regardless of pass/fail (used by 08:00 cron)",
    )
    parser.add_argument(
        "--test-email",
        action="store_true",
        help="Send a test email and exit",
    )
    args = parser.parse_args()

    if args.test_email:
        send_test_email()
        sys.exit(0)

    checks = run_checks()
    failures = [c for c in checks if not c.ok]

    print(f"[healthcheck] {NOW}  host={HOSTNAME}")
    for check in checks:
        print(str(check))

    if args.daily_report:
        if failures:
            print(f"\n[healthcheck] Daily report — {len(failures)} failure(s), attempting auto-heal…")
            heal_results, _remaining = heal_failures(failures)
            for heal_result in heal_results:
                print(str(heal_result))
        else:
            print(f"\n[healthcheck] Daily report — All {len(checks)} checks passed.")
        send_daily_report(checks)
        sys.exit(1 if failures else 0)

    if failures:
        print(f"\n[healthcheck] {len(failures)} failure(s) — attempting auto-heal…")
        heal_results, remaining = heal_failures(failures)
        for heal_result in heal_results:
            print(str(heal_result))
        if remaining:
            print(f"[healthcheck] {len(remaining)} still failing — sending alert email")
        else:
            print("[healthcheck] All issues auto-healed — sending notification email")
        send_alert(failures, checks, heal_results, remaining)
        sys.exit(1 if remaining else 0)

    print(f"\n[healthcheck] All {len(checks)} checks passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
