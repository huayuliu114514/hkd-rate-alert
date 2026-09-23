"""Notify an iPhone when an exchange rate is near its recent low.

A lower rate means fewer units of the quote currency are needed to buy
one unit of the base currency.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlencode, urlparse

RATE_API = "https://api.frankfurter.dev/v1"
BARK_API = "https://api.day.app/push"
USER_AGENT = "hkd-rate-alert/1.0"
DEFAULT_BASE = "HKD"
DEFAULT_QUOTE = "CNY"


@dataclass(frozen=True)
class RateSummary:
  """Statistics describing the current rate within a lookback window."""

  date: str
  current: float
  minimum: float
  average: float
  percentile: float


def validate_currency_code(value: str) -> str:
  """Return a normalized three-letter currency code."""
  code = value.strip().upper()
  if len(code) != 3 or not code.isascii() or not code.isalpha():
    raise argparse.ArgumentTypeError("Currency must be a three-letter code.")
  return code


def fetch_currencies() -> dict[str, str]:
  """Return currencies supported by the exchange-rate provider."""
  request = urllib.request.Request(
      f"{RATE_API}/currencies",
      headers={"User-Agent": USER_AGENT},
  )
  with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)
  return dict(sorted(payload.items()))


def fetch_rates(
    lookback_days: int,
    base_currency: str = DEFAULT_BASE,
    quote_currency: str = DEFAULT_QUOTE,
) -> dict[str, float]:
  """Return exchange rates keyed by ISO date for the lookback window."""
  base_currency = validate_currency_code(base_currency)
  quote_currency = validate_currency_code(quote_currency)
  if base_currency == quote_currency:
    raise ValueError("Base and quote currencies must be different.")
  start = dt.date.today() - dt.timedelta(days=lookback_days)
  parameters = urlencode({"from": base_currency, "to": quote_currency})
  url = f"{RATE_API}/{start.isoformat()}..?{parameters}"
  request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
  with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)
  return {
      day: values[quote_currency]
      for day, values in payload["rates"].items()
  }


def summarise(rates: dict[str, float]) -> RateSummary:
  """Compute where the latest rate sits among the historical rates."""
  if not rates:
    raise ValueError("No exchange-rate data returned.")
  latest_date = max(rates)
  current = rates[latest_date]
  values = list(rates.values())
  lower_or_equal = sum(value <= current for value in values)
  return RateSummary(
      date=latest_date,
      current=current,
      minimum=min(values),
      average=sum(values) / len(values),
      percentile=100 * lower_or_equal / len(values),
  )


def should_alert(
    summary: RateSummary,
    tolerance_pct: float,
    percentile_limit: float,
) -> bool:
  """Alert when the rate is close to the minimum or in the lowest band."""
  near_minimum = summary.current <= summary.minimum * (1 + tolerance_pct / 100)
  return near_minimum or summary.percentile <= percentile_limit


def build_message(
  summary: RateSummary,
  lookback_days: int,
  base_currency: str = DEFAULT_BASE,
  quote_currency: str = DEFAULT_QUOTE,
) -> tuple[str, str]:
  """Create the notification title and body."""
  above_min = (summary.current / summary.minimum - 1) * 100
  title = f"{base_currency}/{quote_currency} 汇率接近近期低点"
  body = (
    f"{summary.date}：1 {base_currency} = "
    f"{summary.current:.5f} {quote_currency}\n"
      f"近{lookback_days}天最低：{summary.minimum:.5f}\n"
      f"近{lookback_days}天平均：{summary.average:.5f}\n"
      f"高于最低点：{above_min:.2f}%\n"
    f"兑换 100 {base_currency} 约需 "
    f"{summary.current * 100:.2f} {quote_currency}"
  )
  return title, body


def normalize_bark_key(value: str) -> str:
  """Accept a bare Bark key or a pasted Bark URL such as https://api.day.app/KEY/."""
  value = value.strip().strip("'\"")
  if "://" in value:
    path_parts = [part for part in urlparse(value).path.split("/") if part]
    return path_parts[0] if path_parts else ""
  return value.strip("/")


def send_bark(
  device_key: str,
  title: str,
  body: str,
  group: str = "Exchange Rate",
) -> None:
  """Send a push notification to the Bark iOS app."""
  data = json.dumps({
      "device_key": device_key,
      "title": title,
      "body": body,
      "group": group,
  }).encode("utf-8")
  request = urllib.request.Request(
      BARK_API,
      data=data,
      headers={
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": USER_AGENT,
      },
  )
  try:
    with urllib.request.urlopen(request, timeout=30) as response:
      result = json.load(response)
  except urllib.error.HTTPError as error:
    detail = error.read().decode("utf-8", "replace")
    detail = detail.replace(device_key, "***") if device_key else detail
    raise RuntimeError(f"Bark push failed (HTTP {error.code}): {detail}") from error
  if result.get("code") != 200:
    raise RuntimeError(f"Bark push failed: {result}")


def parse_args() -> argparse.Namespace:
  """Parse command-line options."""
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--base", type=validate_currency_code, default=DEFAULT_BASE)
  parser.add_argument("--quote", type=validate_currency_code, default=DEFAULT_QUOTE)
  parser.add_argument("--lookback-days", type=int, default=30)
  parser.add_argument(
      "--tolerance-pct",
      type=float,
      default=0.05,
      help="Alert if within this percentage of the minimum.",
  )
  parser.add_argument(
      "--percentile",
      type=float,
      default=10,
      help="Alert if the rate is within the lowest N percent of days.",
  )
  parser.add_argument(
      "--force",
      action="store_true",
      help="Send a notification even if the alert rule is not met.",
  )
  parser.add_argument(
      "--dry-run",
      action="store_true",
      help="Print the message without sending it.",
  )
  args = parser.parse_args()
  if args.base == args.quote:
    parser.error("--base and --quote must be different currencies.")
  return args


def main() -> int:
  """Run one exchange-rate check."""
  args = parse_args()
  summary = summarise(fetch_rates(args.lookback_days, args.base, args.quote))
  title, body = build_message(
      summary,
      args.lookback_days,
      args.base,
      args.quote,
  )
  alert = should_alert(summary, args.tolerance_pct, args.percentile)

  print(f"Alert: {alert}\n{title}\n{body}")

  if not (alert or args.force) or args.dry_run:
    return 0

  device_key = normalize_bark_key(os.environ.get("BARK_KEY", ""))
  if not device_key:
    print("BARK_KEY is not set; notification not sent.", file=sys.stderr)
    return 1

  send_bark(device_key, title, body, f"{args.base}/{args.quote}")
  print("Notification sent.")
  return 0


if __name__ == "__main__":
  sys.exit(main())
