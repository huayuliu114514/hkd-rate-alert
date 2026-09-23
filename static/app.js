const state = {
  data: null,
  lookbackDays: 30,
  baseCurrency: "HKD",
  quoteCurrency: "CNY",
  currencies: { HKD: "Hong Kong Dollar", CNY: "Chinese Renminbi Yuan" },
};

const elements = {
  body: document.body,
  brandCode: document.querySelector("#brandCode"),
  pageTitle: document.querySelector("#pageTitle"),
  baseCurrency: document.querySelector("#baseCurrency"),
  quoteCurrency: document.querySelector("#quoteCurrency"),
  swapCurrencies: document.querySelector("#swapCurrencies"),
  currentRate: document.querySelector("#currentRate"),
  baseUnit: document.querySelector("#baseUnit"),
  quoteUnit: document.querySelector("#quoteUnit"),
  minimumRate: document.querySelector("#minimumRate"),
  averageRate: document.querySelector("#averageRate"),
  aboveMinimum: document.querySelector("#aboveMinimum"),
  percentileValue: document.querySelector("#percentileValue"),
  asOfDate: document.querySelector("#asOfDate"),
  signalBadge: document.querySelector("#signalBadge"),
  decisionText: document.querySelector("#decisionText"),
  amountInput: document.querySelector("#amountInput"),
  amountLabel: document.querySelector("#amountLabel"),
  amountCurrency: document.querySelector("#amountCurrency"),
  conversionCurrencyLabel: document.querySelector("#conversionCurrencyLabel"),
  conversionValue: document.querySelector("#conversionValue"),
  toleranceInput: document.querySelector("#toleranceInput"),
  toleranceOutput: document.querySelector("#toleranceOutput"),
  percentileInput: document.querySelector("#percentileInput"),
  percentileOutput: document.querySelector("#percentileOutput"),
  ruleSummary: document.querySelector("#ruleSummary"),
  rulesForm: document.querySelector("#rulesForm"),
  refreshButton: document.querySelector("#refreshButton"),
  notifyButton: document.querySelector("#notifyButton"),
  errorBanner: document.querySelector("#errorBanner"),
  errorMessage: document.querySelector("#errorMessage"),
  sourceLabel: document.querySelector("#sourceLabel"),
  chart: document.querySelector("#rateChart"),
  chartFrame: document.querySelector("#chartFrame"),
  chartTooltip: document.querySelector("#chartTooltip"),
  toast: document.querySelector("#toast"),
  periodButtons: [...document.querySelectorAll("[data-days]")],
};

const rateFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
});

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyDisplayNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["zh-CN"], { type: "currency" })
  : null;

function currencyName(code) {
  return currencyDisplayNames?.of(code) || state.currencies[code] || code;
}

function queryString() {
  const parameters = new URLSearchParams({
    lookback_days: String(state.lookbackDays),
    tolerance_pct: elements.toleranceInput.value,
    percentile: elements.percentileInput.value,
    base: state.baseCurrency,
    quote: state.quoteCurrency,
  });
  return parameters.toString();
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function setLoading(loading) {
  elements.body.classList.toggle("is-loading", loading);
  elements.refreshButton.disabled = loading;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.hidden = false;
}

function clearError() {
  elements.errorBanner.hidden = true;
}

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `请求失败 (${response.status})`);
  }
  return payload;
}

async function loadRates() {
  setLoading(true);
  clearError();
  try {
    const response = await fetch(`/api/rates?${queryString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    state.data = await readJson(response);
    renderDashboard();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    setLoading(false);
  }
}

function populateCurrencySelect(select, selectedCode) {
  const options = Object.entries(state.currencies).map(([code, providerName]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} · ${currencyDisplayNames?.of(code) || providerName}`;
    return option;
  });
  select.replaceChildren(...options);
  select.value = selectedCode;
}

function syncCurrencySelectors() {
  elements.baseCurrency.value = state.baseCurrency;
  elements.quoteCurrency.value = state.quoteCurrency;
}

async function loadCurrencies() {
  try {
    const response = await fetch("/api/currencies", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await readJson(response);
    state.currencies = payload.currencies;
    populateCurrencySelect(elements.baseCurrency, state.baseCurrency);
    populateCurrencySelect(elements.quoteCurrency, state.quoteCurrency);
  } catch (error) {
    showToast(`币种列表加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderDashboard() {
  const { summary, rates, source, pair } = state.data;
  state.baseCurrency = pair.base;
  state.quoteCurrency = pair.quote;
  syncCurrencySelectors();
  const baseName = currencyName(pair.base);
  const quoteName = currencyName(pair.quote);

  document.title = `${pair.base}/${pair.quote} 汇率观察`;
  elements.brandCode.textContent = `${pair.base} / ${pair.quote} MONITOR`;
  elements.pageTitle.textContent = `${baseName}兑${quoteName}`;
  elements.baseUnit.textContent = pair.base;
  elements.quoteUnit.textContent = pair.quote;
  elements.amountLabel.textContent = `${baseName}金额`;
  elements.amountCurrency.textContent = pair.base;
  elements.conversionCurrencyLabel.textContent = quoteName;
  elements.chart.setAttribute("aria-label", `${baseName}兑${quoteName}历史汇率折线图`);
  elements.currentRate.textContent = rateFormatter.format(summary.current);
  elements.minimumRate.textContent = rateFormatter.format(summary.minimum);
  elements.averageRate.textContent = rateFormatter.format(summary.average);
  elements.aboveMinimum.textContent = `${summary.above_minimum_pct.toFixed(2)}%`;
  elements.percentileValue.textContent = `第 ${summary.percentile.toFixed(0)} 百分位`;
  elements.asOfDate.textContent = `${formatDate(summary.date)} · 最新工作日`;
  elements.sourceLabel.textContent = source;
  updateDecision();
  updateConversion();
  drawChart(rates, summary.average);
}

function updateDecision() {
  if (!state.data) return;
  const { summary } = state.data;
  const tolerance = Number(elements.toleranceInput.value);
  const percentile = Number(elements.percentileInput.value);
  const alert = summary.above_minimum_pct <= tolerance || summary.percentile <= percentile;
  const badgeText = elements.signalBadge.querySelector("span");

  elements.signalBadge.classList.toggle("alerting", alert);
  badgeText.textContent = alert ? "达到提醒条件" : "暂未触发提醒";
  elements.decisionText.textContent = alert
    ? `当前价格处于近 ${state.lookbackDays} 天低位，可以关注兑换时机。`
    : `当前价格高于区间最低点 ${summary.above_minimum_pct.toFixed(2)}%，继续观察。`;
  elements.ruleSummary.textContent =
    `高于近 ${state.lookbackDays} 天最低点不超过 ${tolerance.toFixed(2)}%，` +
    `或处于最低 ${percentile.toFixed(0)}% 时提醒。`;
}

function updateConversion() {
  if (!state.data) return;
  const amount = Math.max(0, Number(elements.amountInput.value) || 0);
  const converted = amount * state.data.summary.current;
  elements.conversionValue.textContent =
    `${moneyFormatter.format(converted)} ${state.quoteCurrency}`;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function addSvgText(parent, text, attributes) {
  const label = svgElement("text", attributes);
  label.textContent = text;
  parent.append(label);
}

function drawChart(rates, average) {
  const width = 960;
  const height = 360;
  const margin = { top: 30, right: 24, bottom: 46, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawMinimum = Math.min(...rates.map((item) => item.rate));
  const rawMaximum = Math.max(...rates.map((item) => item.rate));
  const padding = Math.max((rawMaximum - rawMinimum) * 0.14, 0.0002);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const xStep = rates.length > 1 ? plotWidth / (rates.length - 1) : 0;
  const xFor = (index) => margin.left + index * xStep;
  const yFor = (rate) => margin.top + ((maximum - rate) / (maximum - minimum)) * plotHeight;

  elements.chart.replaceChildren();

  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", {
    id: "rateArea",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
    svgElement("stop", { offset: "0%", "stop-color": "#15705f", "stop-opacity": "0.24" }),
    svgElement("stop", { offset: "100%", "stop-color": "#15705f", "stop-opacity": "0" }),
  );
  defs.append(gradient);
  elements.chart.append(defs);

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = margin.top + ratio * plotHeight;
    const value = maximum - ratio * (maximum - minimum);
    elements.chart.append(svgElement("line", {
      x1: margin.left,
      y1: y,
      x2: width - margin.right,
      y2: y,
      stroke: "#d7ddda",
      "stroke-width": 1,
    }));
    addSvgText(elements.chart, value.toFixed(4), {
      x: margin.left - 11,
      y: y + 4,
      fill: "#74807d",
      "font-size": 11,
      "text-anchor": "end",
      "font-family": "Bahnschrift, sans-serif",
    });
  }

  const points = rates.map((item, index) => [xFor(index), yFor(item.rate)]);
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1)[0]},${height - margin.bottom} ` +
    `L${points[0][0]},${height - margin.bottom} Z`;

  elements.chart.append(svgElement("path", {
    d: areaPath,
    fill: "url(#rateArea)",
  }));
  elements.chart.append(svgElement("line", {
    x1: margin.left,
    y1: yFor(average),
    x2: width - margin.right,
    y2: yFor(average),
    stroke: "#b98313",
    "stroke-width": 1.5,
    "stroke-dasharray": "6 6",
  }));
  elements.chart.append(svgElement("path", {
    d: linePath,
    fill: "none",
    stroke: "#243e3a",
    "stroke-width": 3,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  }));

  const latestPoint = points.at(-1);
  elements.chart.append(svgElement("circle", {
    cx: latestPoint[0],
    cy: latestPoint[1],
    r: 5,
    fill: "#ffffff",
    stroke: "#d84a34",
    "stroke-width": 3,
  }));

  const labelIndexes = [...new Set([0, Math.floor((rates.length - 1) / 2), rates.length - 1])];
  for (const index of labelIndexes) {
    addSvgText(elements.chart, rates[index].date.slice(5), {
      x: xFor(index),
      y: height - 18,
      fill: "#74807d",
      "font-size": 11,
      "text-anchor": index === 0 ? "start" : index === rates.length - 1 ? "end" : "middle",
      "font-family": "Bahnschrift, sans-serif",
    });
  }

  const crosshair = svgElement("line", {
    y1: margin.top,
    y2: height - margin.bottom,
    stroke: "#8a9692",
    "stroke-width": 1,
    "stroke-dasharray": "3 4",
    visibility: "hidden",
  });
  const hoverPoint = svgElement("circle", {
    r: 5,
    fill: "#ffffff",
    stroke: "#15705f",
    "stroke-width": 3,
    visibility: "hidden",
  });
  elements.chart.append(crosshair, hoverPoint);

  elements.chart.onpointermove = (event) => {
    const bounds = elements.chart.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.max(0, Math.min(rates.length - 1, Math.round((svgX - margin.left) / xStep)));
    const [pointX, pointY] = points[index];
    const item = rates[index];
    crosshair.setAttribute("x1", pointX);
    crosshair.setAttribute("x2", pointX);
    crosshair.setAttribute("visibility", "visible");
    hoverPoint.setAttribute("cx", pointX);
    hoverPoint.setAttribute("cy", pointY);
    hoverPoint.setAttribute("visibility", "visible");
    const tooltipRate = document.createElement("strong");
    tooltipRate.textContent = `${rateFormatter.format(item.rate)} ${state.quoteCurrency}`;
    elements.chartTooltip.replaceChildren(item.date, tooltipRate);
    elements.chartTooltip.hidden = false;
    const tooltipLeft = Math.min(Math.max(event.clientX - bounds.left + 14, 8), bounds.width - 148);
    const tooltipTop = Math.max(event.clientY - bounds.top - 62, 8);
    elements.chartTooltip.style.left = `${tooltipLeft}px`;
    elements.chartTooltip.style.top = `${tooltipTop}px`;
  };

  elements.chart.onpointerleave = () => {
    crosshair.setAttribute("visibility", "hidden");
    hoverPoint.setAttribute("visibility", "hidden");
    elements.chartTooltip.hidden = true;
  };
}

elements.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.lookbackDays = Number(button.dataset.days);
    elements.periodButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    loadRates();
  });
});

elements.baseCurrency.addEventListener("change", () => {
  const nextBase = elements.baseCurrency.value;
  if (nextBase === state.quoteCurrency) {
    state.quoteCurrency = state.baseCurrency;
  }
  state.baseCurrency = nextBase;
  syncCurrencySelectors();
  loadRates();
});

elements.quoteCurrency.addEventListener("change", () => {
  const nextQuote = elements.quoteCurrency.value;
  if (nextQuote === state.baseCurrency) {
    state.baseCurrency = state.quoteCurrency;
  }
  state.quoteCurrency = nextQuote;
  syncCurrencySelectors();
  loadRates();
});

elements.swapCurrencies.addEventListener("click", () => {
  [state.baseCurrency, state.quoteCurrency] = [state.quoteCurrency, state.baseCurrency];
  syncCurrencySelectors();
  loadRates();
});

elements.amountInput.addEventListener("input", updateConversion);

elements.toleranceInput.addEventListener("input", () => {
  elements.toleranceOutput.textContent = `${Number(elements.toleranceInput.value).toFixed(2)}%`;
  updateDecision();
});

elements.percentileInput.addEventListener("input", () => {
  elements.percentileOutput.textContent = `${elements.percentileInput.value}%`;
  updateDecision();
});

elements.rulesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadRates();
});

elements.refreshButton.addEventListener("click", loadRates);

elements.notifyButton.addEventListener("click", async () => {
  elements.notifyButton.disabled = true;
  try {
    const response = await fetch(`/api/notify?${queryString()}`, { method: "POST" });
    await readJson(response);
    showToast("测试推送已发送到 Bark");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    elements.notifyButton.disabled = false;
  }
});

async function initialize() {
  await loadCurrencies();
  await loadRates();
}

initialize();