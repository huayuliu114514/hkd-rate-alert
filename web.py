"""Serve a local dashboard for checking exchange rates."""

from __future__ import annotations

import argparse
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from alert import (
  DEFAULT_BASE,
  DEFAULT_QUOTE,
  build_message,
  fetch_currencies,
  fetch_rates,
  send_bark,
  should_alert,
  summarise,
  validate_currency_code,
)

HOST = "127.0.0.1"
PORT = 8000
STATIC_DIR = Path(__file__).with_name("static")
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}


def _query_number(
    parameters: dict[str, list[str]],
    name: str,
    default: float,
    minimum: float,
    maximum: float,
    *,
    integer: bool = False,
) -> float | int:
  raw_value = parameters.get(name, [str(default)])[0]
  try:
    value = int(raw_value) if integer else float(raw_value)
  except ValueError as error:
    raise ValueError(f"{name} must be a number.") from error
  if not minimum <= value <= maximum:
    raise ValueError(f"{name} must be between {minimum:g} and {maximum:g}.")
  return value


def parse_settings(query: str) -> tuple[int, float, float, str, str]:
  """Validate dashboard settings from a URL query string."""
  parameters = parse_qs(query)
  lookback_days = _query_number(
      parameters, "lookback_days", 30, 7, 365, integer=True
  )
  tolerance_pct = _query_number(parameters, "tolerance_pct", 0.05, 0, 5)
  percentile_limit = _query_number(parameters, "percentile", 10, 0, 100)
  try:
    base_currency = validate_currency_code(
        parameters.get("base", [DEFAULT_BASE])[0]
    )
    quote_currency = validate_currency_code(
        parameters.get("quote", [DEFAULT_QUOTE])[0]
    )
  except argparse.ArgumentTypeError as error:
    raise ValueError(str(error)) from error
  if base_currency == quote_currency:
    raise ValueError("Base and quote currencies must be different.")
  return (
      int(lookback_days),
      float(tolerance_pct),
      float(percentile_limit),
      base_currency,
      quote_currency,
  )


def build_dashboard_data(
    lookback_days: int,
    tolerance_pct: float,
    percentile_limit: float,
    base_currency: str,
    quote_currency: str,
) -> dict[str, object]:
  """Fetch rates and shape them for the dashboard."""
  rates = fetch_rates(lookback_days, base_currency, quote_currency)
  summary = summarise(rates)
  above_minimum_pct = (summary.current / summary.minimum - 1) * 100
  return {
      "summary": {
          "date": summary.date,
          "current": summary.current,
          "minimum": summary.minimum,
          "average": summary.average,
          "percentile": summary.percentile,
          "above_minimum_pct": above_minimum_pct,
          "alert": should_alert(summary, tolerance_pct, percentile_limit),
      },
      "rates": [
          {"date": date, "rate": rate}
          for date, rate in sorted(rates.items())
      ],
      "settings": {
          "lookback_days": lookback_days,
          "tolerance_pct": tolerance_pct,
          "percentile": percentile_limit,
          "base": base_currency,
          "quote": quote_currency,
      },
        "pair": {"base": base_currency, "quote": quote_currency},
      "source": "Frankfurter / European Central Bank",
  }


class DashboardHandler(BaseHTTPRequestHandler):
  """Handle dashboard pages and API requests."""

  server_version = "ExchangeRateDashboard/1.0"

  def do_GET(self) -> None:
    parsed = urlparse(self.path)
    if parsed.path == "/api/rates":
      self._handle_rates(parsed.query)
      return
    if parsed.path == "/api/currencies":
      self._handle_currencies()
      return
    self._serve_static(parsed.path)

  def do_POST(self) -> None:
    parsed = urlparse(self.path)
    if parsed.path != "/api/notify":
      self.send_error(HTTPStatus.NOT_FOUND)
      return
    self._handle_notify(parsed.query)

  def _handle_rates(self, query: str) -> None:
    try:
      settings = parse_settings(query)
      self._send_json(build_dashboard_data(*settings))
    except ValueError as error:
      self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
    except (OSError, KeyError, json.JSONDecodeError) as error:
      self._send_json(
          {"error": f"Unable to load exchange-rate data: {error}"},
          HTTPStatus.BAD_GATEWAY,
      )

  def _handle_currencies(self) -> None:
    try:
      self._send_json({"currencies": fetch_currencies()})
    except (OSError, KeyError, json.JSONDecodeError) as error:
      self._send_json(
          {"error": f"Unable to load currencies: {error}"},
          HTTPStatus.BAD_GATEWAY,
      )

  def _handle_notify(self, query: str) -> None:
    device_key = os.environ.get("BARK_KEY")
    if not device_key:
      self._send_json(
          {"error": "BARK_KEY is not set on the server."},
          HTTPStatus.SERVICE_UNAVAILABLE,
      )
      return

    try:
      (
          lookback_days,
          tolerance_pct,
          percentile_limit,
          base_currency,
          quote_currency,
      ) = parse_settings(query)
      rates = fetch_rates(lookback_days, base_currency, quote_currency)
      summary = summarise(rates)
      title, body = build_message(
          summary,
          lookback_days,
          base_currency,
          quote_currency,
      )
      send_bark(device_key, title, body, f"{base_currency}/{quote_currency}")
      self._send_json({"sent": True, "title": title, "body": body})
    except ValueError as error:
      self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
    except (OSError, KeyError, json.JSONDecodeError) as error:
      self._send_json(
          {"error": f"Unable to send notification: {error}"},
          HTTPStatus.BAD_GATEWAY,
      )

  def _serve_static(self, path: str) -> None:
    static_file = STATIC_FILES.get(path)
    if static_file is None:
      self.send_error(HTTPStatus.NOT_FOUND)
      return
    filename, content_type = static_file
    try:
      content = (STATIC_DIR / filename).read_bytes()
    except OSError:
      self.send_error(HTTPStatus.NOT_FOUND)
      return
    self.send_response(HTTPStatus.OK)
    self.send_header("Content-Type", content_type)
    self.send_header("Content-Length", str(len(content)))
    self.send_header("Cache-Control", "no-cache")
    self.end_headers()
    self.wfile.write(content)

  def _send_json(
      self,
      payload: dict[str, object],
      status: HTTPStatus = HTTPStatus.OK,
  ) -> None:
    content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(content)))
    self.send_header("Cache-Control", "no-store")
    self.end_headers()
    self.wfile.write(content)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--host", default=HOST)
  parser.add_argument("--port", type=int, default=PORT)
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
  print(f"Dashboard: http://{args.host}:{args.port}")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()


if __name__ == "__main__":
  main()